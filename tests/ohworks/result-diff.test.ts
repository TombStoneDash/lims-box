import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ResultDiffError,
  diffResultVersions,
  explainResultDiffErrorCode,
  explainSignificanceReason,
  type ResultDiffErrorCode,
  type ResultDiffSignificanceReason,
  type ResultRow,
  type SignificanceThreshold,
} from '../../lib/ohworks-result-diff';

/**
 * All fabricated: synthetic analyte codes and made-up numeric/qualitative
 * values. None of this represents a real patient, sample, or result.
 */

function baselineOld(): ResultRow[] {
  return [
    { analyteCode: 'ANALYTE-SYNTH-A', value: 100, unit: 'mg/L', flags: ['normal'] },
    { analyteCode: 'ANALYTE-SYNTH-B', value: 'negative', flags: [] },
    { analyteCode: 'ANALYTE-SYNTH-C', value: 5, unit: 'mmol/L' },
  ];
}

function baselineNew(): ResultRow[] {
  return [
    { analyteCode: 'ANALYTE-SYNTH-A', value: 100, unit: 'mg/L', flags: ['normal'] },
    { analyteCode: 'ANALYTE-SYNTH-B', value: 'negative', flags: [] },
    { analyteCode: 'ANALYTE-SYNTH-C', value: 5, unit: 'mmol/L' },
  ];
}

function baselineThresholds(): SignificanceThreshold[] {
  return [
    { analyteCode: 'ANALYTE-SYNTH-A', absolute: 5, percent: null },
    { analyteCode: 'ANALYTE-SYNTH-C', absolute: null, percent: 10 },
  ];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function expectError(fn: () => unknown, code: ResultDiffErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof ResultDiffError);
      assert.equal((error as ResultDiffError).code, code);
      return true;
    },
  );
}

const ALL_ERROR_CODES: ResultDiffErrorCode[] = [
  'old-version-not-array',
  'new-version-not-array',
  'old-version-row-malformed',
  'new-version-row-malformed',
  'old-version-duplicate-analyte',
  'new-version-duplicate-analyte',
  'unit-mismatch',
  'thresholds-not-array',
  'thresholds-invalid',
  'thresholds-duplicate-analyte',
];

const ALL_SIGNIFICANCE_REASONS: ResultDiffSignificanceReason[] = [
  'flag-changed',
  'nonnumeric-value-changed',
  'no-threshold-declared',
  'exceeds-threshold',
  'within-threshold',
];

// --- identical versions: no diff at all ---

test('two identical versions produce no added, removed, or changed entries', () => {
  const diff = diffResultVersions(baselineOld(), baselineNew(), baselineThresholds());
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
  assert.equal(diff.hasSignificantChange, false);
  assert.deepEqual(diff.changeLines, []);
});

test('a numeric-looking string and a number that parse to the same value are not a change', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, unit: 'mg/L' }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: '5', unit: 'mg/L' }];
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.deepEqual(diff.changed, []);
});

test('flags differing only in order and duplicates are not a change', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, flags: ['high', 'critical', 'high'] }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, flags: ['critical', 'high'] }];
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.deepEqual(diff.changed, []);
});

// --- added / removed ---

test('an analyte only in the new version is added', () => {
  const oldVersion = baselineOld();
  const newVersion = [...baselineNew(), { analyteCode: 'ANALYTE-SYNTH-D', value: 42, unit: 'ng/mL', flags: ['high'] }];
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.equal(diff.added.length, 1);
  assert.deepEqual(diff.added[0], {
    analyteCode: 'ANALYTE-SYNTH-D',
    value: 42,
    unit: 'ng/mL',
    flags: ['high'],
  });
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
});

test('an analyte only in the old version is removed', () => {
  const oldVersion = [...baselineOld(), { analyteCode: 'ANALYTE-SYNTH-D', value: 42, unit: 'ng/mL' }];
  const newVersion = baselineNew();
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.equal(diff.removed.length, 1);
  assert.deepEqual(diff.removed[0], {
    analyteCode: 'ANALYTE-SYNTH-D',
    value: 42,
    unit: 'ng/mL',
    flags: [],
  });
  assert.deepEqual(diff.added, []);
});

test('added and removed entries are sorted ascending by analyte code', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-Z', value: 1 }, { analyteCode: 'ANALYTE-SYNTH-A', value: 2 }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-Y', value: 1 }, { analyteCode: 'ANALYTE-SYNTH-B', value: 2 }];
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.deepEqual(diff.removed.map((entry) => entry.analyteCode), ['ANALYTE-SYNTH-A', 'ANALYTE-SYNTH-Z']);
  assert.deepEqual(diff.added.map((entry) => entry.analyteCode), ['ANALYTE-SYNTH-B', 'ANALYTE-SYNTH-Y']);
});

// --- changed: numeric with thresholds ---

