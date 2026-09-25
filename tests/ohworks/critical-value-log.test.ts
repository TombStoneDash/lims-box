import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CriticalValueLogInputError,
  buildCriticalValueNotificationLog,
  canonicalCriticalValueLogJson,
  explainCriticalValueLogReason,
  hashCriticalValueLogEntry,
  type CriticalValueLogInput,
  type CriticalValueLogInputErrorCode,
  type NotificationAttempt,
  type NotificationLogReasonCode,
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
    value: 7.2,
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: NotificationLogReasonCode[] = [
  'result-identified-timestamp-invalid',
  'sequence-invalid',
  'attempt-timestamp-invalid',
  'attempt-before-identified',
  'attempt-not-after-previous',
  'first-attempt-not-primary',
  'repeated-primary-attempt',
  'escalation-without-preceding-failure',
  'escalation-timeout-exceeded',
  'read-back-not-confirmed',
  'confirmed-within-window',
  'confirmed-outside-window',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant\b/i, /accredited/i, /releasable/i];

test('every reason code has an explanation with no forbidden compliance language', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainCriticalValueLogReason(code);
    assert.ok(message.length > 0, `missing explanation for ${code}`);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.ok(!pattern.test(message), `explanation for ${code} contains forbidden word: ${message}`);
    }
  }
});

test('a confirmed primary read-back within the compliance window is CONFIRMED and satisfies the window', () => {
  const entry = buildCriticalValueNotificationLog(baselineInput());
  assert.equal(entry.status, 'CONFIRMED');
  assert.equal(entry.reasonCode, 'confirmed-within-window');
  assert.equal(entry.minutesToConfirmation, 5);
  assert.equal(entry.windowSatisfied, true);
  assert.equal(entry.attemptCount, 1);
  assert.equal(entry.finalContactRole, 'PRIMARY');
  assert.equal(entry.value, 7.2);
  assert.equal(entry.rangeLow, null);
  assert.equal(entry.rangeHigh, 6.5);
});

test('the returned entry is frozen (immutable)', () => {
  const entry = buildCriticalValueNotificationLog(baselineInput());
  assert.ok(Object.isFrozen(entry));
  entry.status = 'UNCONFIRMED';
  assert.equal(entry.status, 'CONFIRMED', 'a frozen entry must silently reject mutation, not apply it');
});

test('evaluation is pure: it does not mutate input records', () => {
  const input = baselineInput();
  const before = JSON.stringify(input);
  buildCriticalValueNotificationLog(input);
  assert.equal(JSON.stringify(input), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const input = baselineInput();
  const first = buildCriticalValueNotificationLog(input);
  const second = buildCriticalValueNotificationLog(clone(input));
  assert.deepEqual(first, second);
});

test('a status other than the three defined values is never produced', () => {
  const entry = buildCriticalValueNotificationLog(baselineInput());
  assert.ok(['CONFIRMED', 'UNCONFIRMED', 'CHAIN_GAP'].includes(entry.status));
});

test('the entry hash matches a recomputation over its own fields', () => {
  const entry = buildCriticalValueNotificationLog(baselineInput());
  const { entryHash, ...fields } = entry;
  assert.equal(hashCriticalValueLogEntry(fields), entryHash);
});

test('tampering with a returned entry field is detectable via hash mismatch', () => {
  const entry = buildCriticalValueNotificationLog(baselineInput());
  const tampered = { ...entry, windowSatisfied: !entry.windowSatisfied };
  const { entryHash, ...fields } = tampered;
  assert.notEqual(hashCriticalValueLogEntry(fields), entryHash);
});

test('canonicalCriticalValueLogJson is stable field-order JSON independent of key insertion order', () => {
  const entry = buildCriticalValueNotificationLog(baselineInput());
  const { entryHash, ...fields } = entry;
  const reordered = {
    windowSatisfied: fields.windowSatisfied,
    subjectId: fields.subjectId,
    ...fields,
  };
  assert.equal(canonicalCriticalValueLogJson(fields), canonicalCriticalValueLogJson(reordered));
});

test('a confirmed read-back outside the compliance window is CONFIRMED but does not satisfy the window', () => {
  const input = baselineInput();
  input.policy.complianceWindowMinutes = 3;
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CONFIRMED');
  assert.equal(entry.reasonCode, 'confirmed-outside-window');
  assert.equal(entry.minutesToConfirmation, 5);
  assert.equal(entry.windowSatisfied, false);
});

test('minutesToConfirmation exactly at the compliance window boundary satisfies the window', () => {
  const input = baselineInput();
  input.policy.complianceWindowMinutes = 5;
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.windowSatisfied, true);
});

