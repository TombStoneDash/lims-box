import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InstrumentFlagMappingInputError,
  explainFlagMappingReason,
  mapInstrumentFlags,
  type FlagMappingReasonCode,
  type InstrumentFlagMappingTable,
} from '../../lib/ohworks-instrument-flags';

/**
 * All fabricated: synthetic instrument model names, flag codes, and
 * canonical flag definitions. None of this represents a real instrument,
 * sample, or customer.
 */
const TABLE: InstrumentFlagMappingTable = {
  'analyzer-synthetic-x1': {
    'E-01': { canonicalFlag: 'hemolysis', severity: 'low', action: 'review' },
    'E-02': { canonicalFlag: 'lipemia', severity: 'medium', action: 'review' },
    'E-09': { canonicalFlag: 'clot-detected', severity: 'critical', action: 'suppress' },
    'E-10': { canonicalFlag: 'out-of-range-high', severity: 'high', action: 'report' },
    'E-11': { canonicalFlag: 'sample-short', severity: 'high', action: 'suppress' },
    'E-12': { canonicalFlag: 'sample-short-review', severity: 'high', action: 'review' },
  },
  'analyzer-synthetic-y2': {
    'F-01': { canonicalFlag: 'hemolysis', severity: 'low', action: 'review' },
  },
};

const ALL_REASON_CODES: FlagMappingReasonCode[] = [
  'unknown-instrument-model',
  'unmapped-flag-code',
  'no-raw-flags',
  'flags-mapped',
];

const FORBIDDEN_WORDS = [/compliant/i, /accredited/i, /released?\b.*\bresult/i];

// ---------------------------------------------------------------------------
// Golden paths
// ---------------------------------------------------------------------------

test('a single mapped flag translates to its canonical flag and action', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01']);
  assert.equal(result.decision, 'mapped');
  assert.equal(result.reasonCode, 'flags-mapped');
  assert.equal(result.canonicalFlags.length, 1);
  assert.equal(result.canonicalFlags[0]?.canonicalFlag, 'hemolysis');
  assert.equal(result.canonicalFlags[0]?.rawFlagCode, 'E-01');
  assert.equal(result.resolvedSeverity, 'low');
  assert.equal(result.requiredAction, 'review');
});

test('an empty raw flag list maps cleanly with no canonical flags and no required action', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', []);
  assert.equal(result.decision, 'mapped');
  assert.equal(result.reasonCode, 'no-raw-flags');
  assert.deepEqual(result.canonicalFlags, []);
  assert.equal(result.resolvedSeverity, null);
  assert.equal(result.requiredAction, 'none');
});

test('multiple mapped flags produce one entry per distinct canonical flag in first-seen order', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 'E-02']);
  assert.equal(result.canonicalFlags.length, 2);
  assert.equal(result.canonicalFlags[0]?.canonicalFlag, 'hemolysis');
  assert.equal(result.canonicalFlags[1]?.canonicalFlag, 'lipemia');
});

test('the same instrument-specific flag code maps consistently across two independent calls', () => {
  const first = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01']);
  const second = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01']);
  assert.deepEqual(first, second);
});

test('the same raw flag code can map to a different canonical flag under a different instrument model', () => {
  const x1 = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01']);
  const y2 = mapInstrumentFlags(TABLE, 'analyzer-synthetic-y2', ['F-01']);
  assert.equal(x1.canonicalFlags[0]?.canonicalFlag, 'hemolysis');
  assert.equal(y2.canonicalFlags[0]?.canonicalFlag, 'hemolysis');
});

// ---------------------------------------------------------------------------
// Conflict resolution: highest severity wins
// ---------------------------------------------------------------------------

test('conflicting flags resolve to the highest declared severity and its action', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 'E-09']);
  assert.equal(result.resolvedSeverity, 'critical');
  assert.equal(result.requiredAction, 'suppress');
});

test('severity resolution is independent of raw flag order', () => {
  const forward = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 'E-09']);
  const reverse = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-09', 'E-01']);
  assert.equal(forward.resolvedSeverity, reverse.resolvedSeverity);
  assert.equal(forward.requiredAction, reverse.requiredAction);
});