test('a numeric change within the declared absolute threshold is not clinically significant', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 103; // delta 3, under the declared absolute threshold of 5
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  assert.equal(diff.changed.length, 1);
  const entry = diff.changed[0];
  assert.equal(entry.significant, false);
  assert.equal(entry.significanceReason, 'within-threshold');
  assert.deepEqual(entry.delta, { absolute: 3, percent: 3 });
  assert.equal(diff.hasSignificantChange, false);
});

test('a numeric change exceeding the declared absolute threshold is clinically significant', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 106; // delta 6, over the declared absolute threshold of 5
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  const entry = diff.changed[0];
  assert.equal(entry.significant, true);
  assert.equal(entry.significanceReason, 'exceeds-threshold');
  assert.equal(diff.hasSignificantChange, true);
});

test('a numeric change exactly at the absolute threshold is not clinically significant', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 105; // delta exactly 5
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  assert.equal(diff.changed[0].significant, false);
});

test('a percent-based threshold is applied when declared', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[2].value = 5.6; // delta 0.6 on base 5 -> 12%, over the declared 10% threshold
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  const entry = diff.changed.find((c) => c.analyteCode === 'ANALYTE-SYNTH-C')!;
  assert.equal(entry.significant, true);
  assert.equal(entry.significanceReason, 'exceeds-threshold');
  assert.ok(entry.delta);
  assert.equal(Math.round((entry.delta!.percent ?? 0) * 100) / 100, 12);
});

test('a zero old value yields a null percent delta and only the absolute threshold applies', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 0, unit: 'mg/L' }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 2, unit: 'mg/L' }];
  const thresholds: SignificanceThreshold[] = [{ analyteCode: 'ANALYTE-SYNTH-A', absolute: 5, percent: 10 }];
  const diff = diffResultVersions(oldVersion, newVersion, thresholds);
  assert.equal(diff.changed[0].delta?.percent, null);
  assert.equal(diff.changed[0].significant, false);
});

test('a negative delta magnitude is evaluated the same as a positive one', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 94; // delta -6, magnitude 6, over the absolute threshold of 5
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  assert.equal(diff.changed[0].significant, true);
  assert.equal(diff.changed[0].delta?.absolute, -6);
});

test('a numeric change with no declared threshold for that analyte defaults to significant', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-UNDECLARED', value: 1, unit: 'mg/L' }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-UNDECLARED', value: 2, unit: 'mg/L' }];
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  assert.equal(diff.changed[0].significant, true);
  assert.equal(diff.changed[0].significanceReason, 'no-threshold-declared');
});

test('a numeric change with an empty declared threshold list defaults to significant', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 1 }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 2 }];
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.equal(diff.changed[0].significant, true);
  assert.equal(diff.changed[0].significanceReason, 'no-threshold-declared');
});

// --- changed: qualitative and flags ---

test('a qualitative value change is always clinically significant with a null delta', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[1].value = 'positive';
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  const entry = diff.changed.find((c) => c.analyteCode === 'ANALYTE-SYNTH-B')!;
  assert.equal(entry.significant, true);
  assert.equal(entry.significanceReason, 'nonnumeric-value-changed');
  assert.equal(entry.delta, null);
});

test('a flag-only change is clinically significant even when the value is identical', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].flags = ['normal', 'high'];
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  const entry = diff.changed.find((c) => c.analyteCode === 'ANALYTE-SYNTH-A')!;
  assert.equal(entry.valueChanged, false);
  assert.equal(entry.flagsChanged, true);
  assert.equal(entry.significant, true);
  assert.equal(entry.significanceReason, 'flag-changed');
});

test('a flag change takes precedence over an in-threshold numeric change', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 101; // delta 1, well under threshold
  newVersion[0].flags = ['high'];
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  const entry = diff.changed.find((c) => c.analyteCode === 'ANALYTE-SYNTH-A')!;
  assert.equal(entry.significanceReason, 'flag-changed');
  assert.equal(entry.significant, true);
});

test('a changed entry carries both old and new values, units, and flags', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 120;
  newVersion[0].flags = ['high'];
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  const entry = diff.changed.find((c) => c.analyteCode === 'ANALYTE-SYNTH-A')!;
  assert.equal(entry.oldValue, 100);
  assert.equal(entry.newValue, 120);
  assert.equal(entry.unit, 'mg/L');
  assert.deepEqual(entry.oldFlags, ['normal']);
  assert.deepEqual(entry.newFlags, ['high']);
});

// --- fail closed: unit mismatch ---

test('an analyte with a different unit in each version fails closed', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, unit: 'mg/L' }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, unit: 'g/L' }];
  expectError(() => diffResultVersions(oldVersion, newVersion), 'unit-mismatch');
});

