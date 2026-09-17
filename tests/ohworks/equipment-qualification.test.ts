import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QualificationInputError,
  evaluateEquipmentQualificationGate,
  explainQualificationGateReason,
  type ChangeEventInput,
  type InstrumentQualificationInput,
  type InstrumentQualificationRegistry,
  type QualificationReasonCode,
} from '../../lib/ohworks-equipment-qualification';

/**
 * All fabricated: synthetic instrument identifiers and made-up
 * qualification data. None of this represents a real instrument, sample,
 * or customer.
 */
function record(overrides: Partial<InstrumentQualificationInput> = {}): InstrumentQualificationInput {
  return {
    instrumentId: 'instrument-synthetic-001',
    installation: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'quality-manager' },
    operational: { completedAt: '2026-01-02T00:00:00.000Z', approverRole: 'lab-director' },
    performance: { completedAt: '2026-01-03T00:00:00.000Z', approverRole: 'metrology-engineer' },
    requalificationIntervalDays: 365,
    ...overrides,
  };
}

function registryOf(entry: InstrumentQualificationInput): InstrumentQualificationRegistry {
  return { [entry.instrumentId]: entry };
}

const ALL_REASON_CODES: QualificationReasonCode[] = [
  'unknown-instrument',
  'run-timestamp-invalid',
  'requalification-interval-invalid',
  'installation-stage-missing',
  'installation-timestamp-invalid',
  'installation-approver-invalid',
  'operational-stage-missing',
  'operational-timestamp-invalid',
  'operational-approver-invalid',
  'operational-before-installation',
  'performance-stage-missing',
  'performance-timestamp-invalid',
  'performance-approver-invalid',
  'performance-before-operational',
  'change-event-timestamp-invalid',
  'unknown-change-event-kind',
  'run-before-installation',
  'run-before-operational',
  'run-before-performance',
  'installation-invalidated-by-change-event',
  'operational-invalidated-by-change-event',
  'performance-invalidated-by-change-event',
  'requalification-interval-expired',
  'fully-qualified',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /released?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('a fully completed, correctly ordered, current chain is qualified', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'qualified');
  assert.equal(result.reasonCode, 'fully-qualified');
});

test('a run at the exact instant performance qualification completed is qualified', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, entry.performance!.completedAt);
  assert.equal(result.decision, 'qualified');
});

test('stages completed at the exact same instant are not out of order', () => {
  const entry = record({
    installation: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'quality-manager' },
    operational: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'lab-director' },
    performance: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'metrology-engineer' },
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'qualified');
  assert.equal(result.reasonCode, 'fully-qualified');
});

test('a change event that predates every qualification stage does not invalidate anything', () => {
  const entry = record({
    changeEvents: [{ kind: 'relocation', occurredAt: '2025-12-01T00:00:00.000Z' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'qualified');
  assert.equal(result.reasonCode, 'fully-qualified');
});

// ---------------------------------------------------------------------------
// Fail closed: unknown instrument
// ---------------------------------------------------------------------------

test('an instrument absent from the registry is not qualified as unknown', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), 'instrument-synthetic-does-not-exist', '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'unknown-instrument');
});

test('an empty registry blocks every lookup as unknown', () => {
  const result = evaluateEquipmentQualificationGate({}, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'unknown-instrument');
});

// ---------------------------------------------------------------------------
// Fail closed: missing stages
// ---------------------------------------------------------------------------

test('a missing installation stage is not qualified', () => {
  const entry = record({ installation: undefined });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'installation-stage-missing');
});

test('a missing operational stage is not qualified even with installation complete', () => {
  const entry = record({ operational: undefined });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'operational-stage-missing');
});

test('a missing performance stage is not qualified even with installation and operational complete', () => {
  const entry = record({ performance: undefined });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'performance-stage-missing');
});

// ---------------------------------------------------------------------------
// Fail closed: malformed stage timestamps and approver roles
// ---------------------------------------------------------------------------

test('an unparsable installation timestamp is not qualified', () => {
  const entry = record({ installation: { completedAt: 'not-a-timestamp', approverRole: 'quality-manager' } });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'installation-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") installation timestamp is not qualified', () => {
  const entry = record({ installation: { completedAt: '2026-01-01T00:00:00.000+00:00', approverRole: 'quality-manager' } });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'installation-timestamp-invalid');
});

test('an unrecognized installation approver role is not qualified', () => {
  const entry = record({ installation: { completedAt: '2026-01-01T00:00:00.000Z', approverRole: 'random-visitor' as never } });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'installation-approver-invalid');
});

test('an unparsable operational timestamp is not qualified', () => {
  const entry = record({ operational: { completedAt: 'not-a-timestamp', approverRole: 'lab-director' } });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'operational-timestamp-invalid');
});

