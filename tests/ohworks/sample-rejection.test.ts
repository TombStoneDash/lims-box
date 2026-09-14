import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSampleAcceptance,
  explainSampleRejectionNextAction,
  explainSampleRejectionReason,
  SampleRejectionInputError,
  type SampleAcceptanceDecision,
  type SampleAcceptancePolicy,
  type SampleRejectionReasonCode,
  type SampleSubmission,
} from '../../lib/ohworks-sample-rejection';

/**
 * All fabricated: synthetic sample/tenant identifiers and made-up matrix,
 * container, volume, and temperature data. None of this represents a real
 * sample, patient, instrument, or customer.
 */
function baselinePolicy(): SampleAcceptancePolicy {
  return {
    tenantId: 'tenant-synthetic-a',
    approvedPairs: [
      { matrix: 'water-surface', container: 'amber-glass-1l' },
      { matrix: 'soil-composite', container: 'wide-mouth-jar-500ml' },
    ],
    volumeRules: [
      { matrix: 'water-surface', unit: 'mL', minVolume: 250, maxVolume: 1000 },
      { matrix: 'soil-composite', unit: 'g', minVolume: 100, maxVolume: 500 },
    ],
    temperatureRanges: [
      { matrix: 'water-surface', unit: 'C', minTemperature: 0, maxTemperature: 6 },
      { matrix: 'soil-composite', unit: 'C', minTemperature: 0, maxTemperature: 6 },
    ],
    sealRule: { acceptedSealStates: ['intact', 'tamper-evident-tape'] },
    duplicateRule: { replayDisposition: 'HOLD' },
    holdRule: { conditions: [{ sealState: 'tamper-evident-tape' }] },
    timestampBound: { referenceTime: '2026-01-01T12:00:00.000Z', maxAgeMs: 60 * 60 * 1000 },
  };
}

function baselineSamples(): SampleSubmission[] {
  return [
    {
      sampleId: 'sample-synthetic-1',
      tenantId: 'tenant-synthetic-a',
      matrix: 'water-surface',
      container: 'amber-glass-1l',
      volume: 500,
      volumeUnit: 'mL',
      temperature: 4,
      temperatureUnit: 'C',
      sealState: 'intact',
      collectedAt: '2026-01-01T11:30:00.000Z',
    },
    {
      sampleId: 'sample-synthetic-2',
      tenantId: 'tenant-synthetic-a',
      matrix: 'soil-composite',
      container: 'wide-mouth-jar-500ml',
      volume: 300,
      volumeUnit: 'g',
      temperature: 4,
      temperatureUnit: 'C',
      sealState: 'intact',
      collectedAt: '2026-01-01T11:45:00.000Z',
    },
  ];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function decisionFor(decisions: SampleAcceptanceDecision[], sampleId: string): SampleAcceptanceDecision {
  const found = decisions.find((d) => d.sampleId === sampleId);
  assert.ok(found, `expected a decision for ${sampleId}`);
  return found;
}

const ALL_REASON_CODES: SampleRejectionReasonCode[] = [
  'tenant-mismatch',
  'matrix-container-not-approved',
  'volume-invalid',
  'volume-unit-mismatched',
  'volume-out-of-range',
  'temperature-invalid',
  'temperature-unit-mismatched',
  'temperature-out-of-range',
  'seal-state-invalid',
  'timestamp-invalid',
  'timestamp-out-of-bound',
  'duplicate-conflict',
  'duplicate-replay',
  'note-unsafe-content',
  'hold-condition-matched',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /releasable/i];

// ---------------------------------------------------------------------------
// Golden path
// ---------------------------------------------------------------------------

test('a fully complete fabricated batch is accepted with no reasons', () => {
  const decisions = evaluateSampleAcceptance(baselinePolicy(), baselineSamples());
  for (const decision of decisions) {
    assert.equal(decision.status, 'ACCEPT');
    assert.deepEqual(decision.reasons, []);
  }
});

test('evaluation is pure: it does not mutate input policy or samples', () => {
  const policy = baselinePolicy();
  const samples = baselineSamples();
  const policyBefore = JSON.stringify(policy);
  const samplesBefore = JSON.stringify(samples);
  evaluateSampleAcceptance(policy, samples);
  assert.equal(JSON.stringify(policy), policyBefore);
  assert.equal(JSON.stringify(samples), samplesBefore);
});

test('evaluation is deterministic across repeated calls', () => {
  const policy = baselinePolicy();
  const samples = baselineSamples();
  const first = evaluateSampleAcceptance(policy, samples);
  const second = evaluateSampleAcceptance(clone(policy), clone(samples));
  assert.deepEqual(first, second);
});

test('decisions are returned in the same order the samples were given, not re-sorted', () => {
  const samples = baselineSamples();
  samples[0].sampleId = 'sample-synthetic-zzz';
  samples[1].sampleId = 'sample-synthetic-aaa';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.deepEqual(
    decisions.map((d) => d.sampleId),
    ['sample-synthetic-zzz', 'sample-synthetic-aaa'],
  );
});

test('a status other than the three defined values is never produced', () => {
  const decisions = evaluateSampleAcceptance(baselinePolicy(), baselineSamples());
  for (const decision of decisions) {
    assert.ok(['ACCEPT', 'HOLD', 'REJECT'].includes(decision.status));
  }
});

// ---------------------------------------------------------------------------
// Matrix/container pairing
// ---------------------------------------------------------------------------

test('an unapproved matrix/container pairing rejects', () => {
  const samples = baselineSamples();
  samples[0].container = 'plastic-bag-unlisted';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.deepEqual(decision.reasons, [{ code: 'matrix-container-not-approved' }]);
});

test('a completely unknown matrix rejects as an unapproved pairing', () => {
  const samples = baselineSamples();
  samples[0].matrix = 'sediment-core';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'REJECT');
});

