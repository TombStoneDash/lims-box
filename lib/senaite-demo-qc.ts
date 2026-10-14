export type QCRunInput = { date: string; result: number };

export type QCAnalyteInput = {
  name: string;
  mean: number;
  sd: number;
  runs: QCRunInput[];
};

export type QCRunEvaluation = QCRunInput & {
  deviations: number;
  outOfRange: boolean;
};

export type QCAnalyteStatusValue = 'in-range' | 'out-of-range' | 'invalid';

export type QCAnalyteEvaluation = {
  name: string;
  status: QCAnalyteStatusValue;
  totalRuns: number;
  outOfRangeCount: number;
  runs: QCRunEvaluation[];
};

export type QCEvaluationSummary = {
  status: QCAnalyteStatusValue;
  analyteCount: number;
  totalRuns: number;
  outOfRangeCount: number;
  outOfRangeAnalytes: string[];
  invalidAnalytes: string[];
};

const OUT_OF_RANGE_SD_THRESHOLD = 3;
// Guards against float noise (e.g. 1.2 / 0.4 === 2.9999999999999996 in IEEE 754)
// so a result that is decimally exactly at the threshold is still classified out of range.
const SD_THRESHOLD_EPSILON = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidRun(run: unknown): run is QCRunInput {
  return isRecord(run) && Number.isFinite((run as { result: unknown }).result as number);
}

function isValidAnalyteInput(analyte: unknown): analyte is QCAnalyteInput {
  if (!isRecord(analyte)) {
    return false;
  }
  const { mean, sd, runs } = analyte as QCAnalyteInput;
  if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) {
    return false;
  }
  if (!Array.isArray(runs) || runs.length === 0) {
    return false;
  }
  // Spread to turn array holes into explicit `undefined` entries: every()/map()/filter()
  // silently skip holes (per spec), which would otherwise let a sparse runs list pass validation.
  return [...runs].every(isValidRun);
}

export function evaluateAnalyteQC(analyte: QCAnalyteInput): QCAnalyteEvaluation {
  if (!isValidAnalyteInput(analyte)) {
    const unsafeAnalyte: unknown = analyte;
    const name = isRecord(unsafeAnalyte) && typeof unsafeAnalyte.name === 'string' ? unsafeAnalyte.name : '';
    const runs = isRecord(unsafeAnalyte) ? unsafeAnalyte.runs : undefined;
    return {
      name,
      status: 'invalid',
      totalRuns: Array.isArray(runs) ? runs.length : 0,
      outOfRangeCount: 0,
      runs: [],
    };
  }

  const runs = analyte.runs.map(run => {
    const deviations = Math.abs(run.result - analyte.mean) / analyte.sd;
    return { ...run, deviations, outOfRange: deviations >= OUT_OF_RANGE_SD_THRESHOLD - SD_THRESHOLD_EPSILON };
  });
  const outOfRangeCount = runs.filter(run => run.outOfRange).length;

  return {
    name: analyte.name,
    status: outOfRangeCount > 0 ? 'out-of-range' : 'in-range',
    totalRuns: runs.length,
    outOfRangeCount,
    runs,
  };
}

export function evaluateQCSummary(analytes: QCAnalyteInput[]): QCEvaluationSummary {
  if (!Array.isArray(analytes)) {
    return {
      status: 'invalid',
      analyteCount: 0,
      totalRuns: 0,
      outOfRangeCount: 0,
      outOfRangeAnalytes: [],
      invalidAnalytes: [],
    };
  }

  // Spread to turn array holes into explicit `undefined` entries: map() silently skips
  // holes (per spec), which would otherwise let a sparse analytes list evade validation.
  const denseAnalytes = [...analytes];
  const evaluations = denseAnalytes.map(evaluateAnalyteQC);

  const invalidAnalytes = evaluations.filter(e => e.status === 'invalid').map(e => e.name);
  const outOfRangeAnalytes = evaluations.filter(e => e.status === 'out-of-range').map(e => e.name);
  const totalRuns = evaluations.reduce((n, e) => n + e.totalRuns, 0);
  const outOfRangeCount = evaluations.reduce((n, e) => n + e.outOfRangeCount, 0);

  const status: QCAnalyteStatusValue =
    denseAnalytes.length === 0 || invalidAnalytes.length > 0
      ? 'invalid'
      : outOfRangeAnalytes.length > 0
        ? 'out-of-range'
        : 'in-range';

  return {
    status,
    analyteCount: denseAnalytes.length,
    totalRuns,
    outOfRangeCount,
    outOfRangeAnalytes,
    invalidAnalytes,
  };
}
