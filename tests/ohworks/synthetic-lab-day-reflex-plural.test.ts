import test from 'node:test';
import assert from 'node:assert/strict';
import { runSyntheticLabDay, type SyntheticLabDayInput, type SyntheticLabDayResultInput } from '../../lib/ohworks-synthetic-lab-day';

function fixture(): SyntheticLabDayInput {
  const result: SyntheticLabDayResultInput = {
    resultId: 'SYNTHETIC-CLEAN', subjectId: 'SYNTHETIC-SUBJECT-CLEAN', specimenId: 'SYNTHETIC-SPECIMEN-CLEAN',
    runId: 'SYNTHETIC-RUN-GOOD', testCode: 'SYNTHETIC-GLUCOSE', analyteCode: 'GLUCOSE', value: 90,
    instrumentUnit: 'mg/dL', resultTimestamp: '2026-09-19T10:00:00Z', limitOfDetection: 0.1, upperLimitOfQuantitation: 30,
    deltaRules: [{ windowMs: 86400000, unit: 'mmol/L', flag: { absolute: 1, percent: null }, block: { absolute: 2, percent: null } }],
    measurementRange: { lowerBound: 0.1, upperBound: 30, unit: 'mmol/L' }, criticalLimits: { lower: 1, upper: 25, unit: 'mmol/L' },
    instrumentFlags: [], consumptionVolume: 1,
  };
  return {
    catalog: [
      { versionId: 'SYNTHETIC-V2', testCode: 'SYNTHETIC-GLUCOSE', methodIdentifier: 'SYNTHETIC-METHOD', units: 'mmol/L', referenceInterval: { lowerBound: 3, upperBound: 6 }, effectiveFrom: '2026-09-19T00:00:00Z' },
    ],
    runs: [{ runId: 'SYNTHETIC-RUN-GOOD', qc: { levels: [{ levelId: 'SYNTHETIC-LEVEL', mean: 10, sd: 1 }], results: [{ levelId: 'SYNTHETIC-LEVEL', runId: 'SYNTHETIC-RUN-GOOD', value: 10 }] } }],
    specimens: [{ volume: { accessionId: result.specimenId, initialVolume: 10, deadVolume: 0 }, turnaround: { priorityClass: 'STAT', timestamps: { collectedAt: '2026-09-19T09:30:00Z', receivedAt: '2026-09-19T09:40:00Z', analyzedAt: '2026-09-19T10:00:00Z', reportedAt: '2026-09-19T10:10:00Z' } } }],
    results: [result],
  };
}

test('reflex-plan explanation uses singular analyte for a single addition', () => {
  const input = fixture();
  input.extended = {
    reflex: {
      knownAnalytes: ['GLUCOSE', 'SYNTHETIC-REFLEX'],
      rules: [{ id: 'SYNTHETIC-REFLEX-RULE', triggerAnalyte: 'GLUCOSE', comparison: 'gte', threshold: 5, reflexAnalytes: ['SYNTHETIC-REFLEX'], maxReflexDepth: 1 }],
    },
  };
  const report = runSyntheticLabDay(input);
  const result = report.results[0];
  assert.deepEqual(result.reflexAdditions, ['SYNTHETIC-REFLEX']);
  const reflexTrace = result.trace.find(t => t.step === 'reflex-plan');
  assert.equal(reflexTrace?.explanation, 'Fabricated reflex plan adds 1 analyte.');
});

test('reflex-plan explanation stays plural for two additions', () => {
  const input = fixture();
  input.extended = {
    reflex: {
      knownAnalytes: ['GLUCOSE', 'SYNTHETIC-REFLEX', 'SYNTHETIC-REFLEX-2'],
      rules: [{ id: 'SYNTHETIC-REFLEX-RULE', triggerAnalyte: 'GLUCOSE', comparison: 'gte', threshold: 5, reflexAnalytes: ['SYNTHETIC-REFLEX', 'SYNTHETIC-REFLEX-2'], maxReflexDepth: 1 }],
    },
  };
  const report = runSyntheticLabDay(input);
  const result = report.results[0];
  assert.deepEqual(result.reflexAdditions, ['SYNTHETIC-REFLEX', 'SYNTHETIC-REFLEX-2']);
  const reflexTrace = result.trace.find(t => t.step === 'reflex-plan');
  assert.equal(reflexTrace?.explanation, 'Fabricated reflex plan adds 2 analytes.');
});
