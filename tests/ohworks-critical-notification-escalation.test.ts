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
    maxAttemptsPerContact: 2,
    now: '2026-01-01T12:00:00.000Z',
    minMinutesBetweenAttemptsToSameContact: 15,
    ...overrides,
  };
}

test('fresh chain targets the first contact and is ready to contact now', () => {
  const plan = planNextEscalationContact(baselineInput());
  assert.equal(plan.action, 'contact_now');
  assert.equal(plan.targetChainIndex, 0);
  assert.deepEqual(plan.targetContact, baselineChain()[0]);
  assert.equal(plan.waitMinutes, 0);
});

test('moves to the next contact once the first is exhausted with no acknowledgment', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [
        { chainIndex: 0, attemptedAt: '2026-01-01T10:00:00.000Z', reached: false },
        { chainIndex: 0, attemptedAt: '2026-01-01T10:30:00.000Z', reached: false },
      ],
    }),
  );
  assert.equal(plan.action, 'contact_now');
  assert.equal(plan.targetChainIndex, 1);
  assert.deepEqual(plan.targetContact, baselineChain()[1]);
  assert.equal(plan.waitMinutes, 0);
});

test('waits when the most recent attempt to the target contact is inside the minimum interval', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [{ chainIndex: 0, attemptedAt: '2026-01-01T11:50:00.000Z', reached: false }],
      now: '2026-01-01T12:00:00.000Z',
      minMinutesBetweenAttemptsToSameContact: 15,
    }),
  );
  assert.equal(plan.action, 'wait');
  assert.equal(plan.targetChainIndex, 0);
  assert.deepEqual(plan.targetContact, baselineChain()[0]);
  assert.equal(plan.waitMinutes, 5);
});

test('is ready to contact now exactly at the minimum between-attempt boundary', () => {
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

test('signals full chain exhaustion as a hard alert when every contact is exhausted with none reached', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [
        { chainIndex: 0, attemptedAt: '2026-01-01T09:00:00.000Z', reached: false },
        { chainIndex: 0, attemptedAt: '2026-01-01T09:20:00.000Z', reached: false },
        { chainIndex: 1, attemptedAt: '2026-01-01T09:40:00.000Z', reached: false },
        { chainIndex: 1, attemptedAt: '2026-01-01T10:00:00.000Z', reached: false },
        { chainIndex: 2, attemptedAt: '2026-01-01T10:20:00.000Z', reached: false },
        { chainIndex: 2, attemptedAt: '2026-01-01T10:40:00.000Z', reached: false },
        { chainIndex: 3, attemptedAt: '2026-01-01T11:00:00.000Z', reached: false },
        { chainIndex: 3, attemptedAt: '2026-01-01T11:20:00.000Z', reached: false },
      ],
    }),
  );
  assert.equal(plan.action, 'escalation_chain_exhausted');
  assert.equal(plan.targetChainIndex, null);
  assert.equal(plan.targetContact, null);
  assert.equal(plan.waitMinutes, 0);
});

test('short-circuits with the already-acknowledged sentinel once any attempt was reached', () => {
  const plan = planNextEscalationContact(
    baselineInput({
      attemptsSoFar: [
        { chainIndex: 0, attemptedAt: '2026-01-01T09:00:00.000Z', reached: false },
        { chainIndex: 1, attemptedAt: '2026-01-01T09:30:00.000Z', reached: true },
      ],
    }),
  );
  assert.equal(plan.action, 'contact_now');
  assert.equal(plan.targetChainIndex, null);
  assert.equal(plan.targetContact, null);
  assert.equal(plan.waitMinutes, 0);
  assert.equal(plan.reason, 'already acknowledged, no further escalation needed');
});
