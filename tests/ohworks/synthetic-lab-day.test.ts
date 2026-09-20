import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSyntheticLabDay, type SyntheticLabDayInput, type SyntheticLabDayResultInput } from '../../lib/ohworks-synthetic-lab-day';

function fixture(): SyntheticLabDayInput {
  const result = (id: string, overrides: Partial<SyntheticLabDayResultInput> = {}): SyntheticLabDayResultInput => ({
    resultId: `SYNTHETIC-${id}`, subjectId: `SYNTHETIC-SUBJECT-${id}`, specimenId: `SYNTHETIC-SPECIMEN-${id}`,
    runId: 'SYNTHETIC-RUN-GOOD', testCode: 'SYNTHETIC-GLUCOSE', analyteCode: 'GLUCOSE', value: 90,
    instrumentUnit: 'mg/dL', resultTimestamp: '2026-09-19T10:00:00Z', limitOfDetection: 0.1, upperLimitOfQuantitation: 30,
    deltaRules: [{ windowMs: 86400000, unit: 'mmol/L', flag: { absolute: 1, percent: null }, block: { absolute: 2, percent: null } }],
    measurementRange: { lowerBound: 0.1, upperBound: 30, unit: 'mmol/L' }, criticalLimits: { lower: 1, upper: 25, unit: 'mmol/L' },
    instrumentFlags: [], consumptionVolume: 1, ...overrides,
  });
  const results = [
    result('CLEAN'),
    result('QC-A', { runId: 'SYNTHETIC-RUN-BAD' }),
    result('QC-B', { runId: 'SYNTHETIC-RUN-BAD' }),
    result('DELTA', { previousResult: { subjectId: 'SYNTHETIC-SUBJECT-DELTA', analyteCode: 'GLUCOSE', value: 2, unit: 'mmol/L', capturedAt: '2026-09-19T09:00:00Z' } }),
    result('UNKNOWN', { analyteCode: 'SYNTHETIC-UNKNOWN' }),
    result('OLD', { resultTimestamp: '2026-09-18T10:00:00Z' }),
    result('NEW'),
    result('VOLUME', { consumptionVolume: 11 }),
    result('LATE'),
  ];
  return {
    catalog: [
      { versionId: 'SYNTHETIC-V1', testCode: 'SYNTHETIC-GLUCOSE', methodIdentifier: 'SYNTHETIC-METHOD', units: 'mmol/L', referenceInterval: { lowerBound: 3, upperBound: 4 }, effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: '2026-09-19T00:00:00Z' },
      { versionId: 'SYNTHETIC-V2', testCode: 'SYNTHETIC-GLUCOSE', methodIdentifier: 'SYNTHETIC-METHOD', units: 'mmol/L', referenceInterval: { lowerBound: 3, upperBound: 6 }, effectiveFrom: '2026-09-19T00:00:00Z' },
    ],
    runs: [10, 14].map((value, i) => ({ runId: i ? 'SYNTHETIC-RUN-BAD' : 'SYNTHETIC-RUN-GOOD', qc: { levels: [{ levelId: 'SYNTHETIC-LEVEL', mean: 10, sd: 1 }], results: [{ levelId: 'SYNTHETIC-LEVEL', runId: i ? 'SYNTHETIC-RUN-BAD' : 'SYNTHETIC-RUN-GOOD', value }] } })),
    specimens: results.map(r => ({ volume: { accessionId: r.specimenId, initialVolume: 10, deadVolume: 0 }, turnaround: { priorityClass: 'STAT', timestamps: { collectedAt: r.resultTimestamp.replace('10:00', '09:30'), receivedAt: r.resultTimestamp.replace('10:00', '09:40'), analyzedAt: r.resultTimestamp, reportedAt: r.resultTimestamp.replace('10:00', r.resultId === 'SYNTHETIC-LATE' ? '12:00' : '10:10') } } })),
    results,
  };
}