// ---------------------------------------------------------------------------
// Volume + unit rule
// ---------------------------------------------------------------------------

test('a numeric-looking string volume is accepted as numeric', () => {
  const samples = baselineSamples();
  samples[0].volume = '500';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'ACCEPT');
});

test('a nonnumeric volume rejects', () => {
  const samples = baselineSamples();
  samples[0].volume = 'a-lot';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.ok(decision.reasons.some((r) => r.code === 'volume-invalid'));
});

test('a null volume rejects as non-numeric', () => {
  const samples = baselineSamples();
  samples[0].volume = null;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'REJECT');
});

test('a volume exactly at the lower bound is accepted', () => {
  const samples = baselineSamples();
  samples[0].volume = 250;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'ACCEPT');
});

test('a volume exactly at the upper bound is accepted', () => {
  const samples = baselineSamples();
  samples[0].volume = 1000;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'ACCEPT');
});

test('a volume just below the lower bound rejects', () => {
  const samples = baselineSamples();
  samples[0].volume = 249.99;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.deepEqual(decision.reasons, [{ code: 'volume-out-of-range' }]);
});

test('a volume just above the upper bound rejects', () => {
  const samples = baselineSamples();
  samples[0].volume = 1000.01;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'volume-out-of-range'));
});

test('a missing volume unit rejects as mismatched', () => {
  const samples = baselineSamples();
  delete samples[0].volumeUnit;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.deepEqual(decision.reasons, [{ code: 'volume-unit-mismatched' }]);
});

test('a volume unit that disagrees with the configured unit rejects', () => {
  const samples = baselineSamples();
  samples[0].volumeUnit = 'L';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.ok(decision.reasons.some((r) => r.code === 'volume-unit-mismatched'));
});

// ---------------------------------------------------------------------------
// Temperature range
// ---------------------------------------------------------------------------

test('a temperature exactly at the lower bound is accepted', () => {
  const samples = baselineSamples();
  samples[0].temperature = 0;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'ACCEPT');
});

test('a temperature exactly at the upper bound is accepted', () => {
  const samples = baselineSamples();
  samples[0].temperature = 6;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'ACCEPT');
});

test('a temperature just below the lower bound rejects', () => {
  const samples = baselineSamples();
  samples[0].temperature = -0.01;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'temperature-out-of-range'));
});

