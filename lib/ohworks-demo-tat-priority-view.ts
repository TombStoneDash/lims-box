import {
  explainTatReason,
  resolveTatTarget,
  TatInputError,
  type TatCatalogue,
  type TatDayType,
  type TatOrderRequest,
  type TatPriority,
} from './ohworks-tat-catalogue';
import {
  escalateSpecimenPriorities,
  explainPriorityEscalationReason,
} from './ohworks-priority-escalation';

export const DEMO_CURRENT_AT = '2026-09-21T12:00:00.000Z';

export type PilotTatPriorityRow = {
  orderId: string;
  specimenId: string;
  testCode: string;
  receivedAt: string;
  declaredPriority: TatPriority;
  effectivePriority: TatPriority;
  escalated: boolean;
  escalationReason: string;
  dayType: TatDayType | null;
  targetHours: number | null;
  dueAt: string | null;
  tatReason: string | null;
  unresolvedReason: string | null;
};

export type PilotTatPriorityView = {
  currentAt: string;
  rows: PilotTatPriorityRow[];
  escalatedCount: number;
  unresolvedCount: number;
};

/** Fabricated fixtures only; no SENAITE connection or persistence. */
export function buildPilotTatPriorityView(): PilotTatPriorityView {
  const priorities: TatPriority[] = ['routine', 'urgent', 'stat'];
  const dayTypes: TatDayType[] = ['weekday', 'weekend', 'holiday'];
  const baseHours = { routine: 48, urgent: 12, stat: 2 };
  const dayMultiplier = { weekday: 1, weekend: 2, holiday: 3 };
  const catalogue: TatCatalogue = {
    rows: ['SYNTHETIC-TEST-A', 'SYNTHETIC-TEST-B', 'SYNTHETIC-TEST-C'].flatMap((testCode) =>
      priorities.flatMap((priority) => dayTypes.map((dayType) => ({
        testCode, priority, dayType,
        targetHours: baseHours[priority] * dayMultiplier[dayType],
      }))),
    ),
    holidayDates: ['2026-09-20'],
  };
  const orders: (TatOrderRequest & { specimenId: string })[] = [
    { orderId: 'SYNTHETIC-ORD-001', specimenId: 'SYNTHETIC-SPEC-001', testCode: 'SYNTHETIC-TEST-A', priority: 'routine', receivedAt: '2026-09-21T11:50:00.000Z' },
    { orderId: 'SYNTHETIC-ORD-002', specimenId: 'SYNTHETIC-SPEC-002', testCode: 'SYNTHETIC-TEST-B', priority: 'routine', receivedAt: '2026-09-19T10:00:00.000Z' },
    { orderId: 'SYNTHETIC-ORD-003', specimenId: 'SYNTHETIC-SPEC-003', testCode: 'SYNTHETIC-TEST-C', priority: 'routine', receivedAt: '2026-09-20T10:00:00.000Z' },
    { orderId: 'SYNTHETIC-ORD-004', specimenId: 'SYNTHETIC-SPEC-004', testCode: 'SYNTHETIC-TEST-A', priority: 'stat', receivedAt: '2026-09-21T11:55:00.000Z' },
    { orderId: 'SYNTHETIC-ORD-005', specimenId: 'SYNTHETIC-SPEC-005', testCode: 'SYNTHETIC-TEST-B', priority: 'routine', receivedAt: '2026-09-21T11:00:00.000Z' },
    { orderId: 'SYNTHETIC-ORD-006', specimenId: 'SYNTHETIC-SPEC-006', testCode: 'SYNTHETIC-TEST-MISSING', priority: 'routine', receivedAt: '2026-09-21T11:58:00.000Z' },
  ];
  const { queue } = escalateSpecimenPriorities({
    specimens: orders.map((order) => ({
      specimenId: order.specimenId, initialPriority: order.priority, receivedAt: order.receivedAt,
    })),
    steps: { routineToUrgentMinutes: 30, urgentToStatMinutes: 90 },
    currentAt: DEMO_CURRENT_AT,
  });
  const rows = queue.map((entry): PilotTatPriorityRow => {
    const order = orders.find((candidate) => candidate.specimenId === entry.specimenId)!;
    const row: PilotTatPriorityRow = {
      orderId: order.orderId,
      specimenId: order.specimenId,
      testCode: order.testCode,
      receivedAt: order.receivedAt,
      declaredPriority: entry.initialPriority,
      effectivePriority: entry.effectivePriority,
      escalated: entry.initialPriority !== entry.effectivePriority,
      escalationReason: explainPriorityEscalationReason(entry.reasonCode),
      dayType: null, targetHours: null, dueAt: null, tatReason: null, unresolvedReason: null,
    };
    try {
      // The fabricated policy resolves targets at effective priority, from original receipt.
      const tat = resolveTatTarget(catalogue, { ...order, priority: entry.effectivePriority });
      return { ...row, dayType: tat.dayType, targetHours: tat.targetHours, dueAt: tat.dueAt,
        tatReason: explainTatReason(tat.reasonCode) };
    } catch (error) {
      // Only the intentionally absent test is a display scenario; fixture defects must throw.
      if (!(error instanceof TatInputError) || error.code !== 'unknown-test-code') throw error;
      // explainTatReason accepts successful matches only; typed errors own failure text.
      return { ...row, unresolvedReason: error.message };
    }
  });
  return {
    currentAt: DEMO_CURRENT_AT,
    rows,
    escalatedCount: rows.filter((row) => row.escalated).length,
    unresolvedCount: rows.filter((row) => row.unresolvedReason !== null).length,
  };
}
