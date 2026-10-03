import { authorizeOrder, explainOrderAuthorizationRule, type OrderAuthorizationMatrix, type OrderRequest, type RequesterCredential, type OrderAuthorizationDecision } from './ohworks-order-authorization';
import { evaluateVerbalOrderReadback, type VerbalOrderReadbackInput, type VerbalOrderReadbackStatus } from './ohworks-verbal-order-readback';
import { evaluateAddOnEligibility, type AddOnEligibilityInput, type AddOnEligibilityStatus } from './ohworks-add-on-test-window';

export const DEMO_NOW = '2026-09-19T12:00:00.000Z';

export interface PilotOrderIntakeFixture {
  matrix: OrderAuthorizationMatrix;
  orders: { requester: RequesterCredential; order: OrderRequest }[];
  verbalOrders: { label: string; input: VerbalOrderReadbackInput }[];
  addOns: { label: string; input: AddOnEligibilityInput }[];
}

/** Every identity, permission, validity window, stability limit and volume is fabricated. */
export function createPilotOrderIntakeFixture(): PilotOrderIntakeFixture {
  const requester: RequesterCredential = {
    requesterId: 'SYNTHETIC-STAFF-01', role: 'SYNTHETIC-ROLE-A',
    validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-10-01T00:00:00.000Z',
  };
  const order: OrderRequest = { orderId: 'SYNTHETIC-ORD-001', testClass: 'SYNTHETIC-CLASS-BASIC', timestamp: DEMO_NOW };
  const verbal: VerbalOrderReadbackInput = {
    orderReceivedVerbally: true, readBackPerformed: true, readBackConfirmedByOriginator: true,
    receivingStaffId: 'SYNTHETIC-STAFF-03', originatorName: 'SYNTHETIC-ORIGINATOR-A',
    originatorRole: 'other', orderText: 'SYNTHETIC-TEST-A fabricated order', timestampReceived: DEMO_NOW,
  };
  const addOn: AddOnEligibilityInput = {
    specimenStatus: 'available', collectedAt: '2026-09-19T09:44:00.000Z', now: DEMO_NOW,
    stabilityHoursForAnalyte: 24, remainingVolumeMicroliters: 500,
    requiredVolumeMicroliters: 100, requiresMinimumBufferMicroliters: 50,
  };
  return {
    matrix: [
      { role: requester.role, testClass: order.testClass, requiresCosign: false },
      { role: requester.role, testClass: 'SYNTHETIC-CLASS-RESTRICTED', requiresCosign: true },
    ],
    orders: [
      { requester: { ...requester }, order: { ...order } },
      { requester: { ...requester }, order: { ...order, orderId: 'SYNTHETIC-ORD-002', testClass: 'SYNTHETIC-CLASS-RESTRICTED', cosignerId: 'SYNTHETIC-STAFF-02' } },
      { requester: { ...requester }, order: { ...order, orderId: 'SYNTHETIC-ORD-003', testClass: 'SYNTHETIC-CLASS-RESTRICTED' } },
      { requester: { ...requester, validUntil: '2026-09-18T00:00:00.000Z' }, order: { ...order, orderId: 'SYNTHETIC-ORD-004' } },
      { requester: { ...requester, role: 'SYNTHETIC-ROLE-B' }, order: { ...order, orderId: 'SYNTHETIC-ORD-005' } },
      { requester: { ...requester }, order: { ...order, orderId: 'SYNTHETIC-ORD-006', testClass: 'SYNTHETIC-CLASS-RESTRICTED', cosignerId: requester.requesterId } },
    ],
    verbalOrders: [
      { label: 'SYNTHETIC-ORD-007', input: { ...verbal, orderReceivedVerbally: false, readBackPerformed: false, readBackConfirmedByOriginator: false } },
      { label: 'SYNTHETIC-ORD-008', input: { ...verbal } },
      { label: 'SYNTHETIC-ORD-009', input: { ...verbal, readBackPerformed: false, readBackConfirmedByOriginator: false } },
      { label: 'SYNTHETIC-ORD-010', input: { ...verbal, readBackConfirmedByOriginator: false } },
      { label: 'SYNTHETIC-ORD-011', input: { ...verbal, receivingStaffId: null, originatorName: null, orderText: '' } },
    ],
    addOns: [
      { label: 'SYNTHETIC-ORD-012', input: { ...addOn } },
      { label: 'SYNTHETIC-ORD-013', input: { ...addOn, specimenStatus: 'discarded' } },
      { label: 'SYNTHETIC-ORD-014', input: { ...addOn, collectedAt: '2026-09-18T08:00:00.000Z' } },
      { label: 'SYNTHETIC-ORD-015', input: { ...addOn, remainingVolumeMicroliters: 80 } },
      { label: 'SYNTHETIC-ORD-016', input: { ...addOn, remainingVolumeMicroliters: 120 } },
    ],
  };
}

export interface PilotOrderIntakeView {
  asOf: string;
  authorizationRows: { orderId: string; testClass: string; decision: OrderAuthorizationDecision; explanation: string }[];
  verbalRows: { label: string; status: VerbalOrderReadbackStatus; issues: string[] }[];
  addOnRows: { label: string; status: AddOnEligibilityStatus; hoursSinceCollection: number; remainingVolumeMicroliters: number; requiredVolumeMicroliters: number; issues: string[] }[];
  counts: { ordersNotAuthorized: number; verbalOrdersNotCompliant: number; addOnsNotEligible: number };
}

/** Pure in-memory rule evaluation only; no backing SENAITE server or persistence. */
export function buildPilotOrderIntakeView(): PilotOrderIntakeView {
  const fixture = createPilotOrderIntakeFixture();
  const authorizationRows = fixture.orders.map(({ requester, order }) => {
    const result = authorizeOrder(fixture.matrix, requester, order);
    return { orderId: result.orderId, testClass: order.testClass, decision: result.decision,
      explanation: explainOrderAuthorizationRule(result.rule) };
  });
  const verbalResults = fixture.verbalOrders.map(({ input }) => evaluateVerbalOrderReadback(input));
  const addOnResults = fixture.addOns.map(({ input }) => evaluateAddOnEligibility(input));
  return {
    asOf: DEMO_NOW,
    authorizationRows,
    verbalRows: fixture.verbalOrders.map(({ label }, index) => ({
      label, status: verbalResults[index].status, issues: verbalResults[index].issues,
    })),
    addOnRows: fixture.addOns.map(({ label, input }, index) => ({
      label, status: addOnResults[index].status,
      hoursSinceCollection: Number(addOnResults[index].hoursSinceCollection.toFixed(1)),
      remainingVolumeMicroliters: input.remainingVolumeMicroliters,
      requiredVolumeMicroliters: input.requiredVolumeMicroliters, issues: addOnResults[index].issues,
    })),
    counts: {
      ordersNotAuthorized: authorizationRows.filter((row) => row.decision !== 'AUTHORIZED').length,
      verbalOrdersNotCompliant: verbalResults.filter((result) => !result.compliant).length,
      addOnsNotEligible: addOnResults.filter((result) => !result.eligible).length,
    },
  };
}
