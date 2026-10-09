import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PriorityEscalationInputError,
  escalateSpecimenPriorities,
  type EscalationSteps,
  type PriorityEscalationInput,
  type Specimen,
} from '../../lib/ohworks-priority-escalation';

/**
 * All fabricated: synthetic specimen identifiers and made-up timestamps.
 * None of this represents a real patient, sample, or subject.
 *
 * Reproduces lims-box#566: `Date.parse` rolls an impossible literal calendar
 * date (e.g. February 30th) into a neighboring real date instead of
 * rejecting it, which previously let a stale specimen slip past the
 * fail-closed stat outcome and be computed as freshly received.
 */
function baselineSteps(): EscalationSteps {
  return {
    routineToUrgentMinutes: 60,
    urgentToStatMinutes: 120,
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

test('reproduction: a routine specimen with an impossible February 30th receipt does not stay routine at elapsedMinutes=10', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-repro', 'routine', '2026-02-30T12:00:00Z')];
  input.currentAt = '2026-03-02T12:10:00Z';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'receipt-timestamp-invalid');
  assert.equal(result.queue[0]!.elapsedMinutes, null);
});

test('an impossible current timestamp (February 30th) throws the current-timestamp-invalid error', () => {
  const input = baselineInput();
  input.currentAt = '2026-02-30T12:00:00Z';
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'current-timestamp-invalid');
      return true;
    },
  );
});

test('an impossible current timestamp with an explicit offset (April 31st) throws the current-timestamp-invalid error', () => {
  const input = baselineInput();
  input.currentAt = '2026-04-31T08:00:00+02:00';
  assert.throws(
    () => escalateSpecimenPriorities(input),
    (error: unknown) => {
      assert.ok(error instanceof PriorityEscalationInputError);
      assert.equal((error as PriorityEscalationInputError).code, 'current-timestamp-invalid');
      return true;
    },
  );
});

test('a receipt timestamp of April 31st fails closed to stat with null elapsed minutes', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-apr31', 'routine', '2026-04-31T09:00:00Z')];
  input.currentAt = '2026-05-01T09:10:00Z';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'receipt-timestamp-invalid');
  assert.equal(result.queue[0]!.elapsedMinutes, null);
});

test('a receipt timestamp of non-leap February 29th fails closed to stat with null elapsed minutes', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-feb29-non-leap', 'routine', '2026-02-29T10:00:00Z')];
  input.currentAt = '2026-03-01T10:05:00Z';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'receipt-timestamp-invalid');
  assert.equal(result.queue[0]!.elapsedMinutes, null);
});

test('control: a receipt timestamp of leap-day February 29th in a real leap year is accepted and computed normally', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-feb29-leap', 'routine', '2024-02-29T10:00:00Z')];
  input.currentAt = '2024-02-29T10:10:00Z';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'routine');
  assert.equal(result.queue[0]!.reasonCode, 'no-escalation-needed');
  assert.equal(result.queue[0]!.elapsedMinutes, 10);
});

test('control: a valid receipt timestamp with an explicit positive offset is accepted and computed normally', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-offset', 'routine', '2026-01-02T13:00:00+01:00')];
  input.currentAt = '2026-01-02T12:10:00Z';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'routine');
  assert.equal(result.queue[0]!.reasonCode, 'no-escalation-needed');
  assert.equal(result.queue[0]!.elapsedMinutes, 10);
});

test('control: a valid current timestamp with an explicit negative offset is accepted and computed normally', () => {
  const input = baselineInput();
  input.specimens = [specimen('spec-synth-offset-current', 'routine', '2026-01-02T12:00:00Z')];
  input.currentAt = '2026-01-02T07:10:00-05:00';
  const result = escalateSpecimenPriorities(input);
  assert.equal(result.queue[0]!.effectivePriority, 'routine');
  assert.equal(result.queue[0]!.reasonCode, 'no-escalation-needed');
  assert.equal(result.queue[0]!.elapsedMinutes, 10);
});

test('a mixed queue proves invalid receipts remain conservatively ranked ahead of trustworthy stat entries and preserve ordering semantics', () => {
  const input = baselineInput();
  input.specimens = [
    specimen('spec-synth-trustworthy-stat', 'stat', '2026-01-02T12:00:00.000Z'),
    specimen('spec-synth-impossible-feb30', 'routine', '2026-02-30T12:00:00Z'),
    specimen('spec-synth-impossible-apr31', 'urgent', '2026-04-31T09:00:00Z'),
    specimen('spec-synth-valid-routine', 'routine', '2026-03-02T12:05:00Z'),
  ];
  input.currentAt = '2026-03-02T12:10:00Z';
  const result = escalateSpecimenPriorities(input);

  assert.deepEqual(
    result.queue.map((entry) => entry.specimenId),
    [
      'spec-synth-impossible-feb30',
      'spec-synth-impossible-apr31',
      'spec-synth-trustworthy-stat',
      'spec-synth-valid-routine',
    ],
  );
  assert.equal(result.queue[0]!.effectivePriority, 'stat');
  assert.equal(result.queue[0]!.reasonCode, 'receipt-timestamp-invalid');
  assert.equal(result.queue[0]!.elapsedMinutes, null);
  assert.equal(result.queue[1]!.effectivePriority, 'stat');
  assert.equal(result.queue[1]!.reasonCode, 'receipt-timestamp-invalid');
  assert.equal(result.queue[1]!.elapsedMinutes, null);
  assert.equal(result.queue[2]!.effectivePriority, 'stat');
  assert.equal(result.queue[2]!.specimenId, 'spec-synth-trustworthy-stat');
  assert.equal(result.queue[3]!.effectivePriority, 'routine');
  assert.equal(result.queue[3]!.elapsedMinutes, 5);
});
