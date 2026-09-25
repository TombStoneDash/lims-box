import {
  buildShiftHandoffChecklist,
  STALE_STAT_MINUTES,
  QC_BLOCKING_THRESHOLD,
  type ShiftHandoffChecklistInput,
  type HandoffItemCategory,
  type HandoffItemSeverity,
} from './ohworks-shift-handoff-checklist';

export const DEMO_HANDOFF_AT = '2026-09-19T19:00:00.000Z';

const SHIFT_HANDOFF_CAPTION =
  'Every specimen, analyte, instrument and timestamp below is fabricated. The severities come from the real shift-handoff rule module; the 60-minute stale-STAT window and the 3-result QC threshold are fabricated examples, not regulatory guidance. This panel hands nothing over and reads no SENAITE server.';

function minutesBefore(now: string, minutes: number): string {
  return new Date(Date.parse(now) - minutes * 60000).toISOString();
}

/** All specimens, analytes and instruments below are fabricated examples, not real patient or customer data. */
export function createPilotShiftHandoffFixtures(): ShiftHandoffChecklistInput {
  const now = DEMO_HANDOFF_AT;
  return {
    openWorklistItems: [
      {
        specimenId: 'SYNTHETIC-SPECIMEN-101',
        testCode: 'BMP',
        status: 'pending',
        priority: 'routine',
        enteredAt: minutesBefore(now, 20),
      },
      {
        specimenId: 'SYNTHETIC-SPECIMEN-102',
        testCode: 'CBC',
        status: 'pending',
        priority: 'stat',
        enteredAt: minutesBefore(now, 15),
      },
      {
        specimenId: 'SYNTHETIC-SPECIMEN-103',
        testCode: 'TROP',
        status: 'in_progress',
        priority: 'critical',
        enteredAt: minutesBefore(now, 4 * 60),
      },
    ],
    pendingCriticalValues: [
      {
        specimenId: 'SYNTHETIC-SPECIMEN-104',
        analyte: 'potassium',
        value: 7.1,
        notifiedAt: minutesBefore(now, 30),
      },
      {
        specimenId: 'SYNTHETIC-SPECIMEN-105',
        analyte: 'glucose',
        value: 480,
        notifiedAt: null,
      },
    ],
    qcOutOfRangeCount: 2,
    instrumentsDown: [{ instrumentId: 'SYNTHETIC-INSTR-201', reason: 'reagent depleted' }],
    now,
  };
}

const SEVERITY_LABELS: Record<HandoffItemSeverity, string> = {
  blocking: 'Blocking - must be resolved before handoff',
  attention: 'Attention - hand over with a note',
  info: 'Info - no action required',
};

export type PilotShiftHandoffRow = {
  category: HandoffItemCategory;
  severity: HandoffItemSeverity;
  severityLabel: string;
  description: string;
};

export type PilotShiftHandoffView = {
  caption: string;
  generatedAt: string;
  readyForHandoff: boolean;
  blockingIssueCount: number;
  staleStatMinutes: number;
  qcBlockingThreshold: number;
  rows: PilotShiftHandoffRow[];
};

/** Read-only synthetic evaluation; no backing server, worklist feed or persistence. */
export function buildPilotShiftHandoffView(): PilotShiftHandoffView {
  const checklist = buildShiftHandoffChecklist(createPilotShiftHandoffFixtures());

  return {
    caption: SHIFT_HANDOFF_CAPTION,
    generatedAt: checklist.generatedAt,
    readyForHandoff: checklist.readyForHandoff,
    blockingIssueCount: checklist.blockingIssueCount,
    staleStatMinutes: STALE_STAT_MINUTES,
    qcBlockingThreshold: QC_BLOCKING_THRESHOLD,
    rows: checklist.items.map((item) => ({
      category: item.category,
      severity: item.severity,
      severityLabel: SEVERITY_LABELS[item.severity],
      description: item.description,
    })),
  };
}
