import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCriticalValueNotificationLog,
  type CriticalValueLogInput,
  type NotificationAttempt,
} from '../../lib/ohworks-critical-value-log';

/**
 * All fabricated: synthetic subject/analyte/contact identifiers and made-up
 * numeric values. None of this represents a real patient, clinician, or
 * result.
 */
function baselineResult() {
  return {
    subjectId: 'subject-synthetic-a',
    analyteCode: 'ANALYTE-SYNTH-K',
    value: 7.5,
    unit: 'mmol/L',
    criticalRange: { low: null, high: 6.5 },
    identifiedAt: '2026-01-02T12:00:00.000Z',
  };
}

function baselineAttempts(): NotificationAttempt[] {
  return [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-01-02T12:05:00.000Z',
      readBackConfirmed: true,
    },
  ];
}

function baselinePolicy() {
  return {
    escalationTimeoutMinutes: 15,
    complianceWindowMinutes: 30,
  };
}

function baselineInput(): CriticalValueLogInput {
  return {
    result: baselineResult(),
    attempts: baselineAttempts(),
    policy: baselinePolicy(),
  };
}

test('an impossible result identifiedAt calendar date fails closed to CHAIN_GAP instead of rolling over', () => {
  const input = baselineInput();
  input.result.identifiedAt = '2026-04-31T10:00:00Z';
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-05-01T10:10:00Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'result-identified-timestamp-invalid');
  assert.equal(entry.minutesToConfirmation, null);
  assert.equal(entry.windowSatisfied, false);
});

test('an impossible attempt calledAt calendar date fails closed to CHAIN_GAP instead of rolling over', () => {
  const input = baselineInput();
  input.result.identifiedAt = '2026-02-20T10:00:00Z';
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-02-30T10:10:00Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'attempt-timestamp-invalid');
  assert.equal(entry.minutesToConfirmation, null);
  assert.equal(entry.windowSatisfied, false);
});

test('a leap-day calendar date (2028-02-29) is accepted and the chain remains CONFIRMED', () => {
  const input = baselineInput();
  input.result.identifiedAt = '2028-02-29T10:00:00Z';
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2028-02-29T10:10:00Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CONFIRMED');
  assert.equal(entry.reasonCode, 'confirmed-within-window');
  assert.equal(entry.minutesToConfirmation, 10);
  assert.equal(entry.windowSatisfied, true);
});
