// LIMS BOT model-run receipt recorder.
// Records the fields required by spec section 7.2 for every model adapter
// run. Never accepts or persists a value that looks like a prompt, PHI, or
// a secret; it stores only the receipt fields below.

export type OutputVerdict = 'pass' | 'blocked' | 'fallback';

export interface ModelRunReceipt {
  requestedModel: string;
  requestedEffort: string;
  effectiveModel: string;
  providerId: string;
  evidenceSource: string;
  routeId: string;
  startedAt: string;
  endedAt: string;
  usage: string | Record<string, number>;
  fallbackUsed: boolean;
  sourceIdsCited: string[];
  outputVerdict: OutputVerdict;
}

const REQUIRED_FIELDS: readonly (keyof ModelRunReceipt)[] = [
  'requestedModel',
  'requestedEffort',
  'effectiveModel',
  'providerId',
  'evidenceSource',
  'routeId',
  'startedAt',
  'endedAt',
  'usage',
  'fallbackUsed',
  'sourceIdsCited',
  'outputVerdict',
];

const ALLOWED_FIELDS = new Set<string>(REQUIRED_FIELDS);
const OUTPUT_VERDICTS = new Set<OutputVerdict>(['pass', 'blocked', 'fallback']);
const SAFE_LABEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/ -]{0,119}$/;
const SAFE_SOURCE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

// Bounded, deterministic patterns for common secret shapes. This is a
// defensive last check on the receipt fields, not a general secret scanner.
const SECRET_SHAPE_PATTERNS: readonly RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{10,}\b/,
  /\bapi[_-]?key\s*[:=]\s*\S+/i,
  /\bbearer\s+[a-zA-Z0-9._-]{10,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
];

const PRIVATE_CONTENT_PATTERNS: readonly RegExp[] = [
  /\b(?:patient|date of birth|dob|medical record|mrn|nhs number|social security|ssn)\b/i,
  /\b(?:customer[- ]private|client[- ]confidential|confidential customer)\b/i,
  /\b(?:prompt|question|answer)\s*[:=]/i,
  /\b[A-Z]{2,4}-\d{5,}\b/, // common patient/sample-record identifier shape
];

function containsSecretShape(value: unknown): boolean {
  if (typeof value === 'string') {
    return SECRET_SHAPE_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some(containsSecretShape);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsSecretShape);
  }
  return false;
}

function containsPrivateContent(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.includes('\n') || PRIVATE_CONTENT_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) return value.some(containsPrivateContent);
  if (value && typeof value === 'object') return Object.values(value).some(containsPrivateContent);
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/, (_match, fraction: string | undefined) => (
    `.${(fraction ?? '').padEnd(3, '0')}Z`
  ));
  return parsed.toISOString() === normalized;
}

function isUsage(value: unknown): value is string | Record<string, number> {
  if (value === 'not-exposed') return true;
  return isPlainObject(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([key, amount]) => (
      SAFE_SOURCE_ID_PATTERN.test(key)
      && typeof amount === 'number'
      && Number.isFinite(amount)
      && amount >= 0
    ));
}

export interface RecordReceiptResult {
  ok: boolean;
  receipt?: ModelRunReceipt;
  reason?: string;
}

/**
 * Validates a candidate receipt against the required-field and
 * secret-shape contracts. Does not accept free-text prompt content: callers
 * must only pass the receipt fields, never the underlying question/answer.
 */
export function recordModelReceipt(input: unknown): RecordReceiptResult {
  if (!isPlainObject(input)) return { ok: false, reason: 'invalid_receipt_object' };

  const unknownField = Object.keys(input).find((field) => !ALLOWED_FIELDS.has(field));
  if (unknownField) return { ok: false, reason: `unknown_field:${unknownField}` };

  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null) {
      return { ok: false, reason: `missing_required_field:${String(field)}` };
    }
  }

  if (containsSecretShape(input)) {
    return { ok: false, reason: 'secret_shaped_value_rejected' };
  }

  if (containsPrivateContent(input)) {
    return { ok: false, reason: 'private_or_prompt_content_rejected' };
  }

  const labelFields: readonly (keyof ModelRunReceipt)[] = [
    'requestedModel', 'requestedEffort', 'effectiveModel', 'providerId', 'evidenceSource', 'routeId',
  ];
  for (const field of labelFields) {
    if (typeof input[field] !== 'string' || !SAFE_LABEL_PATTERN.test(input[field] as string)) {
      return { ok: false, reason: `invalid_field:${String(field)}` };
    }
  }
  if (!isIsoTimestamp(input.startedAt) || !isIsoTimestamp(input.endedAt)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  if (Date.parse(input.endedAt) < Date.parse(input.startedAt)) {
    return { ok: false, reason: 'ended_before_started' };
  }
  if (!isUsage(input.usage)) return { ok: false, reason: 'invalid_usage' };
  if (typeof input.fallbackUsed !== 'boolean') return { ok: false, reason: 'invalid_fallback_used' };
  if (!Array.isArray(input.sourceIdsCited)
    || !input.sourceIdsCited.every((id) => typeof id === 'string' && SAFE_SOURCE_ID_PATTERN.test(id))) {
    return { ok: false, reason: 'invalid_source_ids_cited' };
  }
  if (typeof input.outputVerdict !== 'string'
    || !OUTPUT_VERDICTS.has(input.outputVerdict as OutputVerdict)) {
    return { ok: false, reason: 'invalid_output_verdict' };
  }

  const receipt: ModelRunReceipt = {
    requestedModel: input.requestedModel as string,
    requestedEffort: input.requestedEffort as string,
    effectiveModel: input.effectiveModel as string,
    providerId: input.providerId as string,
    evidenceSource: input.evidenceSource as string,
    routeId: input.routeId as string,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    usage: typeof input.usage === 'string' ? input.usage : { ...input.usage },
    fallbackUsed: input.fallbackUsed,
    sourceIdsCited: [...input.sourceIdsCited],
    outputVerdict: input.outputVerdict as OutputVerdict,
  };
  return { ok: true, receipt };
}

export interface ReceiptStore {
  add(receipt: unknown): void;
  all(): readonly ModelRunReceipt[];
  findByFallbackUsed(used: boolean): ModelRunReceipt[];
  findByOutputVerdict(verdict: OutputVerdict): ModelRunReceipt[];
}

/** Creates an isolated, in-memory receipt store (no shared module state). */
export function createReceiptStore(): ReceiptStore {
  const receipts: ModelRunReceipt[] = [];

  function immutableCopy(receipt: ModelRunReceipt): ModelRunReceipt {
    const usage = typeof receipt.usage === 'string'
      ? receipt.usage
      : Object.freeze({ ...receipt.usage }) as Record<string, number>;
    return Object.freeze({
      ...receipt,
      usage,
      sourceIdsCited: Object.freeze([...receipt.sourceIdsCited]) as unknown as string[],
    }) as ModelRunReceipt;
  }

  return {
    add(receipt) {
      const validated = recordModelReceipt(receipt);
      if (!validated.ok || !validated.receipt) {
        throw new TypeError(`invalid_model_receipt:${validated.reason ?? 'unknown'}`);
      }
      receipts.push(immutableCopy(validated.receipt));
    },
    all() {
      return receipts.slice();
    },
    findByFallbackUsed(used) {
      return receipts.filter((receipt) => receipt.fallbackUsed === used);
    },
    findByOutputVerdict(verdict) {
      return receipts.filter((receipt) => receipt.outputVerdict === verdict);
    },
  };
}
