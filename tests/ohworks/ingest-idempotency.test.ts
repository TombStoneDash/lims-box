import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyIngestDecision,
  DEFAULT_INGEST_POLICY,
  evaluateIngestAttempt,
  type IngestAttempt,
  type PriorBindings,
} from '../../lib/ohworks-ingest-idempotency';

const NOW = '2026-09-12T10:00:00.000Z';
const FINGERPRINT_A = 'a'.repeat(64);
const FINGERPRINT_B = 'b'.repeat(64);

function baseAttempt(overrides: Partial<IngestAttempt> = {}): IngestAttempt {
  return {
    tenantId: 'ohworks-tenant-synthetic-001',
    messageSourceId: 'ohworks-message-source-90001',
    correlationId: 'ohworks-correlation-90001',
    parserVersionId: 'ohworks-parser-v1-synthetic',
    mappingVersionId: 'ohworks-mapping-v1-synthetic',
    observedAtUtc: NOW,
    fingerprint: FINGERPRINT_A,
    ...overrides,
  };
}

const emptyBindings: PriorBindings = new Map();

test('first sighting of an identity is a new decision and binds it', () => {
  const attempt = baseAttempt();
  const decision = evaluateIngestAttempt(attempt, NOW, emptyBindings);
  assert.equal(decision.kind, 'new');
  assert.equal(decision.reason, 'no_prior_binding');

  const bindings = applyIngestDecision(decision, emptyBindings, attempt);
  assert.equal(bindings.size, 1);
  assert.ok(bindings.get(decision.identityKey));
});

test('replaying the identical identity and fingerprint is byte-identical idempotent_replay', () => {
  const attempt = baseAttempt();
  const first = evaluateIngestAttempt(attempt, NOW, emptyBindings);
  const bindings = applyIngestDecision(first, emptyBindings, attempt);

  const replayAttempt = baseAttempt({ observedAtUtc: '2026-09-12T10:05:00.000Z' });
  const replayA = evaluateIngestAttempt(replayAttempt, NOW, bindings);
  const replayB = evaluateIngestAttempt(replayAttempt, NOW, bindings);

  assert.equal(replayA.kind, 'idempotent_replay');
  assert.deepEqual(replayA, replayB, 'identical inputs must produce a byte-identical decision');
  assert.equal(JSON.stringify(replayA), JSON.stringify(replayB));
});

test('same identity with a changed fingerprint is a conflict, and prior binding is untouched', () => {
  const attempt = baseAttempt();
  const first = evaluateIngestAttempt(attempt, NOW, emptyBindings);
  const bindings = applyIngestDecision(first, emptyBindings, attempt);

  const conflicting = baseAttempt({ fingerprint: FINGERPRINT_B, observedAtUtc: '2026-09-12T10:05:00.000Z' });
  const decision = evaluateIngestAttempt(conflicting, NOW, bindings);

  assert.equal(decision.kind, 'conflict');
  assert.equal(decision.reason, 'fingerprint_mismatch_for_bound_identity');

  const nextBindings = applyIngestDecision(decision, bindings, conflicting);
  assert.deepEqual(nextBindings.get(decision.identityKey), bindings.get(decision.identityKey));
});

test('an attempt observed before the bound time is stale and does not overwrite the binding', () => {
  const attempt = baseAttempt({ observedAtUtc: '2026-09-12T10:05:00.000Z' });
  const first = evaluateIngestAttempt(attempt, NOW, emptyBindings);
  const bindings = applyIngestDecision(first, emptyBindings, attempt);

  const outOfOrder = baseAttempt({ observedAtUtc: '2026-09-12T09:00:00.000Z', fingerprint: FINGERPRINT_B });
  const decision = evaluateIngestAttempt(outOfOrder, NOW, bindings);

  assert.equal(decision.kind, 'stale');
  assert.equal(decision.reason, 'observed_before_prior_binding');
});

test('unknown parser or mapping version is quarantined, not guessed', () => {
  const decision = evaluateIngestAttempt(
    baseAttempt({ parserVersionId: 'ohworks-parser-v9-unknown' }),
    NOW,
    emptyBindings,
  );
  assert.equal(decision.kind, 'quarantined');
  assert.equal(decision.reason, 'unknown_mapping');
});

