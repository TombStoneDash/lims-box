import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AmendmentChainInputError,
  applyReportAmendments,
  explainAmendmentChainNextAction,
  explainAmendmentChainReason,
  BASELINE_VERSION,
  type AmendmentChainReasonCode,
  type ReportAmendment,
} from '../../lib/ohworks-report-amendment';

/**
 * All fabricated: synthetic reference tokens, version numbers, reason
 * codes, author roles, and timestamps. None of this represents a real
 * report, patient, or lab record.
 */
function baselineAmendment(overrides: Partial<ReportAmendment> = {}): ReportAmendment {
  return {
    versionNumber: 2,
    supersedesVersion: 1,
    reasonCode: 'TRANSCRIPTION_ERROR',
    authorRole: 'LAB_DIRECTOR',
    timestamp: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function baselineChain(): ReportAmendment[] {
  return [
    baselineAmendment({
      versionNumber: 2,
      supersedesVersion: 1,
      reasonCode: 'TRANSCRIPTION_ERROR',
      authorRole: 'LAB_DIRECTOR',
      timestamp: '2026-01-01T12:00:00.000Z',
    }),
    baselineAmendment({
      versionNumber: 3,
      supersedesVersion: 2,
      reasonCode: 'QC_REPROCESS_RESULT',
      authorRole: 'QC_REVIEWER',
      timestamp: '2026-01-02T12:00:00.000Z',
    }),
    baselineAmendment({
      versionNumber: 4,
      supersedesVersion: 3,
      reasonCode: 'REGULATORY_CORRECTION',
      authorRole: 'CERTIFYING_SCIENTIST',
      timestamp: '2026-01-03T12:00:00.000Z',
    }),
  ];
}

test('validates a well-formed amendment chain with no gaps or reuse', () => {
  const summary = applyReportAmendments('report-synthetic-1', baselineChain());
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.failure, undefined);
  assert.equal(summary.reportReferenceToken, 'report-synthetic-1');
  assert.equal(summary.currentEffectiveVersion, 4);
  assert.equal(summary.supersedeChain.length, 3);
});

test('accepts an empty amendment list as trivially valid at the baseline version', () => {
  const summary = applyReportAmendments('report-synthetic-empty', []);
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.currentEffectiveVersion, BASELINE_VERSION);
  assert.deepEqual(summary.supersedeChain, []);
});

test('accepts a single valid amendment', () => {
  const summary = applyReportAmendments('report-synthetic-single', [baselineAmendment()]);
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.currentEffectiveVersion, 2);
});

test('rejects a reused version number', () => {
  const summary = applyReportAmendments('report-synthetic-reuse', [
    baselineAmendment({ versionNumber: 1, supersedesVersion: 1 }),
  ]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'version-reused' });
});

test('rejects a reused version number from an earlier amendment', () => {
  const chain = baselineChain();
  chain[2] = { ...chain[2], versionNumber: 2, supersedesVersion: 3 };
  const summary = applyReportAmendments('report-synthetic-reuse-later', chain);
  assert.deepEqual(summary.failure, { amendmentIndex: 2, code: 'version-reused' });
  assert.equal(summary.currentEffectiveVersion, 3);
  assert.equal(summary.supersedeChain.length, 2);
});

test('rejects a skipped version number', () => {
  const summary = applyReportAmendments('report-synthetic-skip', [
    baselineAmendment({ versionNumber: 3, supersedesVersion: 1 }),
  ]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'version-skipped' });
});

test('rejects citing a retracted (already superseded) version', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], supersedesVersion: 1 };
  const summary = applyReportAmendments('report-synthetic-retracted', chain);
  assert.deepEqual(summary.failure, { amendmentIndex: 1, code: 'version-retracted' });
  assert.equal(summary.currentEffectiveVersion, 2);
});

test('rejects citing a version that does not exist yet', () => {
  const summary = applyReportAmendments('report-synthetic-future', [
    baselineAmendment({ versionNumber: 2, supersedesVersion: 5 }),
  ]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'version-retracted' });
});

test('rejects an unknown reason code', () => {
  const summary = applyReportAmendments('report-synthetic-reason', [baselineAmendment({ reasonCode: 'MYSTERY_REASON' })]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'reason-code-unknown' });
});

test('rejects an author role without amend authority', () => {
  const summary = applyReportAmendments('report-synthetic-role', [baselineAmendment({ authorRole: 'FRONT_DESK' })]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'author-role-unauthorized' });
});

test('rejects a completely unknown author role', () => {
  const summary = applyReportAmendments('report-synthetic-role-unknown', [
    baselineAmendment({ authorRole: 'MYSTERY_ROLE' }),
  ]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'author-role-unauthorized' });
});

test('reports the first failing amendment when a later amendment is also broken', () => {
  const chain = baselineChain();
  chain[1] = { ...chain[1], versionNumber: 5 };
  chain[2] = { ...chain[2], reasonCode: 'MYSTERY_REASON' };
  const summary = applyReportAmendments('report-synthetic-first-failure', chain);
  assert.deepEqual(summary.failure, { amendmentIndex: 1, code: 'version-skipped' });
  assert.equal(summary.currentEffectiveVersion, 2);
  assert.equal(summary.supersedeChain.length, 1);
});

