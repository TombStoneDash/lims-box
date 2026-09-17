/**
 * Fail-closed synthetic OHWorks result comment code renderer.
 *
 * This module is a pure, dependency-free renderer: given a declared table of
 * comment codes (each with template text, its named placeholders, a maximum
 * rendered length, and a display priority) and a request naming a code and
 * supplying placeholder values, it renders the exact text for that comment.
 * It performs no I/O, mutates no SENAITE or database state, and touches no
 * real subject, sample, or customer data.
 *
 * There is no free-text path: a comment can only be produced by naming a
 * code that is declared in the table, and the request is not accepted as
 * arbitrary text under any circumstance. Everything that would otherwise
 * require guessing fails closed by throwing CommentRenderError instead of
 * returning a partial, truncated, or best-effort comment:
 *
 *   - a code that is not declared in the table ("unknown-code"),
 *   - a declared placeholder with no supplied value, a non-string value, or
 *     a value that is blank after trimming ("missing-placeholder-value",
 *     "empty-placeholder-value"),
 *   - a supplied value for a placeholder the code does not declare
 *     ("unexpected-placeholder-value"),
 *   - a fully rendered comment longer than that code's declared maximum
 *     length ("rendered-comment-too-long"),
 *   - a structurally invalid declared table or request.
 *
 * When more than one comment applies to the same result, this module does
 * not decide which one "wins" -- it renders every requested comment and
 * returns them in a single deterministic order: ascending declared
 * priority, then ascending code. That ordering depends only on the declared
 * table and the set of requested codes, never on request order or wall-clock
 * time, so the same inputs always produce the same sequence.
 */

export type CommentCodeDefinition = {
  /** Declared unique code, e.g. "DILUTION-APPLIED". Never free text. */
  code: string;
  /** Template text containing zero or more `{placeholderName}` tokens. */
  template: string;
  /** Every placeholder name referenced by the template; must exactly match the tokens found in it. */
  placeholders: string[];
  /** Maximum allowed length, in characters, of this code's fully rendered text. */
  maxLength: number;
  /** Lower sorts first when multiple rendered comments apply to the same result. */
  priority: number;
};

export type CommentTable = ReadonlyArray<CommentCodeDefinition>;

export type ResultCommentRequest = {
  /** Must exactly match a code declared in the table; free text is never accepted here. */
  code: string;
  /** Values for every placeholder the named code declares, keyed by placeholder name. */
  values: Readonly<Record<string, string>>;
};

export type RenderedResultComment = {
  code: string;
  priority: number;
  text: string;
};

export type CommentRenderErrorCode =
  | 'table-not-array'
  | 'table-empty'
  | 'table-entry-malformed'
  | 'table-duplicate-code'
  | 'table-placeholder-invalid'
  | 'table-placeholder-duplicate'
  | 'table-template-placeholder-mismatch'
  | 'requests-not-array'
  | 'request-malformed'
  | 'unknown-code'
  | 'missing-placeholder-value'
  | 'empty-placeholder-value'
  | 'unexpected-placeholder-value'
  | 'rendered-comment-too-long';

const ERROR_MESSAGES: Record<CommentRenderErrorCode, string> = {
  'table-not-array': 'The declared comment code table is not a list.',
  'table-empty': 'No comment codes were declared.',
  'table-entry-malformed': 'A declared comment code entry is not structurally valid.',
  'table-duplicate-code': 'More than one declared comment code entry shares the same code.',
  'table-placeholder-invalid': 'A declared comment code entry names an invalid placeholder.',
  'table-placeholder-duplicate': 'A declared comment code entry lists the same placeholder more than once.',
  'table-template-placeholder-mismatch':
    "A declared comment code entry's template tokens do not exactly match its declared placeholders.",
  'requests-not-array': 'The submitted comment requests are not a list.',
  'request-malformed': 'A submitted comment request is not structurally valid.',
  'unknown-code': 'The submitted code is not declared in the comment code table.',
  'missing-placeholder-value': 'A declared placeholder has no submitted value.',
  'empty-placeholder-value': 'A declared placeholder value is blank.',
  'unexpected-placeholder-value': 'A submitted value names a placeholder the code does not declare.',
  'rendered-comment-too-long': "The rendered comment exceeds the code's declared maximum length.",
};

/** Thrown for any table, request, or rendering condition this module refuses to guess at. */
export class CommentRenderError extends Error {
  readonly code: CommentRenderErrorCode;

  constructor(code: CommentRenderErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'CommentRenderError';
    this.code = code;
  }
}

/** Deterministic, privacy-safe human-readable text for a comment render error code. */
export function explainCommentRenderError(code: CommentRenderErrorCode): string {
  return ERROR_MESSAGES[code];
}

