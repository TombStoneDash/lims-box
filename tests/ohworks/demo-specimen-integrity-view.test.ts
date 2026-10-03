import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotSpecimenIntegrityView, createPilotSpecimenIntegrityFixtures } from '../../lib/ohworks-demo-specimen-integrity-view';
import { evaluateSpecimenStability, explainStabilityCheckReason } from '../../lib/ohworks-stability-window';
import { evaluateTransportConditions, explainTransportConditionsError, TransportConditionsError } from '../../lib/ohworks-transport-conditions';

const view = buildPilotSpecimenIntegrityView();
const fixtures = createPilotSpecimenIntegrityFixtures();

test('all four stability scenarios match the real evaluator and whole-minute segments', () => {
  assert.deepEqual(view.stabilityRows.map((row) => [row.status, row.reasonCode]), [
    ['within-window', 'within-all-windows'], ['expired', 'window-exceeded'],
    ['expired', 'undocumented-condition'], ['expired', 'history-start-gap'],
  ]);
  fixtures.stability.forEach((input, index) => {
    const actual = view.stabilityRows[index];
    const expected = evaluateSpecimenStability(input);
    assert.equal(actual.specimenId, input.specimenId);
    assert.equal(actual.analyteCode, input.analyteCode);
    assert.equal(actual.status, expected.status);
    assert.equal(actual.reasonCode, expected.reasonCode);
    assert.equal(actual.explanation, explainStabilityCheckReason(expected.reasonCode));
    assert.deepEqual(actual.segments, expected.segments.map((segment) => ({ ...segment,
      elapsedMinutes: Math.floor(segment.elapsedMs / 60_000),
      windowMinutes: segment.windowMs === null ? null : Math.floor(segment.windowMs / 60_000),
    })));
  });
  assert.deepEqual(view.stabilityRows.map((row) => row.segments.map((s) => [s.condition, s.elapsedMinutes, s.windowMinutes])), [
    [['refrigerated', 60, 120]], [['room-temp', 60, 30]],
    [['refrigerated', 30, 120], ['frozen', 30, null]], [],
  ]);
  assert.equal(view.notWithinWindowCount, 3);
});

test('three resolved courier logs match real decisions, counts and durations for two fabricated types', () => {
  assert.equal(fixtures.limits.length, 2);
  assert.equal(new Set(fixtures.logs.map((log) => log.specimenType)).size, 2);
  assert.deepEqual(view.transportRows.map((row) => row.decision), ['acceptable', 'acceptable_with_comment', 'reject', 'unresolved']);
  fixtures.logs.slice(0, 3).forEach((log, index) => {
    const expected = evaluateTransportConditions(fixtures.limits, log);
    const actual = view.transportRows[index];
    assert.equal(actual.specimenId, expected.specimenId);
    assert.equal(actual.specimenType, expected.specimenType);
    assert.equal(actual.decision, expected.decision);
    assert.equal(actual.readingCount, expected.readingCount);
    assert.equal(actual.excursionCount, expected.excursions.length);
    assert.equal(actual.totalExcursionMinutes, Math.floor(expected.totalExcursionMs / 60_000));
    assert.equal(actual.longestExcursionMinutes, Math.floor(expected.longestExcursionMs / 60_000));
    assert.equal(actual.errorCode, null);
  });
  assert.deepEqual(view.transportRows.slice(0, 3).map((row) => [row.readingCount, row.excursionCount, row.totalExcursionMinutes, row.longestExcursionMinutes]), [
    [2, 0, 0, 0], [4, 1, 5, 5], [5, 1, 20, 20],
  ]);
  assert.equal(view.rejectedOrUnresolvedCount, 2);
});

test('logger gap is an unresolved row with the real error explanation, not zero excursion time', () => {
  assert.doesNotThrow(buildPilotSpecimenIntegrityView);
  const gap = view.transportRows[3];
  assert.throws(() => evaluateTransportConditions(fixtures.limits, fixtures.logs[3]), (error: unknown) => {
    assert.ok(error instanceof TransportConditionsError);
    assert.equal(error.code, 'gap-too-large');
    assert.equal(gap.errorCode, error.code);
    assert.ok(gap.explanation.includes(explainTransportConditionsError(error.code)));
    return true;
  });
  assert.equal(gap.specimenId, fixtures.logs[3].specimenId);
  assert.equal(gap.specimenType, fixtures.logs[3].specimenType);
  assert.equal(gap.readingCount, 2);
  assert.equal(gap.excursionCount, null);
  assert.equal(gap.totalExcursionMinutes, null);
  assert.equal(gap.longestExcursionMinutes, null);
  assert.match(gap.explanation, /cannot be trusted/);
});

test('all identities are synthetic, explanations non-empty, and fixtures and output deterministic', () => {
  const rows = [...view.stabilityRows, ...view.transportRows];
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map((row) => row.specimenId)).size, 8);
  for (const row of rows) {
    assert.match(row.specimenId, /^SYNTHETIC-SPEC-INT-\d{3}$/);
    assert.ok(row.explanation.trim().length > 0);
  }
  for (const row of view.stabilityRows) assert.match(row.analyteCode, /^SYNTHETIC-/);
  for (const row of view.transportRows) assert.match(row.specimenType, /^SYNTHETIC-/);
  for (const limit of fixtures.limits) assert.match(limit.specimenType, /^SYNTHETIC-/);
  assert.deepEqual(buildPilotSpecimenIntegrityView(), view);
  assert.deepEqual(createPilotSpecimenIntegrityFixtures(), fixtures);
});

test('view module has no ambient clock, environment access or fetch', () => {
  const source = readFileSync(new URL('../../lib/ohworks-demo-specimen-integrity-view.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});
