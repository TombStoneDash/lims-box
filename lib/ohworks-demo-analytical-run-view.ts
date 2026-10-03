import { evaluateCarryoverRisk, explainCarryoverReason, type CarryoverAssessment, type CarryoverRun } from './ohworks-carryover';
import { evaluateDilutionRerun, explainDilutionRerunReason, type DilutionRerunOutcome, type DilutionRerunRequest } from './ohworks-dilution-rerun';

export interface PilotAnalyticalRunFixture {
  carryoverRun: CarryoverRun;
  dilutionReadings: { id: string; label: string; request: DilutionRerunRequest }[];
}

/** Every identifier, reading, threshold, range and factor is fabricated. No instrument or server is used. */
export function createPilotAnalyticalRunFixture(): PilotAnalyticalRunFixture {
  const analyteCode = 'SYNTHETIC-ANALYTE-A';
  return {
    carryoverRun: {
      rules: [{ analyteCode, highThreshold: 100, carryoverFactor: 0.012345, repeatThreshold: 5 }],
      // Washes isolate the severe source, moderate source, and final washed low result.
      results: [20, 1000, 10, 200, 12, 1000, 15, 18].map((value, index) => ({
        resultId: `SYNTHETIC-RES-${String(index + 1).padStart(3, '0')}`,
        position: index + 1, analyteCode, value, washBefore: [3, 5, 6].includes(index),
      })),
    },
    dilutionReadings: [
      { label: 'Fabricated in-range reading', rawReading: 40, appliedDilutionFactor: 2, rerunCount: 0, analyteCode },
      { label: 'Fabricated above-range reading', rawReading: 150, appliedDilutionFactor: 2, rerunCount: 0, analyteCode },
      { label: 'Fabricated top-of-ladder reading', rawReading: 150, appliedDilutionFactor: 20, rerunCount: 0, analyteCode },
      { label: 'Fabricated exhausted rerun count', rawReading: 150, appliedDilutionFactor: 2, rerunCount: 3, analyteCode },
      { label: 'Fabricated missing measuring range', rawReading: 150, appliedDilutionFactor: 1, rerunCount: 0, analyteCode: 'SYNTHETIC-ANALYTE-B' },
    ].map((reading, index) => ({
      id: `SYNTHETIC-RES-${String(index + 101).padStart(3, '0')}`,
      label: reading.label,
      request: {
        result: { analyteCode: reading.analyteCode, unit: 'synthetic-units', rawReading: reading.rawReading, appliedDilutionFactor: reading.appliedDilutionFactor },
        measuringRanges: [{ analyteCode, unit: 'synthetic-units', lowerLimit: 0, upperLimit: 100 }],
        ladder: { analyteCode: reading.analyteCode, factors: [2, 5, 10, 20] },
        maxDilutionFactor: 20,
        rerunTracking: { rerunCount: reading.rerunCount, maxReruns: 3 },
      },
    })),
  };
}

export interface PilotAnalyticalRunView {
  carryoverRows: (CarryoverAssessment & {
    position: number; positionId: string; value: number; washBefore: boolean;
    contributionText: string; sourcePositionText: string; explanation: string;
  })[];
  dilutionRows: (DilutionRerunOutcome & {
    id: string; label: string; rawReading: number; appliedDilutionFactor: number; outcomeText: string;
  })[];
  counts: { mustRepeat: number; rerunsRequired: number; blocked: number };
}

export function buildPilotAnalyticalRunView(): PilotAnalyticalRunView {
  const fixture = createPilotAnalyticalRunFixture();
  const positionId = (position: number) => `SYNTHETIC-POS-${String(position).padStart(2, '0')}`;
  const carryoverRows = evaluateCarryoverRisk(fixture.carryoverRun).map((assessment, index) => {
    const input = fixture.carryoverRun.results[index];
    return {
      ...assessment, position: input.position, positionId: positionId(input.position),
      value: input.value as number, washBefore: input.washBefore,
      contributionText: assessment.contribution === null ? '—' : assessment.contribution.toFixed(3),
      sourcePositionText: assessment.sourcePosition === null ? '—' : positionId(assessment.sourcePosition),
      explanation: explainCarryoverReason(assessment.reasonCode),
    };
  });
  const dilutionRows = fixture.dilutionReadings.map(({ id, label, request }) => {
    const outcome = evaluateDilutionRerun(request);
    return {
      ...outcome, id, label, rawReading: request.result.rawReading,
      appliedDilutionFactor: request.result.appliedDilutionFactor,
      reason: explainDilutionRerunReason(outcome.reasonCode),
      outcomeText: outcome.nextDilutionFactor !== null ? `Next factor: ${outcome.nextDilutionFactor}`
        : outcome.greaterThanLimit !== null ? `Greater than: > ${outcome.greaterThanLimit} synthetic-units`
          : outcome.correctedResult !== null ? `Corrected result: ${outcome.correctedResult} synthetic-units` : '—',
    };
  });
  return {
    carryoverRows, dilutionRows,
    counts: {
      mustRepeat: carryoverRows.filter((row) => row.status === 'must_repeat').length,
      rerunsRequired: dilutionRows.filter((row) => row.decision === 'rerun_with_dilution').length,
      blocked: dilutionRows.filter((row) => row.decision === 'block').length,
    },
  };
}
