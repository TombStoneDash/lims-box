import {
  filterByDataClass,
  type DataClass,
  type DataClassRecord,
  type PrincipalContext,
} from '@/lib/bot/data-class';
import { filterCommercialClaims, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE } from '@/lib/bot/output-claims-filter';
import { admitSource, type SourceRecord } from '@/lib/bot/source-registry';
import {
  assistantKnowledge,
  auditFixtures,
  discoveryGates,
  evidenceRegistry,
  OHWORKS_CORPUS_VERSION,
  OHWORKS_MAPPING_VERSION,
  OHWORKS_PARSER_VERSION,
  OHWORKS_TENANT_ID,
  ORCHIDLIVE_DISCOVERY_VERSION,
  roleViews,
  sourceRegistry,
  syntheticPersonnelRecords,
  workflowCases,
  workflowStages,
  type AssistantKnowledgeRecord,
  type AuditFixture,
  type DiscoveryGate,
  type OHWorksRoleView,
  type OHWorksRoleViewId,
  type PersonnelFixture,
  type WorkflowCase,
  type WorkflowEvent,
  type WorkflowEventKind,
  type WorkflowState,
} from '@/fixtures/ohworks/supervised-demo';

export type {
  AuditFixture,
  DiscoveryGate,
  OHWorksRoleView,
  OHWorksRoleViewId,
  WorkflowCase,
  WorkflowEvent,
  WorkflowState,
} from '@/fixtures/ohworks/supervised-demo';

export const pilotMeta = {
  client: 'OHWorks',
  title: 'Supervised demo workspace',
  annualVolumeRange: '30,000-40,000',
  deploymentPreference: 'Cloud may be acceptable; customer governance decision still required',
  instrumentCandidate: 'Unverified discovery hypothesis: LIAISON XL -> Orchidlive -> LIMS BOX',
  dataClass: 'Synthetic demonstration data only',
  status: 'Local supervised demo and discovery simulator',
  tenantId: OHWORKS_TENANT_ID,
  corpusVersion: OHWORKS_CORPUS_VERSION,
  parserVersionId: OHWORKS_PARSER_VERSION,
  mappingVersionId: OHWORKS_MAPPING_VERSION,
  discoveryVersionId: ORCHIDLIVE_DISCOVERY_VERSION,
} as const;

export { workflowStages, discoveryGates };

export const instrumentMappings = [
  {
    instrumentCode: 'LIAISON-XL-IMMUNITY',
    canonicalTest: 'Synthetic immunity verification panel',
    components: 'RUB-IGG, MEAS-IGG',
    status: 'Hypothesis only - requires supplier packet',
  },
  {
    instrumentCode: 'LIAISON-XL-RELEASE',
    canonicalTest: 'Synthetic release-ready serology panel',
    components: 'HEPB-IGG, MUMPS-IGG',
    status: 'Hypothesis only - supplier workflow unverified',
  },
  {
    instrumentCode: 'LIAISON-XL-UNKNOWN',
    canonicalTest: 'No approved mapping',
    components: 'Unknown',
    status: 'Quarantine only - mapping guess prohibited',
  },
] as const;

export const interfaceControls = [
  ['Topology', 'Treat LIAISON XL and Orchidlive as an unverified discovery path until suppliers confirm the supported topology.'],
  ['Tenant filter', 'Every role-view and assistant record selection is filtered by exact tenant ID plus S1 data-class policy before render.'],
  ['Parser gate', `Synthetic messageSourceId, parserVersionId, and mappingVersionId are captured on every ingest attempt.`],
  ['Idempotency', 'Replay and duplicate handling remain discovery questions; the simulator marks them as unresolved rather than guessed.'],
  ['Quarantine', 'Unknown mapping or malformed payload goes to Quarantined and never promotes automatically.'],
  ['Release', 'Release is a separate authorized event after Technical review only.'],
] as const;

