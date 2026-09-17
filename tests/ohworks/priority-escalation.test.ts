import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PriorityEscalationInputError,
  escalateSpecimenPriorities,
  explainPriorityEscalationReason,
  type EscalationSteps,
  type PriorityEscalationInput,
  type PriorityEscalationReasonCode,
  type Specimen,
} from '../../lib/ohworks-priority-escalation';

/**
 * All fabricated: synthetic specimen identifiers and made-up timestamps.
 * None of this represents a real patient, sample, or subject.
 */
function baselineSteps(): EscalationSteps {
  return {
    routineToUrgentMinutes: 30,
    urgentToStatMinutes: 90,
  };
}

function specimen(id: string, initialPriority: Specimen['initialPriority'], receivedAt: string): Specimen {
  return { specimenId: id, initialPriority, receivedAt };
}

function baselineInput(): PriorityEscalationInput {
  return {
    specimens: [specimen('spec-synth-a', 'routine', '2026-01-02T12:00:00.000Z')],
    steps: baselineSteps(),
    currentAt: '2026-01-02T12:00:00.000Z',
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: PriorityEscalationReasonCode[] = [
  'no-escalation-needed',
  'escalated-to-urgent',
  'escalated-to-stat',
  'receipt-timestamp-invalid',
  'current-before-receipt',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

test('a specimen with no elapsed time is not escalated', () => {
  const result = escalateSpecimenPriorities(baselineInput());
  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0]!.effectivePriority, 'routine');
  assert.equal(result.queue[0]!.reasonCode, 'no-escalation-needed');
  assert.equal(result.queue[0]!.elapsedMinutes, 0);
  assert.equal(result.queue[0]!.queuePosition, 0);
});

test('evaluation is pure: it does not mutate input records', () => {
  const input = baselineInput();
  const before = JSON.stringify(input);
  escalateSpecimenPriorities(input);
  assert.equal(JSON.stringify(input), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const input = baselineInput();
  const first = escalateSpecimenPriorities(input);
  const second = escalateSpecimenPriorities(clone(input));
  assert.deepEqual(first, second);
});

test('a routine specimen escalates to urgent once the routine-to-urgent threshold elapses', () => {
  const input = baselineInput();
  input.currentAt = '2026-01-02T12:30:00.000Z'; // exactly 30 minutes elapsed
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'urgent');
  assert.equal(result.queue[0]!.reasonCode, 'escalated-to-urgent');
  assert.equal(result.queue[0]!.elapsedMinutes, 30);
});

test('a routine specimen just under the routine-to-urgent threshold is not escalated', () => {
  const input = baselineInput();
  input.currentAt = '2026-01-02T12:29:59.000Z';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'routine');
  assert.equal(result.queue[0]!.reasonCode, 'no-escalation-needed');
});

test('a routine specimen escalates all the way to stat once the urgent-to-stat threshold elapses', () => {
  const input = baselineInput();
  input.currentAt = '2026-01-02T13:30:00.000Z'; // exactly 90 minutes elapsed
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'escalated-to-stat');
  assert.equal(result.queue[0]!.elapsedMinutes, 90);
});

test('an initial priority never de-escalates: an already-urgent specimen with no elapsed time stays urgent', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-a', 'urgent', '2026-01-02T12:00:00.000Z')];
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'urgent');
  assert.equal(result.queue[0]!.reasonCode, 'no-escalation-needed');
});

test('an already-stat specimen stays stat even with zero elapsed time', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-a', 'stat', '2026-01-02T12:00:00.000Z')];
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'no-escalation-needed');
});

test('an already-urgent specimen that reaches the stat threshold escalates to stat', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-a', 'urgent', '2026-01-02T12:00:00.000Z')];
  input.currentAt = '2026-01-02T13:30:00.000Z';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'escalated-to-stat');
});

test('an unparsable receipt timestamp fails closed to stat with null elapsed minutes', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-a', 'routine', 'not-a-timestamp')];
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'receipt-timestamp-invalid');
  assert.equal(result.queue[0]!.elapsedMinutes, null);
});

test('a receipt timestamp after the current timestamp fails closed to stat', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-a', 'routine', '2026-01-02T13:00:00.000Z')];
  input.currentAt = '2026-01-02T12:00:00.000Z';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'current-before-receipt');
  assert.equal(result.queue[0]!.elapsedMinutes, null);
});

test('the queue orders highest effective priority first', () => {
  const input = baselineInput();
  input.specimens = [
    specimen('spec-synth-routine', 'routine', '2026-01-02T12:00:00.000Z'),
    specimen('spec-synth-stat', 'stat', '2026-01-02T12:00:00.000Z'),
    specimen('spec-synth-urgent', 'urgent', '2026-01-02T12:00:00.000Z'),
  ];
  const result = escalateSpecimenPriorities(input);
  assert.deepEqual(
    result.queue.map((entry) => entry.specimenId),
    ['spec-synth-stat', 'spec-synth-urgent', 'spec-synth-routine'],
  );
  assert.deepEqual(
    result.queue.map((entry) => entry.queuePosition),
    [0, 1, 2],
  );
});