test('an unrecognized operational approver role is not qualified', () => {
  const entry = record({ operational: { completedAt: '2026-01-02T00:00:00.000Z', approverRole: 'random-visitor' as never } });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'operational-approver-invalid');
});

test('an unparsable performance timestamp is not qualified', () => {
  const entry = record({ performance: { completedAt: 'not-a-timestamp', approverRole: 'metrology-engineer' } });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'performance-timestamp-invalid');
});

test('an unrecognized performance approver role is not qualified', () => {
  const entry = record({ performance: { completedAt: '2026-01-03T00:00:00.000Z', approverRole: 'random-visitor' as never } });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'performance-approver-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: out-of-order stages
// ---------------------------------------------------------------------------

test('operational completed before installation is not qualified', () => {
  const entry = record({
    installation: { completedAt: '2026-01-05T00:00:00.000Z', approverRole: 'quality-manager' },
    operational: { completedAt: '2026-01-02T00:00:00.000Z', approverRole: 'lab-director' },
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'operational-before-installation');
});

test('performance completed before operational is not qualified', () => {
  const entry = record({
    operational: { completedAt: '2026-01-05T00:00:00.000Z', approverRole: 'lab-director' },
    performance: { completedAt: '2026-01-03T00:00:00.000Z', approverRole: 'metrology-engineer' },
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'performance-before-operational');
});

// ---------------------------------------------------------------------------
// Fail closed: run timestamp precedes a completed stage
// ---------------------------------------------------------------------------

test('a run before installation completed is not qualified', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2025-12-31T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'run-before-installation');
});

test('a run between installation and operational completion is not qualified', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-01T12:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'run-before-operational');
});

test('a run between operational and performance completion is not qualified', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-02T12:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'run-before-performance');
});

// ---------------------------------------------------------------------------
// Fail closed: change events
// ---------------------------------------------------------------------------

