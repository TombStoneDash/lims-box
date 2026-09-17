/**
 * Fail-closed synthetic OHWorks hemolysis/icterus/lipemia (HIL) interference
 * index evaluator.
 *
 * This module is a pure, dependency-free evaluator: given a fabricated
 * specimen's measured HIL index values and a declared per-analyte tolerance
 * table (each analyte declaring, per index kind, an optional comment
 * threshold with a comment code and/or an optional suppression threshold),
 * it decides, for each ordered analyte report, one of:
 *
 *   - report:              every applicable index is within tolerance.
 *   - report_with_comment: an applicable index reached a declared comment
 *                           threshold; the result carries the declared
 *                           comment code(s) but is still reportable.
 *   - suppress:             an applicable index reached a declared
 *                           suppression threshold, or an index the analyte
 *                           declares a tolerance for was not measured at
 *                           all.
 *
 * It performs no I/O, mutates no SENAITE or database state, and touches no
 * real subject, sample, or customer data.
 *
 * Fail-closed, in two distinct ways:
 *
 *   - Structurally unusable input -- a malformed specimen ID, a malformed
 *     indices object, an index value that is present but not a finite
 *     non-negative number, a malformed ordered-analyte list, a malformed
 *     tolerance table, or an ordered analyte with no entry in the declared
 *     tolerance table ("unknown analyte") -- throws
 *     InterferenceInputError rather than guessing at a decision.
 *   - A legitimate but incomplete measurement -- an index kind the analyte
 *     declares a tolerance for, but that was not measured on this specimen
 *     -- does not throw; it resolves that single analyte to `suppress`
 *     (reasonCode "index-missing") while every other ordered analyte on the
 *     same specimen is still decided normally.
 *
 * Precedence when more than one index kind applies to the same analyte is
 * fixed and conservative: a missing measurement outranks a suppression
 * threshold, which outranks a comment threshold, which outranks a clean
 * report. Index kinds are always evaluated in the fixed order hemolysis,
 * icterus, lipemia, so output ordering never depends on object key order.
 */

export type InterferenceIndexKind = 'hemolysis' | 'icterus' | 'lipemia';

/** Fabricated specimen HIL index values. A kind's key is omitted when that index was not measured on this specimen. */
export type SpecimenIndices = {
  hemolysisIndex?: number;
  icterusIndex?: number;
  lipemiaIndex?: number;
};

/**
 * A declared per-index-kind tolerance rule for one analyte. `commentAt` and
 * `suppressAt` are inclusive lower bounds: a measured index value greater
 * than or equal to the bound triggers that outcome. At least one of the two
 * must be declared; `commentCode` is required exactly when `commentAt` is
 * declared, and `suppressAt`, when both are declared, must be greater than
 * or equal to `commentAt`.
 */
export type IndexToleranceRule = {
  commentAt: number | null;
  commentCode: string | null;
  suppressAt: number | null;
};

/** Declared tolerance rules for one analyte, one entry per HIL index kind. A `null` entry means that index kind does not affect this analyte. */
export type AnalyteToleranceRules = {
  hemolysis: IndexToleranceRule | null;
  icterus: IndexToleranceRule | null;
  lipemia: IndexToleranceRule | null;
};

/** Declared tolerance table, keyed by analyte code. An ordered analyte with no entry here is an unknown analyte. */
export type InterferenceToleranceTable = Readonly<Record<string, AnalyteToleranceRules>>;

export type InterferenceEvaluationInput = {
  specimenId: string;
  indices: SpecimenIndices;
  /** Analyte codes ordered for this specimen, in report order. Must be non-empty with no duplicates. */
  orderedAnalytes: ReadonlyArray<string>;
  toleranceTable: InterferenceToleranceTable;
};

export type AnalyteInterferenceDecisionStatus = 'report' | 'report_with_comment' | 'suppress';

export type AnalyteInterferenceReasonCode =
  | 'within-tolerance'
  | 'comment-threshold-exceeded'
  | 'suppress-threshold-exceeded'
  | 'index-missing';

export type AnalyteInterferenceIndexOutcomeStatus = 'ok' | 'comment' | 'suppress' | 'missing';

export type AnalyteInterferenceIndexOutcome = {
  kind: InterferenceIndexKind;
  status: AnalyteInterferenceIndexOutcomeStatus;
  /** The measured index value, or null when this kind's index was not measured. */
  indexValue: number | null;
  /** The declared comment code, only when status is "comment". */
  commentCode: string | null;
};

