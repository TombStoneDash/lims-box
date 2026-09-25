import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQCDecisions,
  explainQCDecisionReason,
  QCDecisionInputError,
  type QCDecision,
  type QCDecisionContext,
  type QCDecisionReasonCode,
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function decisionFor(decisions: QCDecision[], recordId: string): QCDecision {
  const found = decisions.find((d) => d.recordId === recordId);
  assert.ok(found, `expected a decision for ${recordId}`);
  return found;
}

const ALL_REASON_CODES: QCDecisionReasonCode[] = [
  'duplicate-record',
  'tenant-mismatch',
  'timestamp-invalid',
  'timestamp-stale',
  'value-non-numeric',
  'unit-missing',
  'unit-mismatched',
  'qualifier-unknown',
  'qualifier-flagged',
  'reference-limits-missing',
  'reference-limits-invalid',
  'reference-limits-conflicting',
  'value-out-of-reference-range',
  'verification-state-missing',
  'verification-state-unknown',
  'verification-unverified',
  'verification-rejected',
  'qc-metadata-missing',
  'qc-metadata-incomplete',
  'qc-controls-failed',
  'qc-instrument-uncalibrated',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

test('a fully complete fabricated batch is eligible for review with no reasons', () => {
  const decisions = evaluateQCDecisions(baselineRecords(), baselineContext());
  for (const decision of decisions) {
    assert.equal(decision.status, 'ELIGIBLE_FOR_REVIEW');
    assert.deepEqual(decision.reasons, []);
  }
});

test('evaluation is pure: it does not mutate input records or context', () => {
  const records = baselineRecords();
  const context = baselineContext();
  const recordsBefore = JSON.stringify(records);
  const contextBefore = JSON.stringify(context);
  evaluateQCDecisions(records, context);
  assert.equal(JSON.stringify(records), recordsBefore);
  assert.equal(JSON.stringify(context), contextBefore);
});

test('evaluation is deterministic across repeated calls', () => {
  const records = baselineRecords();
  const context = baselineContext();
  const first = evaluateQCDecisions(records, context);
  const second = evaluateQCDecisions(clone(records), clone(context));
  assert.deepEqual(first, second);
});

test('decisions are returned in the same order the records were given, not re-sorted', () => {
  const records = baselineRecords();
  records[0].recordId = 'record-synthetic-zzz';
  records[1].recordId = 'record-synthetic-aaa';
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.deepEqual(
    decisions.map((d) => d.recordId),
    ['record-synthetic-zzz', 'record-synthetic-aaa'],
  );
});

test('a status other than the three defined values is never produced', () => {
  const decisions = evaluateQCDecisions(baselineRecords(), baselineContext());
  for (const decision of decisions) {
    assert.ok(['HOLD', 'REVIEW_REQUIRED', 'ELIGIBLE_FOR_REVIEW'].includes(decision.status));
  }
});

test('a numeric-looking string value is accepted as numeric, not flagged non-numeric', () => {
  const records = baselineRecords();
  records[0].rawValue = '15';
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'ELIGIBLE_FOR_REVIEW');
});

test('a nonnumeric value fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].rawValue = 'not-a-number';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'value-non-numeric'));
});

test('a null value fails closed to HOLD as non-numeric', () => {
  const records = baselineRecords();
  records[0].rawValue = null;
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'HOLD');
});

test('a value exactly at the lower reference bound is in range', () => {
  const records = baselineRecords();
  records[0].rawValue = 10;
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'ELIGIBLE_FOR_REVIEW');
});

test('a value exactly at the upper reference bound is in range', () => {
  const records = baselineRecords();
  records[0].rawValue = 20;
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'ELIGIBLE_FOR_REVIEW');
});

test('a value just below the lower bound requires review, but is not held', () => {
  const records = baselineRecords();
  records[0].rawValue = 9.999;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'REVIEW_REQUIRED');
  assert.deepEqual(decision.reasons, [{ code: 'value-out-of-reference-range' }]);
});

test('a value just above the upper bound requires review, but is not held', () => {
  const records = baselineRecords();
  records[0].rawValue = 20.001;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'REVIEW_REQUIRED');
  assert.ok(decision.reasons.some((r) => r.code === 'value-out-of-reference-range'));
});

test('a missing unit fails closed to HOLD', () => {
  const records = baselineRecords();
  delete records[0].unit;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'unit-missing'));
});

test('an empty-string unit fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].unit = '';
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'HOLD');
});

