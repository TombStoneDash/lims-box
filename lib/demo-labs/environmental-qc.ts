/**
 * Synthetic batch QC and hold-time checks for the environmental demo profile.
 * Acceptance windows are demo values, not method-published limits; the public
 * method sources behind every number are listed in docs/demo-labs/METHODS_SOURCES.md.
 * A failing QC element never auto-releases a batch: it returns `needs_review`.
 */

export type QcElementKind = 'method_blank' | 'lcs' | 'lcsd' | 'ms' | 'msd' | 'duplicate';

export type QcElement = Readonly<{
  kind: QcElementKind;
  /** Percent recovery for LCS/LCSD/MS/MSD; measured concentration for a blank; RPD % for a duplicate. */
  value: number;
}>;

export type QcLimits = Readonly<{
  recoveryMin: number;
  recoveryMax: number;
  matrixSpikeMin: number;
  matrixSpikeMax: number;
  maxRpd: number;
  /** Reporting limit; a method blank must read below it. */
  reportingLimit: number;
}>;

export type MethodQcRule = Readonly<{
  methodCode: string;
  limits: QcLimits;
  /** Maximum holding time from collection to analysis, in hours. */
  holdTimeHours: number;
}>;

const rule = (methodCode: string, holdTimeHours: number, limits: Partial<QcLimits> = {}): MethodQcRule =>
  Object.freeze({
    methodCode,
    holdTimeHours,
    limits: Object.freeze({
      recoveryMin: 85,
      recoveryMax: 115,
      matrixSpikeMin: 70,
      matrixSpikeMax: 130,
      maxRpd: 20,
      reportingLimit: 1,
      ...limits,
    }),
  });

/** Synthetic QC windows; hold times follow 40 CFR 136 Table II / EPA method text (see METHODS_SOURCES.md). */
export const ENVIRONMENTAL_QC_RULES: Readonly<Record<string, MethodQcRule>> = Object.freeze({
  'EPA-200.8': rule('EPA-200.8', 24 * 180),
  'EPA-300.0': rule('EPA-300.0', 24 * 28, { recoveryMin: 90, recoveryMax: 110, matrixSpikeMin: 80, matrixSpikeMax: 120 }),
  'SM-9223B': rule('SM-9223B', 30),
  'SM-5210B': rule('SM-5210B', 48),
  'SM-2540D': rule('SM-2540D', 24 * 7),
  'SM-5220D': rule('SM-5220D', 24 * 28),
  'EPA-524.2': rule('EPA-524.2', 24 * 14, { recoveryMin: 70, recoveryMax: 130 }),
});

export type QcFinding = Readonly<{ kind: QcElementKind; value: number; passed: boolean; reason: string }>;

export type BatchQcResult = Readonly<{
  methodCode: string;
  status: 'pass' | 'needs_review';
  findings: readonly QcFinding[];
}>;

function checkElement(element: QcElement, limits: QcLimits): QcFinding {
  const { kind, value } = element;
  if (!Number.isFinite(value)) return { kind, value, passed: false, reason: 'value is not a number' };
  switch (kind) {
    case 'method_blank':
      return value < limits.reportingLimit
        ? { kind, value, passed: true, reason: 'blank below reporting limit' }
        : { kind, value, passed: false, reason: `blank ${value} at or above reporting limit ${limits.reportingLimit}` };
    case 'lcs':
    case 'lcsd':
      return value >= limits.recoveryMin && value <= limits.recoveryMax
        ? { kind, value, passed: true, reason: 'recovery within window' }
        : { kind, value, passed: false, reason: `recovery ${value}% outside ${limits.recoveryMin}-${limits.recoveryMax}%` };
    case 'ms':
    case 'msd':
      return value >= limits.matrixSpikeMin && value <= limits.matrixSpikeMax
        ? { kind, value, passed: true, reason: 'spike recovery within window' }
        : { kind, value, passed: false, reason: `spike recovery ${value}% outside ${limits.matrixSpikeMin}-${limits.matrixSpikeMax}%` };
    case 'duplicate':
      return value <= limits.maxRpd
        ? { kind, value, passed: true, reason: 'RPD within limit' }
        : { kind, value, passed: false, reason: `RPD ${value}% above ${limits.maxRpd}%` };
  }
}

const REQUIRED: readonly QcElementKind[] = ['method_blank', 'lcs'];

/** Evaluates one analytical batch. Unknown method, missing blank/LCS, or any failure → needs_review. */
export function evaluateBatchQc(methodCode: string, elements: readonly QcElement[]): BatchQcResult {
  const methodRule = ENVIRONMENTAL_QC_RULES[methodCode];
  if (!methodRule) {
    return { methodCode, status: 'needs_review', findings: [] };
  }
  const findings = elements.map((element) => checkElement(element, methodRule.limits));
  const missing = REQUIRED.filter((kind) => !elements.some((element) => element.kind === kind));
  const allPassed = findings.length > 0 && findings.every((finding) => finding.passed);
  return { methodCode, status: allPassed && missing.length === 0 ? 'pass' : 'needs_review', findings };
}

export type HoldTimeCheck = Readonly<{
  methodCode: string;
  elapsedHours: number;
  limitHours: number | null;
  exceeded: boolean;
  flag: 'ok' | 'hold_time_exceeded' | 'unknown_method' | 'invalid_time';
}>;

/** Flags a sample whose analysis started after the method's holding time. */
export function checkHoldTime(methodCode: string, collectedAt: string | Date, analyzedAt: string | Date): HoldTimeCheck {
  const methodRule = ENVIRONMENTAL_QC_RULES[methodCode];
  const start = new Date(collectedAt).getTime();
  const end = new Date(analyzedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { methodCode, elapsedHours: NaN, limitHours: methodRule?.holdTimeHours ?? null, exceeded: true, flag: 'invalid_time' };
  }
  const elapsedHours = (end - start) / 3_600_000;
  if (!methodRule) {
    return { methodCode, elapsedHours, limitHours: null, exceeded: true, flag: 'unknown_method' };
  }
  const exceeded = elapsedHours > methodRule.holdTimeHours;
  return { methodCode, elapsedHours, limitHours: methodRule.holdTimeHours, exceeded, flag: exceeded ? 'hold_time_exceeded' : 'ok' };
}