test('a version change against a bound identity is quarantined as binding drift', () => {
  const attempt = baseAttempt();
  const first = evaluateIngestAttempt(attempt, NOW, emptyBindings);
  const bindings = applyIngestDecision(first, emptyBindings, attempt);

  // Simulate a policy where a second, differently-versioned mapping is allowed globally
  // but conflicts with what this identity was already bound to.
  const alteredPolicy = {
    ...DEFAULT_INGEST_POLICY,
    allowedMappingVersionIds: [...DEFAULT_INGEST_POLICY.allowedMappingVersionIds, 'ohworks-mapping-v2-synthetic'],
  };
  const secondBindAttempt = baseAttempt({ mappingVersionId: 'ohworks-mapping-v2-synthetic' });
  const decision = evaluateIngestAttempt(secondBindAttempt, NOW, bindings, alteredPolicy);

  assert.equal(decision.kind, 'quarantined');
  assert.equal(decision.reason, 'binding_version_drift');
});

test('malformed opaque IDs fail closed to quarantined', () => {
  const decision = evaluateIngestAttempt(
    baseAttempt({ correlationId: 'has a space' }),
    NOW,
    emptyBindings,
  );
  assert.equal(decision.kind, 'quarantined');
  assert.equal(decision.reason, 'malformed_opaque_id');
});

test('malformed fingerprint fails closed to quarantined', () => {
  const decision = evaluateIngestAttempt(
    baseAttempt({ fingerprint: 'not-a-hex-fingerprint' }),
    NOW,
    emptyBindings,
  );
  assert.equal(decision.kind, 'quarantined');
  assert.equal(decision.reason, 'malformed_fingerprint');
});

test('non-strict-UTC timestamps fail closed to quarantined', () => {
  const withOffset = evaluateIngestAttempt(
    baseAttempt({ observedAtUtc: '2026-09-12T10:00:00.000+00:00' }),
    NOW,
    emptyBindings,
  );
  assert.equal(withOffset.kind, 'quarantined');
  assert.equal(withOffset.reason, 'malformed_observed_at');

  const badClock = evaluateIngestAttempt(baseAttempt(), 'not-a-time', emptyBindings);
  assert.equal(badClock.kind, 'quarantined');
  assert.equal(badClock.reason, 'malformed_injected_clock');
});

test('a timestamp far in the future of the injected clock is quarantined as time drift', () => {
  const decision = evaluateIngestAttempt(
    baseAttempt({ observedAtUtc: '2026-09-12T11:00:00.000Z' }),
    NOW,
    emptyBindings,
  );
  assert.equal(decision.kind, 'quarantined');
  assert.equal(decision.reason, 'time_drift_future_skew');
});

test('an oversize field is quarantined without inspecting its content', () => {
  const decision = evaluateIngestAttempt(
    baseAttempt({ correlationId: `ohworks-${'x'.repeat(200)}` }),
    NOW,
    emptyBindings,
  );
  assert.equal(decision.kind, 'quarantined');
  assert.equal(decision.reason, 'oversize_field');
});

test('a contradictory prior binding (wrong identity key or malformed shape) is quarantined', () => {
  const attempt = baseAttempt();
  const identityKey = 'ohworks-tenant-synthetic-001:ohworks-message-source-90001:ohworks-correlation-90001';
  const brokenBindings: PriorBindings = new Map([
    [identityKey, {
      identityKey: 'wrong-identity-key',
      parserVersionId: 'ohworks-parser-v1-synthetic',
      mappingVersionId: 'ohworks-mapping-v1-synthetic',
      fingerprint: FINGERPRINT_A,
      observedAtUtc: NOW,
    }],
  ]);
  const decision = evaluateIngestAttempt(attempt, NOW, brokenBindings);
  assert.equal(decision.kind, 'quarantined');
  assert.equal(decision.reason, 'broken_prior_binding');
});

test('unknown or sensitive fields are rejected before any decision logic runs', () => {
  const withUnknownField = evaluateIngestAttempt(
    { ...baseAttempt(), instrumentIpAddress: '10.0.0.5' },
    NOW,
    emptyBindings,
  );
  assert.equal(withUnknownField.kind, 'quarantined');
  assert.equal(withUnknownField.reason, 'unexpected_field_rejected');

  const withSensitiveField = evaluateIngestAttempt(
    { ...baseAttempt(), patientId: 'p-001' },
    NOW,
    emptyBindings,
  );
  assert.equal(withSensitiveField.kind, 'quarantined');
  assert.equal(withSensitiveField.reason, 'sensitive_field_rejected');

  const notAnObject = evaluateIngestAttempt('raw string payload', NOW, emptyBindings);
  assert.equal(notAnObject.kind, 'quarantined');
  assert.equal(notAnObject.reason, 'malformed_input_not_an_object');
});

test('decisions are deterministic: same inputs always produce the same decision', () => {
  const attempt = baseAttempt();
  const first = evaluateIngestAttempt(attempt, NOW, emptyBindings);
  const second = evaluateIngestAttempt(baseAttempt(), NOW, emptyBindings);
  assert.deepEqual(first, second);
});