export type AnalyteInterferenceDecision = {
  analyteCode: string;
  status: AnalyteInterferenceDecisionStatus;
  reasonCode: AnalyteInterferenceReasonCode;
  /** Distinct declared comment codes to attach to this result, in fixed hemolysis/icterus/lipemia order. Empty unless status is "report_with_comment". */
  commentCodes: ReadonlyArray<string>;
  /** Per-kind detail for only the index kinds this analyte declares a tolerance rule for, in fixed hemolysis/icterus/lipemia order. */
  indexOutcomes: ReadonlyArray<AnalyteInterferenceIndexOutcome>;
};

export type SpecimenInterferenceSummary = {
  specimenId: string;
  reportCount: number;
  reportWithCommentCount: number;
  suppressCount: number;
  /** Ordered-analyte-order subset of analyte codes decided "suppress". */
  suppressedAnalytes: ReadonlyArray<string>;
  /** Ordered-analyte-order subset of analyte codes decided "report_with_comment". */
  commentedAnalytes: ReadonlyArray<string>;
  /** Every distinct comment code used anywhere on this specimen, sorted ascending. */
  allCommentCodes: ReadonlyArray<string>;
};

export type SpecimenInterferenceResult = {
  specimenId: string;
  /** One decision per entry of `orderedAnalytes`, in the same order. */
  decisions: ReadonlyArray<AnalyteInterferenceDecision>;
  summary: SpecimenInterferenceSummary;
};

export type InterferenceInputErrorCode =
  | 'specimen-id-invalid'
  | 'indices-not-object'
  | 'indices-unexpected-key'
  | 'index-value-invalid'
  | 'ordered-analytes-not-array'
  | 'ordered-analytes-empty'
  | 'ordered-analyte-invalid'
  | 'ordered-analyte-duplicate'
  | 'tolerance-table-not-object'
  | 'tolerance-table-entry-invalid'
  | 'unknown-analyte';

const INPUT_ERROR_MESSAGES: Record<InterferenceInputErrorCode, string> = {
  'specimen-id-invalid': 'The specimen ID is missing or not a non-blank string.',
  'indices-not-object': 'The specimen indices are not a plain object.',
  'indices-unexpected-key': 'The specimen indices object declares a key that is not a recognized HIL index field.',
  'index-value-invalid': 'A supplied specimen index value is not a finite, non-negative number.',
  'ordered-analytes-not-array': 'The ordered analyte list is not an array.',
  'ordered-analytes-empty': 'The ordered analyte list is empty.',
  'ordered-analyte-invalid': 'An ordered analyte entry is not a non-blank string.',
  'ordered-analyte-duplicate': 'The ordered analyte list contains the same analyte code more than once.',
  'tolerance-table-not-object': 'The declared tolerance table is not a plain object.',
  'tolerance-table-entry-invalid': 'A declared tolerance table entry is not structurally valid.',
  'unknown-analyte': 'An ordered analyte has no entry in the declared tolerance table.',
};

/** Thrown for any specimen, index, order, or tolerance-table condition this module refuses to guess at. */
export class InterferenceInputError extends Error {
  readonly code: InterferenceInputErrorCode;

  constructor(code: InterferenceInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'InterferenceInputError';
    this.code = code;
  }
}

/** Deterministic, privacy-safe human-readable text for an interference input error code. */
export function explainInterferenceInputError(code: InterferenceInputErrorCode): string {
  return INPUT_ERROR_MESSAGES[code];
}

const INDEX_KIND_ORDER: ReadonlyArray<InterferenceIndexKind> = ['hemolysis', 'icterus', 'lipemia'];

const INDEX_KIND_FIELDS: Record<InterferenceIndexKind, keyof SpecimenIndices> = {
  hemolysis: 'hemolysisIndex',
  icterus: 'icterusIndex',
  lipemia: 'lipemiaIndex',
};