test('a lower-severity flag never overrides an already-resolved higher severity', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-09', 'E-02']);
  assert.equal(result.resolvedSeverity, 'critical');
  assert.equal(result.requiredAction, 'suppress');
});

test('a tie in resolved severity breaks toward the more visible action: report over review', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-11', 'E-10']);
  assert.equal(result.resolvedSeverity, 'high');
  assert.equal(result.requiredAction, 'report');
});

test('a tie in resolved severity breaks toward review over suppress when report is not present', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-11', 'E-12']);
  assert.equal(result.resolvedSeverity, 'high');
  assert.equal(result.requiredAction, 'review');
});

test('duplicate raw flag codes collapse to a single canonical flag entry', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 'E-01']);
  assert.equal(result.canonicalFlags.length, 1);
});

// ---------------------------------------------------------------------------
// Fail closed: unknown instrument model
// ---------------------------------------------------------------------------

test('an instrument model absent from the table is blocked as unknown', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-does-not-exist', ['E-01']);
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-instrument-model');
  assert.equal(result.requiredAction, 'none');
});

test('an empty table blocks every lookup as unknown', () => {
  const result = mapInstrumentFlags({}, 'analyzer-synthetic-x1', ['E-01']);
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unknown-instrument-model');
});

// ---------------------------------------------------------------------------
// Fail closed: unmapped flag code
// ---------------------------------------------------------------------------

test('a raw flag code not declared for the instrument model is blocked', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-99']);
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unmapped-flag-code');
  assert.equal(result.unmappedFlagCode, 'E-99');
  assert.equal(result.requiredAction, 'none');
});

test('a raw flag code declared for a different instrument model is still blocked as unmapped', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-y2', ['E-01']);
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unmapped-flag-code');
  assert.equal(result.unmappedFlagCode, 'E-01');
});

test('one unmapped flag blocks the whole translation even when earlier flags were mappable', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 'E-99']);
  assert.equal(result.decision, 'blocked');
  assert.equal(result.reasonCode, 'unmapped-flag-code');
  assert.equal(result.unmappedFlagCode, 'E-99');
  assert.deepEqual(result.canonicalFlags, []);
});

// ---------------------------------------------------------------------------
// Structurally malformed input throws, rather than guessing
// ---------------------------------------------------------------------------

test('a null table throws a sanitized typed error', () => {
  assert.throws(
    () => mapInstrumentFlags(null as unknown as InstrumentFlagMappingTable, 'analyzer-synthetic-x1', ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'table-malformed');
      return true;
    },
  );
});

test('an array table throws a sanitized typed error', () => {
  assert.throws(
    () => mapInstrumentFlags([] as unknown as InstrumentFlagMappingTable, 'analyzer-synthetic-x1', ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'table-malformed');
      return true;
    },
  );
});

test('an empty-string instrument model throws a sanitized typed error', () => {
  assert.throws(
    () => mapInstrumentFlags(TABLE, '', ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'instrument-model-malformed');
      return true;
    },
  );
});

test('a non-string instrument model throws a sanitized typed error', () => {
  assert.throws(
    () => mapInstrumentFlags(TABLE, 12345 as unknown as string, ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'instrument-model-malformed');
      return true;
    },
  );
});

test('a non-array raw flag list throws a sanitized typed error', () => {
  assert.throws(
    () => mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', 'E-01' as unknown as string[]),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'raw-flags-malformed');
      return true;
    },
  );
});

test('a raw flag list containing an empty string throws a sanitized typed error', () => {
  assert.throws(
    () => mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', '']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'raw-flags-malformed');
      return true;
    },
  );
});

test('a raw flag list containing a non-string element throws a sanitized typed error', () => {
  assert.throws(
    () => mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 7 as unknown as string]),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'raw-flags-malformed');
      return true;
    },
  );
});

