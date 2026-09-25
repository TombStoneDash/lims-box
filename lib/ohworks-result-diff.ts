/**
 * Fail-closed synthetic OHWorks report result version diff.
 *
 * This module is a pure, dependency-free comparator: given two fabricated
 * versions of a single report's analyte result set (an "old" version and a
 * "new" version), it computes which analytes were added, which were
 * removed, and which changed value and/or flags between the two versions,
 * and classifies each change as clinically significant or not using
 * declared per-analyte thresholds. It produces a deterministic, ordered
 * list of human-readable change lines suitable for a corrected report
 * footer.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or
 * database state, and touches no real subject, sample, or customer data.
 * It never asserts approval, compliance, accreditation, or releasability.
 *
 * Fail-closed by design:
 *
 *   - Two rows in the same version declaring the same analyte code throw
 *     ResultDiffError rather than silently picking one of them, since a
 *     result set with an undeclared duplicate cannot be trusted to diff.
 *   - An analyte declared in both versions with two different units (after
 *     trim/case-fold) throws ResultDiffError rather than comparing values
 *     across an implied, unstated unit conversion.
 *   - An analyte whose value changed but which has no declared
 *     significance threshold is classified as significant by default
 *     ('no-threshold-declared'), so an unclassified change is always
 *     surfaced rather than silently suppressed.
 *   - A change to an analyte's flags, or a change to a non-numeric
 *     ("qualitative") value, is always classified as significant: there is
 *     no numeric threshold that could safely downgrade it.
 */

export type ResultRow = {
  analyteCode: string;
  /** Fabricated observed value: a finite number, or non-empty qualitative text (e.g. "positive"). */
  value: number | string;
  unit?: string;
  flags?: ReadonlyArray<string>;
};

/** A declared, per-analyte magnitude threshold at or below which a numeric change is not clinically significant. */
export type SignificanceThreshold = {
  analyteCode: string;
  /** Non-negative absolute delta threshold, or null if this analyte declares no absolute limit. */
  absolute: number | null;
  /** Non-negative percent delta threshold, or null if this analyte declares no percent limit. */
  percent: number | null;
};

export type ResultDiffRowEntry = Readonly<{
  analyteCode: string;
  value: number | string;
  unit: string | null;
  flags: ReadonlyArray<string>;
}>;

export type ResultDiffDelta = Readonly<{
  /** newValue - oldValue, signed. Only present when both values are numeric. */
  absolute: number;
  /** Signed percent change relative to |oldValue|; null when oldValue is 0 (percent is undefined). */
  percent: number | null;
}>;

export type ResultDiffSignificanceReason =
  | 'flag-changed'
  | 'nonnumeric-value-changed'
  | 'no-threshold-declared'
  | 'exceeds-threshold'
  | 'within-threshold';

export type ResultDiffChangedEntry = Readonly<{
  analyteCode: string;
  oldValue: number | string;
  newValue: number | string;
  /** Shared unit of the old and new rows (canonical match enforced), or null if neither declared one. */
  unit: string | null;
  oldFlags: ReadonlyArray<string>;
  newFlags: ReadonlyArray<string>;
  valueChanged: boolean;
  flagsChanged: boolean;
  /** Null when either value is non-numeric, so no numeric delta could be computed. */
  delta: ResultDiffDelta | null;
  significant: boolean;
  significanceReason: ResultDiffSignificanceReason;
}>;

export type ResultVersionDiff = Readonly<{
  added: ReadonlyArray<ResultDiffRowEntry>;
  removed: ReadonlyArray<ResultDiffRowEntry>;
  changed: ReadonlyArray<ResultDiffChangedEntry>;
  hasSignificantChange: boolean;
  /**
   * Deterministic, ordered lines for a corrected report footer: changed
   * results first (most relevant to a correction), then added results,
   * then removed results, each group sorted ascending by analyte code.
   */
  changeLines: ReadonlyArray<string>;
}>;

