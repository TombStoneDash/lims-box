import {
  evaluateMethodValidationGate,
  type MethodValidationGateDecision,
  type MethodValidationReasonCode,
  type MethodValidationRegistry,
} from './ohworks-method-validation';
import {
  evaluateLinearityVerification,
  type LinearityAcceptanceLimits,
  type LinearityDecision,
  type LinearityLevelInput,
  type LinearityReasonCode,
} from './ohworks-linearity';
import {
  evaluateMethodComparison,
  explainMethodComparisonCriterion,
  explainMethodComparisonError,
  MethodComparisonError,
  type MethodComparisonDecision,
  type MethodComparisonDeclaration,
  type MethodComparisonErrorCode,
  type MethodComparisonGoverningCriterion,
  type MethodComparisonLimitsOfAgreement,
  type MethodComparisonPair,
} from './ohworks-method-comparison';

/** Fixed synthetic run timestamp shared by every method-validation-gate scenario below. */
export const DEMO_RUN_AT = '2026-09-19T12:00:00.000Z';

type ValidationRun = { methodId: string; matrix: string; runAt: string };
type LinearitySet = { setId: string; levels: LinearityLevelInput[] };
type ComparisonSet = { setId: string; pairs: MethodComparisonPair[] };

/** All method ids, matrices, levels, limits and paired values here are fabricated examples, not regulatory guidance. */
export function createPilotMethodPerformanceFixtures(): {
  registry: MethodValidationRegistry;
  validationRuns: ValidationRun[];
  linearityLimits: LinearityAcceptanceLimits;
  linearitySets: LinearitySet[];
  comparisonDeclaration: MethodComparisonDeclaration;
  comparisonSets: ComparisonSet[];
} {
  const registry: MethodValidationRegistry = {
    'SYNTHETIC-METHOD-001': {
      methodId: 'SYNTHETIC-METHOD-001', validationState: 'validated',
      validatedAt: '2026-08-01T00:00:00.000Z', revalidationIntervalDays: 180,
      validatedMatrices: ['synthetic-serum', 'synthetic-plasma'],
    },
    'SYNTHETIC-METHOD-002': {
      methodId: 'SYNTHETIC-METHOD-002', validationState: 'validated',
      validatedAt: '2026-06-22T12:00:00.000Z', revalidationIntervalDays: 90,
      validatedMatrices: ['synthetic-serum'],
    },
    'SYNTHETIC-METHOD-003': {
      methodId: 'SYNTHETIC-METHOD-003', validationState: 'revalidation_due',
      validatedAt: '2026-01-01T00:00:00.000Z', revalidationIntervalDays: 365,
      validatedMatrices: ['synthetic-serum'],
    },
    'SYNTHETIC-METHOD-004': {
      methodId: 'SYNTHETIC-METHOD-004', validationState: 'validated',
      validatedAt: '2026-01-01T00:00:00.000Z', revalidationIntervalDays: 30,
      validatedMatrices: ['synthetic-serum'],
    },
    'SYNTHETIC-METHOD-005': {
      methodId: 'SYNTHETIC-METHOD-005', validationState: 'validated',
      validatedAt: '2026-08-01T00:00:00.000Z', revalidationIntervalDays: 180,
      validatedMatrices: ['synthetic-urine'],
    },
  };

  const validationRuns: ValidationRun[] = [
    { methodId: 'SYNTHETIC-METHOD-001', matrix: 'synthetic-serum', runAt: DEMO_RUN_AT },
    { methodId: 'SYNTHETIC-METHOD-002', matrix: 'synthetic-serum', runAt: DEMO_RUN_AT },
    { methodId: 'SYNTHETIC-METHOD-003', matrix: 'synthetic-serum', runAt: DEMO_RUN_AT },
    { methodId: 'SYNTHETIC-METHOD-004', matrix: 'synthetic-serum', runAt: DEMO_RUN_AT },
    { methodId: 'SYNTHETIC-METHOD-005', matrix: 'synthetic-serum', runAt: DEMO_RUN_AT },
    { methodId: 'SYNTHETIC-METHOD-006', matrix: 'synthetic-serum', runAt: DEMO_RUN_AT },
  ];

  const linearityLimits: LinearityAcceptanceLimits = {
    slopeMin: 0.9, slopeMax: 1.1, interceptMin: -5, interceptMax: 5,
    correlationMin: 0.99, recoveryMinPercent: 90, recoveryMaxPercent: 110,
  };

  const expectedFive = [10, 20, 30, 40, 50];
  const linearitySets: LinearitySet[] = [
    {
      setId: 'SYNTHETIC-LINEARITY-SET-1',
      levels: expectedFive.map((expected, index) => ({ levelId: `SYNTHETIC-LEVEL-1-${index + 1}`, expected, observed: expected })),
    },
    {
      setId: 'SYNTHETIC-LINEARITY-SET-2',
      levels: [10, 20, 33.3, 40, 50].map((observed, index) => ({ levelId: `SYNTHETIC-LEVEL-2-${index + 1}`, expected: expectedFive[index], observed })),
    },
    {
      setId: 'SYNTHETIC-LINEARITY-SET-3',
      levels: [10, 20, 30, 40].map((expected, index) => ({ levelId: `SYNTHETIC-LEVEL-3-${index + 1}`, expected, observed: expected })),
    },
  ];

  const comparisonDeclaration: MethodComparisonDeclaration = {
    minPairs: 4, unit: 'mg/dL', loaMultiplier: 1.96,
    allowableBias: { maxMeanDifference: 2, maxPercentBias: 10 },
  };
  const comparisonSets: ComparisonSet[] = [
    {
      setId: 'SYNTHETIC-COMPARISON-SET-1',
      pairs: expectedFive.map((referenceValue, index) => ({
        specimenId: `SYNTHETIC-PAIR-10${index + 1}`, referenceValue, referenceUnit: 'mg/dL',
        candidateValue: referenceValue + 0.5, candidateUnit: 'mg/dL',
      })),
    },
    {
      setId: 'SYNTHETIC-COMPARISON-SET-2',
      pairs: expectedFive.map((referenceValue, index) => ({
        specimenId: `SYNTHETIC-PAIR-20${index + 1}`, referenceValue, referenceUnit: 'mg/dL',
        candidateValue: referenceValue + 5, candidateUnit: 'mg/dL',
      })),
    },
    {
      setId: 'SYNTHETIC-COMPARISON-SET-3',
      pairs: [10, 20].map((referenceValue, index) => ({
        specimenId: `SYNTHETIC-PAIR-30${index + 1}`, referenceValue, referenceUnit: 'mg/dL',
        candidateValue: referenceValue + 0.5, candidateUnit: 'mg/dL',
      })),
    },
  ];

  return { registry, validationRuns, linearityLimits, linearitySets, comparisonDeclaration, comparisonSets };
}

