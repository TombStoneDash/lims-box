import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORAGE_CONDITIONS,
  StabilityWindowInputError,
  evaluateSpecimenStability,
  explainStabilityCheckReason,
  type StabilityCheckInput,
  type StabilityCheckReasonCode,
  type StabilityWindowDeclaration,
  type StorageConditionEntry,
} from '../../lib/ohworks-stability-window';

/**
 * All fabricated: synthetic specimen/analyte identifiers and made-up
 * timestamps and durations. None of this represents a real patient,
 * specimen, or result.
 */
function baselineWindows(): StabilityWindowDeclaration[] {
  return [
    { condition: 'room-temp', maxDurationMs: 4 * 60 * 60 * 1000 },
    { condition: 'refrigerated', maxDurationMs: 48 * 60 * 60 * 1000 },
    { condition: 'frozen', maxDurationMs: 30 * 24 * 60 * 60 * 1000 },
  ];
}

function baselineHistory(): StorageConditionEntry[] {
  return [
    { condition: 'room-temp', at: '2026-01-01T08:00:00.000Z' },
    { condition: 'refrigerated', at: '2026-01-01T10:00:00.000Z' },
  ];
}

function baselineInput(): StabilityCheckInput {
  return {
    specimenId: 'specimen-synthetic-a',
    analyteCode: 'ANALYTE-SYNTH-A',
    collectedAt: '2026-01-01T08:00:00.000Z',
    history: baselineHistory(),
    resultAt: '2026-01-02T09:00:00.000Z', // 23h refrigerated, within 48h window
    windows: baselineWindows(),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: StabilityCheckReasonCode[] = [
  'within-all-windows',
  'collected-timestamp-invalid',
  'result-timestamp-invalid',
  'result-before-collection',
  'entry-timestamp-invalid',
  'history-empty',
  'history-start-gap',
  'history-not-chronological',
  'result-before-last-segment',
  'undocumented-condition',
  'window-exceeded',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

test('declares exactly the three documented storage conditions', () => {
  assert.deepEqual([...STORAGE_CONDITIONS], ['room-temp', 'refrigerated', 'frozen']);
});

test('a specimen tested within every segment window passes', () => {
  const result = evaluateSpecimenStability(baselineInput());
  assert.equal(result.status, 'within-window');
  assert.equal(result.reasonCode, 'within-all-windows');
  assert.equal(result.segments.length, 2);
});

test('evaluation is pure: it does not mutate input records', () => {
  const input = baselineInput();
  const before = JSON.stringify(input);
  evaluateSpecimenStability(input);
  assert.equal(JSON.stringify(input), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const input = baselineInput();
  const first = evaluateSpecimenStability(input);
  const second = evaluateSpecimenStability(clone(input));
  assert.deepEqual(first, second);
});

test('a status other than the two defined values is never produced', () => {
  const result = evaluateSpecimenStability(baselineInput());
  assert.ok(['within-window', 'expired'].includes(result.status));
});

test('computes elapsed time per segment correctly', () => {
  const result = evaluateSpecimenStability(baselineInput());
  assert.equal(result.segments[0].elapsedMs, 2 * 60 * 60 * 1000); // room-temp 08:00 -> 10:00
  assert.equal(result.segments[1].elapsedMs, 23 * 60 * 60 * 1000); // refrigerated 10:00 -> result 09:00 next day
});

test('a single-segment specimen with no condition change is evaluated against the result timestamp', () => {
  const input = baselineInput();
  input.history = [{ condition: 'frozen', at: '2026-01-01T08:00:00.000Z' }];
  input.resultAt = '2026-01-10T08:00:00.000Z'; // 9 days, within the 30-day frozen window
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'within-window');
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].elapsedMs, 9 * 24 * 60 * 60 * 1000);
});

test('elapsed time exactly at the window boundary is within the window', () => {
  const input = baselineInput();
  input.history = [{ condition: 'room-temp', at: '2026-01-01T08:00:00.000Z' }];
  input.resultAt = '2026-01-01T12:00:00.000Z'; // exactly 4h, the declared room-temp window
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'within-window');
  assert.equal(result.segments[0].withinWindow, true);
});

test('elapsed time one millisecond past the window boundary expires', () => {
  const input = baselineInput();
  input.history = [{ condition: 'room-temp', at: '2026-01-01T08:00:00.000Z' }];
  input.resultAt = '2026-01-01T12:00:00.001Z';
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'window-exceeded');
  assert.equal(result.segments[0].withinWindow, false);
});

test('an earlier segment exceeding its window expires even if later segments are within window', () => {
  const input = baselineInput();
  input.history = [
    { condition: 'room-temp', at: '2026-01-01T08:00:00.000Z' },
    { condition: 'refrigerated', at: '2026-01-01T13:00:00.000Z' }, // 5h room-temp, over the 4h window
  ];
  input.resultAt = '2026-01-01T14:00:00.000Z';
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'window-exceeded');
  assert.equal(result.segments[0].withinWindow, false);
});

test('a condition with no declared window fails closed to expired, not a guessed pass', () => {
  const input = baselineInput();
  input.history = [{ condition: 'frozen', at: '2026-01-01T08:00:00.000Z' }];
  input.windows = [{ condition: 'room-temp', maxDurationMs: 1000 }];
  input.resultAt = '2026-01-01T08:00:01.000Z';
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'undocumented-condition');
  assert.equal(result.segments[0].windowMs, null);
});

test('a gap between collection and the first recorded condition fails closed', () => {
  const input = baselineInput();
  input.collectedAt = '2026-01-01T07:00:00.000Z';
  input.history = [{ condition: 'room-temp', at: '2026-01-01T08:00:00.000Z' }]; // 1h undocumented gap
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'history-start-gap');
  assert.deepEqual(result.segments, []);
});