test('within the same effective priority tier, earlier receipt is queued first', () => {
  const input = baselineInput();
  input.specimens = [
    specimen('spec-synth-later', 'routine', '2026-01-02T12:10:00.000Z'),
    specimen('spec-synth-earlier', 'routine', '2026-01-02T12:00:00.000Z'),
  ];
  input.currentAt = '2026-01-02T12:20:00.000Z';
  const result = escalateSpecimenPriorities(input);
  assert.deepEqual(
    result.queue.map((entry) => entry.specimenId),
    ['spec-synth-earlier', 'spec-synth-later'],
  );
});

test('a tie on both priority and receipt timestamp falls back to original input order', () => {
  const input = baselineInput();
  input.specimens = [
    specimen('spec-synth-first', 'routine', '2026-01-02T12:00:00.000Z'),
    specimen('spec-synth-second', 'routine', '2026-01-02T12:00:00.000Z'),
  ];
  const result = escalateSpecimenPriorities(input);
  assert.deepEqual(
    result.queue.map((entry) => entry.specimenId),
    ['spec-synth-first', 'spec-synth-second'],
  );
});

test('fail-closed stat entries with unparsable receipts are queued ahead of trustworthy stat entries at the same tier', () => {
  const input = baselineInput();
  input.specimens = [
    specimen('spec-synth-trustworthy-stat', 'stat', '2026-01-02T12:00:00.000Z'),
    specimen('spec-synth-unparsable', 'routine', 'not-a-timestamp'),
  ];
  const result = escalateSpecimenPriorities(input);
  assert.deepEqual(
    result.queue.map((entry) => entry.specimenId),
    ['spec-synth-unparsable', 'spec-synth-trustworthy-stat'],
  );
});

test('queue ordering is stable across repeated calls with identical input', () => {
  const input = baselineInput();
  input.specimens = [
    specimen('spec-synth-a', 'urgent', '2026-01-02T12:00:00.000Z'),
    specimen('spec-synth-b', 'routine', '2026-01-02T11:00:00.000Z'),
    specimen('spec-synth-c', 'stat', '2026-01-02T13:00:00.000Z'),
  ];
  const first = escalateSpecimenPriorities(input);
  const second = escalateSpecimenPriorities(clone(input));
  assert.deepEqual(
    first.queue.map((entry) => entry.specimenId),
    second.queue.map((entry) => entry.specimenId),
  );
});

test('an empty specimen list produces an empty queue', () => {
  const input = baselineInput();
  input.specimens = [];
  const result = escalateSpecimenPriorities(input);
  assert.deepEqual(result.queue, []);
});

test('an unrecognized priority value throws a sanitized typed error', () => {
  const input = baselineInput();
  (input.specimens[0] as unknown as { initialPriority: unknown }).initialPriority = 'critical';
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'unknown-priority');
      return true;
    },
  );
});

test('missing specimen identity fields throw a sanitized typed error', () => {
  const input = baselineInput();
  delete (input.specimens[0] as Partial<Specimen>).specimenId;
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'specimen-malformed');
      return true;
    },
  );
});

test('a non-array specimens input throws a sanitized typed error', () => {
  const input = baselineInput();
  (input as unknown as { specimens: unknown }).specimens = 'not-an-array';
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'specimens-not-array');
      return true;
    },
  );
});

test('an unparsable current timestamp throws a sanitized typed error', () => {
  const input = baselineInput();
  input.currentAt = 'not-a-timestamp';
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'current-timestamp-invalid');
      return true;
    },
  );
});

test('malformed escalation steps throw a sanitized typed error', () => {
  const input = baselineInput();
  (input as unknown as { steps: unknown }).steps = { routineToUrgentMinutes: 'thirty', urgentToStatMinutes: 90 };
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'steps-malformed');
      return true;
    },
  );
});

test('non-positive escalation thresholds throw a sanitized typed error', () => {
  const input = baselineInput();
  input.steps.routineToUrgentMinutes = 0;
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'steps-non-positive');
      return true;
    },
  );
});

test('a non-monotonic escalation policy throws a sanitized typed error', () => {
  const input = baselineInput();
  input.steps = { routineToUrgentMinutes: 90, urgentToStatMinutes: 30 };
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'steps-non-monotonic');
      return true;
    },
  );
});

test('equal escalation thresholds are rejected as non-monotonic', () => {
  const input = baselineInput();
  input.steps = { routineToUrgentMinutes: 30, urgentToStatMinutes: 30 };
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'steps-non-monotonic');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  const input = baselineInput();
  (input.specimens[0] as unknown as { initialPriority: unknown }).initialPriority = 'critical';
  try {
    escalateSpecimenPriorities(input);
    assert.fail('expected escalateSpecimenPriorities to throw');
  } catch (error) {
    assert.ok(error instanceof PriorityEscalationInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /spec-synth/);
  }
});

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainPriorityEscalationReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /spec-synth/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(
    explainPriorityEscalationReason('escalated-to-stat'),
    explainPriorityEscalationReason('escalated-to-stat'),
  );
});

test('no reason code ever uses approval, compliance, accreditation, or release language', () => {
  for (const code of ALL_REASON_CODES) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(code, pattern);
    }
  }
});

test('the returned outcome and each queue entry are frozen', () => {
  const result = escalateSpecimenPriorities(baselineInput());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.queue));
  assert.ok(Object.isFrozen(result.queue[0]));
});
