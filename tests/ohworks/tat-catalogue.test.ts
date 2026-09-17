import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TatInputError,
  explainTatReason,
  resolveTatTarget,
  type TatCatalogue,
  type TatOrderRequest,
  type TatReasonCode,
  type TatTargetRow,
} from '../../lib/ohworks-tat-catalogue';

/**
 * All fabricated: synthetic order identifiers, test codes, and made-up
 * numeric targets. None of this represents a real patient, sample, or
 * instrument result.
 */
function baselineRows(): TatTargetRow[] {
  return [
    { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 48 },
    { testCode: 'TEST-SYNTH-A', priority: 'urgent', dayType: 'weekday', targetHours: 12 },
    { testCode: 'TEST-SYNTH-A', priority: 'stat', dayType: 'weekday', targetHours: 2 },
    { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekend', targetHours: 72 },
    { testCode: 'TEST-SYNTH-A', priority: 'stat', dayType: 'weekend', targetHours: 4 },
    { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'holiday', targetHours: 96 },
  ];
}

function baselineCatalogue(overrides: Partial<TatCatalogue> = {}): TatCatalogue {
  return {
    rows: baselineRows(),
    holidayDates: ['2026-01-01'],
    ...overrides,
  };
}

function request(overrides: Partial<TatOrderRequest> = {}): TatOrderRequest {
  return {
    orderId: 'order-synthetic-1',
    testCode: 'TEST-SYNTH-A',
    priority: 'routine',
    // 2026-09-14 is a Monday (weekday).
    receivedAt: '2026-09-14T10:00:00.000Z',
    ...overrides,
  };
}

const ALL_REASON_CODES: TatReasonCode[] = ['matched-declared-row'];

test('a weekday routine order resolves the declared weekday routine row', () => {
  const resolution = resolveTatTarget(baselineCatalogue(), request());
  assert.equal(resolution.dayType, 'weekday');
  assert.equal(resolution.targetHours, 48);
  assert.equal(resolution.dueAt, '2026-09-16T10:00:00.000Z');
  assert.equal(resolution.reasonCode, 'matched-declared-row');
});

test('a weekend order resolves against the declared weekend row instead of weekday', () => {
  // 2026-09-19 is a Saturday.
  const resolution = resolveTatTarget(
    baselineCatalogue(),
    request({ receivedAt: '2026-09-19T08:00:00.000Z' }),
  );
  assert.equal(resolution.dayType, 'weekend');
  assert.equal(resolution.targetHours, 72);
});

test('a sunday order is classified as weekend', () => {
  // 2026-09-20 is a Sunday.
  const resolution = resolveTatTarget(
    baselineCatalogue(),
    request({ receivedAt: '2026-09-20T08:00:00.000Z' }),
  );
  assert.equal(resolution.dayType, 'weekend');
});

test('a declared holiday date resolves as holiday even though it falls on a weekday', () => {
  // 2026-01-01 is a Thursday, but declared as a holiday.
  const resolution = resolveTatTarget(
    baselineCatalogue(),
    request({ receivedAt: '2026-01-01T09:00:00.000Z' }),
  );
  assert.equal(resolution.dayType, 'holiday');
  assert.equal(resolution.targetHours, 96);
});

test('holiday classification takes precedence over a holiday that also falls on a weekend', () => {
  const catalogue = baselineCatalogue({
    // 2026-01-03 is a Saturday.
    holidayDates: ['2026-01-03'],
  });
  const resolution = resolveTatTarget(catalogue, request({ receivedAt: '2026-01-03T09:00:00.000Z' }));
  assert.equal(resolution.dayType, 'holiday');
  assert.equal(resolution.targetHours, 96);
});

test('the due timestamp is the received timestamp plus the target hours', () => {
  const resolution = resolveTatTarget(
    baselineCatalogue(),
    request({ priority: 'stat', receivedAt: '2026-09-14T23:00:00.000Z' }),
  );
  assert.equal(resolution.dueAt, '2026-09-15T01:00:00.000Z');
});

test('resolution is deterministic across repeated calls', () => {
  const catalogue = baselineCatalogue();
  const req = request();
  const first = resolveTatTarget(catalogue, req);
  const second = resolveTatTarget(JSON.parse(JSON.stringify(catalogue)), JSON.parse(JSON.stringify(req)));
  assert.deepEqual(first, second);
});

test('resolution does not mutate the input catalogue or request', () => {
  const catalogue = baselineCatalogue();
  const req = request();
  const catalogueBefore = JSON.stringify(catalogue);
  const requestBefore = JSON.stringify(req);
  resolveTatTarget(catalogue, req);
  assert.equal(JSON.stringify(catalogue), catalogueBefore);
  assert.equal(JSON.stringify(req), requestBefore);
});

test('the resolution is returned frozen', () => {
  const resolution = resolveTatTarget(baselineCatalogue(), request());
  assert.ok(Object.isFrozen(resolution));
});

test('an unknown test code with no declared rows fails closed', () => {
  assert.throws(
    () => resolveTatTarget(baselineCatalogue(), request({ testCode: 'TEST-SYNTH-UNDECLARED' })),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'unknown-test-code');
      return true;
    },
  );
});

test('a resolved day type with no declared rows for any test code fails closed', () => {
  const catalogue: TatCatalogue = {
    rows: [{ testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 48 }],
    holidayDates: [],
  };
  // 2026-09-19 is a Saturday; no weekend rows are declared for any test code.
  assert.throws(
    () => resolveTatTarget(catalogue, request({ receivedAt: '2026-09-19T08:00:00.000Z' })),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'undeclared-day-type');
      return true;
    },
  );
});