test('an unconfirmed sole attempt fails closed to UNCONFIRMED and withholds the window', () => {
  const input = baselineInput();
  input.attempts[0]!.readBackConfirmed = false;
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'UNCONFIRMED');
  assert.equal(entry.reasonCode, 'read-back-not-confirmed');
  assert.equal(entry.minutesToConfirmation, null);
  assert.equal(entry.windowSatisfied, false);
});

test('a failed primary followed by a confirmed escalation within timeout is CONFIRMED', () => {
  const input = baselineInput();
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-01-02T12:05:00.000Z',
      readBackConfirmed: false,
    },
    {
      sequence: 2,
      contactRole: 'ESCALATION',
      contactId: 'contact-synthetic-escalation',
      calledAt: '2026-01-02T12:15:00.000Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CONFIRMED');
  assert.equal(entry.reasonCode, 'confirmed-within-window');
  assert.equal(entry.minutesToConfirmation, 15);
  assert.equal(entry.attemptCount, 2);
  assert.equal(entry.finalContactRole, 'ESCALATION');
});

test('an escalation attempt outside the declared timeout fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.policy.escalationTimeoutMinutes = 5;
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-01-02T12:05:00.000Z',
      readBackConfirmed: false,
    },
    {
      sequence: 2,
      contactRole: 'ESCALATION',
      contactId: 'contact-synthetic-escalation',
      calledAt: '2026-01-02T12:15:00.000Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'escalation-timeout-exceeded');
  assert.equal(entry.minutesToConfirmation, null);
  assert.equal(entry.windowSatisfied, false);
});

test('an escalation attempt with no preceding failure fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-01-02T12:05:00.000Z',
      readBackConfirmed: true,
    },
    {
      sequence: 2,
      contactRole: 'ESCALATION',
      contactId: 'contact-synthetic-escalation',
      calledAt: '2026-01-02T12:10:00.000Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'escalation-without-preceding-failure');
});

test('a repeated primary attempt fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-01-02T12:05:00.000Z',
      readBackConfirmed: false,
    },
    {
      sequence: 2,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-01-02T12:10:00.000Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'repeated-primary-attempt');
});

test('a first attempt that is ESCALATION rather than PRIMARY fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'ESCALATION',
      contactId: 'contact-synthetic-escalation',
      calledAt: '2026-01-02T12:05:00.000Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'first-attempt-not-primary');
});

test('a sequence number mismatched with array position fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.attempts[0]!.sequence = 2;
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'sequence-invalid');
});

test('an attempt called before the result was identified fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.attempts[0]!.calledAt = '2026-01-02T11:00:00.000Z';
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'attempt-before-identified');
});

test('an attempt not strictly after the previous attempt fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.attempts = [
    {
      sequence: 1,
      contactRole: 'PRIMARY',
      contactId: 'contact-synthetic-primary',
      calledAt: '2026-01-02T12:05:00.000Z',
      readBackConfirmed: false,
    },
    {
      sequence: 2,
      contactRole: 'ESCALATION',
      contactId: 'contact-synthetic-escalation',
      calledAt: '2026-01-02T12:05:00.000Z',
      readBackConfirmed: true,
    },
  ];
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'attempt-not-after-previous');
});

test('an unparsable attempt timestamp fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.attempts[0]!.calledAt = 'not-a-timestamp';
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'attempt-timestamp-invalid');
});

