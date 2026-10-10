import assert from 'node:assert/strict';
import test from 'node:test';

import { planNextEscalationContact, type PlanNextEscalationContactInput } from '../lib/ohworks-critical-notification-escalation';

/**
 * All fabricated: synthetic contact names and identifiers. No real
 * clinician, patient, or customer data, and no network call.
 */
function baselineChain() {
  return [
    { role: 'ordering_provider' as const, name: 'Dr. Synthetic Alpha', contactMethod: 'page-alpha' },
    { role: 'covering_provider' as const, name: 'Dr. Synthetic Beta', contactMethod: 'page-beta' },
    { role: 'charge_nurse' as const, name: 'Nurse Synthetic Gamma', contactMethod: 'phone-gamma' },
    { role: 'lab_director' as const, name: 'Dir. Synthetic Delta', contactMethod: 'phone-delta' },
  ];
}

function baselineInput(overrides: Partial<PlanNextEscalationContactInput> = {}): PlanNextEscalationContactInput {
  return {
    escalationChain: baselineChain(),
    attemptsSoFar: [],
    maxAttemptsPerContact: 3,
    now: '2026-01-01T12:00:00.000Z',
    minMinutesBetweenAttemptsToSameContact: 15,
    ...overrides,
  };
}

test('rejects an invalid "now" timestamp instead of returning contact_now', () => {
  assert.throws(
    () =>
      planNextEscalationContact(
        baselineInput({
          attemptsSoFar: [{ chainIndex: 0, attemptedAt: 'not-a-timestamp', reached: false }],
          now: 'also-not-a-timestamp',
        }),
      ),
    RangeError,
  );
});

test('rejects an invalid timestamp on the only (first) attempt instead of returning contact_now', () => {
  assert.throws(
    () =>
      planNextEscalationContact(
        baselineInput({
          attemptsSoFar: [{ chainIndex: 0, attemptedAt: 'not-a-timestamp', reached: false }],
          now: '2026-01-01T12:00:00.000Z',
        }),
      ),
    RangeError,
  );
});

test('rejects an invalid timestamp on a later attempt even when the first attempt is valid', () => {
  assert.throws(
    () =>
      planNextEscalationContact(
        baselineInput({
          attemptsSoFar: [
            { chainIndex: 0, attemptedAt: '2026-01-01T09:00:00.000Z', reached: false },
            { chainIndex: 0, attemptedAt: 'not-a-timestamp', reached: false },
          ],
          now: '2026-01-01T12:00:00.000Z',
        }),
      ),
    RangeError,
  );
});

test('thrown error carries a fixed, privacy-safe message with no raw input or contact details echoed', () => {
  try {
    planNextEscalationContact(
      baselineInput({
        attemptsSoFar: [{ chainIndex: 0, attemptedAt: 'not-a-timestamp', reached: false }],
        now: '2026-01-01T12:00:00.000Z',
      }),
    );
    assert.fail('expected planNextEscalationContact to throw');
  } catch (error) {
    assert.ok(error instanceof RangeError);
    assert.equal((error as Error).message, 'planNextEscalationContact: unusable timestamp input');
    assert.doesNotMatch((error as Error).message, /not-a-timestamp/);
    assert.doesNotMatch((error as Error).message, /Synthetic|page-alpha|phone-gamma/);
  }
});

test('the already-acknowledged short circuit still returns before any timestamp is parsed', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [
        { chainIndex: 0, attemptedAt: 'not-a-timestamp', reached: false },
        { chainIndex: 1, attemptedAt: 'also-not-a-timestamp', reached: true },
      ],
      now: 'not-a-timestamp-either',
    }),
  );
  assert.equal(plan.action, 'contact_now');
  assert.equal(plan.targetChainIndex, null);
  assert.equal(plan.targetContact, null);
  assert.equal(plan.reason, 'already acknowledged, no further escalation needed');
});

test('an invalid attempt timestamp against an already-exhausted contact does not block moving to the next contact', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [
        { chainIndex: 0, attemptedAt: 'not-a-timestamp', reached: false },
        { chainIndex: 0, attemptedAt: 'not-a-timestamp', reached: false },
        { chainIndex: 0, attemptedAt: 'not-a-timestamp', reached: false },
      ],
      maxAttemptsPerContact: 3,
      now: '2026-01-01T12:00:00.000Z',
    }),
  );
  assert.equal(plan.action, 'contact_now');
  assert.equal(plan.targetChainIndex, 1);
  assert.deepEqual(plan.targetContact, baselineChain()[1]);
});

test('valid, unsorted attempts still compute the most recent one correctly and wait as expected', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [
        { chainIndex: 0, attemptedAt: '2026-01-01T09:00:00.000Z', reached: false },
        { chainIndex: 0, attemptedAt: '2026-01-01T11:50:00.000Z', reached: false },
        { chainIndex: 0, attemptedAt: '2026-01-01T10:30:00.000Z', reached: false },
      ],
      maxAttemptsPerContact: 4,
      now: '2026-01-01T12:00:00.000Z',
      minMinutesBetweenAttemptsToSameContact: 15,
    }),
  );
  assert.equal(plan.action, 'wait');
  assert.equal(plan.targetChainIndex, 0);
  assert.equal(plan.waitMinutes, 5);
});

test('valid attempts remain ready to contact now exactly at the retry boundary', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [{ chainIndex: 0, attemptedAt: '2026-01-01T11:45:00.000Z', reached: false }],
      now: '2026-01-01T12:00:00.000Z',
      minMinutesBetweenAttemptsToSameContact: 15,
    }),
  );
  assert.equal(plan.action, 'contact_now');
  assert.equal(plan.targetChainIndex, 0);
  assert.equal(plan.waitMinutes, 0);
});

test('valid attempts just before the retry boundary still wait', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [{ chainIndex: 0, attemptedAt: '2026-01-01T11:45:01.000Z', reached: false }],
      now: '2026-01-01T12:00:00.000Z',
      minMinutesBetweenAttemptsToSameContact: 15,
    }),
  );
  assert.equal(plan.action, 'wait');
  assert.equal(plan.targetChainIndex, 0);
  assert.ok(plan.waitMinutes > 0);
});