test('a missing priority row for a declared test code and day type fails closed', () => {
  const catalogue: TatCatalogue = {
    rows: [
      { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 48 },
      { testCode: 'TEST-SYNTH-B', priority: 'stat', dayType: 'weekday', targetHours: 2 },
    ],
    holidayDates: [],
  };
  assert.throws(
    () => resolveTatTarget(catalogue, request({ priority: 'stat' })),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'missing-priority-row');
      return true;
    },
  );
});

test('a missing priority row for a declared holiday day type fails closed rather than falling back to weekday', () => {
  const catalogue: TatCatalogue = {
    rows: [
      { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 48 },
      { testCode: 'TEST-SYNTH-A', priority: 'stat', dayType: 'holiday', targetHours: 6 },
    ],
    holidayDates: ['2026-01-01'],
  };
  assert.throws(
    () => resolveTatTarget(catalogue, request({ priority: 'routine', receivedAt: '2026-01-01T09:00:00.000Z' })),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'missing-priority-row');
      return true;
    },
  );
});

test('an invalid received-at timestamp fails closed', () => {
  assert.throws(
    () => resolveTatTarget(baselineCatalogue(), request({ receivedAt: 'not-a-timestamp' })),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'invalid-received-at');
      return true;
    },
  );
});

test('a request with an invalid priority fails closed as a missing identity', () => {
  assert.throws(
    () => resolveTatTarget(baselineCatalogue(), request({ priority: 'urgent-ish' as unknown as TatOrderRequest['priority'] })),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'request-missing-identity');
      return true;
    },
  );
});

test('a request missing an order id fails closed', () => {
  assert.throws(
    () => resolveTatTarget(baselineCatalogue(), { ...request(), orderId: '' }),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'request-missing-identity');
      return true;
    },
  );
});

test('a non-object request fails closed', () => {
  assert.throws(
    () => resolveTatTarget(baselineCatalogue(), null as unknown as TatOrderRequest),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'request-not-object');
      return true;
    },
  );
});

test('a non-object catalogue fails closed', () => {
  assert.throws(
    () => resolveTatTarget(null as unknown as TatCatalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'catalogue-not-object');
      return true;
    },
  );
});

test('a non-array rows input fails closed', () => {
  const catalogue = { rows: 'not-an-array', holidayDates: [] } as unknown as TatCatalogue;
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'rows-not-array');
      return true;
    },
  );
});

test('an empty rows array fails closed', () => {
  const catalogue: TatCatalogue = { rows: [], holidayDates: [] };
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'rows-empty');
      return true;
    },
  );
});

test('a row with a non-positive targetHours fails closed', () => {
  const catalogue: TatCatalogue = {
    rows: [{ testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 0 }],
    holidayDates: [],
  };
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'rows-invalid');
      return true;
    },
  );
});

test('a row with a non-integer targetHours fails closed', () => {
  const catalogue: TatCatalogue = {
    rows: [{ testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 12.5 }],
    holidayDates: [],
  };
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'rows-invalid');
      return true;
    },
  );
});

test('a row with an undeclared priority value fails closed', () => {
  const catalogue = {
    rows: [{ testCode: 'TEST-SYNTH-A', priority: 'super-stat', dayType: 'weekday', targetHours: 12 }],
    holidayDates: [],
  } as unknown as TatCatalogue;
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'rows-invalid');
      return true;
    },
  );
});

test('a row with an undeclared day type value fails closed', () => {
  const catalogue = {
    rows: [{ testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'leap-day', targetHours: 12 }],
    holidayDates: [],
  } as unknown as TatCatalogue;
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'rows-invalid');
      return true;
    },
  );
});

test('duplicate rows for the same test code, priority, and day type fail closed', () => {
  const catalogue: TatCatalogue = {
    rows: [
      { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 48 },
      { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 24 },
    ],
    holidayDates: [],
  };
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'rows-duplicate');
      return true;
    },
  );
});

test('the same test code may declare the same priority for two different day types', () => {
  const catalogue: TatCatalogue = {
    rows: [
      { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekday', targetHours: 48 },
      { testCode: 'TEST-SYNTH-A', priority: 'routine', dayType: 'weekend', targetHours: 72 },
    ],
    holidayDates: [],
  };
  const resolution = resolveTatTarget(catalogue, request());
  assert.equal(resolution.targetHours, 48);
});

test('a non-array holidayDates input fails closed', () => {
  const catalogue = { rows: baselineRows(), holidayDates: 'not-an-array' } as unknown as TatCatalogue;
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'holiday-dates-not-array');
      return true;
    },
  );
});

test('a malformed holiday date string fails closed', () => {
  const catalogue = baselineCatalogue({ holidayDates: ['01/01/2026'] });
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'holiday-date-invalid');
      return true;
    },
  );
});

test('a calendar-invalid holiday date fails closed', () => {
  const catalogue = baselineCatalogue({ holidayDates: ['2026-02-30'] });
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'holiday-date-invalid');
      return true;
    },
  );
});

test('a duplicate holiday date fails closed', () => {
  const catalogue = baselineCatalogue({ holidayDates: ['2026-01-01', '2026-01-01'] });
  assert.throws(
    () => resolveTatTarget(catalogue, request()),
    (error: unknown) => {
      assert.ok(error instanceof TatInputError);
      assert.equal((error as TatInputError).code, 'holiday-date-duplicate');
      return true;
    },
  );
});

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainTatReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /order-synthetic|TEST-SYNTH/);
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainTatReason('matched-declared-row'), explainTatReason('matched-declared-row'));
});
