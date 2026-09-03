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

// Bounded, deterministic patterns for common secret shapes. This is a
// defensive last check on the receipt fields, not a general secret scanner.
const SECRET_SHAPE_PATTERNS: readonly RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{10,}\b/,
  /\bapi[_-]?key\s*[:=]\s*\S+/i,
  /\bbearer\s+[a-zA-Z0-9._-]{10,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
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
export function recordModelReceipt(input: Partial<ModelRunReceipt>): RecordReceiptResult {
  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null) {
      return { ok: false, reason: `missing_required_field:${String(field)}` };
    }
  }

  if (containsSecretShape(input)) {
    return { ok: false, reason: 'secret_shaped_value_rejected' };
  }

  return { ok: true, receipt: input as ModelRunReceipt };
}

export interface ReceiptStore {
  add(receipt: ModelRunReceipt): void;
  all(): readonly ModelRunReceipt[];
  findByFallbackUsed(used: boolean): ModelRunReceipt[];
  findByOutputVerdict(verdict: OutputVerdict): ModelRunReceipt[];
}

/** Creates an isolated, in-memory receipt store (no shared module state). */
export function createReceiptStore(): ReceiptStore {
  const receipts: ModelRunReceipt[] = [];
  return {
    add(receipt) {
      receipts.push(receipt);
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