test('one version declaring a unit and the other declaring none fails closed', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, unit: 'mg/L' }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5 }];
  expectError(() => diffResultVersions(oldVersion, newVersion), 'unit-mismatch');
});

test('unit comparison ignores outer whitespace and case, so no false mismatch fires', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, unit: '  MG/L  ' }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 6, unit: 'mg/L' }];
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.equal(diff.changed.length, 1);
});

test('unit comparison never infers a conversion: mg/L and g/L still mismatch', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5000, unit: 'mg/L' }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, unit: 'g/L' }];
  expectError(() => diffResultVersions(oldVersion, newVersion), 'unit-mismatch');
});

test('a unit mismatch on an untouched analyte still fails the whole diff closed', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[2].unit = 'mol/L'; // ANALYTE-SYNTH-C: same value, mismatched unit
  expectError(() => diffResultVersions(oldVersion, newVersion), 'unit-mismatch');
});

// --- fail closed: duplicate analyte rows ---

test('a duplicate analyte code in the old version fails closed', () => {
  const oldVersion: ResultRow[] = [
    { analyteCode: 'ANALYTE-SYNTH-A', value: 1 },
    { analyteCode: 'ANALYTE-SYNTH-A', value: 2 },
  ];
  expectError(() => diffResultVersions(oldVersion, []), 'old-version-duplicate-analyte');
});

test('a duplicate analyte code in the new version fails closed', () => {
  const newVersion: ResultRow[] = [
    { analyteCode: 'ANALYTE-SYNTH-A', value: 1 },
    { analyteCode: 'ANALYTE-SYNTH-A', value: 2 },
  ];
  expectError(() => diffResultVersions([], newVersion), 'new-version-duplicate-analyte');
});

// --- fail closed: malformed rows and non-array versions ---

test('a non-array old version fails closed', () => {
  expectError(() => diffResultVersions('not-an-array' as unknown as ResultRow[], []), 'old-version-not-array');
});

test('a non-array new version fails closed', () => {
  expectError(() => diffResultVersions([], 'not-an-array' as unknown as ResultRow[]), 'new-version-not-array');
});

test('an old-version row missing analyteCode fails closed', () => {
  const oldVersion = [{ value: 1 }] as unknown as ResultRow[];
  expectError(() => diffResultVersions(oldVersion, []), 'old-version-row-malformed');
});

test('a new-version row with a non-finite value fails closed', () => {
  const newVersion = [{ analyteCode: 'ANALYTE-SYNTH-A', value: Number.POSITIVE_INFINITY }] as unknown as ResultRow[];
  expectError(() => diffResultVersions([], newVersion), 'new-version-row-malformed');
});

test('a row with an empty string value fails closed', () => {
  const oldVersion = [{ analyteCode: 'ANALYTE-SYNTH-A', value: '' }] as unknown as ResultRow[];
  expectError(() => diffResultVersions(oldVersion, []), 'old-version-row-malformed');
});

test('a row with a blank unit fails closed', () => {
  const oldVersion = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 1, unit: '   ' }] as unknown as ResultRow[];
  expectError(() => diffResultVersions(oldVersion, []), 'old-version-row-malformed');
});

test('a row with a non-string flag fails closed', () => {
  const oldVersion = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 1, flags: ['high', 7] }] as unknown as ResultRow[];
  expectError(() => diffResultVersions(oldVersion, []), 'old-version-row-malformed');
});

// --- fail closed: threshold validation ---

test('a non-array thresholds input fails closed', () => {
  expectError(
    () => diffResultVersions([], [], 'not-an-array' as unknown as SignificanceThreshold[]),
    'thresholds-not-array',
  );
});

test('a threshold with both limits null fails closed', () => {
  const thresholds: SignificanceThreshold[] = [{ analyteCode: 'ANALYTE-SYNTH-A', absolute: null, percent: null }];
  expectError(() => diffResultVersions([], [], thresholds), 'thresholds-invalid');
});

test('a threshold with a negative limit fails closed', () => {
  const thresholds: SignificanceThreshold[] = [{ analyteCode: 'ANALYTE-SYNTH-A', absolute: -1, percent: null }];
  expectError(() => diffResultVersions([], [], thresholds), 'thresholds-invalid');
});

test('duplicate thresholds for the same analyte fail closed', () => {
  const thresholds: SignificanceThreshold[] = [
    { analyteCode: 'ANALYTE-SYNTH-A', absolute: 5, percent: null },
    { analyteCode: 'ANALYTE-SYNTH-A', absolute: 6, percent: null },
  ];
  expectError(() => diffResultVersions([], [], thresholds), 'thresholds-duplicate-analyte');
});

// --- change lines for the corrected report footer ---

