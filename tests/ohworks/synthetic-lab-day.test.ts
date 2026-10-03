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

function extendedFixture(): SyntheticLabDayInput {
  const input = fixture();
  input.extended = {
    stability: { bySpecimenId: {
      [input.results[0].specimenId]: {
        collectedAt: '2026-09-19T09:00:00Z',
        history: [{ condition: 'room-temp', at: '2026-09-19T09:00:00Z' }],
        windows: [{ condition: 'room-temp', maxDurationMs: 30 * 60_000 }],
      },
    } },
    criticalRepeat: {
      policies: [{ analyteCode: 'GLUCOSE', unit: 'mmol/L', repeatRequired: true, tolerance: { absolute: 1, percent: null }, maxRepeats: 2 }],
      repeatsByResultId: {},
    },
    reflex: {
      knownAnalytes: ['GLUCOSE', 'SYNTHETIC-REFLEX'],
      rules: [{ id: 'SYNTHETIC-REFLEX-RULE', triggerAnalyte: 'GLUCOSE', comparison: 'gte', threshold: 5, reflexAnalytes: ['SYNTHETIC-REFLEX'], maxReflexDepth: 1 }],
    },
    reportingFormats: [{ analyteCode: 'GLUCOSE', unit: 'mmol/L', decimalPlaces: 2, belowDetectionSymbol: '<', belowDetectionLimit: 0.1, aboveQuantitationSymbol: '>', aboveQuantitationLimit: 30, qualitativeThresholds: null }],
  };
  return input;
}

test('expired stability holds but all later extended stages still run in order', () => {
  const report = runSyntheticLabDay(extendedFixture());
  const result = report.results[0];
  assert.equal(result.stability?.status, 'expired');
  assert.equal(result.outcome, 'HOLD');
  assert.ok(result.holdReasonCodes.includes('window-exceeded'));
  assert.deepEqual(result.trace.map(t => t.step), ['effective-definition', 'specimen-stability', 'unit-conversion', 'reference-range', 'delta-check', 'qc-rules', 'volume-ledger', 'autoverification', 'reflex-plan', 'reporting-format', 'turnaround-time']);
  assert.match(result.trace[1].explanation, /exceeded/);
  assert.equal(result.reportString, '5.00 mmol/L');
  assert.deepEqual(result.reflexAdditions, ['SYNTHETIC-REFLEX']);
  const undeclared = report.results.find(r => r.resultId === 'SYNTHETIC-NEW')!;
  assert.equal(undeclared.outcome, 'AUTO_RELEASE');
  assert.equal(undeclared.trace[1].decision, 'not-declared');
  assert.equal(Object.hasOwn(undeclared, 'stability'), false);
});

test('critical repeat uses converted units and retains the critical hold pending or confirmed', () => {
  for (const confirmed of [false, true]) {
    const input = extendedFixture();
    input.results = [{ ...input.results[0], value: 468 }];
    const result = input.results[0];
    if (confirmed) input.extended!.criticalRepeat!.repeatsByResultId[result.resultId] = [{ subjectId: result.subjectId, analyteCode: result.analyteCode, value: 26.5, unit: 'mmol/L', capturedAt: '2026-09-19T10:05:00Z' }];
    const report = runSyntheticLabDay(input);
    const output = report.results[0];
    assert.equal(output.converted?.value, 25.98);
    assert.equal(output.criticalRepeat?.status, confirmed ? 'confirmed' : 'pending');
    assert.equal(output.criticalRepeat?.notifyAllowed, confirmed);
    assert.equal(output.outcome, 'HOLD'); // Stability hold must survive confirmation.
    assert.ok(output.holdReasonCodes.includes('value-critical'));
    const steps = output.trace.map(t => t.step);
    assert.equal(steps[steps.indexOf('autoverification') + 1], 'critical-repeat');
    assert.equal(steps[steps.indexOf('critical-repeat') + 1], 'reflex-plan');
    assert.equal(report.extendedTotals?.criticalNotifyBlocked, confirmed ? 0 : 1);
  }
});

test('critical repeat is skipped for noncritical values or missing analyte policies', () => {
  for (const critical of [false, true]) {
    const input = fixture();
    input.results = [{ ...input.results[0], value: critical ? 468 : 90 }];
    input.extended = { criticalRepeat: extendedFixture().extended!.criticalRepeat };
    if (critical) input.extended.criticalRepeat!.policies = [];
    const output = runSyntheticLabDay(input).results[0];
    assert.equal(Object.hasOwn(output, 'criticalRepeat'), false);
    assert.ok(output.trace.every(t => t.step !== 'critical-repeat'));
  }
});

