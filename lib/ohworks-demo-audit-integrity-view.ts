import {
  GENESIS_PREVIOUS_HASH, hashAuditEntry, verifyAuditTrail,
  explainAuditTrailReason, explainAuditTrailNextAction,
  type AuditEntry, type AuditTrailSummary,
} from './ohworks-audit-trail';
import {
  evaluateRecordRetention, createRecordPurgeManifest, RecordRetentionError,
  explainRecordRetentionError, type RecordPurgeEntry, type RecordPurgeManifest,
  type RecordRetentionEvaluation, type RecordRetentionErrorCode,
} from './ohworks-record-retention';

export const DEMO_CURRENT_AT = '2026-09-19T12:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fresh, fabricated fixtures on every call; all periods are invented examples. */
export function createPilotAuditIntegrityFixtures() {
  const actions: Pick<AuditEntry, 'actorRole' | 'actionCode'>[] = [
    { actorRole: 'COLLECTOR', actionCode: 'SAMPLE_RECEIVED' },
    { actorRole: 'ANALYST', actionCode: 'RESULT_ENTERED' },
    { actorRole: 'QC_REVIEWER', actionCode: 'RESULT_REVIEWED' },
    { actorRole: 'ANALYST', actionCode: 'RESULT_AMENDED' },
    { actorRole: 'QC_REVIEWER', actionCode: 'RESULT_REVIEWED' },
    { actorRole: 'LAB_DIRECTOR', actionCode: 'REPORT_RELEASED' },
  ];
  const valid: AuditEntry[] = [];
  actions.forEach((action, index) => valid.push({
    ...action, sequence: index + 1,
    timestamp: `2026-09-18T0${index + 1}:00:00.000Z`,
    previousHash: index === 0 ? GENESIS_PREVIOUS_HASH : hashAuditEntry(valid[index - 1]),
  }));
  const copy = () => valid.map((entry) => ({ ...entry }));
  const tampered = copy();
  tampered[2].timestamp = '2026-09-18T03:30:00.000Z';
  const sequenceGap = copy();
  sequenceGap[2].sequence += 1;
  const disallowedRole = copy();
  disallowedRole[2].actorRole = 'COLLECTOR';
  const chains = [
    { label: 'Fabricated intact chain', entries: valid },
    { label: 'Fabricated timestamp alteration', entries: tampered },
    { label: 'Fabricated sequence gap', entries: sequenceGap },
    { label: 'Fabricated disallowed role action', entries: disallowedRole },
  ];
  const classes = ['QC_LOG', 'INSTRUMENT_MAINTENANCE', 'PERSONNEL_COMPETENCY', 'REPORT', 'AUDIT_TRAIL'];
  const periods = [30, 5, 5, 7, 40];
  const records: RecordPurgeEntry[] = classes.map((recordClass, index) => ({
    recordId: `SYNTHETIC-REC-${String(index + 1).padStart(3, '0')}`,
    creationDate: '2026-09-09T00:00:00.000Z',
    profile: { recordClass, retentionPeriodMs: periods[index] * DAY_MS, litigationHold: index === 2 },
  }));
  return { chains, records };
}

export type PilotAuditIntegrityView = {
  currentAt: string;
  chains: (AuditTrailSummary & {
    label: string;
    finalHashPreview: string | null;
    reason: string | null;
    nextAction: string | null;
  })[];
  records: {
    recordId: string;
    recordClass: string;
    evaluation: RecordRetentionEvaluation;
    wholeDays: number;
    dayDirection: 'remaining' | 'past retention end';
  }[];
  manifestPreview: RecordPurgeManifest;
  purgeAttempts: {
    recordIds: readonly string[];
    status: 'preview' | 'refused';
    code: RecordRetentionErrorCode | null;
    explanation: string;
  }[];
  counts: { brokenChains: number; recordsEligible: number; recordsHeld: number };
};

/** Pure read-only demonstration; manifests are returned, never executed. */
export function buildPilotAuditIntegrityView(): PilotAuditIntegrityView {
  const fixtures = createPilotAuditIntegrityFixtures();
  const chains = fixtures.chains.map(({ label, entries }) => {
    const result = verifyAuditTrail(entries);
    return {
      ...result, label, finalHashPreview: result.finalHash?.slice(0, 12) ?? null,
      reason: result.failure ? explainAuditTrailReason(result.failure.code) : null,
      nextAction: result.failure ? explainAuditTrailNextAction(result.failure.code) : null,
    };
  });
  const records = fixtures.records.map((record) => {
    const evaluation = evaluateRecordRetention(record.profile, record.creationDate, DEMO_CURRENT_AT);
    const delta = Date.parse(evaluation.retentionEndDate) - Date.parse(DEMO_CURRENT_AT);
    return {
      recordId: record.recordId, recordClass: record.profile.recordClass, evaluation,
      wholeDays: Math.floor(Math.abs(delta) / DAY_MS),
      dayDirection: delta > 0 ? 'remaining' as const : 'past retention end' as const,
    };
  });
  const eligible = fixtures.records.filter((_, index) => records[index].evaluation.status === 'eligible_for_purge');
  const held = fixtures.records.filter((_, index) => records[index].evaluation.status === 'held');
  const manifestPreview = createRecordPurgeManifest(eligible, DEMO_CURRENT_AT);
  const purgeAttempts: PilotAuditIntegrityView['purgeAttempts'] = [{
    recordIds: manifestPreview.recordIds, status: 'preview', code: null,
    explanation: 'Fabricated eligible records only. Preview only; nothing is purged or deleted.',
  }];
  const refusedEntries = [...eligible, ...held];
  try {
    createRecordPurgeManifest(refusedEntries, DEMO_CURRENT_AT);
  } catch (error) {
    if (!(error instanceof RecordRetentionError) || error.code !== 'purge-under-litigation-hold') throw error;
    purgeAttempts.push({
      recordIds: refusedEntries.map((entry) => entry.recordId), status: 'refused',
      code: error.code, explanation: explainRecordRetentionError(error.code),
    });
  }
  return {
    currentAt: DEMO_CURRENT_AT, chains, records, manifestPreview, purgeAttempts,
    counts: {
      brokenChains: chains.filter((chain) => chain.status === 'BROKEN').length,
      recordsEligible: eligible.length, recordsHeld: held.length,
    },
  };
}