test('change lines list changed entries first, then added, then removed', () => {
  const oldVersion: ResultRow[] = [
    { analyteCode: 'ANALYTE-SYNTH-A', value: 100, unit: 'mg/L' },
    { analyteCode: 'ANALYTE-SYNTH-Z', value: 1 },
  ];
  const newVersion: ResultRow[] = [
    { analyteCode: 'ANALYTE-SYNTH-A', value: 200, unit: 'mg/L' },
    { analyteCode: 'ANALYTE-SYNTH-NEW', value: 9, unit: 'ng/mL' },
  ];
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.equal(diff.changeLines.length, 3);
  assert.match(diff.changeLines[0], /^ANALYTE-SYNTH-A: 100 mg\/L -> 200 mg\/L .*clinically significant/);
  assert.match(diff.changeLines[1], /^ANALYTE-SYNTH-NEW: added 9 ng\/mL/);
  assert.match(diff.changeLines[2], /^ANALYTE-SYNTH-Z: removed \(was 1\)/);
});

test('a change line reports not-clinically-significant for an in-threshold change', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 100, unit: 'mg/L' }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 102, unit: 'mg/L' }];
  const thresholds: SignificanceThreshold[] = [{ analyteCode: 'ANALYTE-SYNTH-A', absolute: 5, percent: null }];
  const diff = diffResultVersions(oldVersion, newVersion, thresholds);
  assert.equal(diff.changeLines[0], 'ANALYTE-SYNTH-A: 100 mg/L -> 102 mg/L (not clinically significant)');
});

test('a change line includes a flag transition when flags changed', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, flags: ['normal'] }];
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, flags: ['critical'] }];
  const diff = diffResultVersions(oldVersion, newVersion);
  assert.equal(diff.changeLines[0], 'ANALYTE-SYNTH-A: 5 -> 5 [flags: normal -> critical] (clinically significant)');
});

test('an added line with no flags omits the flag suffix', () => {
  const newVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5 }];
  const diff = diffResultVersions([], newVersion);
  assert.equal(diff.changeLines[0], 'ANALYTE-SYNTH-A: added 5');
});

test('a removed line includes flags when the removed row had them', () => {
  const oldVersion: ResultRow[] = [{ analyteCode: 'ANALYTE-SYNTH-A', value: 5, flags: ['high'] }];
  const diff = diffResultVersions(oldVersion, []);
  assert.equal(diff.changeLines[0], 'ANALYTE-SYNTH-A: removed (was 5) [flags: high]');
});

// --- purity, determinism, output shape ---

test('the diff is pure: it does not mutate either input version or the thresholds', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 150;
  const thresholds = baselineThresholds();
  const beforeOld = JSON.stringify(oldVersion);
  const beforeNew = JSON.stringify(newVersion);
  const beforeThresholds = JSON.stringify(thresholds);
  diffResultVersions(oldVersion, newVersion, thresholds);
  assert.equal(JSON.stringify(oldVersion), beforeOld);
  assert.equal(JSON.stringify(newVersion), beforeNew);
  assert.equal(JSON.stringify(thresholds), beforeThresholds);
});

test('the diff is deterministic across repeated calls with equivalent input', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 150;
  const thresholds = baselineThresholds();
  const first = diffResultVersions(oldVersion, newVersion, thresholds);
  const second = diffResultVersions(clone(oldVersion), clone(newVersion), clone(thresholds));
  assert.deepEqual(first, second);
});

test('the returned diff and its nested entries are frozen', () => {
  const oldVersion = baselineOld();
  const newVersion = clone(baselineOld());
  newVersion[0].value = 150;
  const diff = diffResultVersions(oldVersion, newVersion, baselineThresholds());
  assert.ok(Object.isFrozen(diff));
  assert.ok(Object.isFrozen(diff.changed));
  assert.ok(Object.isFrozen(diff.changed[0]));
  assert.ok(Object.isFrozen(diff.changeLines));
});

// --- explain functions ---

test('every declared error code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainResultDiffErrorCode(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /ANALYTE-SYNTH/);
  }
});

test('every declared significance reason has a non-empty explanation', () => {
  for (const reason of ALL_SIGNIFICANCE_REASONS) {
    const message = explainSignificanceReason(reason);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainResultDiffErrorCode('unit-mismatch'), explainResultDiffErrorCode('unit-mismatch'));
  assert.equal(explainSignificanceReason('exceeds-threshold'), explainSignificanceReason('exceeds-threshold'));
});

test('a thrown error message never echoes a submitted analyte code', () => {
  try {
    diffResultVersions([{ analyteCode: 'ANALYTE-SYNTH-SECRET', value: 1 }, { analyteCode: 'ANALYTE-SYNTH-SECRET', value: 2 }], []);
    assert.fail('expected diffResultVersions to throw');
  } catch (error) {
    assert.ok(error instanceof ResultDiffError);
    assert.doesNotMatch((error as Error).message, /ANALYTE-SYNTH-SECRET/);
  }
});