test('reflex cycles and excessive declared depth block and hold an otherwise clean result', () => {
  for (const cycle of [true, false]) {
    const input = fixture();
    input.results = [input.results[0]];
    const reflex = extendedFixture().extended!.reflex!;
    reflex.knownAnalytes.push('SYNTHETIC-SECOND-REFLEX');
    reflex.rules.push({ ...reflex.rules[0], id: 'SYNTHETIC-SECOND-RULE', triggerAnalyte: 'SYNTHETIC-REFLEX', reflexAnalytes: [cycle ? 'GLUCOSE' : 'SYNTHETIC-SECOND-REFLEX'] });
    input.extended = { reflex };
    const output = runSyntheticLabDay(input).results[0];
    assert.equal(output.outcome, 'HOLD');
    assert.ok(output.holdReasonCodes.includes(cycle ? 'rule-cycle-detected' : 'reflex-depth-exceeded'));
    assert.equal(output.trace.find(t => t.step === 'reflex-plan')?.decision, 'blocked');
    assert.equal(Object.hasOwn(output, 'reflexAdditions'), false);
    assert.equal(output.trace.at(-1)?.step, 'turnaround-time');
  }
});

test('reporting censors converted values and holds missing formats before turnaround', () => {
  const input = fixture();
  input.results = [{ ...input.results[0], value: 0.9 }];
  input.extended = { reportingFormats: extendedFixture().extended!.reportingFormats };
  const report = runSyntheticLabDay(input);
  assert.equal(report.results[0].reportString, '<0.1 mmol/L');
  assert.equal(report.extendedTotals?.censoredReports, 1);
  assert.equal(report.results[0].trace.at(-2)?.decision, 'below-detection');
  input.results[0].value = 90;
  input.extended.reportingFormats = [];
  const missing = runSyntheticLabDay(input).results[0];
  assert.equal(missing.outcome, 'HOLD');
  assert.ok(missing.holdReasonCodes.includes('unknown-analyte'));
  assert.equal(missing.trace.at(-2)?.step, 'reporting-format');
  assert.deepEqual(missing.trace.at(-2)?.reasonCodes, ['unknown-analyte']);
  assert.ok(missing.trace.at(-2)!.explanation.length > 0);
  assert.equal(missing.trace.at(-1)?.step, 'turnaround-time');
  assert.equal(Object.hasOwn(missing, 'reportString'), false);
});

test('typed stability and repeat policy errors hold with trace explanations', () => {
  const input = extendedFixture();
  input.results = [{ ...input.results[0], value: 468 }];
  input.extended!.stability!.bySpecimenId[input.results[0].specimenId].windows = [];
  input.extended!.criticalRepeat!.policies[0].maxRepeats = 0;
  const output = runSyntheticLabDay(input).results[0];
  assert.equal(output.outcome, 'HOLD');
  for (const code of ['windows-empty', 'policy-max-repeats-invalid']) {
    assert.ok(output.holdReasonCodes.includes(code));
    assert.ok(output.trace.find(t => t.reasonCodes.includes(code))!.explanation.length > 0);
  }
  assert.equal(output.trace.at(-1)?.step, 'turnaround-time');
});

test('extended totals reconcile and extended runs are deterministic without input mutation', () => {
  const input = extendedFixture();
  input.results[1].value = 468;
  input.results[2].value = 0.9;
  const before = structuredClone(input);
  const report = runSyntheticLabDay(input);
  assert.deepEqual(input, before);
  assert.deepEqual(runSyntheticLabDay(input), report);
  assert.deepEqual(report.extendedTotals, {
    stabilityExpired: report.results.filter(r => r.stability?.status === 'expired').length,
    criticalNotifyBlocked: report.results.filter(r => r.criticalRepeat?.notifyAllowed === false).length,
    reflexAdditions: report.results.reduce((sum, r) => sum + (r.reflexAdditions?.length ?? 0), 0),
    censoredReports: report.results.filter(r => r.trace.some(t => t.step === 'reporting-format' && ['below-detection', 'above-quantitation'].includes(t.decision))).length,
  });
  assert.equal(report.extendedTotals?.stabilityExpired, 1);
  assert.equal(report.extendedTotals?.criticalNotifyBlocked, 2);
  assert.equal(report.extendedTotals?.censoredReports, 1);
  assert.ok(report.extendedTotals!.reflexAdditions > 0);
  assert.equal(report.totals.released + report.totals.held, input.results.length);
});

test('original fixture has no extended keys and only the original eight step names', () => {
  const input = fixture();
  const report = runSyntheticLabDay(input);
  assert.equal(Object.hasOwn(report, 'extendedTotals'), false);
  const originalSteps = ['effective-definition', 'unit-conversion', 'reference-range', 'delta-check', 'qc-rules', 'volume-ledger', 'autoverification', 'turnaround-time'];
  assert.deepEqual([...new Set(report.results.flatMap(r => r.trace.map(t => t.step)))], originalSteps);
  for (const result of report.results) {
    for (const key of ['stability', 'criticalRepeat', 'reflexAdditions', 'reportString']) assert.equal(Object.hasOwn(result, key), false);
  }
  input.extended = {};
  const empty = runSyntheticLabDay(input);
  assert.deepEqual(empty.results, report.results);
  assert.deepEqual(empty.totals, report.totals);
  assert.deepEqual(empty.extendedTotals, { stabilityExpired: 0, criticalNotifyBlocked: 0, reflexAdditions: 0, censoredReports: 0 });
});
