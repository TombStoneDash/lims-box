import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSampleAcceptance,
  SampleRejectionInputError,
  type SampleAcceptanceDecision,
  type SampleAcceptancePolicy,
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

function decisionFor(decisions: SampleAcceptanceDecision[], sampleId: string): SampleAcceptanceDecision {
  const found = decisions.find((d) => d.sampleId === sampleId);
  assert.ok(found, `expected a decision for ${sampleId}`);
  return found;
}

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

// ---------------------------------------------------------------------------
// Non-ISO timestamp strings (month-name and slash-delimited forms, including
// an impossible written calendar date like Feb 30) must be treated as
// unparsable, the same outcome the module already gives for an impossible
// ISO calendar date. Covers both the collection (sample.collectedAt) and
// policy (timestampBound.referenceTime) forms, plus a valid non-ISO control
// showing even a real calendar date in a non-ISO format is rejected, and a
// valid ISO control proving ISO parsing is unchanged.
// ---------------------------------------------------------------------------

const NON_ISO_TIMESTAMP_SHAPES = [
  { label: 'month-name impossible date', value: 'Feb 30 2026 11:30:00 Z' },
  { label: 'slash-delimited impossible date', value: '02/30/2026 11:30:00Z' },
  { label: 'month-name valid date', value: 'Mar 1 2026 11:30:00 Z' },
];

for (const shape of NON_ISO_TIMESTAMP_SHAPES) {
  test(`a collection timestamp in the non-ISO ${shape.label} form rejects`, () => {
    const samples = baselineSamples();
    samples[0].collectedAt = shape.value;
    const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
    const decision = decisionFor(decisions, 'sample-synthetic-1');
    assert.equal(decision.status, 'REJECT');
    assert.deepEqual(decision.reasons, [{ code: 'timestamp-invalid' }]);
  });

  test(`a policy reference time in the non-ISO ${shape.label} form throws a sanitized typed error`, () => {
    const policy = baselinePolicy();
    policy.timestampBound.referenceTime = shape.value;
    assertPolicyRejected(policy, 'policy-timestamp-bound-invalid');
  });
}

test('a valid ISO collection timestamp is still accepted', () => {
  const samples = baselineSamples();
  samples[0].collectedAt = '2026-01-01T11:30:00Z';
  const decisions = evaluateSampleAcceptance(baselinePolicy(), samples);
  const decision = decisionFor(decisions, 'sample-synthetic-1');
  assert.equal(decision.status, 'ACCEPT');
  assert.deepEqual(decision.reasons, []);
});

test('a valid ISO policy reference time is still accepted', () => {
  const policy = baselinePolicy();
  policy.timestampBound.referenceTime = '2026-01-01T12:00:00Z';
  const decisions = evaluateSampleAcceptance(policy, baselineSamples());
  for (const decision of decisions) {
    assert.equal(decision.status, 'ACCEPT');
    assert.deepEqual(decision.reasons, []);
  }
});