test('a temperature just above the upper bound rejects', () => {
  const samples = baselineSamples();
  samples[0].temperature = 6.01;
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'temperature-out-of-range'));
});

test('a nonnumeric temperature rejects', () => {
  const samples = baselineSamples();
  samples[0].temperature = 'cold';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'temperature-invalid'));
});

test('a temperature unit that disagrees with the configured unit rejects', () => {
  const samples = baselineSamples();
  samples[0].temperatureUnit = 'F';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'temperature-unit-mismatched'));
});

// ---------------------------------------------------------------------------
// Seal rule
// ---------------------------------------------------------------------------

test('an unrecognized seal state rejects', () => {
  const samples = baselineSamples();
  samples[0].sealState = 'broken';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.deepEqual(decision.reasons, [{ code: 'seal-state-invalid' }]);
});

// ---------------------------------------------------------------------------
// Hold rule
// ---------------------------------------------------------------------------

test('a sample matching a configured hold condition holds, not rejects or accepts', () => {
  const samples = baselineSamples();
  samples[0].sealState = 'tamper-evident-tape';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'HOLD');
  assert.deepEqual(decision.reasons, [{ code: 'hold-condition-matched' }]);
});

test('a REJECT-tier defect outranks a matched hold condition on the same sample', () => {
  const policy = baselinePolicy();
  const samples = baselineSamples();
  samples[0].sealState = 'tamper-evident-tape'; // HOLD
  samples[0].tenantId = 'tenant-synthetic-intruder'; // REJECT
  const decisions = evaluateSampleAcceptance(policy, samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.ok(decision.reasons.some((r) => r.code === 'tenant-mismatch'));
  assert.ok(decision.reasons.some((r) => r.code === 'hold-condition-matched'));
});

// ---------------------------------------------------------------------------
// Timestamp bound
// ---------------------------------------------------------------------------

test('a stale collection timestamp rejects', () => {
  const samples = baselineSamples();
  samples[0].collectedAt = '2026-01-01T10:00:00.000Z'; // 2h before reference, window is 1h
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'timestamp-out-of-bound'));
});

test('a collection timestamp exactly at the freshness boundary is accepted', () => {
  const samples = baselineSamples();
  samples[0].collectedAt = '2026-01-01T11:00:00.000Z'; // exactly 1h before reference
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'ACCEPT');
});

test('a collection timestamp after the reference time is out of bound, not trusted', () => {
  const samples = baselineSamples();
  samples[0].collectedAt = '2026-01-01T13:00:00.000Z';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'timestamp-out-of-bound'));
});

test('an unparsable collection timestamp rejects', () => {
  const samples = baselineSamples();
  samples[0].collectedAt = 'not-a-timestamp';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.deepEqual(decision.reasons, [{ code: 'timestamp-invalid' }]);
});

// ---------------------------------------------------------------------------
// Tenant mismatch
// ---------------------------------------------------------------------------

test('a tenant mismatch rejects', () => {
  const samples = baselineSamples();
  samples[0].tenantId = 'tenant-synthetic-intruder';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'REJECT');
  assert.deepEqual(decision.reasons, [{ code: 'tenant-mismatch' }]);
});

// ---------------------------------------------------------------------------
// Unsafe free text
// ---------------------------------------------------------------------------

test('a note containing an email address rejects', () => {
  const samples = baselineSamples();
  samples[0].note = 'Contact collector at jane.synthetic@example.com for details.';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'note-unsafe-content'));
});

test('a note containing script markup rejects', () => {
  const samples = baselineSamples();
  samples[0].note = 'looks fine <script>alert(1)</script>';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.ok(decisionFor(decisions, 'sample-synthetic-1').reasons.some((r) => r.code === 'note-unsafe-content'));
});

test('an operational note with no unsafe content is accepted', () => {
  const samples = baselineSamples();
  samples[0].note = 'Container was intact and chilled on arrival.';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'ACCEPT');
});