const INDEX_FIELD_NAMES: ReadonlyArray<string> = Object.values(INDEX_KIND_FIELDS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function assertValidSpecimenId(value: unknown): asserts value is string {
  if (!isNonBlankString(value)) {
    throw new InterferenceInputError('specimen-id-invalid');
  }
}

function assertValidIndices(value: unknown): SpecimenIndices {
  if (!isPlainObject(value)) {
    throw new InterferenceInputError('indices-not-object');
  }
  for (const key of Object.keys(value)) {
    if (!INDEX_FIELD_NAMES.includes(key)) {
      throw new InterferenceInputError('indices-unexpected-key');
    }
  }

  const result: SpecimenIndices = {};
  for (const kind of INDEX_KIND_ORDER) {
    const field = INDEX_KIND_FIELDS[kind];
    if (!(field in value)) {
      continue;
    }
    const raw = value[field];
    if (!isFiniteNonNegativeNumber(raw)) {
      throw new InterferenceInputError('index-value-invalid');
    }
    result[field] = raw;
  }
  return result;
}

function assertValidOrderedAnalytes(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    throw new InterferenceInputError('ordered-analytes-not-array');
  }
  if (value.length === 0) {
    throw new InterferenceInputError('ordered-analytes-empty');
  }

  const seen = new Set<string>();
  for (const entry of value) {
    if (!isNonBlankString(entry)) {
      throw new InterferenceInputError('ordered-analyte-invalid');
    }
    if (seen.has(entry)) {
      throw new InterferenceInputError('ordered-analyte-duplicate');
    }
    seen.add(entry);
  }
  return value as ReadonlyArray<string>;
}

function assertValidIndexToleranceRule(value: unknown): IndexToleranceRule | null {
  if (value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    throw new InterferenceInputError('tolerance-table-entry-invalid');
  }

  const allowedKeys = ['commentAt', 'commentCode', 'suppressAt'];
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new InterferenceInputError('tolerance-table-entry-invalid');
    }
  }

  const commentAt = value.commentAt;
  const commentCode = value.commentCode;
  const suppressAt = value.suppressAt;

  if (commentAt !== null && !isFiniteNonNegativeNumber(commentAt)) {
    throw new InterferenceInputError('tolerance-table-entry-invalid');
  }
  if (suppressAt !== null && !isFiniteNonNegativeNumber(suppressAt)) {
    throw new InterferenceInputError('tolerance-table-entry-invalid');
  }
  if (commentAt === null && suppressAt === null) {
    throw new InterferenceInputError('tolerance-table-entry-invalid');
  }
  if (commentAt !== null) {
    if (!isNonBlankString(commentCode)) {
      throw new InterferenceInputError('tolerance-table-entry-invalid');
    }
  } else if (commentCode !== null) {
    throw new InterferenceInputError('tolerance-table-entry-invalid');
  }
  if (commentAt !== null && suppressAt !== null && (suppressAt as number) < (commentAt as number)) {
    throw new InterferenceInputError('tolerance-table-entry-invalid');
  }

  return {
    commentAt: commentAt as number | null,
    commentCode: (commentCode as string | null) ?? null,
    suppressAt: suppressAt as number | null,
  };
}

function assertValidAnalyteRules(value: unknown): AnalyteToleranceRules {
  if (!isPlainObject(value)) {
    throw new InterferenceInputError('tolerance-table-entry-invalid');
  }
  const allowedKeys: ReadonlyArray<string> = INDEX_KIND_ORDER;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new InterferenceInputError('tolerance-table-entry-invalid');
    }
  }
  for (const kind of INDEX_KIND_ORDER) {
    if (!(kind in value)) {
      throw new InterferenceInputError('tolerance-table-entry-invalid');
    }
  }

  return {
    hemolysis: assertValidIndexToleranceRule(value.hemolysis),
    icterus: assertValidIndexToleranceRule(value.icterus),
    lipemia: assertValidIndexToleranceRule(value.lipemia),
  };
}

function assertValidToleranceTable(value: unknown): Record<string, AnalyteToleranceRules> {
  if (!isPlainObject(value)) {
    throw new InterferenceInputError('tolerance-table-not-object');
  }

  const result: Record<string, AnalyteToleranceRules> = {};
  for (const [analyteCode, rules] of Object.entries(value)) {
    if (!isNonBlankString(analyteCode)) {
      throw new InterferenceInputError('tolerance-table-entry-invalid');
    }
    result[analyteCode] = assertValidAnalyteRules(rules);
  }
  return result;
}

