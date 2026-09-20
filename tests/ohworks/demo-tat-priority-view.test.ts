import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotTatPriorityView, DEMO_CURRENT_AT } from '../../lib/ohworks-demo-tat-priority-view';
import { escalateSpecimenPriorities, explainPriorityEscalationReason } from '../../lib/ohworks-priority-escalation';
import { resolveTatTarget, explainTatReason, TatInputError } from '../../lib/ohworks-tat-catalogue';

const view = buildPilotTatPriorityView();
function row(number: number) {
  const result = view.rows.find((entry) => entry.orderId === `SYNTHETIC-ORD-${String(number).padStart(3, '0')}`);
  assert.ok(result);
  return result;
}

test('fabricated weekday, weekend, holiday, STAT and urgent targets match the real resolver', () => {
  const cases = [
    { number: 1, dayType: 'weekday', targetHours: 48, dueAt: '2026-09-23T11:50:00.000Z' },
    { number: 2, dayType: 'weekend', targetHours: 4, dueAt: '2026-09-19T14:00:00.000Z' },
    { number: 3, dayType: 'holiday', targetHours: 6, dueAt: '2026-09-20T16:00:00.000Z' },
    { number: 4, dayType: 'weekday', targetHours: 2, dueAt: '2026-09-21T13:55:00.000Z' },
    { number: 5, dayType: 'weekday', targetHours: 12, dueAt: '2026-09-21T23:00:00.000Z' },
  ] as const;
  for (const scenario of cases) {
    const actual = row(scenario.number);
    const expected = resolveTatTarget({
      rows: [{ testCode: actual.testCode, priority: actual.effectivePriority,
        dayType: scenario.dayType, targetHours: scenario.targetHours }],
      holidayDates: ['2026-09-20'],
    }, { orderId: actual.orderId, testCode: actual.testCode,
      priority: actual.effectivePriority, receivedAt: actual.receivedAt });
    assert.equal(actual.dayType, scenario.dayType);
    assert.equal(actual.targetHours, expected.targetHours);
    assert.equal(actual.dueAt, expected.dueAt);
    assert.equal(actual.dueAt, scenario.dueAt);
    assert.equal(actual.tatReason, explainTatReason(expected.reasonCode));
    assert.equal(actual.unresolvedReason, null);
  }
  assert.equal(row(1).declaredPriority, 'routine');
  assert.equal(row(1).effectivePriority, 'routine');
  assert.equal(row(4).declaredPriority, 'stat');
  assert.equal(row(4).escalated, false);
});

test('real escalation output controls reasons and the complete queue order', () => {
  const expected = escalateSpecimenPriorities({
    specimens: [...view.rows].sort((a, b) => a.orderId.localeCompare(b.orderId)).map((entry) => ({
      specimenId: entry.specimenId, initialPriority: entry.declaredPriority, receivedAt: entry.receivedAt,
    })),
    steps: { routineToUrgentMinutes: 30, urgentToStatMinutes: 90 }, currentAt: DEMO_CURRENT_AT,
  });
  assert.deepEqual(view.rows.map((entry) => entry.specimenId), expected.queue.map((entry) => entry.specimenId));
  expected.queue.forEach((entry, index) => {
    assert.equal(view.rows[index].effectivePriority, entry.effectivePriority);
    assert.equal(view.rows[index].escalationReason, explainPriorityEscalationReason(entry.reasonCode));
    assert.equal(view.rows[index].escalated, entry.initialPriority !== entry.effectivePriority);
  });
  assert.deepEqual(view.rows.map((entry) => entry.effectivePriority), ['stat', 'stat', 'stat', 'urgent', 'routine', 'routine']);
  assert.equal(row(5).declaredPriority, 'routine');
  assert.equal(row(5).effectivePriority, 'urgent');
  assert.equal(row(2).declaredPriority, 'routine');
  assert.equal(row(2).effectivePriority, 'stat');
  assert.equal(view.escalatedCount, 3);
});

test('unknown fabricated test remains visible with the real typed error text, without throwing', () => {
  assert.doesNotThrow(buildPilotTatPriorityView);
  const missing = row(6);
  assert.throws(() => resolveTatTarget({
    rows: [{ testCode: 'SYNTHETIC-TEST-A', priority: 'routine', dayType: 'weekday', targetHours: 48 }],
    holidayDates: ['2026-09-20'],
  }, { orderId: missing.orderId, testCode: missing.testCode, priority: missing.effectivePriority,
    receivedAt: missing.receivedAt }), (error: unknown) => {
    assert.ok(error instanceof TatInputError);
    assert.equal(error.code, 'unknown-test-code');
    assert.equal(missing.unresolvedReason, error.message);
    return true;
  });
  assert.equal(missing.targetHours, null);
  assert.equal(missing.dueAt, null);
  assert.equal(missing.tatReason, null);
  assert.equal(view.unresolvedCount, 1);
});

test('all six identifiers are synthetic and output is deterministic', () => {
  assert.equal(view.rows.length, 6);
  for (const entry of view.rows) {
    assert.match(entry.orderId, /^SYNTHETIC-ORD-\d{3}$/);
    assert.match(entry.specimenId, /^SYNTHETIC-SPEC-\d{3}$/);
    assert.match(entry.testCode, /^SYNTHETIC-/);
  }
  assert.equal(new Set(view.rows.map((entry) => entry.orderId)).size, 6);
  assert.equal(new Set(view.rows.map((entry) => entry.specimenId)).size, 6);
  assert.equal(view.currentAt, DEMO_CURRENT_AT);
  assert.deepEqual(buildPilotTatPriorityView(), buildPilotTatPriorityView());
});

test('view module has no ambient clock, environment access or fetch', () => {
  const source = readFileSync(new URL('../../lib/ohworks-demo-tat-priority-view.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});