export type PilotMethodValidationRow = {
  methodId: string;
  matrix: string;
  decision: MethodValidationGateDecision;
  reasonCode: MethodValidationReasonCode;
  reason: string;
};

export type PilotLinearityLevelRow = {
  levelId: string;
  expected: number;
  observed: number;
  recoveryPercent: number;
  withinLimits: boolean;
};

export type PilotLinearityRow = {
  setId: string;
  decision: LinearityDecision;
  reasonCode: LinearityReasonCode;
  reason: string;
  slope: number | null;
  intercept: number | null;
  correlation: number | null;
  slopeDisplay: string;
  interceptDisplay: string;
  correlationDisplay: string;
  levelRecoveries: PilotLinearityLevelRow[];
};

export type PilotMethodComparisonRow =
  | {
      setId: string;
      unresolved: false;
      pairCount: number;
      meanDifference: number;
      percentBias: number | null;
      limitsOfAgreement: MethodComparisonLimitsOfAgreement;
      passingBablok: { slope: number; intercept: number };
      decision: MethodComparisonDecision;
      governingCriterion: MethodComparisonGoverningCriterion;
      explanation: string;
    }
  | {
      setId: string;
      unresolved: true;
      code: MethodComparisonErrorCode;
      explanation: string;
    };

export type ResolvedPilotMethodComparisonRow = Extract<PilotMethodComparisonRow, { unresolved: false }>;
export type UnresolvedPilotMethodComparisonRow = Extract<PilotMethodComparisonRow, { unresolved: true }>;

