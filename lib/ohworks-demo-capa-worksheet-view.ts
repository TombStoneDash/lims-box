import {
  runCorrectiveActionWorkflow, explainCorrectiveActionBlock,
  type CorrectiveActionContext, type CorrectiveActionEventInput, type CorrectiveActionRootCause,
  type CorrectiveActionState, type CorrectiveActionBlockCode,
} from './ohworks-corrective-action';
import {
  runWorksheetVerificationWorkflow, explainWorksheetVerificationBlock, isHighRiskWorksheetType,
  type WorksheetContext, type WorksheetEventInput, type WorksheetType, type WorksheetState,
  type WorksheetBlockCode, type WorksheetActorRole, type WorksheetEventKind,
} from './ohworks-worksheet-verification';

export const TENANT_ID = 'synthetic-tenant-ohworks-demo';

/** All records, actors, worksheets and timestamps are fabricated examples evaluated by the real workflow modules. */
export function createPilotCapaWorksheetFixtures(): {
  correctiveActions: { context: CorrectiveActionContext; events: CorrectiveActionEventInput[] }[];
  worksheets: { context: WorksheetContext; events: WorksheetEventInput[] }[];
} {
  const at = (day: string, hour: string) => `2026-09-${day}T${hour}:00:00.000Z`;

  const correctiveActions: { context: CorrectiveActionContext; events: CorrectiveActionEventInput[] }[] = [
    {
      // Full path: opened -> investigating -> action_proposed -> action_implemented -> effectiveness_checked -> closed.
      context: { tenantId: TENANT_ID, recordId: 'SYNTHETIC-CAPA-001', initialFindingReference: 'SYNTHETIC-FINDING-001' },
      events: [
        { eventId: 'SYNTHETIC-CAPA-001-EVT-1', recordId: 'SYNTHETIC-CAPA-001', tenantId: TENANT_ID, kind: 'start_investigation', actorRole: 'investigator', actorId: 'SYNTHETIC-ACTOR-001', occurredAt: at('10', '08'), investigationScope: 'Fabricated scope: review the synthetic calibration log for batch SYNTHETIC-BATCH-01.' },
        { eventId: 'SYNTHETIC-CAPA-001-EVT-2', recordId: 'SYNTHETIC-CAPA-001', tenantId: TENANT_ID, kind: 'propose_action', actorRole: 'investigator', actorId: 'SYNTHETIC-ACTOR-001', occurredAt: at('10', '09'), proposedAction: 'Fabricated action: recalibrate the synthetic analyzer per fabricated procedure section 4.2.', rootCause: 'EQUIPMENT_MALFUNCTION' },
        { eventId: 'SYNTHETIC-CAPA-001-EVT-3', recordId: 'SYNTHETIC-CAPA-001', tenantId: TENANT_ID, kind: 'implement_action', actorRole: 'action_owner', actorId: 'SYNTHETIC-ACTOR-002', occurredAt: at('10', '10'), implementationEvidence: 'Fabricated evidence: synthetic recalibration record SYNTHETIC-CAL-001 attached.' },
        { eventId: 'SYNTHETIC-CAPA-001-EVT-4', recordId: 'SYNTHETIC-CAPA-001', tenantId: TENANT_ID, kind: 'check_effectiveness', actorRole: 'qa_reviewer', actorId: 'SYNTHETIC-ACTOR-003', occurredAt: at('10', '11'), effectivenessOutcome: 'effective' },
        { eventId: 'SYNTHETIC-CAPA-001-EVT-5', recordId: 'SYNTHETIC-CAPA-001', tenantId: TENANT_ID, kind: 'close', actorRole: 'qa_reviewer', actorId: 'SYNTHETIC-ACTOR-003', occurredAt: at('10', '12'), closureSummary: 'Fabricated closure: the synthetic effectiveness check confirmed the corrective action resolved the finding.' },
      ],
    },
    {
      // Close attempted after a "not_effective" check: blocked on effectiveness-not-confirmed.
      context: { tenantId: TENANT_ID, recordId: 'SYNTHETIC-CAPA-002', initialFindingReference: 'SYNTHETIC-FINDING-002' },
      events: [
        { eventId: 'SYNTHETIC-CAPA-002-EVT-1', recordId: 'SYNTHETIC-CAPA-002', tenantId: TENANT_ID, kind: 'start_investigation', actorRole: 'investigator', actorId: 'SYNTHETIC-ACTOR-004', occurredAt: at('11', '08'), investigationScope: 'Fabricated scope: review the synthetic reagent storage log for fridge SYNTHETIC-FRIDGE-02.' },
        { eventId: 'SYNTHETIC-CAPA-002-EVT-2', recordId: 'SYNTHETIC-CAPA-002', tenantId: TENANT_ID, kind: 'propose_action', actorRole: 'investigator', actorId: 'SYNTHETIC-ACTOR-004', occurredAt: at('11', '09'), proposedAction: 'Fabricated action: retrain synthetic staff on fabricated storage procedure section 2.1.', rootCause: 'PROCEDURE_NOT_FOLLOWED' },
        { eventId: 'SYNTHETIC-CAPA-002-EVT-3', recordId: 'SYNTHETIC-CAPA-002', tenantId: TENANT_ID, kind: 'implement_action', actorRole: 'action_owner', actorId: 'SYNTHETIC-ACTOR-005', occurredAt: at('11', '10'), implementationEvidence: 'Fabricated evidence: synthetic training completion record SYNTHETIC-TRN-001 attached.' },
        { eventId: 'SYNTHETIC-CAPA-002-EVT-4', recordId: 'SYNTHETIC-CAPA-002', tenantId: TENANT_ID, kind: 'check_effectiveness', actorRole: 'qa_reviewer', actorId: 'SYNTHETIC-ACTOR-006', occurredAt: at('11', '11'), effectivenessOutcome: 'not_effective' },
        { eventId: 'SYNTHETIC-CAPA-002-EVT-5', recordId: 'SYNTHETIC-CAPA-002', tenantId: TENANT_ID, kind: 'close', actorRole: 'qa_reviewer', actorId: 'SYNTHETIC-ACTOR-006', occurredAt: at('11', '12'), closureSummary: 'Fabricated closure: attempted before a confirmed effective recheck.' },
      ],
    },
    {
      // Recorded by a role the module does not allow for start_investigation: blocked on role-not-allowed-for-kind.
      context: { tenantId: TENANT_ID, recordId: 'SYNTHETIC-CAPA-003', initialFindingReference: 'SYNTHETIC-FINDING-003' },
      events: [
        { eventId: 'SYNTHETIC-CAPA-003-EVT-1', recordId: 'SYNTHETIC-CAPA-003', tenantId: TENANT_ID, kind: 'start_investigation', actorRole: 'action_owner', actorId: 'SYNTHETIC-ACTOR-007', occurredAt: at('12', '08'), investigationScope: 'Fabricated scope: review the synthetic pipette maintenance log for device SYNTHETIC-PIP-03.' },
      ],
    },
    {
      // Implement attempted straight after start_investigation: blocked on skipped-transition.
      context: { tenantId: TENANT_ID, recordId: 'SYNTHETIC-CAPA-004', initialFindingReference: 'SYNTHETIC-FINDING-004' },
      events: [
        { eventId: 'SYNTHETIC-CAPA-004-EVT-1', recordId: 'SYNTHETIC-CAPA-004', tenantId: TENANT_ID, kind: 'start_investigation', actorRole: 'investigator', actorId: 'SYNTHETIC-ACTOR-008', occurredAt: at('13', '08'), investigationScope: 'Fabricated scope: review the synthetic proficiency-testing log for event SYNTHETIC-PT-04.' },
        { eventId: 'SYNTHETIC-CAPA-004-EVT-2', recordId: 'SYNTHETIC-CAPA-004', tenantId: TENANT_ID, kind: 'implement_action', actorRole: 'action_owner', actorId: 'SYNTHETIC-ACTOR-009', occurredAt: at('13', '09'), implementationEvidence: 'Fabricated evidence: synthetic implementation record SYNTHETIC-IMP-001 attached.' },
      ],
    },
  ];

  const worksheets: { context: WorksheetContext; events: WorksheetEventInput[] }[] = [
    {
      // Routine chemistry prepared, verified by a different actor, then locked.
      context: { tenantId: TENANT_ID, worksheetId: 'SYNTHETIC-WS-001', worksheetType: 'routine_chemistry' },
      events: [
        { eventId: 'SYNTHETIC-WS-001-EVT-1', worksheetId: 'SYNTHETIC-WS-001', tenantId: TENANT_ID, kind: 'prepare', actorRole: 'preparer', actorId: 'SYNTHETIC-ACTOR-101', occurredAt: at('14', '08'), preparationNotes: 'Fabricated notes: synthetic routine chemistry worksheet SYNTHETIC-WS-001 prepared from synthetic run data.' },
        { eventId: 'SYNTHETIC-WS-001-EVT-2', worksheetId: 'SYNTHETIC-WS-001', tenantId: TENANT_ID, kind: 'verify', actorRole: 'verifier', actorId: 'SYNTHETIC-ACTOR-102', occurredAt: at('14', '09'), verificationNotes: 'Fabricated notes: independent second-person review of synthetic worksheet SYNTHETIC-WS-001 completed.' },
        { eventId: 'SYNTHETIC-WS-001-EVT-3', worksheetId: 'SYNTHETIC-WS-001', tenantId: TENANT_ID, kind: 'lock', actorRole: 'verifier', actorId: 'SYNTHETIC-ACTOR-102', occurredAt: at('14', '10') },
      ],
    },
    {
      // Verification attempted by the same actor who prepared: blocked on self-verification-rejected.
      context: { tenantId: TENANT_ID, worksheetId: 'SYNTHETIC-WS-002', worksheetType: 'routine_chemistry' },
      events: [
        { eventId: 'SYNTHETIC-WS-002-EVT-1', worksheetId: 'SYNTHETIC-WS-002', tenantId: TENANT_ID, kind: 'prepare', actorRole: 'preparer', actorId: 'SYNTHETIC-ACTOR-103', occurredAt: at('15', '08'), preparationNotes: 'Fabricated notes: synthetic routine chemistry worksheet SYNTHETIC-WS-002 prepared from synthetic run data.' },
        { eventId: 'SYNTHETIC-WS-002-EVT-2', worksheetId: 'SYNTHETIC-WS-002', tenantId: TENANT_ID, kind: 'verify', actorRole: 'verifier', actorId: 'SYNTHETIC-ACTOR-103', occurredAt: at('15', '09'), verificationNotes: 'Fabricated notes: same synthetic actor id attempting to verify their own preparation.' },
      ],
    },
    {
      // High-risk type: lock attempted without sign-off, blocked on sign-off-required-for-high-risk.
      context: { tenantId: TENANT_ID, worksheetId: 'SYNTHETIC-WS-003', worksheetType: 'molecular_pathology' },
      events: [
        { eventId: 'SYNTHETIC-WS-003-EVT-1', worksheetId: 'SYNTHETIC-WS-003', tenantId: TENANT_ID, kind: 'prepare', actorRole: 'preparer', actorId: 'SYNTHETIC-ACTOR-104', occurredAt: at('16', '08'), preparationNotes: 'Fabricated notes: synthetic molecular pathology worksheet SYNTHETIC-WS-003 prepared from synthetic run data.' },
        { eventId: 'SYNTHETIC-WS-003-EVT-2', worksheetId: 'SYNTHETIC-WS-003', tenantId: TENANT_ID, kind: 'verify', actorRole: 'verifier', actorId: 'SYNTHETIC-ACTOR-105', occurredAt: at('16', '09'), verificationNotes: 'Fabricated notes: independent second-person review of synthetic worksheet SYNTHETIC-WS-003 completed.' },
        { eventId: 'SYNTHETIC-WS-003-EVT-3', worksheetId: 'SYNTHETIC-WS-003', tenantId: TENANT_ID, kind: 'lock', actorRole: 'verifier', actorId: 'SYNTHETIC-ACTOR-105', occurredAt: at('16', '10') },
      ],
    },
    {
      // Same high-risk type completed with sign-off and lock, then an edit attempted after lock: blocked on edit-rejected-worksheet-locked.
      context: { tenantId: TENANT_ID, worksheetId: 'SYNTHETIC-WS-004', worksheetType: 'molecular_pathology' },
      events: [
        { eventId: 'SYNTHETIC-WS-004-EVT-1', worksheetId: 'SYNTHETIC-WS-004', tenantId: TENANT_ID, kind: 'prepare', actorRole: 'preparer', actorId: 'SYNTHETIC-ACTOR-106', occurredAt: at('17', '08'), preparationNotes: 'Fabricated notes: synthetic molecular pathology worksheet SYNTHETIC-WS-004 prepared from synthetic run data.' },
        { eventId: 'SYNTHETIC-WS-004-EVT-2', worksheetId: 'SYNTHETIC-WS-004', tenantId: TENANT_ID, kind: 'verify', actorRole: 'verifier', actorId: 'SYNTHETIC-ACTOR-107', occurredAt: at('17', '09'), verificationNotes: 'Fabricated notes: independent second-person review of synthetic worksheet SYNTHETIC-WS-004 completed.' },
        { eventId: 'SYNTHETIC-WS-004-EVT-3', worksheetId: 'SYNTHETIC-WS-004', tenantId: TENANT_ID, kind: 'sign_off', actorRole: 'third_party_reviewer', actorId: 'SYNTHETIC-ACTOR-108', occurredAt: at('17', '10'), signOffNotes: 'Fabricated notes: synthetic third-party sign-off of high-risk worksheet SYNTHETIC-WS-004 completed.' },
        { eventId: 'SYNTHETIC-WS-004-EVT-4', worksheetId: 'SYNTHETIC-WS-004', tenantId: TENANT_ID, kind: 'lock', actorRole: 'verifier', actorId: 'SYNTHETIC-ACTOR-107', occurredAt: at('17', '11') },
        { eventId: 'SYNTHETIC-WS-004-EVT-5', worksheetId: 'SYNTHETIC-WS-004', tenantId: TENANT_ID, kind: 'edit', actorRole: 'preparer', actorId: 'SYNTHETIC-ACTOR-106', occurredAt: at('17', '12'), editDescription: 'Fabricated attempted edit after the synthetic worksheet was locked.' },
      ],
    },
  ];

  return { correctiveActions, worksheets };
}