test('a relocation after installation invalidates installation qualification', () => {
  const entry = record({
    changeEvents: [{ kind: 'relocation', occurredAt: '2026-01-01T12:00:00.000Z' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'installation-invalidated-by-change-event');
});

test('a major repair between operational and performance completion invalidates operational qualification', () => {
  const entry = record({
    changeEvents: [{ kind: 'major-repair', occurredAt: '2026-01-02T12:00:00.000Z' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'operational-invalidated-by-change-event');
});

test('a major repair after installation but before operational completion invalidates nothing', () => {
  const entry = record({
    changeEvents: [{ kind: 'major-repair', occurredAt: '2026-01-01T12:00:00.000Z' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'qualified');
  assert.equal(result.reasonCode, 'fully-qualified');
});

test('a software update after performance completion invalidates performance qualification', () => {
  const entry = record({
    changeEvents: [{ kind: 'software-update', occurredAt: '2026-01-04T00:00:00.000Z' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'performance-invalidated-by-change-event');
});

test('a software update before performance completion invalidates nothing', () => {
  const entry = record({
    changeEvents: [{ kind: 'software-update', occurredAt: '2026-01-01T12:00:00.000Z' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'qualified');
  assert.equal(result.reasonCode, 'fully-qualified');
});

test('a change event after the run timestamp does not invalidate anything', () => {
  const entry = record({
    changeEvents: [{ kind: 'relocation', occurredAt: '2026-01-20T00:00:00.000Z' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'qualified');
  assert.equal(result.reasonCode, 'fully-qualified');
});

test('an unrecognized change event kind is not qualified', () => {
  const entry = record({
    changeEvents: [{ kind: 'firmware-patch' as ChangeEventInput['kind'], occurredAt: '2026-01-04T00:00:00.000Z' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'unknown-change-event-kind');
});

test('an unparsable change event timestamp is not qualified', () => {
  const entry = record({
    changeEvents: [{ kind: 'relocation', occurredAt: 'not-a-timestamp' }],
  });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'change-event-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: requalification interval
// ---------------------------------------------------------------------------

test('a run at the exact requalification expiry instant is not qualified', () => {
  const entry = record({ requalificationIntervalDays: 30 });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-02-02T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'requalification-interval-expired');
});

test('a run one instant before requalification expiry is qualified', () => {
  const entry = record({ requalificationIntervalDays: 30 });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-02-01T23:59:59.999Z');
  assert.equal(result.decision, 'qualified');
  assert.equal(result.reasonCode, 'fully-qualified');
});

test('a run well past the requalification interval is not qualified', () => {
  const entry = record({ requalificationIntervalDays: 30 });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-06-01T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'requalification-interval-expired');
});

test('a zero requalification interval is not qualified as invalid', () => {
  const entry = record({ requalificationIntervalDays: 0 });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'requalification-interval-invalid');
});

test('a negative requalification interval is not qualified as invalid', () => {
  const entry = record({ requalificationIntervalDays: -10 });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'requalification-interval-invalid');
});

test('a non-integer requalification interval is not qualified as invalid', () => {
  const entry = record({ requalificationIntervalDays: 30.5 });
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'requalification-interval-invalid');
});

// ---------------------------------------------------------------------------
// Fail closed: run timestamp itself malformed
// ---------------------------------------------------------------------------

test('an unparsable run timestamp is not qualified', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, 'not-a-timestamp');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

test('a non-UTC (offset, non-"Z") run timestamp is not qualified', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000+00:00');
  assert.equal(result.decision, 'not_qualified');
  assert.equal(result.reasonCode, 'run-timestamp-invalid');
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a null registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateEquipmentQualificationGate(null as unknown as InstrumentQualificationRegistry, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof QualificationInputError);
      assert.equal((error as QualificationInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an array registry throws a sanitized typed error', () => {
  assert.throws(
    () => evaluateEquipmentQualificationGate([] as unknown as InstrumentQualificationRegistry, 'instrument-synthetic-001', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof QualificationInputError);
      assert.equal((error as QualificationInputError).code, 'registry-malformed');
      return true;
    },
  );
});

test('an empty-string instrument id throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateEquipmentQualificationGate(registryOf(entry), '', '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof QualificationInputError);
      assert.equal((error as QualificationInputError).code, 'instrument-id-malformed');
      return true;
    },
  );
});

test('a non-string run timestamp throws a sanitized typed error', () => {
  const entry = record();
  assert.throws(
    () => evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, 12345 as unknown as string),
    (error: unknown) => {
      assert.ok(error instanceof QualificationInputError);
      assert.equal((error as QualificationInputError).code, 'run-timestamp-malformed');
      return true;
    },
  );
});

test('a registry entry missing requalificationIntervalDays throws a sanitized typed error', () => {
  const malformed = record();
  delete (malformed as Partial<InstrumentQualificationInput>).requalificationIntervalDays;
  assert.throws(
    () => evaluateEquipmentQualificationGate({ [malformed.instrumentId]: malformed } as unknown as InstrumentQualificationRegistry, malformed.instrumentId, '2026-01-05T00:00:00.000Z'),
    (error: unknown) => {
      assert.ok(error instanceof QualificationInputError);
      assert.equal((error as QualificationInputError).code, 'instrument-record-malformed');
      return true;
    },
  );
});

test('a registry entry with a malformed stage shape throws a sanitized typed error', () => {
  const entry = record({ installation: { completedAt: '2026-01-01T00:00:00.000Z' } as unknown as InstrumentQualificationInput['installation'] });
  assert.throws(
    () => evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z'),
    QualificationInputError,
  );
});

test('a registry entry with a non-array changeEvents throws a sanitized typed error', () => {
  const entry = record({ changeEvents: 'not-an-array' as unknown as InstrumentQualificationInput['changeEvents'] });
  assert.throws(
    () => evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z'),
    QualificationInputError,
  );
});

test('a registry entry with a malformed change event entry throws a sanitized typed error', () => {
  const entry = record({ changeEvents: [{ kind: 'relocation' } as unknown as ChangeEventInput] });
  assert.throws(
    () => evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-05T00:00:00.000Z'),
    QualificationInputError,
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    evaluateEquipmentQualificationGate(null as unknown as InstrumentQualificationRegistry, 'instrument-secret-token-abc123', '2026-01-05T00:00:00.000Z');
    assert.fail('expected evaluateEquipmentQualificationGate to throw');
  } catch (error) {
    assert.ok(error instanceof QualificationInputError);
    assert.doesNotMatch((error as Error).message, /instrument-secret-token-abc123/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const entry = record();
  const first = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  const second = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.deepEqual(first, second);
});

test('the result object is frozen', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'decision', 'qualified');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.decision, 'qualified');
});

test('evaluateEquipmentQualificationGate does not mutate its registry input', () => {
  const entry = record({ changeEvents: [{ kind: 'relocation', occurredAt: '2025-12-01T00:00:00.000Z' }] });
  const registry = registryOf(entry);
  const before = JSON.stringify(registry);
  evaluateEquipmentQualificationGate(registry, entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(JSON.stringify(registry), before);
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainQualificationGateReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /instrument-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainQualificationGateReason('performance-invalidated-by-change-event'), explainQualificationGateReason('performance-invalidated-by-change-event'));
});

test('the reason field on a result matches explainQualificationGateReason for its reasonCode', () => {
  const entry = record();
  const result = evaluateEquipmentQualificationGate(registryOf(entry), entry.instrumentId, '2026-01-10T00:00:00.000Z');
  assert.equal(result.reason, explainQualificationGateReason(result.reasonCode));
});
