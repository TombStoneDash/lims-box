import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotOrderIntakeView, createPilotOrderIntakeFixture, DEMO_NOW } from '../../lib/ohworks-demo-order-intake-view';
import { authorizeOrder, explainOrderAuthorizationRule } from '../../lib/ohworks-order-authorization';
import { evaluateVerbalOrderReadback } from '../../lib/ohworks-verbal-order-readback';
import { evaluateAddOnEligibility } from '../../lib/ohworks-add-on-test-window';

test('six authorization scenarios use the real decisions and privacy-safe explanations', () => {
  const fixture = createPilotOrderIntakeFixture();
  const view = buildPilotOrderIntakeView();
  const rules = ['authorized-no-cosign-required', 'authorized-with-cosign', 'cosign-required',
    'credential-expired', 'role-not-authorized', 'cosigner-same-as-requester'];
  assert.deepEqual(view.authorizationRows.map((row) => row.decision),
    ['AUTHORIZED', 'AUTHORIZED', 'NEEDS_COSIGN', 'REFUSED', 'REFUSED', 'REFUSED']);
  fixture.orders.forEach(({ requester, order }, index) => {
    const result = authorizeOrder(fixture.matrix, requester, order);
    assert.equal(result.rule, rules[index]);
    assert.deepEqual(view.authorizationRows[index], {
      orderId: order.orderId, testClass: order.testClass, decision: result.decision,
      explanation: explainOrderAuthorizationRule(result.rule),
    });
    assert.equal(order.timestamp, DEMO_NOW);
  });
  assert.equal(fixture.matrix.length, 2);
  assert.notEqual(fixture.orders[1].order.cosignerId, fixture.orders[1].requester.requesterId);
});

test('all five read-back statuses and complete issue lists come from the real evaluator', () => {
  const fixture = createPilotOrderIntakeFixture();
  const view = buildPilotOrderIntakeView();
  assert.deepEqual(view.verbalRows.map((row) => row.status),
    ['not_applicable', 'compliant', 'missing_readback', 'readback_not_confirmed', 'missing_required_fields']);
  fixture.verbalOrders.forEach(({ label, input }, index) => {
    const result = evaluateVerbalOrderReadback(input);
    assert.deepEqual(view.verbalRows[index], { label, status: result.status, issues: result.issues });
  });
  assert.equal(view.verbalRows[4].issues.length, 3);
});

test('all five add-on statuses use fixed time, rounded hours, volumes and real issues', () => {
  const fixture = createPilotOrderIntakeFixture();
  const view = buildPilotOrderIntakeView();
  assert.equal(view.asOf, DEMO_NOW);
  assert.deepEqual(view.addOnRows.map((row) => row.status),
    ['eligible', 'specimen_unavailable', 'stability_expired', 'insufficient_volume', 'eligible_with_buffer_warning']);
  fixture.addOns.forEach(({ label, input }, index) => {
    const result = evaluateAddOnEligibility(input);
    assert.equal(input.now, DEMO_NOW);
    assert.deepEqual(view.addOnRows[index], {
      label, status: result.status, hoursSinceCollection: Number(result.hoursSinceCollection.toFixed(1)),
      remainingVolumeMicroliters: input.remainingVolumeMicroliters,
      requiredVolumeMicroliters: input.requiredVolumeMicroliters, issues: result.issues,
    });
  });
  assert.equal(view.addOnRows[0].hoursSinceCollection, 2.3);
  assert.equal(view.addOnRows[2].hoursSinceCollection, 28);
});

test('headline counts exclude written orders and eligible buffer warnings', () => {
  const fixture = createPilotOrderIntakeFixture();
  const view = buildPilotOrderIntakeView();
  assert.deepEqual(view.counts, { ordersNotAuthorized: 4, verbalOrdersNotCompliant: 3, addOnsNotEligible: 3 });
  assert.equal(view.counts.ordersNotAuthorized, fixture.orders.filter(({ requester, order }) =>
    authorizeOrder(fixture.matrix, requester, order).decision !== 'AUTHORIZED').length);
  assert.equal(view.counts.verbalOrdersNotCompliant, fixture.verbalOrders.filter(({ input }) =>
    !evaluateVerbalOrderReadback(input).compliant).length);
  assert.equal(view.counts.addOnsNotEligible, fixture.addOns.filter(({ input }) =>
    !evaluateAddOnEligibility(input).eligible).length);
});

test('every identifier is synthetic and no view row exposes requester identities or role values', () => {
  const fixture = createPilotOrderIntakeFixture();
  const view = buildPilotOrderIntakeView();
  const ids = fixture.matrix.flatMap((entry) => [entry.role, entry.testClass]);
  for (const { requester, order } of fixture.orders) {
    ids.push(requester.requesterId, requester.role, order.orderId, order.testClass);
    if (order.cosignerId) ids.push(order.cosignerId);
    assert.match(requester.requesterId, /^SYNTHETIC-STAFF-\d{2}$/);
  }
  for (const { label, input } of fixture.verbalOrders) {
    ids.push(label);
    if (input.receivingStaffId) ids.push(input.receivingStaffId);
    if (input.originatorName) ids.push(input.originatorName);
  }
  ids.push(...fixture.addOns.map((entry) => entry.label));
  for (const id of ids) assert.match(id, /^SYNTHETIC-/);
  const rowIds = [...view.authorizationRows.map((row) => row.orderId),
    ...view.verbalRows.map((row) => row.label), ...view.addOnRows.map((row) => row.label)];
  assert.equal(new Set(rowIds).size, 16);
  for (const id of rowIds) assert.match(id, /^SYNTHETIC-ORD-\d{3}$/);
  for (const row of [...view.authorizationRows, ...view.verbalRows, ...view.addOnRows]) {
    const serialized = JSON.stringify(row);
    for (const { requester } of fixture.orders) {
      assert.ok(!serialized.includes(requester.requesterId));
      assert.ok(!serialized.includes(requester.role));
    }
  }
});

test('fixtures are fresh and output is deterministic without ambient inputs', () => {
  const fixture = createPilotOrderIntakeFixture();
  const before = structuredClone(fixture);
  assert.deepEqual(buildPilotOrderIntakeView(), buildPilotOrderIntakeView());
  assert.deepEqual(fixture, before);
  fixture.orders[0].requester.role = 'SYNTHETIC-CHANGED';
  assert.deepEqual(createPilotOrderIntakeFixture(), before);
  const source = readFileSync('lib/ohworks-demo-order-intake-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});

test('page renders exactly one final read-only intake section with three tables', () => {
  const source = readFileSync('app/pilot/ohworks/accessions/page.tsx', 'utf8');
  const title = 'Order intake checks (fabricated orders)';
  assert.equal(source.split(title).length - 1, 1);
  const panel = source.slice(source.lastIndexOf('<section'));
  assert.ok(panel.includes(title));
  assert.ok(source.indexOf(title) > source.indexOf('Rejected sample submissions'));
  assert.equal((panel.match(/<h3\b/g) ?? []).length, 3);
  assert.equal((panel.match(/<table\b/g) ?? []).length, 3);
  assert.match(source, /const intake = buildPilotOrderIntakeView\(\)/);
  assert.doesNotMatch(source, /['"]use client['"]|<form\b|fetch\s*\(|export default async|authorizeOrder\(|evaluateVerbalOrderReadback\(|evaluateAddOnEligibility\(/);
});
