import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCBracketing,
  QCBracketInputError,
  type QCBracketRun,
} from '../../lib/ohworks-qc-bracket';

// Fabricated records only; no real patient, instrument, or customer data.
function syntheticRun(
  before = '2026-03-02T08:00:00.000Z',
  result = '2026-03-02T08:30:00.000Z',
  after = '2026-03-02T09:00:00.000Z',
): QCBracketRun {
  return {
    runId: 'run-synthetic-calendar',
    status: 'complete',
    windowMs: 3600000,
    qcResults: [
      { qcId: 'qc-synthetic-before', level: 'normal', outcome: 'pass', timestamp: before },
      { qcId: 'qc-synthetic-after', level: 'normal', outcome: 'pass', timestamp: after },
    ],
    patientResults: [{ resultId: 'result-synthetic-calendar', timestamp: result }],
  };
}

function assertInvalid(run: QCBracketRun): void {
  assert.throws(() => evaluateQCBracketing(run), (error: unknown) => {
    assert.ok(error instanceof QCBracketInputError);
    assert.equal(error.code, 'timestamp-invalid');
    return true;
  });
}

test('the reproduced February 30 QC run fails closed instead of releasing a result', () => {
  assertInvalid(syntheticRun('2026-02-30T08:00:00.000Z'));
});

for (const timestamp of [
  '2026-02-30T08:30:00.000Z',
  '2026-02-29T08:30:00.000Z',
  '2100-02-29T08:30:00.000Z',
  '2026-04-31T08:30:00.000Z',
  '2026-02-30T00:30:00.000+05:30',
  '2026-04-31T23:30:00.000-0700',
]) {
  for (const target of ['preceding QC', 'trailing QC', 'patient result'] as const) {
    test(`${target} rejects nonexistent calendar date ${timestamp}`, () => {
      const run = syntheticRun();
      if (target === 'patient result') run.patientResults[0].timestamp = timestamp;
      else run.qcResults[target === 'preceding QC' ? 0 : 1].timestamp = timestamp;
      assertInvalid(run);
    });
  }
}

for (const year of ['2024', '2000', '0096']) {
  test(`valid leap day in ${year} preserves exact window boundaries`, () => {
    const run = syntheticRun(
      `${year}-02-29T08:00:00.000Z`,
      `${year}-02-29T08:30:00.000Z`,
      `${year}-02-29T09:00:00.000Z`,
    );
    run.windowMs = 1800000;
    assert.equal(evaluateQCBracketing(run)[0].disposition, 'releasable');
    run.windowMs -= 1;
    assert.equal(evaluateQCBracketing(run)[0].rule, 'preceding-qc-window-exceeded');
  });
}

test('valid offsets crossing calendar dates preserve chronological order and exact boundaries', () => {
  const run = syntheticRun(
    '2024-03-01T00:00:00.000+05:30',
    '2024-02-29T12:00:00.000-0700',
    '2024-02-29T19:30:00.000Z',
  );
  run.windowMs = 1800000;
  assert.equal(evaluateQCBracketing(run)[0].disposition, 'releasable');
  run.qcResults.reverse();
  assert.throws(() => evaluateQCBracketing(run), (error: unknown) => {
    assert.ok(error instanceof QCBracketInputError);
    assert.equal(error.code, 'timestamps-out-of-order');
    return true;
  });
});