test('a unit that disagrees with the reference limit unit fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].unit = 'g/L';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'unit-mismatched'));
});

test('a result unit with only outer whitespace and case differences from the reference limit unit matches', () => {
  const records = baselineRecords();
  records[0].unit = '  MG/L  ';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'ELIGIBLE_FOR_REVIEW');
  assert.ok(!decision.reasons.some((r) => r.code === 'unit-mismatched'));
});

test('a reference limit unit with only outer whitespace and case differences from the result unit matches', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [{ lowerBound: 10, upperBound: 20, unit: ' Mg/l ' }];
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'ELIGIBLE_FOR_REVIEW');
});

test('canonicalization never infers a conversion: mg/L and g/L still mismatch', () => {
  const records = baselineRecords();
  records[0].unit = 'mg/L';
  records[0].referenceLimits = [{ lowerBound: 10, upperBound: 20, unit: 'g/L' }];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'unit-mismatched'));
});

test('outer-whitespace/case variants of g/L vs mg/L still mismatch, not silently accepted', () => {
  const records = baselineRecords();
  records[0].unit = '  MG/L  ';
  records[0].referenceLimits = [{ lowerBound: 10, upperBound: 20, unit: ' G/L ' }];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'unit-mismatched'));
});

test('reference limits that are duplicates only after unit canonicalization are de-duplicated, not conflicting', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [
    { lowerBound: 10, upperBound: 20, unit: 'mg/L' },
    { lowerBound: 10, upperBound: 20, unit: '  MG/L  ' },
    { lowerBound: 10, upperBound: 20, unit: 'Mg/L' },
  ];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'ELIGIBLE_FOR_REVIEW');
  assert.ok(!decision.reasons.some((r) => r.code === 'reference-limits-conflicting'));
});

test('a blank (whitespace-only) result unit fails closed to HOLD as missing, not canonicalized away', () => {
  const records = baselineRecords();
  records[0].unit = '   ';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'unit-missing'));
});

test('a blank (whitespace-only) reference limit unit fails closed to HOLD as invalid', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [{ lowerBound: 10, upperBound: 20, unit: '   ' }];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'reference-limits-invalid'));
});

test('a missing result unit still fails closed to HOLD after canonicalization is applied', () => {
  const records = baselineRecords();
  delete records[0].unit;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'unit-missing'));
});

test('a non-string result unit fails closed to HOLD as missing, not coerced to a string', () => {
  const records = baselineRecords();
  (records[0] as unknown as { unit: unknown }).unit = 5;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'unit-missing'));
});

test('a non-string reference limit unit fails closed to HOLD as invalid, not coerced to a string', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [
    { lowerBound: 10, upperBound: 20, unit: 5 as unknown as string },
  ];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'reference-limits-invalid'));
});

test('a NaN observed value fails closed to HOLD as non-numeric', () => {
  const records = baselineRecords();
  records[0].rawValue = NaN;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'value-non-numeric'));
});

test('an Infinity observed value fails closed to HOLD as non-numeric', () => {
  const records = baselineRecords();
  records[0].rawValue = Infinity;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'value-non-numeric'));
});

test('a NaN reference limit bound fails closed to HOLD as invalid even with a valid unit', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [{ lowerBound: NaN, upperBound: 20, unit: 'mg/L' }];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'reference-limits-invalid'));
});

test('an Infinity reference limit bound fails closed to HOLD as invalid even with a valid unit', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [{ lowerBound: 10, upperBound: Infinity, unit: 'mg/L' }];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'reference-limits-invalid'));
});

test('a value exactly at the lower bound is in range after outer-whitespace/case unit canonicalization', () => {
  const records = baselineRecords();
  records[0].rawValue = 10;
  records[0].unit = '  MG/L  ';
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'ELIGIBLE_FOR_REVIEW');
});

test('a value exactly at the upper bound is in range after outer-whitespace/case unit canonicalization', () => {
  const records = baselineRecords();
  records[0].rawValue = 20;
  records[0].unit = '  MG/L  ';
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'ELIGIBLE_FOR_REVIEW');
});

test('an unknown qualifier fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].qualifier = 'suspicious-guess';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.deepEqual(decision.reasons, [{ code: 'qualifier-unknown' }]);
});

test('a known but non-"none" qualifier requires review, but is not held', () => {
  const records = baselineRecords();
  records[0].qualifier = 'estimated';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'REVIEW_REQUIRED');
  assert.deepEqual(decision.reasons, [{ code: 'qualifier-flagged' }]);
});

