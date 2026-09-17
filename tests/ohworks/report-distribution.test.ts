import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeReportDistribution,
  explainDistributionBlockNextAction,
  explainDistributionBlockReason,
  ReportDistributionInputError,
  type DistributionBlockReasonCode,
  type DistributionRule,
  type ReportForDistribution,
} from '../../lib/ohworks-report-distribution';

/**
 * All fabricated: synthetic reference tokens, test classes, roles, and
 * channel types. None of this represents a real report, patient, or lab
 * record, and none of it carries a personal contact detail.
 */
function baselineReport(overrides: Partial<ReportForDistribution> = {}): ReportForDistribution {
  return {
    reportReferenceToken: 'report-synthetic-1',
    kind: 'FINAL',
    testClasses: ['MICROBIOLOGY', 'HEAVY_METALS'],
    ...overrides,
  };
}

function baselineMatrix(): DistributionRule[] {
  return [
    {
      recipientRole: 'ORDERING_PROVIDER',
      channelType: 'PORTAL_SECURE_MESSAGE',
      allowedTestClasses: ['MICROBIOLOGY', 'HEAVY_METALS'],
      requiresFinal: false,
    },
    {
      recipientRole: 'LAB_DIRECTOR',
      channelType: 'ENCRYPTED_EMAIL',
      allowedTestClasses: ['HEAVY_METALS'],
      requiresFinal: true,
    },
    {
      recipientRole: 'STATE_REGULATOR',
      channelType: 'LAB_INFORMATION_SYSTEM_API',
      allowedTestClasses: ['MICROBIOLOGY'],
      requiresFinal: true,
    },
  ];
}

test('final report routes to every rule matching its test classes', () => {
  const summary = computeReportDistribution(baselineReport(), baselineMatrix());
  assert.equal(summary.status, 'DISTRIBUTED');
  assert.deepEqual(summary.recipientRoles, ['LAB_DIRECTOR', 'ORDERING_PROVIDER', 'STATE_REGULATOR']);
  assert.deepEqual(summary.channelTypes, ['ENCRYPTED_EMAIL', 'LAB_INFORMATION_SYSTEM_API', 'PORTAL_SECURE_MESSAGE']);
  assert.equal(summary.routedEntries.length, 4);
  assert.deepEqual(summary.unroutedTestClasses, []);
  assert.equal(summary.block, undefined);
});

test('preliminary report omits recipients whose rule requires a final report', () => {
  const summary = computeReportDistribution(baselineReport({ kind: 'PRELIMINARY', testClasses: ['MICROBIOLOGY'] }), [
    {
      recipientRole: 'ORDERING_PROVIDER',
      channelType: 'PORTAL_SECURE_MESSAGE',
      allowedTestClasses: ['MICROBIOLOGY'],
      requiresFinal: false,
    },
    {
      recipientRole: 'STATE_REGULATOR',
      channelType: 'LAB_INFORMATION_SYSTEM_API',
      allowedTestClasses: ['MICROBIOLOGY'],
      requiresFinal: true,
    },
  ]);
  assert.equal(summary.status, 'DISTRIBUTED');
  assert.deepEqual(summary.recipientRoles, ['ORDERING_PROVIDER']);
  assert.deepEqual(summary.channelTypes, ['PORTAL_SECURE_MESSAGE']);
});

test('flags a test class with no matching rule at all without blocking the rest', () => {
  const summary = computeReportDistribution(baselineReport({ testClasses: ['MICROBIOLOGY', 'RADIOLOGY'] }), baselineMatrix());
  assert.equal(summary.status, 'DISTRIBUTED');
  assert.deepEqual(summary.unroutedTestClasses, ['RADIOLOGY']);
  assert.ok(summary.recipientRoles.includes('ORDERING_PROVIDER'));
});

test('deduplicates repeated test classes on the report', () => {
  const withDuplicate = computeReportDistribution(baselineReport({ testClasses: ['MICROBIOLOGY', 'MICROBIOLOGY'] }), baselineMatrix());
  const withoutDuplicate = computeReportDistribution(baselineReport({ testClasses: ['MICROBIOLOGY'] }), baselineMatrix());
  assert.equal(withDuplicate.routedEntries.length, withoutDuplicate.routedEntries.length);
});

test('blocks the whole report on an unknown channel type in the matrix', () => {
  const matrix = baselineMatrix();
  matrix[1] = { ...matrix[1], channelType: 'CARRIER_PIGEON' };
  const summary = computeReportDistribution(baselineReport(), matrix);
  assert.deepEqual(summary.block, { code: 'channel-type-unknown', detail: '1' });
  assert.equal(summary.status, 'BLOCKED');
  assert.deepEqual(summary.recipientRoles, []);
  assert.deepEqual(summary.channelTypes, []);
  assert.deepEqual(summary.routedEntries, []);
  assert.deepEqual(summary.unroutedTestClasses, []);
});

function finalOnlyMatrix(): DistributionRule[] {
  return [
    {
      recipientRole: 'ORDERING_PROVIDER',
      channelType: 'PORTAL_SECURE_MESSAGE',
      allowedTestClasses: ['MICROBIOLOGY'],
      requiresFinal: false,
    },
    {
      recipientRole: 'LAB_DIRECTOR',
      channelType: 'ENCRYPTED_EMAIL',
      allowedTestClasses: ['HEAVY_METALS'],
      requiresFinal: true,
    },
  ];
}