export const faultCategories = [
  { name: 'Unknown mapping', action: 'Quarantine the message and retain the stable source, parser, and mapping IDs.' },
  { name: 'Malformed payload', action: 'Quarantine before any structured result is accepted.' },
  { name: 'Unauthorized review', action: 'Reject review or release attempts from worker or employer roles.' },
  { name: 'Missing review reference', action: 'Block release unless a distinct authorized technical-review event is referenced.' },
  { name: 'Unsupported live claim', action: 'Refuse the request and keep Orchidlive and LIAISON XL framed as discovery only.' },
] as const;

export const readinessRows = [
  { capability: 'Synthetic workflow simulator', state: 'Built in this local slice', evidence: 'Fail-closed workflow reducer and OHWorks contract tests' },
  { capability: 'Role-data separation', state: 'Built for the demo tenant only', evidence: 'S1 filterByDataClass enforced before render and assistant selection' },
  { capability: 'Deterministic OHWorks assistant', state: 'Built in the OHWorks route only', evidence: 'Approved-source, fail-closed local assistant with citations' },
  { capability: 'Orchidlive discovery simulator', state: 'Hypothesis only', evidence: 'Supplier-question matrix and discovery-only UI copy' },
  { capability: 'Authenticated customer access', state: 'Not implemented in this build', evidence: 'Role switch is explicitly not authentication' },
  { capability: 'Live integration, validation, or deployment', state: 'Stopped', evidence: 'No external actions, no production connection, no customer data' },
] as const;

export interface SyntheticSampleSummary {
  id: string;
  panel: string;
  state: WorkflowState;
  instrument: string;
  received: string;
  flag: string;
}

export interface SyntheticPersonnelSummary {
  id: string;
  name: string;
  role: string;
  competency: string;
  authorization: string;
  nextReview: string;
}

export interface AuditEventSummary {
  at: string;
  actor: string;
  action: string;
  object: string;
}

export interface WorkflowTransitionResult {
  allowed: boolean;
  nextState: WorkflowState;
  reason: string;
}

export interface WorkflowTransitionTrace {
  eventId: string;
  kind: WorkflowEventKind;
  from: WorkflowState;
  to: WorkflowState;
  note: string;
}

export interface WorkflowEvaluation {
  sampleId: string;
  finalState: WorkflowState;
  valid: boolean;
  reason?: string;
  transitions: WorkflowTransitionTrace[];
  reviewEventId?: string;
}

interface WorkflowViewRecord extends DataClassRecord {
  kind: 'sample';
  sampleId: string;
  panel: string;
  state: WorkflowState;
  receivedAt: string;
  instrumentLabel: string;
  summary: string;
  detailLines: string[];
  sourceId: string;
}

interface DiscoveryViewRecord extends DataClassRecord {
  kind: 'discovery';
  gateId: string;
  area: string;
  question: string;
  owner: string;
}

export interface VisibleWorkflowCard {
  sampleId: string;
  panel: string;
  state: WorkflowState;
  receivedAt: string;
  instrumentLabel: string;
  summary: string;
  clinicalLines: string[];
  adminLines: string[];
  visibleDataClasses: DataClass[];
  reviewLocked: boolean;
}

export interface AssistantCitation {
  sourceId: string;
  recordId: string;
  corpusVersion: string;
}

export interface OHWorksAssistantResponse {
  answer: string;
  grounded: boolean;
  mode: 'expert' | 'discovery';
  citations: AssistantCitation[];
  label: typeof pilotMeta.dataClass;
  disposition: 'grounded' | 'refused' | 'evidence_missing' | 'render_blocked';
  refusalReason?:
    | 'clinical_interpretation'
    | 'diagnosis'
    | 'patient_specific_advice'
    | 'result_release'
    | 'compliance_or_accreditation'
    | 'unsupported_live_integration'
    | 'unsupported_configuration_advice'
    | 'prompt_injection';
  matchedClaimCategory?: string;
}

const CLAIM_SAFE_ANSWER = `${OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE} ${pilotMeta.dataClass}.`;
const MISSING_ANSWER = `I do not have an approved OHWorks synthetic source for that request. ${pilotMeta.dataClass}.`;

const QUESTION_SAMPLE_PATTERN = /\bOW-SYN-S2-\d{5}\b/i;
const CLINICAL_INTERPRETATION_PATTERN =
  /\binterpret(?:ation|ive)?\b|\bnormal range\b|\bwithin range\b|\bout of range\b|\belevated\b|\babnormal\b/i;