const PLACEHOLDER_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const TEMPLATE_TOKEN_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function extractTemplateTokens(template: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of template.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    tokens.add(match[1]);
  }
  return tokens;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertValidEntry(entry: unknown): asserts entry is CommentCodeDefinition {
  if (!isPlainObject(entry)) {
    throw new CommentRenderError('table-entry-malformed');
  }
  if (
    !isNonBlankString(entry.code) ||
    !isNonBlankString(entry.template) ||
    !Number.isInteger(entry.maxLength) ||
    (entry.maxLength as number) <= 0 ||
    !Number.isInteger(entry.priority) ||
    !Array.isArray(entry.placeholders)
  ) {
    throw new CommentRenderError('table-entry-malformed');
  }

  const declaredPlaceholders = entry.placeholders as unknown[];
  const declaredSet = new Set<string>();
  for (const placeholder of declaredPlaceholders) {
    if (!isNonBlankString(placeholder) || !PLACEHOLDER_NAME_PATTERN.test(placeholder)) {
      throw new CommentRenderError('table-placeholder-invalid');
    }
    if (declaredSet.has(placeholder)) {
      throw new CommentRenderError('table-placeholder-duplicate');
    }
    declaredSet.add(placeholder);
  }

  const templateTokens = extractTemplateTokens(entry.template as string);
  if (!setsEqual(declaredSet, templateTokens)) {
    throw new CommentRenderError('table-template-placeholder-mismatch');
  }
}

/** Validate the declared comment code table structurally. Called on every entry point; the table is never assumed pre-validated. */
function assertValidTable(table: CommentTable): void {
  if (!Array.isArray(table)) {
    throw new CommentRenderError('table-not-array');
  }
  if (table.length === 0) {
    throw new CommentRenderError('table-empty');
  }

  const seenCodes = new Set<string>();
  for (const entry of table) {
    assertValidEntry(entry);
    if (seenCodes.has(entry.code)) {
      throw new CommentRenderError('table-duplicate-code');
    }
    seenCodes.add(entry.code);
  }
}

function assertValidRequest(request: unknown): asserts request is ResultCommentRequest {
  if (!isPlainObject(request) || !isNonBlankString(request.code) || !isPlainObject(request.values)) {
    throw new CommentRenderError('request-malformed');
  }
  for (const value of Object.values(request.values)) {
    if (typeof value !== 'string') {
      throw new CommentRenderError('request-malformed');
    }
  }
}

/** True only if `code` is a string that exactly matches a code declared in the table. Never treats free text as a comment. */
export function isDeclaredCommentCode(table: CommentTable, code: unknown): boolean {
  assertValidTable(table);
  return typeof code === 'string' && table.some((entry) => entry.code === code);
}

/**
 * Render a single declared comment code with supplied placeholder values.
 *
 * Fail-closed: an undeclared code, a missing/blank/non-string placeholder
 * value, a value supplied for a placeholder the code does not declare, or a
 * rendered result longer than the code's declared maximum length all throw
 * CommentRenderError rather than returning a partial or truncated comment.
 */
export function renderResultComment(table: CommentTable, request: ResultCommentRequest): RenderedResultComment {
  assertValidTable(table);
  assertValidRequest(request);

  const definition = table.find((entry) => entry.code === request.code);
  if (!definition) {
    throw new CommentRenderError('unknown-code');
  }

  const declaredSet = new Set(definition.placeholders);
  for (const suppliedName of Object.keys(request.values)) {
    if (!declaredSet.has(suppliedName)) {
      throw new CommentRenderError('unexpected-placeholder-value');
    }
  }

  const resolved = new Map<string, string>();
  for (const placeholder of definition.placeholders) {
    const value = request.values[placeholder];
    if (value === undefined) {
      throw new CommentRenderError('missing-placeholder-value');
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new CommentRenderError('empty-placeholder-value');
    }
    resolved.set(placeholder, trimmed);
  }

  const text = definition.template.replace(TEMPLATE_TOKEN_PATTERN, (_match, name: string) => {
    return resolved.get(name) as string;
  });

  if (text.length > definition.maxLength) {
    throw new CommentRenderError('rendered-comment-too-long');
  }

  return Object.freeze({ code: definition.code, priority: definition.priority, text });
}

function compareRendered(a: RenderedResultComment, b: RenderedResultComment): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  if (a.code !== b.code) {
    return a.code < b.code ? -1 : 1;
  }
  return 0;
}

/**
 * Render every requested comment code and return them in a single
 * deterministic order: ascending declared priority, then ascending code.
 * The order depends only on the declared table and the requested codes,
 * never on the order requests were submitted in. Any single request that
 * fails to render (unknown code, missing placeholder, etc.) fails the whole
 * call rather than silently dropping that comment.
 */
export function renderResultComments(
  table: CommentTable,
  requests: ReadonlyArray<ResultCommentRequest>,
): ReadonlyArray<RenderedResultComment> {
  if (!Array.isArray(requests)) {
    throw new CommentRenderError('requests-not-array');
  }

  const rendered = requests.map((request) => renderResultComment(table, request));
  return Object.freeze([...rendered].sort(compareRendered));
}
