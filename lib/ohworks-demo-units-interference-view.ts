import {
  convertResultToCanonicalUnit,
  explainResultUnitConversionError,
  ResultUnitConversionError,
  type ResultUnitConversionErrorCode,
  type ResultUnitConversionInput,
} from './ohworks-result-units';
import {
  evaluateSpecimenInterference,
  type AnalyteInterferenceDecisionStatus,
  type AnalyteInterferenceReasonCode,
  type InterferenceEvaluationInput,
  type InterferenceToleranceTable,
  type SpecimenInterferenceSummary,
} from './ohworks-interference';

type ConversionFixture = ResultUnitConversionInput & { id: string };

const ORDERED_ANALYTES = [
  'SYNTHETIC-ANALYTE-K',
  'SYNTHETIC-ANALYTE-AST',
  'SYNTHETIC-ANALYTE-TBIL',
  'SYNTHETIC-ANALYTE-TRIG',
] as const;

/** All analyte codes, thresholds, index values and identifiers below are fabricated examples, not regulatory guidance. */
export function createPilotUnitsInterferenceFixtures(): {
  conversions: ConversionFixture[];
  toleranceTable: InterferenceToleranceTable;
  specimens: InterferenceEvaluationInput[];
} {
  const toleranceTable: InterferenceToleranceTable = {
    'SYNTHETIC-ANALYTE-K': {
      hemolysis: { commentAt: 50, commentCode: 'SYNTHETIC-HEM-COMMENT', suppressAt: 100 },
      icterus: null,
      lipemia: null,
    },
    'SYNTHETIC-ANALYTE-AST': {
      hemolysis: null,
      icterus: { commentAt: 40, commentCode: 'SYNTHETIC-ICT-COMMENT', suppressAt: null },
      lipemia: null,
    },
    'SYNTHETIC-ANALYTE-TBIL': {
      hemolysis: null,
      icterus: null,
      lipemia: { commentAt: null, commentCode: null, suppressAt: 60 },
    },
    'SYNTHETIC-ANALYTE-TRIG': { hemolysis: null, icterus: null, lipemia: null },
  };

  return {
    conversions: [
      { id: 'SYNTHETIC-RESULT-001', analyte: 'analyte-synthetic-mass-001', valueText: '1230', fromUnit: 'µg/L' },
      { id: 'SYNTHETIC-RESULT-002', analyte: 'analyte-synthetic-mass-001', valueText: '2.5', fromUnit: 'g/L' },
      { id: 'SYNTHETIC-RESULT-003', analyte: 'analyte-synthetic-volume-001', valueText: '3.5', fromUnit: '%' },
      { id: 'SYNTHETIC-RESULT-004', analyte: 'analyte-synthetic-count-001', valueText: '250', fromUnit: 'count/100mL' },
      { id: 'SYNTHETIC-RESULT-005', analyte: 'analyte-synthetic-mass-001', valueText: '12.5', fromUnit: 'mg/L' },
      { id: 'SYNTHETIC-RESULT-006', analyte: 'analyte-synthetic-count-001', valueText: '10', fromUnit: 'mg/L' },
      { id: 'SYNTHETIC-RESULT-007', analyte: 'analyte-synthetic-mass-001', valueText: '5', fromUnit: 'kg/L' },
    ],
    toleranceTable,
    specimens: [
      {
        specimenId: 'SYNTHETIC-SPEC-HIL-001',
        indices: { hemolysisIndex: 10, icterusIndex: 10, lipemiaIndex: 10 },
        orderedAnalytes: [...ORDERED_ANALYTES],
        toleranceTable,
      },
      {
        specimenId: 'SYNTHETIC-SPEC-HIL-002',
        indices: { hemolysisIndex: 60, icterusIndex: 10, lipemiaIndex: 10 },
        orderedAnalytes: [...ORDERED_ANALYTES],
        toleranceTable,
      },
      {
        specimenId: 'SYNTHETIC-SPEC-HIL-003',
        indices: { hemolysisIndex: 150, icterusIndex: 10, lipemiaIndex: 10 },
        orderedAnalytes: [...ORDERED_ANALYTES],
        toleranceTable,
      },
      {
        specimenId: 'SYNTHETIC-SPEC-HIL-004',
        indices: { hemolysisIndex: 10, icterusIndex: 10 },
        orderedAnalytes: [...ORDERED_ANALYTES],
        toleranceTable,
      },
    ],
  };
}