function dedupePreserveOrder(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function decideAnalyte(
  analyteCode: string,
  indices: SpecimenIndices,
  toleranceTable: Record<string, AnalyteToleranceRules>,
): AnalyteInterferenceDecision {
  const rules = toleranceTable[analyteCode];
  if (rules === undefined) {
    throw new InterferenceInputError('unknown-analyte');
  }

  const indexOutcomes: AnalyteInterferenceIndexOutcome[] = [];
  for (const kind of INDEX_KIND_ORDER) {
    const rule = rules[kind];
    if (rule === null) {
      continue;
    }

    const field = INDEX_KIND_FIELDS[kind];
    const value = indices[field];

    if (value === undefined) {
      indexOutcomes.push({ kind, status: 'missing', indexValue: null, commentCode: null });
      continue;
    }
    if (rule.suppressAt !== null && value >= rule.suppressAt) {
      indexOutcomes.push({ kind, status: 'suppress', indexValue: value, commentCode: null });
      continue;
    }
    if (rule.commentAt !== null && value >= rule.commentAt) {
      indexOutcomes.push({ kind, status: 'comment', indexValue: value, commentCode: rule.commentCode });
      continue;
    }
    indexOutcomes.push({ kind, status: 'ok', indexValue: value, commentCode: null });
  }

  const frozenOutcomes = Object.freeze(indexOutcomes.map((entry) => Object.freeze(entry)));

  if (indexOutcomes.some((entry) => entry.status === 'missing')) {
    return Object.freeze({
      analyteCode,
      status: 'suppress',
      reasonCode: 'index-missing',
      commentCodes: Object.freeze([]),
      indexOutcomes: frozenOutcomes,
    });
  }
  if (indexOutcomes.some((entry) => entry.status === 'suppress')) {
    return Object.freeze({
      analyteCode,
      status: 'suppress',
      reasonCode: 'suppress-threshold-exceeded',
      commentCodes: Object.freeze([]),
      indexOutcomes: frozenOutcomes,
    });
  }

  const commentCodes = dedupePreserveOrder(
    indexOutcomes.filter((entry) => entry.status === 'comment').map((entry) => entry.commentCode as string),
  );
  if (commentCodes.length > 0) {
    return Object.freeze({
      analyteCode,
      status: 'report_with_comment',
      reasonCode: 'comment-threshold-exceeded',
      commentCodes: Object.freeze(commentCodes),
      indexOutcomes: frozenOutcomes,
    });
  }

  return Object.freeze({
    analyteCode,
    status: 'report',
    reasonCode: 'within-tolerance',
    commentCodes: Object.freeze([]),
    indexOutcomes: frozenOutcomes,
  });
}

function summarize(
  specimenId: string,
  decisions: ReadonlyArray<AnalyteInterferenceDecision>,
): SpecimenInterferenceSummary {
  const suppressedAnalytes = decisions.filter((d) => d.status === 'suppress').map((d) => d.analyteCode);
  const commentedAnalytes = decisions.filter((d) => d.status === 'report_with_comment').map((d) => d.analyteCode);
  const reportCount = decisions.filter((d) => d.status === 'report').length;
  const allCommentCodes = dedupePreserveOrder(decisions.flatMap((d) => d.commentCodes)).sort();

  return Object.freeze({
    specimenId,
    reportCount,
    reportWithCommentCount: commentedAnalytes.length,
    suppressCount: suppressedAnalytes.length,
    suppressedAnalytes: Object.freeze(suppressedAnalytes),
    commentedAnalytes: Object.freeze(commentedAnalytes),
    allCommentCodes: Object.freeze(allCommentCodes),
  });
}

/**
 * Evaluate a fabricated specimen's measured HIL indices against a declared
 * per-analyte tolerance table and decide, for every ordered analyte, one of
 * "report", "report_with_comment", or "suppress".
 *
 * Fail-closed: a malformed specimen ID, indices object, ordered-analyte
 * list, or tolerance table, an index value that is present but not a
 * finite non-negative number, or an ordered analyte absent from the
 * tolerance table all throw InterferenceInputError rather than producing a
 * guessed result. An index kind an analyte declares a tolerance for, but
 * that was not measured on this specimen, is not a structural error: that
 * single analyte resolves to "suppress" (reasonCode "index-missing") while
 * every other ordered analyte is still decided normally.
 */
export function evaluateSpecimenInterference(input: InterferenceEvaluationInput): SpecimenInterferenceResult {
  if (!isPlainObject(input)) {
    throw new InterferenceInputError('specimen-id-invalid');
  }

  assertValidSpecimenId(input.specimenId);
  const indices = assertValidIndices(input.indices);
  const orderedAnalytes = assertValidOrderedAnalytes(input.orderedAnalytes);
  const toleranceTable = assertValidToleranceTable(input.toleranceTable);

  const decisions = orderedAnalytes.map((analyteCode) => decideAnalyte(analyteCode, indices, toleranceTable));
  const summary = summarize(input.specimenId, decisions);

  return Object.freeze({
    specimenId: input.specimenId,
    decisions: Object.freeze(decisions),
    summary,
  });
}