test('no note at all is accepted', () => {
  const decisions = evaluateSampleAcceptance(baselinePolicy(), baselineSamples());
  assert.equal(decisionFor(decisions, 'sample-synthetic-1').status, 'ACCEPT');
});

// ---------------------------------------------------------------------------
// Duplicate rule: replay vs conflict
// ---------------------------------------------------------------------------

test('an exact replay (identical content) of a sample identifier holds when configured to HOLD', () => {
  const samples = baselineSamples();
  const replay = clone(samples[0]);
  const batch = [samples[0], replay, samples[1]];
  const decisions = evaluateSampleAcceptance(baselinePolicy(), batch);
  assert.equal(decisions[0].status, 'HOLD');
  assert.equal(decisions[1].status, 'HOLD');
  assert.ok(decisions[0].reasons.some((r) => r.code === 'duplicate-replay'));
  assert.ok(decisions[1].reasons.some((r) => r.code === 'duplicate-replay'));
  assert.equal(decisions[2].status, 'ACCEPT');
});

test('an exact replay rejects when the policy configures replay to REJECT', () => {
  const policy = baselinePolicy();
  policy.duplicateRule.replayDisposition = 'REJECT';
  const samples = baselineSamples();
  const replay = clone(samples[0]);
  const decisions = evaluateSampleAcceptance(policy, [samples[0], replay]);
  assert.equal(decisions[0].status, 'REJECT');
  assert.equal(decisions[1].status, 'REJECT');
  assert.ok(decisions[0].reasons.some((r) => r.code === 'duplicate-replay'));
});

test('a conflicting duplicate (same identifier, different content) always rejects regardless of replay disposition', () => {
  const policy = baselinePolicy();
  policy.duplicateRule.replayDisposition = 'HOLD';
  const samples = baselineSamples();
  const conflicting = clone(samples[0]);
  conflicting.volume = 999;
  const decisions = evaluateSampleAcceptance(policy, [samples[0], conflicting]);
  assert.equal(decisions[0].status, 'REJECT');
  assert.equal(decisions[1].status, 'REJECT');
  assert.ok(decisions[0].reasons.some((r) => r.code === 'duplicate-conflict'));
  assert.ok(decisions[1].reasons.some((r) => r.code === 'duplicate-conflict'));
});

test('distinct sample identifiers in a batch are never treated as duplicates of each other', () => {
  const decisions = evaluateSampleAcceptance(baselinePolicy(), baselineSamples());
  assert.ok(!decisions.some((d) => d.reasons.some((r) => r.code === 'duplicate-replay' || r.code === 'duplicate-conflict')));
});

// ---------------------------------------------------------------------------
// Status precedence and multiple reasons
// ---------------------------------------------------------------------------

test('reasons are reported in deterministic, sorted order regardless of failure order', () => {
  const samples = baselineSamples();
  samples[0].sealState = 'broken';
  samples[0].volume = 'not-a-number';
  samples[0].tenantId = 'tenant-synthetic-intruder';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const codes = decisionFor(decisions, 'sample-synthetic-1').reasons.map((r) => r.code);
  const sortedCodes = [...codes].sort();
  assert.deepEqual(codes, sortedCodes);
});

test('a sample with many independent defects reports every one, deterministically', () => {
  const samples = baselineSamples();
  samples[0].sealState = 'broken';
  delete samples[0].volumeUnit;
  samples[0].temperature = 'warm';
  samples[0].collectedAt = 'not-a-timestamp';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const codes = decisionFor(decisions, 'sample-synthetic-1')
    .reasons.map((r) => r.code)
    .sort();
  assert.deepEqual(
    codes,
    ['seal-state-invalid', 'temperature-invalid', 'timestamp-invalid', 'volume-unit-mismatched'].sort(),
  );
});

// ---------------------------------------------------------------------------
// Policy validation
// ---------------------------------------------------------------------------

function assertPolicyRejected(policy: unknown, code: string) {
  assert.throws(
    () => evaluateSampleAcceptance(policy, baselineSamples()),
    (error: unknown) => {
      assert.ok(error instanceof SampleRejectionInputError);
      assert.equal((error as SampleRejectionInputError).code, code);
      return true;
    },
  );
}

