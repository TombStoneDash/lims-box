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

function isValidAnalyteInput(analyte: QCAnalyteInput): boolean {
  if (!Number.isFinite(analyte.mean) || !Number.isFinite(analyte.sd) || analyte.sd <= 0) {
    return false;
  }
  if (!Array.isArray(analyte.runs) || analyte.runs.length === 0) {
    return false;
  }
  return analyte.runs.every(run => Number.isFinite(run.result));
}

export function evaluateAnalyteQC(analyte: QCAnalyteInput): QCAnalyteEvaluation {
  if (!isValidAnalyteInput(analyte)) {
    return {
      name: analyte.name,
      status: 'invalid',
      totalRuns: Array.isArray(analyte.runs) ? analyte.runs.length : 0,
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
  const evaluations = analytes.map(evaluateAnalyteQC);

  const invalidAnalytes = evaluations.filter(e => e.status === 'invalid').map(e => e.name);
  const outOfRangeAnalytes = evaluations.filter(e => e.status === 'out-of-range').map(e => e.name);
  const totalRuns = evaluations.reduce((n, e) => n + e.totalRuns, 0);
  const outOfRangeCount = evaluations.reduce((n, e) => n + e.outOfRangeCount, 0);

  const status: QCAnalyteStatusValue =
    invalidAnalytes.length > 0 ? 'invalid' : outOfRangeAnalytes.length > 0 ? 'out-of-range' : 'in-range';

  return {
    status,
    analyteCount: analytes.length,
    totalRuns,
    outOfRangeCount,
    outOfRangeAnalytes,
    invalidAnalytes,
  };
}
