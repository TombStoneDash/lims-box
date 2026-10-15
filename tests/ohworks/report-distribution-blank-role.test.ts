import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeReportDistribution,
  ReportDistributionInputError,
  type DistributionRule,
  type ReportForDistribution,
} from '../../lib/ohworks-report-distribution';

// Fabricated report and role-only matrix; no real records or contact details.
const report: ReportForDistribution = {
  reportReferenceToken: 'report-synthetic-blank-role',
  kind: 'FINAL',
  testClasses: ['HEAVY_METALS'],
};

function matrix(recipientRole: string): DistributionRule[] {
  return [{
    recipientRole,
    channelType: 'ENCRYPTED_EMAIL',
    allowedTestClasses: ['HEAVY_METALS'],
    requiresFinal: true,
  }];
}

for (const [label, recipientRole] of [
  ['spaces', '   '],
  ['tab', '\t'],
  ['newline', '\n'],
]) {
  test(`${label}-only recipient role throws rule-malformed instead of returning DISTRIBUTED`, () => {
    assert.throws(
      () => computeReportDistribution(report, matrix(recipientRole)),
      (error: unknown) => error instanceof ReportDistributionInputError && error.code === 'rule-malformed',
    );
  });
}

for (const recipientRole of ['LAB_DIRECTOR', ' \tLAB_DIRECTOR\n ']) {
  test(`valid role ${JSON.stringify(recipientRole)} routes with its text unchanged`, () => {
    const summary = computeReportDistribution(report, matrix(recipientRole));
    assert.equal(summary.status, 'DISTRIBUTED');
    assert.deepEqual(summary.recipientRoles, [recipientRole]);
    assert.deepEqual(summary.channelTypes, ['ENCRYPTED_EMAIL']);
    assert.deepEqual(summary.routedEntries, [{
      testClass: 'HEAVY_METALS',
      recipientRole,
      channelType: 'ENCRYPTED_EMAIL',
    }]);
    assert.deepEqual(summary.unroutedTestClasses, []);
    assert.equal(summary.block, undefined);
  });
}