test('a non-object policy throws a sanitized typed error', () => {
  assertPolicyRejected('not-a-policy', 'policy-malformed');
});

test('a policy missing a tenant identifier throws a sanitized typed error', () => {
  const policy = baselinePolicy() as unknown as Record<string, unknown>;
  delete policy.tenantId;
  assertPolicyRejected(policy, 'policy-tenant-invalid');
});

test('a policy with an unparsable reference time throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.timestampBound.referenceTime = 'not-a-timestamp';
  assertPolicyRejected(policy, 'policy-timestamp-bound-invalid');
});

test('a policy with a negative freshness window throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.timestampBound.maxAgeMs = -1;
  assertPolicyRejected(policy, 'policy-timestamp-bound-invalid');
});

test('a policy with an empty approved pairing list throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.approvedPairs = [];
  assertPolicyRejected(policy, 'policy-approved-pairs-invalid');
});

test('a policy with a duplicate approved pairing entry throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.approvedPairs.push({ matrix: 'water-surface', container: 'amber-glass-1l' });
  assertPolicyRejected(policy, 'policy-approved-pairs-invalid');
});

test('a policy whose volume rules omit a matrix throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.volumeRules = [policy.volumeRules[0]];
  assertPolicyRejected(policy, 'policy-volume-rules-invalid');
});

test('a policy whose volume rule references an unapproved matrix throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.volumeRules.push({ matrix: 'sediment-core', unit: 'g', minVolume: 1, maxVolume: 2 });
  assertPolicyRejected(policy, 'policy-volume-rules-invalid');
});

test('a policy with an inverted volume rule range throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.volumeRules[0].minVolume = 1000;
  policy.volumeRules[0].maxVolume = 250;
  assertPolicyRejected(policy, 'policy-volume-rules-invalid');
});

test('a policy with a non-finite (unbounded) volume rule bound throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.volumeRules[0].maxVolume = Infinity;
  assertPolicyRejected(policy, 'policy-volume-rules-invalid');
});

test('a policy whose temperature ranges omit a matrix throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.temperatureRanges = [policy.temperatureRanges[0]];
  assertPolicyRejected(policy, 'policy-temperature-ranges-invalid');
});

test('a policy with an inverted temperature range throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.temperatureRanges[0].minTemperature = 6;
  policy.temperatureRanges[0].maxTemperature = 0;
  assertPolicyRejected(policy, 'policy-temperature-ranges-invalid');
});

test('a policy with an empty seal rule throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.sealRule.acceptedSealStates = [];
  assertPolicyRejected(policy, 'policy-seal-rule-invalid');
});

test('a policy with a duplicate seal rule entry throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.sealRule.acceptedSealStates.push('intact');
  assertPolicyRejected(policy, 'policy-seal-rule-invalid');
});

test('a policy with an invalid duplicate rule disposition throws a sanitized typed error', () => {
  const policy = baselinePolicy() as unknown as { duplicateRule: { replayDisposition: string } };
  policy.duplicateRule.replayDisposition = 'IGNORE';
  assertPolicyRejected(policy, 'policy-duplicate-rule-invalid');
});

test('a policy with an empty hold condition (no fields at all) throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.holdRule.conditions = [{}];
  assertPolicyRejected(policy, 'policy-hold-rule-invalid');
});

test('a policy whose hold condition references an unapproved matrix throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.holdRule.conditions = [{ matrix: 'sediment-core' }];
  assertPolicyRejected(policy, 'policy-hold-rule-invalid');
});

test('a policy whose hold condition references an unaccepted seal state throws a sanitized typed error', () => {
  const policy = baselinePolicy();
  policy.holdRule.conditions = [{ sealState: 'broken' }];
  assertPolicyRejected(policy, 'policy-hold-rule-invalid');
});