test('no reference limits at all fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'reference-limits-missing'));
});

test('an inverted reference limit range fails closed to HOLD as invalid', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [{ lowerBound: 25, upperBound: 20, unit: 'mg/L' }];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'reference-limits-invalid'));
});

test('a non-finite reference limit bound fails closed to HOLD as invalid', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [{ lowerBound: 10, upperBound: NaN, unit: 'mg/L' }];
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.ok(decisionFor(decisions, 'record-synthetic-1').reasons.some((r) => r.code === 'reference-limits-invalid'));
});

test('two conflicting reference limit sets fail closed to HOLD', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [
    { lowerBound: 10, upperBound: 20, unit: 'mg/L' },
    { lowerBound: 12, upperBound: 18, unit: 'mg/L' },
  ];
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'reference-limits-conflicting'));
});

test('duplicate but identical reference limit entries are de-duplicated, not treated as conflicting', () => {
  const records = baselineRecords();
  records[0].referenceLimits = [
    { lowerBound: 10, upperBound: 20, unit: 'mg/L' },
    { lowerBound: 10, upperBound: 20, unit: 'mg/L' },
  ];
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'ELIGIBLE_FOR_REVIEW');
});

test('a stale capture timestamp fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].capturedAt = '2026-01-01T10:00:00.000Z'; // 2h before reference, window is 1h
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'timestamp-stale'));
});

test('a capture timestamp exactly at the freshness boundary is accepted', () => {
  const records = baselineRecords();
  records[0].capturedAt = '2026-01-01T11:00:00.000Z'; // exactly 1h before reference
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.equal(decisionFor(decisions, 'record-synthetic-1').status, 'ELIGIBLE_FOR_REVIEW');
});

test('a capture timestamp after the reference time is treated as stale, not trusted', () => {
  const records = baselineRecords();
  records[0].capturedAt = '2026-01-01T13:00:00.000Z';
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.ok(decisionFor(decisions, 'record-synthetic-1').reasons.some((r) => r.code === 'timestamp-stale'));
});

test('an unparsable capture timestamp fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].capturedAt = 'not-a-timestamp';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.deepEqual(decision.reasons, [{ code: 'timestamp-invalid' }]);
});

test('a missing verification state fails closed to HOLD', () => {
  const records = baselineRecords();
  delete records[0].verificationState;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'verification-state-missing'));
});

test('an unrecognized verification state fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].verificationState = 'pending-legacy-import';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'verification-state-unknown'));
});

test('an explicit "unverified" state requires review, but is not held', () => {
  const records = baselineRecords();
  records[0].verificationState = 'unverified';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'REVIEW_REQUIRED');
  assert.deepEqual(decision.reasons, [{ code: 'verification-unverified' }]);
});

test('an explicit "rejected" state requires review, but is not held and is never eligible', () => {
  const records = baselineRecords();
  records[0].verificationState = 'rejected';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.notEqual(decision.status, 'ELIGIBLE_FOR_REVIEW');
  assert.ok(decision.reasons.some((r) => r.code === 'verification-rejected'));
});

test('missing QC metadata fails closed to HOLD', () => {
  const records = baselineRecords();
  delete records[0].qcMetadata;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'qc-metadata-missing'));
});

test('ambiguous QC metadata (non-boolean fields) fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].qcMetadata = { controlsPassed: 'yes' as unknown as boolean, instrumentCalibrated: true };
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'qc-metadata-incomplete'));
});

test('partially present QC metadata fails closed to HOLD as incomplete', () => {
  const records = baselineRecords();
  records[0].qcMetadata = { controlsPassed: true };
  const decisions = evaluateQCDecisions(records, baselineContext());
  assert.ok(decisionFor(decisions, 'record-synthetic-1').reasons.some((r) => r.code === 'qc-metadata-incomplete'));
});

test('failed QC controls fail closed to HOLD', () => {
  const records = baselineRecords();
  records[0].qcMetadata = { controlsPassed: false, instrumentCalibrated: true };
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'qc-controls-failed'));
});

test('an uncalibrated instrument fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].qcMetadata = { controlsPassed: true, instrumentCalibrated: false };
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'qc-instrument-uncalibrated'));
});

test('a tenant mismatch fails closed to HOLD', () => {
  const records = baselineRecords();
  records[0].tenantId = 'tenant-synthetic-intruder';
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'tenant-mismatch'));
});