test('an empty storage condition history fails closed', () => {
  const input = baselineInput();
  input.history = [];
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'history-empty');
});

test('out-of-order history entries fail closed', () => {
  const input = baselineInput();
  input.history = [
    { condition: 'room-temp', at: '2026-01-01T10:00:00.000Z' },
    { condition: 'refrigerated', at: '2026-01-01T08:00:00.000Z' }, // before the first entry
  ];
  input.collectedAt = '2026-01-01T10:00:00.000Z';
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'history-not-chronological');
});

test('duplicate consecutive timestamps in history fail closed as not strictly chronological', () => {
  const input = baselineInput();
  input.history = [
    { condition: 'room-temp', at: '2026-01-01T08:00:00.000Z' },
    { condition: 'refrigerated', at: '2026-01-01T08:00:00.000Z' },
  ];
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'history-not-chronological');
});

test('a result timestamp before the last recorded condition fails closed', () => {
  const input = baselineInput();
  input.resultAt = '2026-01-01T09:00:00.000Z'; // before refrigerated segment started at 10:00
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'result-before-last-segment');
});

test('a result timestamp before collection fails closed', () => {
  const input = baselineInput();
  input.history = [{ condition: 'room-temp', at: '2026-01-01T08:00:00.000Z' }];
  input.resultAt = '2026-01-01T07:00:00.000Z';
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'result-before-collection');
});

test('an unparsable collection timestamp fails closed', () => {
  const input = baselineInput();
  input.collectedAt = 'not-a-timestamp';
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'collected-timestamp-invalid');
});

test('an unparsable result timestamp fails closed', () => {
  const input = baselineInput();
  input.resultAt = 'not-a-timestamp';
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'result-timestamp-invalid');
});

test('an unparsable history entry timestamp fails closed', () => {
  const input = baselineInput();
  input.history = [{ condition: 'room-temp', at: 'not-a-timestamp' }];
  const result = evaluateSpecimenStability(input);
  assert.equal(result.status, 'expired');
  assert.equal(result.reasonCode, 'entry-timestamp-invalid');
});

test('missing specimen identity fields throw a sanitized typed error', () => {
  const input = baselineInput();
  delete (input as Partial<StabilityCheckInput>).specimenId;
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'specimen-malformed');
      return true;
    },
  );
});

test('missing analyte code throws a sanitized typed error', () => {
  const input = baselineInput();
  delete (input as Partial<StabilityCheckInput>).analyteCode;
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'specimen-malformed');
      return true;
    },
  );
});

test('a non-array history throws a sanitized typed error', () => {
  const input = baselineInput();
  (input as unknown as { history: unknown }).history = 'not-an-array';
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'history-not-array');
      return true;
    },
  );
});

test('a history entry with an undeclared condition token throws a sanitized typed error', () => {
  const input = baselineInput();
  input.history = [{ condition: 'on-the-bench' as never, at: '2026-01-01T08:00:00.000Z' }];
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'history-entry-invalid');
      return true;
    },
  );
});

test('a history entry missing its timestamp throws a sanitized typed error', () => {
  const input = baselineInput();
  input.history = [{ condition: 'room-temp' } as unknown as StorageConditionEntry];
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'history-entry-invalid');
      return true;
    },
  );
});

test('a non-array windows list throws a sanitized typed error', () => {
  const input = baselineInput();
  (input as unknown as { windows: unknown }).windows = 'not-an-array';
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'windows-not-array');
      return true;
    },
  );
});

test('an empty windows list throws a sanitized typed error', () => {
  const input = baselineInput();
  input.windows = [];
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'windows-empty');
      return true;
    },
  );
});

test('a window with a negative duration throws a sanitized typed error', () => {
  const input = baselineInput();
  input.windows = [{ condition: 'room-temp', maxDurationMs: -1 }];
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'windows-invalid');
      return true;
    },
  );
});

test('a window with an undeclared condition token throws a sanitized typed error', () => {
  const input = baselineInput();
  input.windows = [{ condition: 'on-the-bench' as never, maxDurationMs: 1000 }];
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'windows-invalid');
      return true;
    },
  );
});

test('duplicate windows for the same condition throw a sanitized typed error', () => {
  const input = baselineInput();
  input.windows = [
    { condition: 'room-temp', maxDurationMs: 1000 },
    { condition: 'room-temp', maxDurationMs: 2000 },
  ];
  assert.throws(
    () => evaluateSpecimenStability(input),
    (error: unknown) => {
      assert.ok(error instanceof StabilityWindowInputError);
      assert.equal((error as StabilityWindowInputError).code, 'windows-duplicate-condition');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  const input = baselineInput();
  input.windows = [];
  try {
    evaluateSpecimenStability(input);
    assert.fail('expected evaluateSpecimenStability to throw');
  } catch (error) {
    assert.ok(error instanceof StabilityWindowInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /specimen-synthetic|ANALYTE-SYNTH/);
  }
});

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainStabilityCheckReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /specimen-synthetic|ANALYTE-SYNTH/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainStabilityCheckReason('window-exceeded'), explainStabilityCheckReason('window-exceeded'));
});

test('no status ever uses approval, compliance, accreditation, or release language', () => {
  const statuses: string[] = ['within-window', 'expired'];
  for (const status of statuses) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(status, pattern);
    }
  }
});

test('the returned outcome and its segments are frozen', () => {
  const result = evaluateSpecimenStability(baselineInput());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.segments));
});