export type ResultDiffErrorCode =
  | 'old-version-not-array'
  | 'new-version-not-array'
  | 'old-version-row-malformed'
  | 'new-version-row-malformed'
  | 'old-version-duplicate-analyte'
  | 'new-version-duplicate-analyte'
  | 'unit-mismatch'
  | 'thresholds-not-array'
  | 'thresholds-invalid'
  | 'thresholds-duplicate-analyte';

const ERROR_MESSAGES: Record<ResultDiffErrorCode, string> = {
  'old-version-not-array': 'The old result version is not a list of results.',
  'new-version-not-array': 'The new result version is not a list of results.',
  'old-version-row-malformed': 'The old result version contains a result missing a required field.',
  'new-version-row-malformed': 'The new result version contains a result missing a required field.',
  'old-version-duplicate-analyte': 'The old result version declares the same analyte more than once.',
  'new-version-duplicate-analyte': 'The new result version declares the same analyte more than once.',
  'unit-mismatch': 'An analyte declared in both versions has a different unit in each, so the values cannot be safely compared.',
  'thresholds-not-array': 'The declared significance thresholds are not a list.',
  'thresholds-invalid': 'A declared significance threshold is not structurally valid.',
  'thresholds-duplicate-analyte': 'More than one declared significance threshold targets the same analyte.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a result diff. */
export class ResultDiffError extends Error {
  readonly code: ResultDiffErrorCode;

  constructor(code: ResultDiffErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ResultDiffError';
    this.code = code;
  }
}

/** Deterministic, privacy-safe human-readable text for a result diff error code. */
export function explainResultDiffErrorCode(code: ResultDiffErrorCode): string {
  return ERROR_MESSAGES[code];
}

const SIGNIFICANCE_REASON_MESSAGES: Record<ResultDiffSignificanceReason, string> = {
  'flag-changed': "The result's flags changed between versions, so the change is treated as clinically significant.",
  'nonnumeric-value-changed': 'The result value changed and is not numeric, so the change is treated as clinically significant.',
  'no-threshold-declared': 'The result value changed and no significance threshold was declared for this analyte, so the change is treated as clinically significant.',
  'exceeds-threshold': "The result value changed by more than the analyte's declared significance threshold.",
  'within-threshold': "The result value changed but stayed within the analyte's declared significance threshold.",
};

/** Deterministic, privacy-safe human-readable text for a result diff significance reason code. */
export function explainSignificanceReason(reason: ResultDiffSignificanceReason): string {
  return SIGNIFICANCE_REASON_MESSAGES[reason];
}

function toFiniteNumber(value: number | string): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Canonicalize a unit for comparison only: trim outer whitespace and case-fold. Never infers or performs a unit conversion. */
function canonicalizeUnit(unit: string | undefined): string | undefined {
  if (typeof unit !== 'string') {
    return undefined;
  }
  const trimmed = unit.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

/** The declared unit, trimmed to its display form, or null if none was declared. */
function displayUnit(unit: string | undefined): string | null {
  if (typeof unit !== 'string') {
    return null;
  }
  const trimmed = unit.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFlags(flags: ReadonlyArray<string> | undefined): ReadonlyArray<string> {
  if (!flags || flags.length === 0) {
    return Object.freeze([]);
  }
  const unique = Array.from(new Set(flags.map((flag) => flag.trim())));
  unique.sort();
  return Object.freeze(unique);
}

function flagsEqual(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function valuesEqual(a: number | string, b: number | string): boolean {
  const numA = toFiniteNumber(a);
  const numB = toFiniteNumber(b);
  if (numA !== undefined && numB !== undefined) {
    return numA === numB;
  }
  return String(a).trim() === String(b).trim();
}

function isValidRow(value: unknown): value is ResultRow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.analyteCode !== 'string' || candidate.analyteCode.trim().length === 0) {
    return false;
  }

  const rawValue = candidate.value;
  const valueOk =
    (typeof rawValue === 'number' && Number.isFinite(rawValue)) ||
    (typeof rawValue === 'string' && rawValue.trim().length > 0);
  if (!valueOk) {
    return false;
  }

  if (candidate.unit !== undefined && (typeof candidate.unit !== 'string' || candidate.unit.trim().length === 0)) {
    return false;
  }

  if (candidate.flags !== undefined) {
    if (!Array.isArray(candidate.flags)) {
      return false;
    }
    for (const flag of candidate.flags) {
      if (typeof flag !== 'string' || flag.trim().length === 0) {
        return false;
      }
    }
  }

  return true;
}

function buildRowMap(rows: unknown, versionLabel: 'old' | 'new'): Map<string, ResultRow> {
  if (!Array.isArray(rows)) {
    throw new ResultDiffError(versionLabel === 'old' ? 'old-version-not-array' : 'new-version-not-array');
  }

  const map = new Map<string, ResultRow>();
  for (const row of rows) {
    if (!isValidRow(row)) {
      throw new ResultDiffError(versionLabel === 'old' ? 'old-version-row-malformed' : 'new-version-row-malformed');
    }
    if (map.has(row.analyteCode)) {
      throw new ResultDiffError(
        versionLabel === 'old' ? 'old-version-duplicate-analyte' : 'new-version-duplicate-analyte',
      );
    }
    map.set(row.analyteCode, row);
  }

  return map;
}

function isValidLimitValue(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isValidThreshold(value: unknown): value is SignificanceThreshold {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.analyteCode !== 'string' || candidate.analyteCode.trim().length === 0) {
    return false;
  }
  if (!isValidLimitValue(candidate.absolute) || !isValidLimitValue(candidate.percent)) {
    return false;
  }
  return candidate.absolute !== null || candidate.percent !== null;
}

function buildThresholdMap(thresholds: ReadonlyArray<SignificanceThreshold>): Map<string, SignificanceThreshold> {
  if (!Array.isArray(thresholds)) {
    throw new ResultDiffError('thresholds-not-array');
  }

  const map = new Map<string, SignificanceThreshold>();
  for (const threshold of thresholds) {
    if (!isValidThreshold(threshold)) {
      throw new ResultDiffError('thresholds-invalid');
    }
    if (map.has(threshold.analyteCode)) {
      throw new ResultDiffError('thresholds-duplicate-analyte');
    }
    map.set(threshold.analyteCode, threshold);
  }

  return map;
}

function toRowEntry(row: ResultRow): ResultDiffRowEntry {
  return Object.freeze({
    analyteCode: row.analyteCode,
    value: row.value,
    unit: displayUnit(row.unit),
    flags: normalizeFlags(row.flags),
  });
}

function formatValue(value: number | string): string {
  return typeof value === 'number' ? String(value) : value;
}

function formatFlagList(flags: ReadonlyArray<string>): string {
  return flags.length > 0 ? flags.join(',') : 'none';
}

function buildChangeLines(
  changed: ReadonlyArray<ResultDiffChangedEntry>,
  added: ReadonlyArray<ResultDiffRowEntry>,
  removed: ReadonlyArray<ResultDiffRowEntry>,
): string[] {
  const lines: string[] = [];

  for (const entry of changed) {
    const unitSuffix = entry.unit ? ` ${entry.unit}` : '';
    let line = `${entry.analyteCode}: ${formatValue(entry.oldValue)}${unitSuffix} -> ${formatValue(entry.newValue)}${unitSuffix}`;
    if (entry.flagsChanged) {
      line += ` [flags: ${formatFlagList(entry.oldFlags)} -> ${formatFlagList(entry.newFlags)}]`;
    }
    line += entry.significant ? ' (clinically significant)' : ' (not clinically significant)';
    lines.push(line);
  }

  for (const entry of added) {
    const unitSuffix = entry.unit ? ` ${entry.unit}` : '';
    let line = `${entry.analyteCode}: added ${formatValue(entry.value)}${unitSuffix}`;
    if (entry.flags.length > 0) {
      line += ` [flags: ${formatFlagList(entry.flags)}]`;
    }
    lines.push(line);
  }

  for (const entry of removed) {
    const unitSuffix = entry.unit ? ` ${entry.unit}` : '';
    let line = `${entry.analyteCode}: removed (was ${formatValue(entry.value)}${unitSuffix})`;
    if (entry.flags.length > 0) {
      line += ` [flags: ${formatFlagList(entry.flags)}]`;
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Compute a deterministic diff between two fabricated versions of a
 * report's analyte result set, using declared per-analyte significance
 * thresholds to classify each changed value.
 *
 * Fails closed (throws ResultDiffError) rather than guessing when: either
 * version is not a list, a row is missing a required field, a version
 * declares the same analyte more than once, an analyte declared in both
 * versions has mismatched units, or the declared thresholds are
 * structurally invalid, empty-limited, or duplicate an analyte.
 */
export function diffResultVersions(
  oldVersion: ReadonlyArray<ResultRow>,
  newVersion: ReadonlyArray<ResultRow>,
  thresholds: ReadonlyArray<SignificanceThreshold> = [],
): ResultVersionDiff {
  const thresholdMap = buildThresholdMap(thresholds);
  const oldMap = buildRowMap(oldVersion, 'old');
  const newMap = buildRowMap(newVersion, 'new');

  const added: ResultDiffRowEntry[] = [];
  const removed: ResultDiffRowEntry[] = [];
  const changed: ResultDiffChangedEntry[] = [];

  const sortedCodes = Array.from(new Set([...oldMap.keys(), ...newMap.keys()])).sort();

  for (const code of sortedCodes) {
    const oldRow = oldMap.get(code);
    const newRow = newMap.get(code);

    if (oldRow && !newRow) {
      removed.push(toRowEntry(oldRow));
      continue;
    }
    if (!oldRow && newRow) {
      added.push(toRowEntry(newRow));
      continue;
    }
    if (!oldRow || !newRow) {
      continue;
    }

    const oldCanonicalUnit = canonicalizeUnit(oldRow.unit);
    const newCanonicalUnit = canonicalizeUnit(newRow.unit);
    if (oldCanonicalUnit !== newCanonicalUnit) {
      throw new ResultDiffError('unit-mismatch');
    }

    const oldFlags = normalizeFlags(oldRow.flags);
    const newFlags = normalizeFlags(newRow.flags);
    const valueChanged = !valuesEqual(oldRow.value, newRow.value);
    const flagsChanged = !flagsEqual(oldFlags, newFlags);

    if (!valueChanged && !flagsChanged) {
      continue;
    }

    const oldNum = toFiniteNumber(oldRow.value);
    const newNum = toFiniteNumber(newRow.value);
    const bothNumeric = oldNum !== undefined && newNum !== undefined;
    const delta: ResultDiffDelta | null = bothNumeric
      ? Object.freeze({
          absolute: newNum! - oldNum!,
          percent: oldNum !== 0 ? ((newNum! - oldNum!) / Math.abs(oldNum!)) * 100 : null,
        })
      : null;

    let significant: boolean;
    let significanceReason: ResultDiffSignificanceReason;

    if (flagsChanged) {
      significant = true;
      significanceReason = 'flag-changed';
    } else if (!bothNumeric) {
      significant = true;
      significanceReason = 'nonnumeric-value-changed';
    } else {
      const threshold = thresholdMap.get(code);
      if (!threshold) {
        significant = true;
        significanceReason = 'no-threshold-declared';
      } else {
        const magnitudeAbs = Math.abs(delta!.absolute);
        const magnitudePercent = delta!.percent === null ? null : Math.abs(delta!.percent);
        const exceeds =
          (threshold.absolute !== null && magnitudeAbs > threshold.absolute) ||
          (threshold.percent !== null && magnitudePercent !== null && magnitudePercent > threshold.percent);
        significant = exceeds;
        significanceReason = exceeds ? 'exceeds-threshold' : 'within-threshold';
      }
    }

    changed.push(
      Object.freeze({
        analyteCode: code,
        oldValue: oldRow.value,
        newValue: newRow.value,
        unit: displayUnit(newRow.unit),
        oldFlags,
        newFlags,
        valueChanged,
        flagsChanged,
        delta,
        significant,
        significanceReason,
      }),
    );
  }

  return Object.freeze({
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    changed: Object.freeze(changed),
    hasSignificantChange: changed.some((entry) => entry.significant),
    changeLines: Object.freeze(buildChangeLines(changed, added, removed)),
  });
}
