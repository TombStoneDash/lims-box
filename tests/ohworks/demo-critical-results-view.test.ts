import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotCriticalResultsView, DEMO_FIXTURES, DEMO_NOW } from '../../lib/ohworks-demo-critical-results-view';
import { evaluateCriticalRepeat, explainCriticalRepeatReason } from '../../lib/ohworks-critical-repeat';
import { buildCriticalValueNotificationLog, explainCriticalValueLogReason } from '../../lib/ohworks-critical-value-log';
import { planNextEscalationContact } from '../../lib/ohworks-critical-notification-escalation';

test('all four repeat scenarios render the real evaluation of their exported fixtures', () => {
  const rows = buildPilotCriticalResultsView().repeatRows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => [row.status, row.notifyAllowed, row.reportValue, row.reasonCode]), [
    ['confirmed', true, 10, 'repeat-not-required'],
    ['pending', false, null, 'awaiting-first-repeat'],
    ['confirmed', true, 10, 'repeat-confirmed'],
    ['discordant', true, null, 'repeats-exhausted'],
  ]);
  DEMO_FIXTURES.repeats.forEach((input, index) => {
    const outcome = evaluateCriticalRepeat(input);
    assert.deepEqual(rows[index], {
      subject: input.first.subjectId, analyte: input.first.analyteCode, firstValue: input.first.value,
      unit: input.first.unit, repeatValues: input.repeats.map((repeat) => repeat.value),
      ...outcome, explanation: explainCriticalRepeatReason(outcome.reasonCode),
    });
    assert.ok(rows[index].explanation.trim());
  });
});

test('four notification logs retain real statuses, timing, range, roles and hash prefixes', () => {
  const rows = buildPilotCriticalResultsView().logRows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => [row.status, row.minutesToConfirmation, row.windowSatisfied, row.finalContactRole, row.attemptCount]), [
    ['CONFIRMED', 5, true, 'PRIMARY', 1],
    ['CONFIRMED', 40, false, 'ESCALATION', 2],
    ['UNCONFIRMED', null, false, 'PRIMARY', 1],
    ['CHAIN_GAP', null, false, 'ESCALATION', 1],
  ]);
  assert.equal(rows[3].reasonCode, 'first-attempt-not-primary');
  DEMO_FIXTURES.logs.forEach((input, index) => {
    assert.ok(input.result.value > input.result.criticalRange.high);
    const outcome = buildCriticalValueNotificationLog(input);
    assert.deepEqual(rows[index], { ...outcome, entryHash: outcome.entryHash.slice(0, 12), explanation: explainCriticalValueLogReason(outcome.reasonCode) });
    assert.ok(rows[index].explanation.trim());
    assert.ok(rows[index].entryHash.length > 0 && rows[index].entryHash.length <= 12);
  });
});

test('four escalation scenarios use the same fabricated four-role chain and fixed clock', () => {
  const view = buildPilotCriticalResultsView();
  assert.equal(view.now, DEMO_NOW);
  assert.equal(view.escalationRows.length, 4);
  assert.deepEqual(view.escalationRows.map((row) => [row.action, row.targetChainIndex, row.targetRole, row.waitMinutes]), [
    ['contact_now', 0, 'ordering_provider', 0],
    ['wait', 0, 'ordering_provider', 10.3],
    ['contact_now', 1, 'covering_provider', 0],
    ['escalation_chain_exhausted', null, null, 0],
  ]);
  DEMO_FIXTURES.escalations.forEach(({ situation, input }, index) => {
    assert.equal(input.now, DEMO_NOW);
    assert.deepEqual(input.escalationChain.map((contact) => contact.role), ['ordering_provider', 'covering_provider', 'charge_nurse', 'lab_director']);
    assert.deepEqual(input.escalationChain, DEMO_FIXTURES.escalations[0].input.escalationChain);
    const outcome = planNextEscalationContact(input);
    assert.deepEqual(view.escalationRows[index], { situation, ...outcome, targetRole: outcome.targetContact?.role ?? null, waitMinutes: Number(outcome.waitMinutes.toFixed(1)) });
    assert.ok(view.escalationRows[index].reason.trim());
    input.escalationChain.forEach((contact) => {
      assert.match(contact.name, /^SYNTHETIC-CONTACT-\d+$/);
      assert.equal(contact.contactMethod, 'synthetic-pager');
    });
  });
});

test('headline counts derive from outcomes and calls are deterministic without mutating fixtures', () => {
  const before = structuredClone(DEMO_FIXTURES);
  const first = buildPilotCriticalResultsView();
  assert.deepEqual(buildPilotCriticalResultsView(), first);
  assert.deepEqual(DEMO_FIXTURES, before);
  assert.deepEqual(first.counts, { notifyBlocked: 1, outsideWindowOrUnconfirmed: 3, exhaustedChains: 1 });
  assert.equal(first.counts.notifyBlocked, first.repeatRows.filter((row) => !row.notifyAllowed).length);
  assert.equal(first.counts.outsideWindowOrUnconfirmed, first.logRows.filter((row) => row.status !== 'CONFIRMED' || !row.windowSatisfied).length);
  assert.equal(first.counts.exhaustedChains, first.escalationRows.filter((row) => row.action === 'escalation_chain_exhausted').length);
});

function inspectStrings(value: unknown, key = ''): void {
  if (typeof value === 'string') {
    assert.doesNotMatch(value, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    // Telephone formats; ISO dates and short synthetic ID suffixes are not telephone numbers.
    assert.doesNotMatch(value, /(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)[ .-]?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b|\b\d{10,15}\b/);
    if (['subject', 'subjectId', 'analyte', 'analyteCode', 'contactId', 'name'].includes(key)) {
      assert.match(value, /^SYNTHETIC-/);
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry) => inspectStrings(entry, key));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([field, entry]) => inspectStrings(entry, field));
  }
}

test('view and fixtures contain only fabricated identifiers and no contact destinations', () => {
  inspectStrings(buildPilotCriticalResultsView());
  inspectStrings(DEMO_FIXTURES);
});

test('view-model source contains no ambient clock, environment or fetching', () => {
  const source = readFileSync(new URL('../../lib/ohworks-demo-critical-results-view.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});