test('fabricated lab day chains all eight real rules with reconciled totals', () => {
  const input = fixture();
  const before = structuredClone(input);
  const report = runSyntheticLabDay(input);
  const byId = (id: string) => report.results.find(r => r.resultId === `SYNTHETIC-${id}`)!;
  assert.equal(byId('CLEAN').outcome, 'AUTO_RELEASE');
  assert.equal(byId('CLEAN').converted?.value, 5);
  assert.deepEqual(byId('CLEAN').trace.map(t => t.step), ['effective-definition', 'unit-conversion', 'reference-range', 'delta-check', 'qc-rules', 'volume-ledger', 'autoverification', 'turnaround-time']);
  for (const id of ['QC-A', 'QC-B']) {
    assert.equal(byId(id).outcome, 'HOLD_FOR_REVIEW');
    assert.deepEqual(byId(id).holdReasonCodes, ['qc-out-of-control']);
    assert.deepEqual(byId(id).trace.find(t => t.step === 'qc-rules')?.reasonCodes, ['1_3s']);
  }
  assert.equal(byId('DELTA').outcome, 'HOLD_FOR_REVIEW');
  assert.deepEqual(byId('DELTA').holdReasonCodes, ['delta-check-blocked']);
  assert.equal(byId('UNKNOWN').outcome, 'HOLD');
  assert.deepEqual(byId('UNKNOWN').holdReasonCodes, ['analyte-unknown']);
  assert.equal(byId('UNKNOWN').trace.length, 2);
  assert.equal(byId('OLD').definition?.versionId, 'SYNTHETIC-V1');
  assert.equal(byId('NEW').definition?.versionId, 'SYNTHETIC-V2');
  assert.deepEqual(byId('OLD').definition?.referenceInterval, { lowerBound: 3, upperBound: 4 });
  assert.deepEqual(byId('NEW').definition?.referenceInterval, { lowerBound: 3, upperBound: 6 });
  assert.equal(byId('OLD').referenceRange?.classification, 'above_range');
  assert.equal(byId('NEW').referenceRange?.classification, 'within_range');
  assert.equal(byId('VOLUME').outcome, 'HOLD');
  assert.deepEqual(byId('VOLUME').holdReasonCodes, ['over-consumption']);
  assert.match(byId('VOLUME').trace.find(t => t.step === 'volume-ledger')!.explanation, /exceeds/);
  assert.equal(byId('LATE').turnaround?.status, 'breached');
  assert.equal(byId('LATE').outcome, 'AUTO_RELEASE');
  assert.deepEqual(report.totals, { released: 4, held: 5, heldByReason: { 'qc-out-of-control': 2, 'delta-check-blocked': 1, 'analyte-unknown': 1, 'over-consumption': 1 }, tatBreaches: 1 });
  assert.equal(report.totals.released + report.totals.held, input.results.length);
  for (const r of report.results) for (const trace of r.trace) assert.ok(trace.explanation.length > 0);
  assert.deepEqual(input, before);
  assert.deepEqual(runSyntheticLabDay(input), report);
});

test('definition rejection stops the pipeline and unknown units never escape', () => {
  for (const [override, code, length] of [
    [{ testCode: 'SYNTHETIC-ABSENT' }, 'test-code-unknown', 1],
    [{ instrumentUnit: 'SYNTHETIC-UNIT' }, 'unit-unknown', 2],
    [{ instrumentUnit: 'mmol/L' }, 'unit-mismatched', 2],
  ] as const) {
    const input = fixture();
    input.results = [{ ...input.results[0], ...override }];
    const report = runSyntheticLabDay(input);
    assert.equal(report.results[0].outcome, 'HOLD');
    assert.deepEqual(report.results[0].holdReasonCodes, [code]);
    assert.equal(report.results[0].trace.length, length);
  }
});

test('missing and warning QC hold; warning is not mapped to in-control', () => {
  for (const warning of [false, true]) {
    const input = fixture();
    input.results = [input.results[0]];
    input.runs[0].qc = warning ? {
      levels: [{ levelId: 'SYNTHETIC-LEVEL', mean: 10, sd: 1 }],
      results: Array.from({ length: 10 }, (_, i) => ({ levelId: 'SYNTHETIC-LEVEL', runId: `SYNTHETIC-HISTORY-${i}`, value: 10.5 })),
    } : { levels: [], results: [] };
    const report = runSyntheticLabDay(input);
    assert.equal(report.results[0].outcome, 'HOLD_FOR_REVIEW');
    assert.deepEqual(report.results[0].holdReasonCodes, [warning ? 'qc-warning' : 'qc-missing']);
  }
});

test('shared specimen consumes cumulatively; rejected consumption is not posted', () => {
  const input = fixture();
  const base = input.results[0];
  input.results = [6, 6, 4].map((consumptionVolume, i) => ({ ...base, resultId: `SYNTHETIC-SHARED-${i}`, consumptionVolume }));
  const report = runSyntheticLabDay(input);
  assert.deepEqual(report.results.map(r => r.outcome), ['AUTO_RELEASE', 'HOLD', 'AUTO_RELEASE']);
  const ledger = report.results[2].volumeLedger;
  assert.equal(ledger?.status, 'VALID');
  if (ledger?.status === 'VALID') {
    assert.equal(ledger.remainingVolume, 0);
    assert.equal(ledger.events.length, 2);
    assert.ok(ledger.events.every(e => e.entryType === 'CONSUMPTION' && e.kind === 'TEST_RUN'));
  }
});

test('library is in-process and has no clock, environment, network or JSON imports', () => {
  const source = readFileSync('lib/ohworks-synthetic-lab-day.ts', 'utf8');
  for (const forbidden of [/Date\.now\s*\(/, /new\s+Date\s*\(\s*\)/, /process\.env/, /fetch\s*\(/, /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"][^'"]*\.json['"]/]) {
    assert.doesNotMatch(source, forbidden);
  }
});
