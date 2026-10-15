import assert from 'node:assert/strict';
import test from 'node:test';

import { AmendmentChainInputError, applyReportAmendments } from '../../lib/ohworks-report-amendment';

function am(versionNumber: number, timestamp: string) {
  return {
    versionNumber,
    supersedesVersion: versionNumber - 1,
    reasonCode: 'TRANSCRIPTION_ERROR',
    authorRole: 'LAB_DIRECTOR',
    timestamp,
  };
}

test('a sparse amendment list (array hole) throws amendment-malformed instead of a plain TypeError', () => {
  const sparse = [, am(2, '2026-01-01T00:00:00Z')];
  assert.throws(
    () => applyReportAmendments('report-synthetic-sparse', sparse),
    (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'amendment-malformed',
  );
});

test('a trailing array hole after a valid amendment throws amendment-malformed', () => {
  const sparse = [am(2, '2026-01-01T00:00:00Z'), , am(4, '2026-01-01T00:00:01Z')];
  assert.throws(
    () => applyReportAmendments('report-synthetic-sparse-trailing', sparse),
    (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'amendment-malformed',
  );
});

test('sub-millisecond timestamps in increasing order (same epoch millisecond) are VALID', () => {
  const summary = applyReportAmendments('report-synthetic-submms-order', [
    am(2, '2026-01-01T00:00:00.0001Z'),
    am(3, '2026-01-01T00:00:00.0009Z'),
  ]);
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.currentEffectiveVersion, 3);
  assert.equal(summary.supersedeChain.length, 2);
});

test('sub-millisecond timestamps in reversed order (same epoch millisecond) stay timestamp-out-of-order', () => {
  const summary = applyReportAmendments('report-synthetic-submms-reversed', [
    am(2, '2026-01-01T00:00:00.0009Z'),
    am(3, '2026-01-01T00:00:00.0001Z'),
  ]);
  assert.equal(summary.status, 'INVALID');
  assert.deepEqual(summary.failure, { amendmentIndex: 1, code: 'timestamp-out-of-order' });
});

test('exact duplicate full-precision timestamps stay timestamp-out-of-order', () => {
  const summary = applyReportAmendments('report-synthetic-submms-duplicate', [
    am(2, '2026-01-01T00:00:00.00015Z'),
    am(3, '2026-01-01T00:00:00.00015Z'),
  ]);
  assert.equal(summary.status, 'INVALID');
  assert.deepEqual(summary.failure, { amendmentIndex: 1, code: 'timestamp-out-of-order' });
});

test('sub-millisecond ordering is unaffected by differing whole-minute UTC offsets', () => {
  const summary = applyReportAmendments('report-synthetic-submms-offsets', [
    am(2, '2026-01-01T05:30:00.0001+05:30'),
    am(3, '2026-01-01T00:00:00.0009Z'),
  ]);
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.currentEffectiveVersion, 3);
  assert.equal(summary.supersedeChain.length, 2);
});

test('millisecond-or-coarser timestamp ordering remains unchanged', () => {
  const summary = applyReportAmendments('report-synthetic-submms-coarse', [
    am(2, '2026-01-01T00:00:00.001Z'),
    am(3, '2026-01-01T00:00:00.000Z'),
  ]);
  assert.equal(summary.status, 'INVALID');
  assert.deepEqual(summary.failure, { amendmentIndex: 1, code: 'timestamp-out-of-order' });
});
