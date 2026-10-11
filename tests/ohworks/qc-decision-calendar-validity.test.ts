import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCDecisions,
  QCDecisionInputError,
  type QCDecisionContext,
  type QCSyntheticResultRecord,
} from '../../lib/ohworks-qc-decision';

/**
 * All fabricated: synthetic record/tenant identifiers and made-up numeric
 * values. None of this represents a real instrument, customer, or result.
 */
function baselineContext(): QCDecisionContext {
  return {
    tenantId: 'tenant-synthetic-a',
    referenceTime: '2026-01-01T12:00:00.000Z',
    maxResultAgeMs: 60 * 60 * 1000,
  };
}

function baselineRecords(): QCSyntheticResultRecord[] {
  return [
    {
      recordId: 'record-synthetic-1',
      tenantId: 'tenant-synthetic-a',
      analyteCode: 'ANALYTE-SYNTH-A',
      rawValue: 15,
      unit: 'mg/L',
      qualifier: 'none',
      verificationState: 'verified',
      referenceLimits: [{ lowerBound: 10, upperBound: 20, unit: 'mg/L' }],
      qcMetadata: { controlsPassed: true, instrumentCalibrated: true },
      capturedAt: '2026-01-01T11:30:00.000Z',
    },
    {
      recordId: 'record-synthetic-2',
      tenantId: 'tenant-synthetic-a',
      analyteCode: 'ANALYTE-SYNTH-B',
      rawValue: 55,
      unit: 'mg/L',
      qualifier: 'none',
      verificationState: 'verified',
      referenceLimits: [{ lowerBound: 50, upperBound: 60, unit: 'mg/L' }],
      qcMetadata: { controlsPassed: true, instrumentCalibrated: true },
      capturedAt: '2026-01-01T11:45:00.000Z',
    },
  ];
}

test('an impossible calendar capture timestamp fails closed with timestamp-invalid, not silently rolled over', () => {
  const records = baselineRecords();
  records[0].capturedAt = '2026-02-30T11:30:00.000Z';
  const decisions = evaluateQCDecisions(records, {
    tenantId: 'tenant-synthetic-a',
    referenceTime: '2026-03-02T12:00:00.000Z',
    maxResultAgeMs: 60 * 60 * 1000,
  });
  const decision = decisions.find((d) => d.recordId === 'record-synthetic-1');
  assert.ok(decision);
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'timestamp-invalid'));
});

test('an impossible calendar reference time throws a sanitized typed error instead of rolling over', () => {
  const context = baselineContext();
  context.referenceTime = '2026-02-30T12:00:00.000Z';
  assert.throws(
    () => evaluateQCDecisions(baselineRecords(), context),
    (error: unknown) => {
      assert.ok(error instanceof QCDecisionInputError);
      assert.equal((error as QCDecisionInputError).code, 'invalid-context');
      return true;
    },
  );
});

test('valid calendar timestamps, including a leap day, remain eligible for review', () => {
  const records = baselineRecords();
  records[0].capturedAt = '2028-02-29T11:30:00.000Z';
  const decisions = evaluateQCDecisions(records, {
    tenantId: 'tenant-synthetic-a',
    referenceTime: '2028-02-29T12:00:00.000Z',
    maxResultAgeMs: 60 * 60 * 1000,
  });
  const decision = decisions.find((d) => d.recordId === 'record-synthetic-1');
  assert.ok(decision);
  assert.equal(decision.status, 'ELIGIBLE_FOR_REVIEW');
  assert.deepEqual(decision.reasons, []);
});

test('a non-leap-year February 29 capture timestamp fails closed with timestamp-invalid', () => {
  const records = baselineRecords();
  records[0].capturedAt = '2026-02-29T11:30:00.000Z';
  const decisions = evaluateQCDecisions(records, {
    tenantId: 'tenant-synthetic-a',
    referenceTime: '2026-03-02T12:00:00.000Z',
    maxResultAgeMs: 60 * 60 * 1000,
  });
  const decision = decisions.find((d) => d.recordId === 'record-synthetic-1');
  assert.ok(decision);
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'timestamp-invalid'));
});