test('blocks a preliminary report carrying a final-only test class', () => {
  const summary = computeReportDistribution(
    baselineReport({ kind: 'PRELIMINARY', testClasses: ['HEAVY_METALS'] }),
    finalOnlyMatrix(),
  );
  assert.deepEqual(summary.block, { code: 'final-only-class-on-preliminary-report', detail: 'HEAVY_METALS' });
  assert.equal(summary.status, 'BLOCKED');
});

test('does not block a preliminary report when the final-only class is absent from the report', () => {
  const summary = computeReportDistribution(
    baselineReport({ kind: 'PRELIMINARY', testClasses: ['MICROBIOLOGY'] }),
    finalOnlyMatrix(),
  );
  assert.equal(summary.status, 'DISTRIBUTED');
  assert.equal(summary.block, undefined);
  assert.deepEqual(summary.recipientRoles, ['ORDERING_PROVIDER']);
});

test('checks channel-type-unknown before final-only-class-on-preliminary-report', () => {
  const matrix = baselineMatrix();
  matrix[1] = { ...matrix[1], channelType: 'CARRIER_PIGEON' };
  const summary = computeReportDistribution(baselineReport({ kind: 'PRELIMINARY' }), matrix);
  assert.deepEqual(summary.block, { code: 'channel-type-unknown', detail: '1' });
});

test('never emits a personal contact detail field on a routed entry or summary', () => {
  const summary = computeReportDistribution(baselineReport(), baselineMatrix());
  const json = JSON.stringify(summary).toLowerCase();
  const forbidden = ['phone', 'address', 'contact'];
  for (const term of forbidden) {
    assert.equal(json.includes(term), false, `summary unexpectedly mentions "${term}"`);
  }
  assert.equal(json.includes('@'), false, 'summary unexpectedly contains an "@" character, as an email address would');
  for (const entry of summary.routedEntries) {
    assert.deepEqual(Object.keys(entry).sort(), ['channelType', 'recipientRole', 'testClass']);
  }
});

test('valid summary carries the full expected shape', () => {
  const summary = computeReportDistribution(baselineReport(), baselineMatrix());
  assert.deepEqual(Object.keys(summary).sort(), [
    'channelTypes',
    'kind',
    'recipientRoles',
    'reportReferenceToken',
    'routedEntries',
    'status',
    'unroutedTestClasses',
  ]);
});

test('blocked summary carries the block reason alongside empty routing fields', () => {
  const summary = computeReportDistribution(
    baselineReport({ kind: 'PRELIMINARY', testClasses: ['HEAVY_METALS'] }),
    finalOnlyMatrix(),
  );
  assert.deepEqual(Object.keys(summary).sort(), [
    'block',
    'channelTypes',
    'kind',
    'recipientRoles',
    'reportReferenceToken',
    'routedEntries',
    'status',
    'unroutedTestClasses',
  ]);
  assert.deepEqual(Object.keys(summary.block!).sort(), ['code', 'detail']);
});

test('throws ReportDistributionInputError when the report is not an object', () => {
  assert.throws(
    () => computeReportDistribution('not-a-report', baselineMatrix()),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'report-malformed',
  );
});

test('throws ReportDistributionInputError for an invalid reference token', () => {
  assert.throws(
    () => computeReportDistribution(baselineReport({ reportReferenceToken: '' }), baselineMatrix()),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'report-reference-token-invalid',
  );
});

test('throws ReportDistributionInputError for an unrecognized report kind', () => {
  const malformed = { ...baselineReport(), kind: 'DRAFT' };
  assert.throws(
    () => computeReportDistribution(malformed, baselineMatrix()),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'report-kind-invalid',
  );
});

test('throws ReportDistributionInputError when test classes is not a list of non-empty strings', () => {
  assert.throws(
    () => computeReportDistribution(baselineReport({ testClasses: ['MICROBIOLOGY', ''] }), baselineMatrix()),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'test-classes-invalid',
  );
});

test('throws ReportDistributionInputError when the matrix is not an array', () => {
  assert.throws(
    () => computeReportDistribution(baselineReport(), 'not-an-array' as unknown as DistributionRule[]),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'matrix-not-array',
  );
});

test('throws ReportDistributionInputError for a matrix row missing a required field', () => {
  const matrix = baselineMatrix();
  const malformed = { ...matrix[0], recipientRole: undefined };
  assert.throws(
    () => computeReportDistribution(baselineReport(), [malformed]),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'rule-malformed',
  );
});

test('throws ReportDistributionInputError for a non-object matrix row', () => {
  assert.throws(
    () => computeReportDistribution(baselineReport(), [null]),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'rule-malformed',
  );
});

test('throws ReportDistributionInputError for a non-boolean requiresFinal', () => {
  const matrix = baselineMatrix();
  const malformed = { ...matrix[0], requiresFinal: 'yes' };
  assert.throws(
    () => computeReportDistribution(baselineReport(), [malformed]),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'rule-malformed',
  );
});

test('throws ReportDistributionInputError for an empty allowedTestClasses list', () => {
  const matrix = baselineMatrix();
  const malformed = { ...matrix[0], allowedTestClasses: [] };
  assert.throws(
    () => computeReportDistribution(baselineReport(), [malformed]),
    (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'rule-malformed',
  );
});

test('explainDistributionBlockReason and explainDistributionBlockNextAction cover every block reason code', () => {
  const codes: DistributionBlockReasonCode[] = ['channel-type-unknown', 'final-only-class-on-preliminary-report'];
  for (const code of codes) {
    const reason = explainDistributionBlockReason(code);
    const nextAction = explainDistributionBlockNextAction(code);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
    assert.equal(typeof nextAction, 'string');
    assert.ok(nextAction.length > 0);
  }
});
