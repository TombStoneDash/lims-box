import assert from 'node:assert/strict';
import test from 'node:test';

import { AmendmentChainInputError, applyReportAmendments } from '../../lib/ohworks-report-amendment';

function amendment(timestamp: string) {
  return {
    versionNumber: 2,
    supersedesVersion: 1,
    reasonCode: 'TRANSCRIPTION_ERROR',
    authorRole: 'LAB_DIRECTOR',
    timestamp,
  };
}

for (const timestamp of ['not-a-date', '   ', '2026-02-30T12:00:00Z', '2026-04-31T12:00:00Z']) {
  test(`rejects malformed timestamp ${JSON.stringify(timestamp)}`, () => {
    assert.throws(
      () => applyReportAmendments('report-synthetic-timestamp', [amendment(timestamp)]),
      (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'amendment-malformed',
    );
  });
}

for (const timestamp of [
  '2026-04-30T12:00:00Z',
  '2028-02-29T12:00:00Z',
  '2028-02-29T12:00:00.123Z',
  '2028-02-29T12:00:00.123+05:30',
]) {
  test(`accepts valid ISO timestamp ${timestamp}`, () => {
    const summary = applyReportAmendments('report-synthetic-timestamp', [amendment(timestamp)]);
    assert.equal(summary.status, 'VALID');
    assert.equal(summary.currentEffectiveVersion, 2);
    assert.equal(summary.supersedeChain[0].timestamp, timestamp);
  });
}