test('duplicate record identifiers in a batch fail closed to HOLD for every copy', () => {
  const records = baselineRecords();
  const duplicate = clone(records[0]);
  const batch = [records[0], duplicate, records[1]];
  const decisions = evaluateQCDecisions(batch, baselineContext());
  assert.equal(decisions[0].status, 'HOLD');
  assert.equal(decisions[1].status, 'HOLD');
  assert.ok(decisions[0].reasons.some((r) => r.code === 'duplicate-record'));
  assert.ok(decisions[1].reasons.some((r) => r.code === 'duplicate-record'));
  assert.equal(decisions[2].status, 'ELIGIBLE_FOR_REVIEW');
});

test('a HOLD-triggering defect always outranks a REVIEW_REQUIRED-triggering one', () => {
  const records = baselineRecords();
  records[0].tenantId = 'tenant-synthetic-intruder'; // HOLD
  records[0].qualifier = 'estimated'; // REVIEW_REQUIRED
  const decisions = evaluateQCDecisions(records, baselineContext());
  const decision = decisionFor(decisions, 'record-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.ok(decision.reasons.some((r) => r.code === 'tenant-mismatch'));
  assert.ok(decision.reasons.some((r) => r.code === 'qualifier-flagged'));
});

test('reasons are reported in deterministic, sorted order regardless of failure order', () => {
  const records = baselineRecords();
  records[0].qualifier = 'unrecognized';
  records[0].rawValue = 'not-a-number';
  delete records[0].verificationState;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const codes = decisionFor(decisions, 'record-synthetic-1').reasons.map((r) => r.code);
  const sortedCodes = [...codes].sort();
  assert.deepEqual(codes, sortedCodes);
});

test('a record with many independent defects reports every one, deterministically', () => {
  const records = baselineRecords();
  records[0].unit = undefined;
  records[0].qualifier = 'unrecognized';
  delete records[0].qcMetadata;
  delete records[0].verificationState;
  const decisions = evaluateQCDecisions(records, baselineContext());
  const codes = decisionFor(decisions, 'record-synthetic-1')
    .reasons.map((r) => r.code)
    .sort();
  assert.deepEqual(
    codes,
    ['qc-metadata-missing', 'qualifier-unknown', 'unit-missing', 'verification-state-missing'].sort(),
  );
});

test('a non-array records input throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateQCDecisions('not-an-array' as unknown as QCSyntheticResultRecord[], baselineContext()),
    (error: unknown) => {
      assert.ok(error instanceof QCDecisionInputError);
      assert.equal((error as QCDecisionInputError).code, 'records-not-array');
      return true;
    },
  );
});

test('an unparsable context reference time throws a sanitized typed error', () => {
  const context = baselineContext();
  context.referenceTime = 'not-a-timestamp';
  assert.throws(
    () => evaluateQCDecisions(baselineRecords(), context),
    (error: unknown) => {
      assert.ok(error instanceof QCDecisionInputError);
      assert.equal((error as QCDecisionInputError).code, 'invalid-context');
      return true;
    },
  );
});

test('a negative freshness window throws a sanitized typed error', () => {
  const context = baselineContext();
  context.maxResultAgeMs = -1;
  assert.throws(() => evaluateQCDecisions(baselineRecords(), context), QCDecisionInputError);
});

test('a record missing its identifier throws a sanitized typed error rather than guessing', () => {
  const records = baselineRecords();
  delete (records[0] as Partial<QCSyntheticResultRecord>).recordId;
  assert.throws(
    () => evaluateQCDecisions(records, baselineContext()),
    (error: unknown) => {
      assert.ok(error instanceof QCDecisionInputError);
      assert.equal((error as QCDecisionInputError).code, 'record-missing-identity');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    evaluateQCDecisions('garbage' as unknown as QCSyntheticResultRecord[], baselineContext());
    assert.fail('expected evaluateQCDecisions to throw');
  } catch (error) {
    assert.ok(error instanceof QCDecisionInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /garbage/);
  }
});

test('every decision reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainQCDecisionReason({ code });
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /record-synthetic|tenant-synthetic|ANALYTE-SYNTH/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(
    explainQCDecisionReason({ code: 'timestamp-stale' }),
    explainQCDecisionReason({ code: 'timestamp-stale' }),
  );
});

test('no decision status ever uses approval, compliance, accreditation, or release language', () => {
  const statuses: string[] = ['HOLD', 'REVIEW_REQUIRED', 'ELIGIBLE_FOR_REVIEW'];
  for (const status of statuses) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(status, pattern);
    }
  }
});