test('a non-object model mapping entry throws a sanitized typed error', () => {
  const malformedTable = { 'analyzer-synthetic-x1': 'not-an-object' } as unknown as InstrumentFlagMappingTable;
  assert.throws(
    () => mapInstrumentFlags(malformedTable, 'analyzer-synthetic-x1', ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'model-mapping-malformed');
      return true;
    },
  );
});

test('an array model mapping entry throws a sanitized typed error', () => {
  const malformedTable = { 'analyzer-synthetic-x1': [] } as unknown as InstrumentFlagMappingTable;
  assert.throws(
    () => mapInstrumentFlags(malformedTable, 'analyzer-synthetic-x1', ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'model-mapping-malformed');
      return true;
    },
  );
});

test('a flag definition missing a required field throws a sanitized typed error', () => {
  const malformedTable = {
    'analyzer-synthetic-x1': { 'E-01': { canonicalFlag: 'hemolysis', severity: 'low' } },
  } as unknown as InstrumentFlagMappingTable;
  assert.throws(
    () => mapInstrumentFlags(malformedTable, 'analyzer-synthetic-x1', ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'flag-definition-malformed');
      return true;
    },
  );
});

test('a flag definition with an unrecognized severity throws a sanitized typed error', () => {
  const malformedTable = {
    'analyzer-synthetic-x1': { 'E-01': { canonicalFlag: 'hemolysis', severity: 'super-bad', action: 'review' } },
  } as unknown as InstrumentFlagMappingTable;
  assert.throws(
    () => mapInstrumentFlags(malformedTable, 'analyzer-synthetic-x1', ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'flag-definition-malformed');
      return true;
    },
  );
});

test('a flag definition with an unrecognized action throws a sanitized typed error', () => {
  const malformedTable = {
    'analyzer-synthetic-x1': { 'E-01': { canonicalFlag: 'hemolysis', severity: 'low', action: 'ignore' } },
  } as unknown as InstrumentFlagMappingTable;
  assert.throws(
    () => mapInstrumentFlags(malformedTable, 'analyzer-synthetic-x1', ['E-01']),
    (error: unknown) => {
      assert.ok(error instanceof InstrumentFlagMappingInputError);
      assert.equal((error as InstrumentFlagMappingInputError).code, 'flag-definition-malformed');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', () => {
  try {
    mapInstrumentFlags(null as unknown as InstrumentFlagMappingTable, 'analyzer-secret-token-abc123', ['E-01']);
    assert.fail('expected mapInstrumentFlags to throw');
  } catch (error) {
    assert.ok(error instanceof InstrumentFlagMappingInputError);
    assert.doesNotMatch((error as Error).message, /analyzer-secret-token-abc123/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
  }
});

// ---------------------------------------------------------------------------
// Determinism, purity, and immutability
// ---------------------------------------------------------------------------

test('the result is deterministic across repeated calls with equivalent input', () => {
  const first = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 'E-09']);
  const second = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 'E-09']);
  assert.deepEqual(first, second);
});

test('the result object is frozen', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01']);
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'requiredAction', 'suppress');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.requiredAction, 'review');
});

test('the canonicalFlags array is frozen', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01']);
  assert.ok(Object.isFrozen(result.canonicalFlags));
});

test('mapInstrumentFlags does not mutate its table input', () => {
  const before = JSON.stringify(TABLE);
  mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01', 'E-09']);
  assert.equal(JSON.stringify(TABLE), before);
});

test('mapInstrumentFlags does not mutate its raw flag codes input', () => {
  const rawFlags = ['E-01', 'E-09'];
  const before = JSON.stringify(rawFlags);
  mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', rawFlags);
  assert.equal(JSON.stringify(rawFlags), before);
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

test('every reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainFlagMappingReason(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /analyzer-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainFlagMappingReason('unmapped-flag-code'), explainFlagMappingReason('unmapped-flag-code'));
});

test('the reason field on a result matches explainFlagMappingReason for its reasonCode', () => {
  const result = mapInstrumentFlags(TABLE, 'analyzer-synthetic-x1', ['E-01']);
  assert.equal(result.reason, explainFlagMappingReason(result.reasonCode));
});