test('an unparsable result identified timestamp fails closed to CHAIN_GAP', () => {
  const input = baselineInput();
  input.result.identifiedAt = 'not-a-timestamp';
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CHAIN_GAP');
  assert.equal(entry.reasonCode, 'result-identified-timestamp-invalid');
});

test('a value breaching only the low bound of a two-sided range is accepted', () => {
  const input = baselineInput();
  input.result.criticalRange = { low: 3, high: 6.5 };
  input.result.value = 2.9;
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CONFIRMED');
  assert.equal(entry.rangeLow, 3);
  assert.equal(entry.rangeHigh, 6.5);
});

test('a value exactly at the range boundary counts as breaching', () => {
  const input = baselineInput();
  input.result.criticalRange = { low: null, high: 6.5 };
  input.result.value = 6.5;
  const entry = buildCriticalValueNotificationLog(input);
  assert.equal(entry.status, 'CONFIRMED');
});

const INPUT_ERROR_CASES: Array<{ name: string; code: CriticalValueLogInputErrorCode; mutate: (input: CriticalValueLogInput) => void }> = [
  {
    name: 'missing subjectId',
    code: 'result-malformed',
    mutate: (input) => {
      input.result.subjectId = '';
    },
  },
  {
    name: 'nonnumeric value',
    code: 'result-value-invalid',
    mutate: (input) => {
      input.result.value = 'high';
    },
  },
  {
    name: 'malformed range bound',
    code: 'result-range-malformed',
    mutate: (input) => {
      // @ts-expect-error intentional malformed input for the error-path test
      input.result.criticalRange = { low: 'nope', high: 6.5 };
    },
  },
  {
    name: 'empty range',
    code: 'result-range-empty',
    mutate: (input) => {
      input.result.criticalRange = { low: null, high: null };
    },
  },
  {
    name: 'inverted range',
    code: 'result-range-inverted',
    mutate: (input) => {
      input.result.criticalRange = { low: 8, high: 6.5 };
    },
  },
  {
    name: 'value not actually critical',
    code: 'result-value-not-critical',
    mutate: (input) => {
      input.result.value = 5;
    },
  },
  {
    name: 'non-positive escalation timeout',
    code: 'escalation-timeout-invalid',
    mutate: (input) => {
      input.policy.escalationTimeoutMinutes = 0;
    },
  },
  {
    name: 'non-positive compliance window',
    code: 'compliance-window-invalid',
    mutate: (input) => {
      input.policy.complianceWindowMinutes = -1;
    },
  },
  {
    name: 'attempts not an array',
    code: 'attempts-not-array',
    mutate: (input) => {
      // @ts-expect-error intentional malformed input for the error-path test
      input.attempts = 'nope';
    },
  },
  {
    name: 'empty attempts',
    code: 'attempts-empty',
    mutate: (input) => {
      input.attempts = [];
    },
  },
  {
    name: 'malformed attempt',
    code: 'attempt-malformed',
    mutate: (input) => {
      input.attempts[0]!.contactId = '';
    },
  },
  {
    name: 'unknown contact role',
    code: 'unknown-contact-role',
    mutate: (input) => {
      // @ts-expect-error intentional malformed input for the error-path test
      input.attempts[0]!.contactRole = 'BACKUP';
    },
  },
];

for (const { name, code, mutate } of INPUT_ERROR_CASES) {
  test(`throws CriticalValueLogInputError(${code}) for ${name}`, () => {
    const input = baselineInput();
    mutate(input);
    assert.throws(
      () => buildCriticalValueNotificationLog(input),
      (error: unknown) => error instanceof CriticalValueLogInputError && error.code === code,
    );
  });
}

test('no thrown error escapes as anything other than CriticalValueLogInputError', () => {
  const input = baselineInput();
  input.attempts = [];
  try {
    buildCriticalValueNotificationLog(input);
    assert.fail('expected a throw');
  } catch (error) {
    assert.ok(error instanceof CriticalValueLogInputError);
  }
});