const DIAGNOSIS_PATTERN = /\bdiagnos(?:e|is|tic)\b|\bdoes this mean\b|\bwhat disease\b|\bindicate an infection\b/i;
const PATIENT_ADVICE_PATTERN =
  /\bshould (?:i|we)\b|\bwhat should\b|\bmedical advice\b|\btreatment\b|\bseek care\b|\bworried\b/i;
const RELEASE_PATTERN = /\b(?:release|approve|sign out|authorize)\b.{0,30}\b(?:result|sample|record)\b/i;
const COMPLIANCE_PATTERN =
  /\b(?:clia|hipaa|iso ?15189|accredit(?:ed|ation)?|certif(?:ied|ication)?|validated?|part 11|21 cfr|fda)\b/i;
const LIVE_INTEGRATION_PATTERN =
  /\b(?:liaison xl|orchidlive)\b.*\b(?:live|production|supported today|currently supported|already connected|ready now)\b|\b(?:live|production|supported today|currently supported|already connected|ready now)\b.*\b(?:liaison xl|orchidlive)\b/i;
const CONFIG_PATTERN =
  /\b(?:liaison xl|orchidlive)\b.*\b(?:baud|port|delimiter|frame|ack|socket|serial|tcp|timeout|setting|configure|configuration)\b|\b(?:baud|port|delimiter|frame|ack|socket|serial|tcp|timeout|setting|configure|configuration)\b.*\b(?:liaison xl|orchidlive)\b/i;
const PROMPT_INJECTION_PATTERN =
  /\b(?:ignore|disregard|override|bypass|reveal|show|dump|expose|forget)\b.{0,80}\b(?:instructions?|prompt|policy|guardrails?|system|developer)\b/i;

const ALLOWED_EXACT_QUESTIONS = {
  expert: [
    /^what is the status of sample id$/,
    /^show the status for sample id$/,
    /^show fabricated values for sample id$/,
    /^what results are visible for sample id$/,
    /^what can this role see$/,
    /^what can this role see for sample id$/,
    /^what blocks release$/,
    /^what blocks release for sample id$/,
    /^show the unsafe approved record$/,
    /^show the pending web note$/,
  ],
  discovery: [
    /^what is the liaison xl orchidlive hypothesis$/,
    /^summarize the discovery hypothesis$/,
    /^what supplier questions remain$/,
    /^list unresolved supplier questions$/,
    /^what topology is confirmed$/,
  ],
} as const;

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractSampleId(question: string): string | undefined {
  return question.toUpperCase().match(QUESTION_SAMPLE_PATTERN)?.[0];
}