test('within one amendment, checks rules in the documented priority order', () => {
  const summary = applyReportAmendments('report-synthetic-priority', [
    baselineAmendment({
      versionNumber: 1,
      supersedesVersion: 9,
      reasonCode: 'MYSTERY_REASON',
      authorRole: 'MYSTERY_ROLE',
    }),
  ]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'version-reused' });
});

test('checks version-skipped before version-retracted when reuse does not apply', () => {
  const summary = applyReportAmendments('report-synthetic-priority-2', [
    baselineAmendment({
      versionNumber: 3,
      supersedesVersion: 9,
      reasonCode: 'MYSTERY_REASON',
      authorRole: 'MYSTERY_ROLE',
    }),
  ]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'version-skipped' });
});

test('checks version-retracted before reason-code-unknown and author-role-unauthorized', () => {
  const summary = applyReportAmendments('report-synthetic-priority-3', [
    baselineAmendment({
      versionNumber: 2,
      supersedesVersion: 9,
      reasonCode: 'MYSTERY_REASON',
      authorRole: 'MYSTERY_ROLE',
    }),
  ]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'version-retracted' });
});

test('checks reason-code-unknown before author-role-unauthorized', () => {
  const summary = applyReportAmendments('report-synthetic-priority-4', [
    baselineAmendment({ reasonCode: 'MYSTERY_REASON', authorRole: 'MYSTERY_ROLE' }),
  ]);
  assert.deepEqual(summary.failure, { amendmentIndex: 0, code: 'reason-code-unknown' });
});

test('valid summary carries the accepted chain with full record shape', () => {
  const summary = applyReportAmendments('report-synthetic-shape', baselineChain());
  assert.deepEqual(Object.keys(summary).sort(), [
    'currentEffectiveVersion',
    'reportReferenceToken',
    'status',
    'supersedeChain',
  ]);
  for (const record of summary.supersedeChain) {
    assert.deepEqual(Object.keys(record).sort(), [
      'authorRole',
      'reasonCode',
      'supersedesVersion',
      'timestamp',
      'versionNumber',
    ]);
  }
});

test('invalid summary carries failure alongside the partial accepted chain', () => {
  const summary = applyReportAmendments('report-synthetic-invalid-shape', [
    baselineAmendment({ reasonCode: 'MYSTERY_REASON' }),
  ]);
  assert.deepEqual(Object.keys(summary).sort(), [
    'currentEffectiveVersion',
    'failure',
    'reportReferenceToken',
    'status',
    'supersedeChain',
  ]);
  assert.deepEqual(Object.keys(summary.failure!).sort(), ['amendmentIndex', 'code']);
});

test('throws AmendmentChainInputError for an invalid reference token', () => {
  assert.throws(
    () => applyReportAmendments('', baselineChain()),
    (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'reference-token-invalid',
  );
});

test('throws AmendmentChainInputError when amendments is not an array', () => {
  assert.throws(
    () => applyReportAmendments('report-synthetic-not-array', 'not-an-array' as unknown as unknown[]),
    (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'amendments-not-array',
  );
});

test('throws AmendmentChainInputError for an amendment missing a required field', () => {
  const malformed = { ...baselineAmendment(), reasonCode: undefined };
  assert.throws(
    () => applyReportAmendments('report-synthetic-malformed', [malformed]),
    (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'amendment-malformed',
  );
});

test('throws AmendmentChainInputError for a non-object amendment', () => {
  assert.throws(
    () => applyReportAmendments('report-synthetic-non-object', [null]),
    (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'amendment-malformed',
  );
});

test('throws AmendmentChainInputError for a non-integer version number', () => {
  const malformed = { ...baselineAmendment(), versionNumber: 2.5 };
  assert.throws(
    () => applyReportAmendments('report-synthetic-bad-version', [malformed]),
    (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'amendment-malformed',
  );
});

test('throws AmendmentChainInputError for a non-positive supersedesVersion', () => {
  const malformed = { ...baselineAmendment(), supersedesVersion: 0 };
  assert.throws(
    () => applyReportAmendments('report-synthetic-bad-supersedes', [malformed]),
    (error: unknown) => error instanceof AmendmentChainInputError && error.code === 'amendment-malformed',
  );
});

test('explainAmendmentChainReason and explainAmendmentChainNextAction cover every reason code', () => {
  const codes: AmendmentChainReasonCode[] = [
    'version-reused',
    'version-skipped',
    'version-retracted',
    'reason-code-unknown',
    'author-role-unauthorized',
  ];
  for (const code of codes) {
    const reason = explainAmendmentChainReason(code);
    const nextAction = explainAmendmentChainNextAction(code);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
    assert.equal(typeof nextAction, 'string');
    assert.ok(nextAction.length > 0);
  }
});