/** Explicit type guard: this project disables strictNullChecks, so automatic discriminant narrowing on `unresolved` is unreliable. */
export function isUnresolvedComparisonRow(row: PilotMethodComparisonRow): row is UnresolvedPilotMethodComparisonRow {
  return row.unresolved;
}

export type PilotMethodPerformanceView = {
  runAt: string;
  validationRows: PilotMethodValidationRow[];
  linearityRows: PilotLinearityRow[];
  comparisonRows: PilotMethodComparisonRow[];
  counts: {
    runsBlocked: number;
    linearitySetsNotPassing: number;
    comparisonsNotAcceptable: number;
  };
};

function roundForDisplay(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(4);
}

/** Read-only synthetic evaluation; no backing instrument, LIMS write or persistence. */
export function buildPilotMethodPerformanceView(): PilotMethodPerformanceView {
  const fixtures = createPilotMethodPerformanceFixtures();

  const validationRows: PilotMethodValidationRow[] = fixtures.validationRuns.map((run) => {
    const result = evaluateMethodValidationGate(fixtures.registry, run.methodId, run.runAt, run.matrix);
    return { methodId: result.methodId, matrix: result.matrix, decision: result.decision, reasonCode: result.reasonCode, reason: result.reason };
  });

  const linearityRows: PilotLinearityRow[] = fixtures.linearitySets.map(({ setId, levels }) => {
    const result = evaluateLinearityVerification(levels, fixtures.linearityLimits);
    return {
      setId, decision: result.decision, reasonCode: result.reasonCode, reason: result.reason,
      slope: result.slope, intercept: result.intercept, correlation: result.correlation,
      slopeDisplay: roundForDisplay(result.slope), interceptDisplay: roundForDisplay(result.intercept), correlationDisplay: roundForDisplay(result.correlation),
      levelRecoveries: result.levelRecoveries.map((entry) => ({
        levelId: entry.levelId, expected: entry.expected, observed: entry.observed,
        recoveryPercent: entry.recoveryPercent, withinLimits: entry.withinLimits,
      })),
    };
  });

  const comparisonRows: PilotMethodComparisonRow[] = fixtures.comparisonSets.map(({ setId, pairs }): PilotMethodComparisonRow => {
    try {
      const result = evaluateMethodComparison(pairs, fixtures.comparisonDeclaration);
      return {
        setId, unresolved: false, pairCount: result.pairCount, meanDifference: result.meanDifference,
        percentBias: result.percentBias, limitsOfAgreement: result.limitsOfAgreement,
        passingBablok: { slope: result.passingBablok.slope, intercept: result.passingBablok.intercept },
        decision: result.decision, governingCriterion: result.governingCriterion,
        explanation: explainMethodComparisonCriterion(result.governingCriterion),
      };
    } catch (error) {
      if (!(error instanceof MethodComparisonError)) {
        throw error;
      }
      return { setId, unresolved: true, code: error.code, explanation: explainMethodComparisonError(error.code) };
    }
  });

  return {
    runAt: DEMO_RUN_AT,
    validationRows,
    linearityRows,
    comparisonRows,
    counts: {
      runsBlocked: validationRows.filter((row) => row.decision === 'blocked').length,
      linearitySetsNotPassing: linearityRows.filter((row) => row.decision !== 'pass').length,
      comparisonsNotAcceptable: comparisonRows.filter((row) => isUnresolvedComparisonRow(row) || row.decision !== 'acceptable').length,
    },
  };
}