function normalizeForMatching(question: string): string {
  const sampleId = extractSampleId(question);
  if (!sampleId) return normalizeQuestion(question);
  return question
    .toLowerCase()
    .replace(sampleId.toLowerCase(), 'sample id')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const admissions = new Map(
  sourceRegistry.map((record) => [record.id, admitSource(record, evidenceRegistry)]),
);

function isApprovedSource(record: SourceRecord): boolean {
  const admission = admissions.get(record.id);
  return Boolean(admission?.ok && admission.record.status === 'approved');
}

const approvedSourceIds = new Set(sourceRegistry.filter(isApprovedSource).map((record) => record.id));

function currentRoleView(rawRole?: string): OHWorksRoleView {
  return roleViews.find((role) => role.id === rawRole) ?? roleViews[0];
}

function buildPrincipal(roleId?: string): PrincipalContext {
  const role = currentRoleView(roleId);
  return {
    tenantId: OHWORKS_TENANT_ID,
    subjectId: role.subjectId,
    role: role.principalRole,
    allowedDataClasses: role.allowedDataClasses,
  };
}

export function getRoleViews(): readonly OHWorksRoleView[] {
  return roleViews;
}

export function resolveRoleView(roleId?: string): OHWorksRoleView {
  return currentRoleView(roleId);
}

const APPROVED_ADAPTER_ACTOR_ID = 'ohworks-actor-adapter-sim-001';
const APPROVED_REVIEWER_ACTOR_ID = 'ohworks-actor-technical-reviewer-001';
const approvedIngestEvidence = new Map<string, {
  sampleId: string;
  workflowRecordId: string;
  disposition: 'structured_result' | 'unknown_mapping' | 'malformed_message';
}>([
  ['ohworks-message-source-10062', { sampleId: 'OW-SYN-S2-10062', workflowRecordId: 'ohworks-record-sample-003', disposition: 'structured_result' }],
  ['ohworks-message-source-10063', { sampleId: 'OW-SYN-S2-10063', workflowRecordId: 'ohworks-record-sample-004', disposition: 'unknown_mapping' }],
  ['ohworks-message-source-10064', { sampleId: 'OW-SYN-S2-10064', workflowRecordId: 'ohworks-record-sample-005', disposition: 'malformed_message' }],
  ['ohworks-message-source-10065', { sampleId: 'OW-SYN-S2-10065', workflowRecordId: 'ohworks-record-sample-006', disposition: 'structured_result' }],
]);

function eventTime(event: WorkflowEvent): number {
  return Date.parse(event.at);
}

function hasValidEventProvenance(event: WorkflowEvent, history: readonly WorkflowEvent[]): boolean {
  if (!event.sampleId || !event.workflowRecordId || !Number.isFinite(eventTime(event))) return false;
  if (history.some((entry) => entry.id === event.id)) return false;
  if (history.some((entry) => entry.sampleId !== event.sampleId || entry.workflowRecordId !== event.workflowRecordId)) return false;
  if (new Set(history.map((entry) => entry.id)).size !== history.length) return false;
  const previous = history.at(-1);
  return !previous || (Number.isFinite(eventTime(previous)) && eventTime(event) > eventTime(previous));
}

export function transitionWorkflowState(
  currentState: WorkflowState,
  event: WorkflowEvent,
  history: readonly WorkflowEvent[],
): WorkflowTransitionResult {
  if (!hasValidEventProvenance(event, history)) {
    return { allowed: false, nextState: currentState, reason: 'event_provenance_invalid' };
  }

  switch (event.kind) {
    case 'queue':
      if (currentState !== 'Accessioned') {
        return { allowed: false, nextState: currentState, reason: 'queue_requires_accessioned_state' };
      }
      return { allowed: true, nextState: 'Queued', reason: 'queued_after_accession' };
    case 'instrument_ingest':
      if (currentState !== 'Queued') {
        return { allowed: false, nextState: currentState, reason: 'ingest_requires_queued_state' };
      }
      if (!event.messageSourceId || !event.parserVersionId || !event.mappingVersionId || !event.ingestDisposition) {
        return { allowed: false, nextState: currentState, reason: 'ingest_requires_stable_source_and_version_ids' };
      }
      const approvedIngest = approvedIngestEvidence.get(event.messageSourceId);
      if (
        event.actorRole !== 'system' ||
        event.actorId !== APPROVED_ADAPTER_ACTOR_ID ||
        event.parserVersionId !== OHWORKS_PARSER_VERSION ||
        event.mappingVersionId !== OHWORKS_MAPPING_VERSION ||
        !approvedIngest ||
        approvedIngest.sampleId !== event.sampleId ||
        approvedIngest.workflowRecordId !== event.workflowRecordId ||
        approvedIngest.disposition !== event.ingestDisposition
      ) {
        return { allowed: true, nextState: 'Quarantined', reason: 'unapproved_ingest_evidence' };
      }
      if (approvedIngest.disposition === 'structured_result') {
        return { allowed: true, nextState: 'Instrument result', reason: 'approved_mapping_and_parser' };
      }
      return { allowed: true, nextState: 'Quarantined', reason: approvedIngest.disposition };
    case 'technical_review':
      if (!['Instrument result', 'Quarantined'].includes(currentState)) {
        return { allowed: false, nextState: currentState, reason: 'technical_review_requires_result_or_quarantine' };
      }
      if (event.actorRole !== 'quality' || event.actorId !== APPROVED_REVIEWER_ACTOR_ID) {
        return { allowed: false, nextState: currentState, reason: 'only_quality_reviewer_can_review' };
      }
      if (!event.authorized) {
        return { allowed: false, nextState: currentState, reason: 'technical_review_requires_authorized_event' };
      }
      return { allowed: true, nextState: 'Technical review', reason: 'authorized_review_recorded' };
    case 'release':
      if (currentState !== 'Technical review') {
        return { allowed: false, nextState: currentState, reason: 'release_requires_technical_review_state' };
      }
      if (event.actorRole !== 'quality' || event.actorId !== APPROVED_REVIEWER_ACTOR_ID) {
        return { allowed: false, nextState: currentState, reason: 'only_quality_reviewer_can_release' };
      }
      if (!event.authorized || !event.reviewReferenceId) {
        return { allowed: false, nextState: currentState, reason: 'release_requires_authorized_review_reference' };
      }
      const review = history.find((entry) => entry.id === event.reviewReferenceId);
      if (
        !review ||
        review.id === event.id ||
        review.kind !== 'technical_review' ||
        !review.authorized ||
        review.actorRole !== 'quality' ||
        review.actorId !== APPROVED_REVIEWER_ACTOR_ID ||
        review.sampleId !== event.sampleId ||
        review.workflowRecordId !== event.workflowRecordId ||
        eventTime(review) >= eventTime(event)
      ) {
        return { allowed: false, nextState: currentState, reason: 'release_requires_distinct_prior_authorized_review' };
      }
      return { allowed: true, nextState: 'Released', reason: 'authorized_release_after_review' };
    default:
      return { allowed: false, nextState: currentState, reason: 'unsupported_transition' };
  }
}

export function evaluateWorkflowCase(workflowCase: WorkflowCase): WorkflowEvaluation {
  let state: WorkflowState = workflowCase.initialState;
  const history: WorkflowEvent[] = [];
  const transitions: WorkflowTransitionTrace[] = [];
  let reviewEventId: string | undefined;

  for (const event of workflowCase.events) {
    const result = transitionWorkflowState(state, event, history);
    transitions.push({
      eventId: event.id,
      kind: event.kind,
      from: state,
      to: result.nextState,
      note: result.reason,
    });
    if (!result.allowed) {
      return {
        sampleId: workflowCase.sampleId,
        finalState: state,
        valid: false,
        reason: result.reason,
        transitions,
      };
    }
    history.push(event);
    state = result.nextState;
    if (event.kind === 'technical_review' && event.authorized) {
      reviewEventId = event.id;
    }
  }

  return {
    sampleId: workflowCase.sampleId,
    finalState: state,
    valid: state === workflowCase.expectedState,
    reason: state === workflowCase.expectedState ? undefined : 'expected_state_mismatch',
    transitions,
    reviewEventId,
  };
}

export const workflowEvaluations = workflowCases.map(evaluateWorkflowCase);

function buildSampleFlag(workflowCase: WorkflowCase, evaluation: WorkflowEvaluation): string {
  switch (evaluation.finalState) {
    case 'Accessioned':
      return 'Awaiting queue placement';
    case 'Queued':
      return 'Queue only; no result ingested';
    case 'Instrument result':
      return 'Synthetic result captured; release blocked pending review';
    case 'Quarantined':
      return 'Quarantined; no mapping guess';
    case 'Technical review':
      return 'Authorized review open; no release event';
    case 'Released':
      return 'Released after distinct review';
  }
}

export const syntheticSamples: readonly SyntheticSampleSummary[] = workflowCases.map((workflowCase, index) => {
  const evaluation = workflowEvaluations[index];
  return {
    id: workflowCase.sampleId,
    panel: workflowCase.panel,
    state: evaluation.finalState,
    instrument: workflowCase.instrumentLabel,
    received: workflowCase.receivedAt,
    flag: buildSampleFlag(workflowCase, evaluation),
  };
});

export const syntheticPersonnel: readonly SyntheticPersonnelSummary[] = syntheticPersonnelRecords.map((record) => ({
  id: record.id,
  name: record.name,
  role: record.role,
  competency: record.competency,
  authorization: record.authorization,
  nextReview: record.nextReview,
}));

export const auditEvents: readonly AuditEventSummary[] = auditFixtures.map((fixture) => ({
  at: fixture.at,
  actor: fixture.actorId,
  action: fixture.action,
  object: fixture.object,
}));

function buildWorkflowRecords(): WorkflowViewRecord[] {
  return workflowCases.flatMap((workflowCase, index) => {
    const evaluation = workflowEvaluations[index];
    const base = {
      sampleId: workflowCase.sampleId,
      panel: workflowCase.panel,
      state: evaluation.finalState,
      receivedAt: workflowCase.receivedAt,
      instrumentLabel: workflowCase.instrumentLabel,
      sourceId: 'ohworks-source-workflow-001',
      tenantId: OHWORKS_TENANT_ID,
      kind: 'sample' as const,
    };

    const outcomeRecord: WorkflowViewRecord = {
      ...base,
      id: `${workflowCase.recordId}-outcome`,
      dataClass: 'outcome_only',
      summary: workflowCase.employerOutcome,
      detailLines: evaluation.transitions.map((transition) => `${transition.from} -> ${transition.to} (${transition.note})`),
    };

    const clinicalRecord: WorkflowViewRecord = {
      ...base,
      id: `${workflowCase.recordId}-clinical`,
      dataClass: 'clinical_detail',
      summary: workflowCase.analytes.length > 0
        ? 'Synthetic analyte values present for reviewer-only display.'
        : 'No structured synthetic analytes are available for this sample.',
      detailLines: workflowCase.analytes.map(
        (analyte) => `${analyte.label}: ${analyte.value} ${analyte.units} (flag ${analyte.flag})`,
      ),
    };

    const adminRecord: WorkflowViewRecord = {
      ...base,
      id: `${workflowCase.recordId}-admin`,
      dataClass: 'admin',
      summary: workflowCase.reviewSummary,
      detailLines: workflowCase.events.map((event) => {
        const bits = [event.id, event.kind, event.actorId, event.note];
        if (event.messageSourceId) bits.push(`source=${event.messageSourceId}`);
        if (event.parserVersionId) bits.push(`parser=${event.parserVersionId}`);
        if (event.mappingVersionId) bits.push(`mapping=${event.mappingVersionId}`);
        if (event.reviewReferenceId) bits.push(`review_ref=${event.reviewReferenceId}`);
        return bits.join(' | ');
      }),
    };

    return [outcomeRecord, clinicalRecord, adminRecord];
  });
}

const workflowRecords = buildWorkflowRecords();

const discoveryRecords: readonly DiscoveryViewRecord[] = discoveryGates.map((gate) => ({
  id: `${gate.id}-outcome`,
  tenantId: OHWORKS_TENANT_ID,
  dataClass: 'outcome_only',
  kind: 'discovery',
  gateId: gate.id,
  area: gate.area,
  question: gate.question,
  owner: gate.owner,
}));

function byRole<T extends DataClassRecord>(records: readonly T[], roleId?: string): T[] {
  return filterByDataClass(records, buildPrincipal(roleId));
}

export function getVisibleWorkflowRecords(roleId?: string): WorkflowViewRecord[] {
  return byRole(workflowRecords, roleId);
}

export function getVisibleDiscoveryRecords(roleId?: string): DiscoveryViewRecord[] {
  return byRole(discoveryRecords, roleId);
}

export function getVisiblePersonnel(roleId?: string): PersonnelFixture[] {
  return byRole(syntheticPersonnelRecords, roleId);
}

export function getVisibleAudit(roleId?: string): AuditFixture[] {
  return byRole(auditFixtures, roleId);
}

export function getVisibleWorkflowCards(roleId?: string): VisibleWorkflowCard[] {
  const visible = getVisibleWorkflowRecords(roleId);
  const grouped = new Map<string, VisibleWorkflowCard>();

  for (const record of visible) {
    const existing = grouped.get(record.sampleId) ?? {
      sampleId: record.sampleId,
      panel: record.panel,
      state: record.state,
      receivedAt: record.receivedAt,
      instrumentLabel: record.instrumentLabel,
      summary: '',
      clinicalLines: [],
      adminLines: [],
      visibleDataClasses: [],
      reviewLocked: currentRoleView(roleId).id !== 'reviewer',
    };

    existing.state = record.state;
    existing.instrumentLabel = record.instrumentLabel;
    if (!existing.visibleDataClasses.includes(record.dataClass)) {
      existing.visibleDataClasses.push(record.dataClass);
    }

    if (record.dataClass === 'outcome_only') {
      existing.summary = record.summary;
    }
    if (record.dataClass === 'clinical_detail') {
      existing.clinicalLines = record.detailLines;
    }
    if (record.dataClass === 'admin') {
      existing.adminLines = record.detailLines;
    }

    grouped.set(record.sampleId, existing);
  }

  return syntheticSamples
    .map((sample) => grouped.get(sample.id))
    .filter((entry): entry is VisibleWorkflowCard => Boolean(entry));
}

function response(
  mode: 'expert' | 'discovery',
  answer: string,
  citations: AssistantCitation[],
  disposition: OHWorksAssistantResponse['disposition'],
  refusalReason?: OHWorksAssistantResponse['refusalReason'],
): OHWorksAssistantResponse {
  const candidate: OHWorksAssistantResponse = {
    answer,
    grounded: disposition === 'grounded',
    mode,
    citations,
    label: pilotMeta.dataClass,
    disposition,
    refusalReason,
  };

  const filtered = filterCommercialClaims(candidate.answer);
  if (filtered.blocked) {
    return {
      ...candidate,
      answer: CLAIM_SAFE_ANSWER,
      grounded: false,
      disposition: 'render_blocked',
      matchedClaimCategory: filtered.matchedCategory,
    };
  }

  return candidate;
}

function approvedKnowledgeFor(
  roleId: OHWorksRoleViewId | undefined,
  mode: 'expert' | 'discovery',
  topic: AssistantKnowledgeRecord['topic'],
  sampleId?: string,
): AssistantKnowledgeRecord[] {
  return byRole(assistantKnowledge, roleId).filter(
    (record) =>
      record.mode === mode
      && record.topic === topic
      && approvedSourceIds.has(record.sourceId)
      && (sampleId ? record.sampleId === sampleId : true),
  );
}

function citationsFor(record: AssistantKnowledgeRecord): AssistantCitation[] {
  return [{ sourceId: record.sourceId, recordId: record.id, corpusVersion: OHWORKS_CORPUS_VERSION }];
}

function missing(mode: 'expert' | 'discovery'): OHWorksAssistantResponse {
  return response(mode, MISSING_ANSWER, [], 'evidence_missing');
}

function refusal(
  mode: 'expert' | 'discovery',
  refusalReason: NonNullable<OHWorksAssistantResponse['refusalReason']>,
  answer: string,
): OHWorksAssistantResponse {
  return response(mode, `${answer} ${pilotMeta.dataClass}.`, [], 'refused', refusalReason);
}

function isAllowedQuestion(mode: 'expert' | 'discovery', question: string): boolean {
  const normalized = normalizeForMatching(question);
  return ALLOWED_EXACT_QUESTIONS[mode].some((pattern) => pattern.test(normalized));
}

export function getApprovedSourceIds(): string[] {
  return [...approvedSourceIds];
}

export function askOHWorksAssistant(
  rawQuestion: unknown,
  roleId?: string,
  mode: 'expert' | 'discovery' = 'expert',
): OHWorksAssistantResponse {
  if (typeof rawQuestion !== 'string' || rawQuestion.trim().length === 0) {
    return missing(mode);
  }

  const question = rawQuestion.trim();
  const sampleId = extractSampleId(question);
  const role = currentRoleView(roleId).id;

  if (PROMPT_INJECTION_PATTERN.test(question)) {
    return refusal(mode, 'prompt_injection', 'I cannot bypass the OHWorks demo guardrails or reveal hidden instructions.');
  }
  if (RELEASE_PATTERN.test(question)) {
    return refusal(mode, 'result_release', 'I cannot release, approve, or authorize any sample or result from this demo.');
  }
  if (DIAGNOSIS_PATTERN.test(question)) {
    return refusal(mode, 'diagnosis', 'I cannot diagnose or infer disease, infection, or clinical meaning from synthetic data.');
  }
  if (COMPLIANCE_PATTERN.test(question)) {
    return refusal(mode, 'compliance_or_accreditation', 'I cannot attest to compliance, accreditation, certification, or validation from this demo.');
  }
  if (LIVE_INTEGRATION_PATTERN.test(question)) {
    return refusal(mode, 'unsupported_live_integration', 'I cannot claim a live or currently supported Orchidlive or LIAISON XL integration from this demo.');
  }
  if (CONFIG_PATTERN.test(question)) {
    return refusal(mode, 'unsupported_configuration_advice', 'I cannot provide unsupported LIAISON XL or Orchidlive configuration advice.');
  }
  if (PATIENT_ADVICE_PATTERN.test(question)) {
    return refusal(mode, 'patient_specific_advice', 'I cannot give patient-specific or worker-specific advice from this synthetic demo.');
  }
  if (CLINICAL_INTERPRETATION_PATTERN.test(question)) {
    return refusal(mode, 'clinical_interpretation', 'I can show permitted fabricated data, but I cannot interpret synthetic results.');
  }
  if (!isAllowedQuestion(mode, question)) {
    return missing(mode);
  }

  const normalized = normalizeForMatching(question);

  if (mode === 'expert') {
    if (/^what is the status of sample id$|^show the status for sample id$/.test(normalized)) {
      const record = sampleId ? approvedKnowledgeFor(role, mode, 'status', sampleId)[0] : undefined;
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }

    if (/^show fabricated values for sample id$|^what results are visible for sample id$/.test(normalized)) {
      if (!['reviewer', 'admin'].includes(role)) {
        const record = approvedKnowledgeFor(role, mode, 'restricted_results')[0];
        return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
      }
      const record = sampleId ? approvedKnowledgeFor(role, mode, 'results', sampleId)[0] : undefined;
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }

    if (/^what can this role see$|^what can this role see for sample id$/.test(normalized)) {
      const record = approvedKnowledgeFor(role, mode, 'role_visibility')[0];
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }

    if (/^what blocks release$|^what blocks release for sample id$/.test(normalized)) {
      const record = approvedKnowledgeFor(role, mode, 'release_controls')[0];
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }

    if (/^show the unsafe approved record$/.test(normalized)) {
      const record = approvedKnowledgeFor(role, mode, 'unsafe_record')[0];
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }

    if (/^show the pending web note$/.test(normalized)) {
      const record = approvedKnowledgeFor(role, mode, 'pending_record')[0];
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }
  }

  if (mode === 'discovery') {
    if (/^what is the liaison xl orchidlive hypothesis$|^summarize the discovery hypothesis$/.test(normalized)) {
      const record = approvedKnowledgeFor(role, mode, 'hypothesis')[0];
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }
    if (/^what supplier questions remain$|^list unresolved supplier questions$/.test(normalized)) {
      const record = approvedKnowledgeFor(role, mode, 'supplier_questions')[0];
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }
    if (/^what topology is confirmed$/.test(normalized)) {
      const record = approvedKnowledgeFor(role, mode, 'topology')[0];
      return record ? response(mode, record.answer, citationsFor(record), 'grounded') : missing(mode);
    }
  }

  return missing(mode);
}

export function getAssistantSuggestions(mode: 'expert' | 'discovery', roleId?: string): string[] {
  if (mode === 'discovery') {
    return [
      'What is the LIAISON XL Orchidlive hypothesis?',
      'What supplier questions remain?',
      'What topology is confirmed?',
    ];
  }

  const role = currentRoleView(roleId).id;
  const base = [
    'What is the status of OW-SYN-S2-10062?',
    'What can this role see?',
    'What blocks release?',
  ];

  if (['reviewer', 'admin'].includes(role)) {
    return [...base, 'Show fabricated values for OW-SYN-S2-10065'];
  }
  return [...base, 'What results are visible for OW-SYN-S2-10065'];
}