export type PilotCorrectiveActionRow = {
  recordId: string;
  finalState: CorrectiveActionState;
  stepsApplied: number;
  rootCause: CorrectiveActionRootCause | null;
  blocked: boolean;
  blockCode: CorrectiveActionBlockCode | null;
  explanation: string;
};

export type PilotWorksheetRow = {
  worksheetId: string;
  worksheetType: WorksheetType;
  highRisk: boolean;
  finalState: WorksheetState;
  stepTrail: { kind: WorksheetEventKind; role: WorksheetActorRole }[];
  blocked: boolean;
  blockCode: WorksheetBlockCode | null;
  explanation: string;
};

export type PilotCapaWorksheetView = {
  correctiveActionRows: PilotCorrectiveActionRow[];
  worksheetRows: PilotWorksheetRow[];
  counts: { correctiveActionsBlocked: number; worksheetsBlocked: number };
};

/** Read-only synthetic evaluation of the real corrective-action and worksheet-verification state machines; no persistence. */
export function buildPilotCapaWorksheetView(): PilotCapaWorksheetView {
  const fixtures = createPilotCapaWorksheetFixtures();

  const correctiveActionRows: PilotCorrectiveActionRow[] = fixtures.correctiveActions.map(({ context, events }) => {
    const result = runCorrectiveActionWorkflow(context, events);
    const lastStep = result.steps.at(-1);
    const blockCode = lastStep && lastStep.allowed === false ? lastStep.blockCode : null;
    const proposeEvent = [...result.history].reverse().find((event) => event.kind === 'propose_action');
    const rootCause = (proposeEvent?.rootCause as CorrectiveActionRootCause | undefined) ?? null;
    return {
      recordId: context.recordId,
      finalState: result.finalState,
      stepsApplied: result.history.length,
      rootCause,
      blocked: result.blocked,
      blockCode,
      explanation: blockCode
        ? explainCorrectiveActionBlock(blockCode)
        : `No step was blocked; the fabricated record reached ${result.finalState}.`,
    };
  });

  const worksheetRows: PilotWorksheetRow[] = fixtures.worksheets.map(({ context, events }) => {
    const result = runWorksheetVerificationWorkflow(context, events);
    const lastStep = result.steps.at(-1);
    const blockCode = lastStep && lastStep.allowed === false ? lastStep.blockCode : null;
    const worksheetType = context.worksheetType as WorksheetType;
    return {
      worksheetId: context.worksheetId,
      worksheetType,
      highRisk: isHighRiskWorksheetType(worksheetType),
      finalState: result.finalState,
      stepTrail: events.map((event) => ({ kind: event.kind, role: event.actorRole })),
      blocked: result.blocked,
      blockCode,
      explanation: blockCode
        ? explainWorksheetVerificationBlock(blockCode)
        : `No step was blocked; the fabricated worksheet reached ${result.finalState}.`,
    };
  });

  return {
    correctiveActionRows,
    worksheetRows,
    counts: {
      correctiveActionsBlocked: correctiveActionRows.filter((row) => row.blocked).length,
      worksheetsBlocked: worksheetRows.filter((row) => row.blocked).length,
    },
  };
}