test('a policy input error message never echoes submitted policy data', () => {
  try {
    evaluateSampleAcceptance('garbage-policy-with-secret-token-abc123', baselineSamples());
    assert.fail('expected evaluateSampleAcceptance to throw');
  } catch (error) {
    assert.ok(error instanceof SampleRejectionInputError);
    assert.doesNotMatch((error as Error).message, /garbage-policy-with-secret-token-abc123/);
  }
});

// ---------------------------------------------------------------------------
// Sample batch validation
// ---------------------------------------------------------------------------

test('a non-array sample batch throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateSampleAcceptance(baselinePolicy(), 'not-an-array'),
    (error: unknown) => {
      assert.ok(error instanceof SampleRejectionInputError);
      assert.equal((error as SampleRejectionInputError).code, 'samples-not-array');
      return true;
    },
  );
});

test('a sample missing its identifier throws a sanitized typed error rather than guessing', () => {
  const samples = baselineSamples();
  delete (samples[0] as Partial<SampleSubmission>).sampleId;
  assert.throws(
    () => evaluateSampleAcceptance(baselinePolicy(), samples),
    (error: unknown) => {
      assert.ok(error instanceof SampleRejectionInputError);
      assert.equal((error as SampleRejectionInputError).code, 'sample-malformed');
      return true;
    },
  );
});

test('a sample missing its collection timestamp field entirely throws a sanitized typed error', () => {
  const samples = baselineSamples();
  delete (samples[0] as Partial<SampleSubmission>).collectedAt;
  assert.throws(
    () => evaluateSampleAcceptance(baselinePolicy(), samples),
    (error: unknown) => {
      assert.ok(error instanceof SampleRejectionInputError);
      assert.equal((error as SampleRejectionInputError).code, 'sample-malformed');
      return true;
    },
  );
});

test('a sample batch input error message never echoes submitted sample data', () => {
  try {
    evaluateSampleAcceptance(baselinePolicy(), 'super-secret-raw-payload-xyz789');
    assert.fail('expected evaluateSampleAcceptance to throw');
  } catch (error) {
    assert.ok(error instanceof SampleRejectionInputError);
    assert.doesNotMatch((error as Error).message, /super-secret-raw-payload-xyz789/);
  }
});

// ---------------------------------------------------------------------------
// Explanations and byte-level redaction
// ---------------------------------------------------------------------------

test('every disposition reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainSampleRejectionReason({ code });
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /sample-synthetic|tenant-synthetic|water-surface|soil-composite/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(
    explainSampleRejectionReason({ code: 'timestamp-out-of-bound' }),
    explainSampleRejectionReason({ code: 'timestamp-out-of-bound' }),
  );
});

test('every disposition reason code has a non-empty, privacy-safe, distinct-from-explanation next action', () => {
  for (const code of ALL_REASON_CODES) {
    const explanation = explainSampleRejectionReason({ code });
    const nextAction = explainSampleRejectionNextAction({ code });
    assert.equal(typeof nextAction, 'string');
    assert.ok(nextAction.length > 0);
    assert.notEqual(nextAction, explanation);
    assert.doesNotMatch(nextAction, /sample-synthetic|tenant-synthetic|water-surface|soil-composite/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(nextAction, pattern);
    }
  }
});

test('next-action text is stable across repeated calls for the same code', () => {
  assert.equal(
    explainSampleRejectionNextAction({ code: 'timestamp-out-of-bound' }),
    explainSampleRejectionNextAction({ code: 'timestamp-out-of-bound' }),
  );
});

test('no decision status ever uses compliance, accreditation, or releasability language', () => {
  const statuses: string[] = ['ACCEPT', 'HOLD', 'REJECT'];
  for (const status of statuses) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(status, pattern);
    }
  }
});

test('a rejected sample carrying an unsafe note never echoes the note text anywhere in the decision', () => {
  const samples = baselineSamples();
  samples[0].note = 'Reach me at jane.synthetic@example.com, SSN 123-45-6789.';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  const serialized = JSON.stringify(decision);
  assert.doesNotMatch(serialized, /jane\.synthetic@example\.com/);
  assert.doesNotMatch(serialized, /123-45-6789/);
});