export type PilotUnitConversionRow = {
  id: string;
  analyte: string;
  inputText: string;
  inputUnit: string;
  outcome: 'converted' | 'refused';
  canonicalText: string | null;
  canonicalUnit: string | null;
  significantFigures: number | null;
  errorCode: ResultUnitConversionErrorCode | null;
  explanation: string;
};

export type PilotInterferenceDecisionRow = {
  analyteCode: string;
  status: AnalyteInterferenceDecisionStatus;
  reasonCode: AnalyteInterferenceReasonCode;
  commentCodes: readonly string[];
};

export type PilotInterferenceSpecimenRow = {
  specimenId: string;
  hemolysisIndex: number | null;
  icterusIndex: number | null;
  lipemiaIndex: number | null;
  decisions: PilotInterferenceDecisionRow[];
  summary: SpecimenInterferenceSummary;
};

export type PilotUnitsInterferenceView = {
  conversionRows: PilotUnitConversionRow[];
  toleranceTable: InterferenceToleranceTable;
  specimenRows: PilotInterferenceSpecimenRow[];
  counts: {
    conversionsRefused: number;
    analytesSuppressed: number;
    analytesReportedWithComment: number;
  };
};

/** Read-only synthetic evaluation; no backing server or persistence. */
export function buildPilotUnitsInterferenceView(): PilotUnitsInterferenceView {
  const fixtures = createPilotUnitsInterferenceFixtures();

  const conversionRows = fixtures.conversions.map((fixture): PilotUnitConversionRow => {
    const { id, ...input } = fixture;
    try {
      const result = convertResultToCanonicalUnit(input);
      return {
        id, analyte: input.analyte, inputText: input.valueText, inputUnit: input.fromUnit,
        outcome: 'converted', canonicalText: result.valueText, canonicalUnit: result.canonicalUnit,
        significantFigures: result.significantFigures, errorCode: null,
        explanation: `Converted from ${input.fromUnit} to canonical unit ${result.canonicalUnit}.`,
      };
    } catch (error) {
      if (!(error instanceof ResultUnitConversionError)) throw error;
      return {
        id, analyte: input.analyte, inputText: input.valueText, inputUnit: input.fromUnit,
        outcome: 'refused', canonicalText: null, canonicalUnit: null, significantFigures: null,
        errorCode: error.code, explanation: explainResultUnitConversionError(error.code),
      };
    }
  });

  const specimenRows = fixtures.specimens.map((input): PilotInterferenceSpecimenRow => {
    const result = evaluateSpecimenInterference(input);
    return {
      specimenId: input.specimenId,
      hemolysisIndex: input.indices.hemolysisIndex ?? null,
      icterusIndex: input.indices.icterusIndex ?? null,
      lipemiaIndex: input.indices.lipemiaIndex ?? null,
      decisions: result.decisions.map((decision) => ({
        analyteCode: decision.analyteCode, status: decision.status,
        reasonCode: decision.reasonCode, commentCodes: decision.commentCodes,
      })),
      summary: result.summary,
    };
  });

  return {
    conversionRows,
    toleranceTable: fixtures.toleranceTable,
    specimenRows,
    counts: {
      conversionsRefused: conversionRows.filter((row) => row.outcome === 'refused').length,
      analytesSuppressed: specimenRows.reduce(
        (sum, row) => sum + row.decisions.filter((decision) => decision.status === 'suppress').length, 0,
      ),
      analytesReportedWithComment: specimenRows.reduce(
        (sum, row) => sum + row.decisions.filter((decision) => decision.status === 'report_with_comment').length, 0,
      ),
    },
  };
}
