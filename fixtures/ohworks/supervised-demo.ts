import type { DataClass, PrincipalContext } from '@/lib/bot/data-class';
import type { EvidenceRegistry, SourceRecord } from '@/lib/bot/source-registry';

export const OHWORKS_TENANT_ID = 'tenant-ohworks-supervised-demo';
export const OHWORKS_CORPUS_VERSION = 'ohworks-supervised-demo-corpus-v1';
export const OHWORKS_PARSER_VERSION = 'ow-parser-sim-v1';
export const OHWORKS_MAPPING_VERSION = 'ow-mapping-sim-v1';
export const ORCHIDLIVE_DISCOVERY_VERSION = 'orchidlive-discovery-sim-v1';

export type OHWorksRoleViewId = 'worker' | 'employer' | 'reviewer' | 'admin';
export type WorkflowState =
  | 'Accessioned'
  | 'Queued'
  | 'Instrument result'
  | 'Quarantined'
  | 'Technical review'
  | 'Released';

export type WorkflowEventKind = 'queue' | 'instrument_ingest' | 'technical_review' | 'release';
export type IngestDisposition = 'structured_result' | 'unknown_mapping' | 'malformed_message';

export interface OHWorksRoleView {
  id: OHWorksRoleViewId;
  label: string;
  note: string;
  principalRole: PrincipalContext['role'];
  subjectId: string;
  allowedDataClasses: DataClass[];
}

export interface WorkflowStageDefinition {
  name: WorkflowState;
  owner: string;
  control: string;
}

export interface WorkflowEvent {
  id: string;
  sampleId: string;
  workflowRecordId: string;
  kind: WorkflowEventKind;
  at: string;
  actorId: string;
  actorRole: PrincipalContext['role'] | 'system';
  note: string;
  authorized?: boolean;
  reviewReferenceId?: string;
  messageSourceId?: string;
  parserVersionId?: string;
  mappingVersionId?: string;
  ingestDisposition?: IngestDisposition;
}

export interface WorkflowAnalyte {
  code: string;
  label: string;
  value: string;
  units: string;
  flag: 'none' | 'present' | 'review';
}

export interface WorkflowCase {
  recordId: string;
  sampleId: string;
  orderId: string;
  employeeReference: string;
  panel: string;
  matrix: string;
  receivedAt: string;
  instrumentLabel: string;
  expectedState: WorkflowState;
  initialState: 'Accessioned';
  employerOutcome: string;
  reviewSummary: string;
  analytes: readonly WorkflowAnalyte[];
  events: readonly WorkflowEvent[];
}

export interface AssistantKnowledgeRecord {
  id: string;
  tenantId: string;
  dataClass: DataClass;
  mode: 'expert' | 'discovery';
  topic:
    | 'status'
    | 'results'
    | 'restricted_results'
    | 'release_controls'
    | 'role_visibility'
    | 'hypothesis'
    | 'supplier_questions'
    | 'topology'
    | 'unsafe_record'
    | 'pending_record';
  sourceId: string;
  sampleId?: string;
  answer: string;
}

export interface PersonnelFixture {
  id: string;
  tenantId: string;
  dataClass: DataClass;
  actorId: string;
  name: string;
  role: string;
  authorization: string;
  competency: string;
  nextReview: string;
}

export interface AuditFixture {
  id: string;
  tenantId: string;
  dataClass: DataClass;
  at: string;
  actorId: string;
  action: string;
  object: string;
  note: string;
}

export interface DiscoveryGate {
  id: string;
  area: string;
  question: string;
  owner: string;
}

export const roleViews: readonly OHWorksRoleView[] = [
  {
    id: 'worker',
    label: 'Receiving worker',
    note: 'Outcome-only operational queue. No review, release, or clinical detail.',
    principalRole: 'worker',
    subjectId: 'ohworks-actor-receiving-worker-001',
    allowedDataClasses: ['outcome_only'],
  },
  {
    id: 'employer',
    label: 'Employer sponsor',
    note: 'Outcome-only sponsor view. No analyte values, clinical flags, review, or release.',
    principalRole: 'employer',
    subjectId: 'ohworks-actor-employer-sponsor-001',
    allowedDataClasses: ['outcome_only'],
  },
  {
    id: 'reviewer',
    label: 'Technical reviewer',
    note: 'May review synthetic workflow details. Release still requires a distinct authorized event.',
    principalRole: 'quality',
    subjectId: 'ohworks-actor-technical-reviewer-001',
    allowedDataClasses: ['outcome_only', 'clinical_detail', 'admin'],
  },
  {
    id: 'admin',
    label: 'Admin observer',
    note: 'Read-only observer for synthetic admin, workflow, and clinical-detail records. No review or release.',
    principalRole: 'admin',
    subjectId: 'ohworks-actor-admin-observer-001',
    allowedDataClasses: ['outcome_only', 'clinical_detail', 'admin'],
  },
] as const;

export const workflowStages: readonly WorkflowStageDefinition[] = [
  {
    name: 'Accessioned',
    owner: 'Receiving worker',
    control: 'Synthetic accession record established before routing or instrument activity.',
  },
  {
    name: 'Queued',
    owner: 'Interface queue',
    control: 'Queued only after the synthetic order and tenant match are validated.',
  },
  {
    name: 'Instrument result',
    owner: 'Adapter simulator',
    control: 'Instrument ingestion can only create structured synthetic results when parser and mapping evidence are approved.',
  },
  {
    name: 'Quarantined',
    owner: 'Exception queue',
    control: 'Unknown mapping or malformed payload stops here. The demo never guesses.',
  },
  {
    name: 'Technical review',
    owner: 'Authorized reviewer',
    control: 'A distinct authorized review event is required before anything can move to release.',
  },
  {
    name: 'Released',
    owner: 'Authorized reviewer',
    control: 'Release is a separate event after technical review; worker and employer roles cannot perform it.',
  },
] as const;

export const evidenceRegistry: EvidenceRegistry = [
  {
    id: 'ohworks-evidence-workflow-001',
    status: 'approved',
    contentHash: '8f2c4ef11d862baf4d6ef91e0d8da523ec8f90b9bbff4a2f34de421dbf5a1a44',
    reviewer: 'qa.ops',
    reviewedAt: '2026-09-03T14:58:00Z',
  },
  {
    id: 'ohworks-evidence-policy-001',
    status: 'approved',
    contentHash: '6d9c14336f4508936b6024b93132937c5274d2494e92284712f6f61457d22f22',
    reviewer: 'qa.ops',
    reviewedAt: '2026-09-03T14:59:00Z',
  },
  {
    id: 'ohworks-evidence-orchidlive-001',
    status: 'approved',
    contentHash: 'cc8da5c01763dfeab8a4f9c30c971f4b5f7837253ec95bf2c328042f52a39022',
    reviewer: 'qa.ops',
    reviewedAt: '2026-09-03T15:00:00Z',
  },
  {
    id: 'ohworks-evidence-unsafe-001',
    status: 'approved',
    contentHash: '7b98ea4a7c69495e24d9e0dd97c9300d5ca04ce2a23bbd4ae4bfef40e1dc9ea0',
    reviewer: 'qa.ops',
    reviewedAt: '2026-09-03T15:01:00Z',
  },
] as const;

export const sourceRegistry: readonly SourceRecord[] = [
  {
    id: 'ohworks-source-workflow-001',
    rightsClass: 'ORIGINAL_INTERNAL',
    status: 'approved',
    rightsEvidence: {
      reference: 'docs/clients/ohworks/DEMO_CONTRACT.md#workflow-contract',
      reviewer: 'qa.ops',
      reviewedAt: '2026-09-03T15:02:00Z',
    },
    employerIpAttestation: true,
    evidenceRef: 'ohworks-evidence-workflow-001',
  },
  {
    id: 'ohworks-source-policy-001',
    rightsClass: 'ORIGINAL_INTERNAL',
    status: 'approved',
    rightsEvidence: {
      reference: 'docs/clients/ohworks/DEMO_CONTRACT.md#role-and-assistant-guardrails',
      reviewer: 'qa.ops',
      reviewedAt: '2026-09-03T15:03:00Z',
    },
    employerIpAttestation: true,
    evidenceRef: 'ohworks-evidence-policy-001',
  },
  {
    id: 'ohworks-source-orchidlive-001',
    rightsClass: 'ORIGINAL_INTERNAL',
    status: 'approved',
    rightsEvidence: {
      reference: 'docs/clients/ohworks/GARY_QUESTION_ANSWER_MATRIX.md#discovery-only-hypothesis',
      reviewer: 'qa.ops',
      reviewedAt: '2026-09-03T15:04:00Z',
    },
    employerIpAttestation: true,
    evidenceRef: 'ohworks-evidence-orchidlive-001',
  },
  {
    id: 'ohworks-source-unsafe-001',
    rightsClass: 'ORIGINAL_INTERNAL',
    status: 'approved',
    rightsEvidence: {
      reference: 'docs/clients/ohworks/CHANGE_LOG.md#2026-09-03--slice-s2-supervised-ohworks-demo',
      reviewer: 'qa.ops',
      reviewedAt: '2026-09-03T15:05:00Z',
    },
    employerIpAttestation: true,
    evidenceRef: 'ohworks-evidence-unsafe-001',
  },
  {
    id: 'ohworks-source-pending-001',
    rightsClass: 'PUBLIC_WEB_SUMMARY',
    status: 'pending',
    summaryWordCap: 25,
  },
] as const;

export const workflowCases: readonly WorkflowCase[] = [
  {
    recordId: 'ohworks-record-sample-001',
    sampleId: 'OW-SYN-S2-10060',
    orderId: 'OW-ORD-S2-10060',
    employeeReference: 'EMP-SYN-10060',
    panel: 'Synthetic pre-employment immunity panel',
    matrix: 'serum',
    receivedAt: '2026-09-03 08:45',
    instrumentLabel: 'Not yet routed',
    expectedState: 'Accessioned',
    initialState: 'Accessioned',
    employerOutcome: 'Synthetic accession accepted. Awaiting queue placement.',
    reviewSummary: 'No technical review exists because the sample has not entered ingestion.',
    analytes: [],
    events: [],
  },
  {
    recordId: 'ohworks-record-sample-002',
    sampleId: 'OW-SYN-S2-10061',
    orderId: 'OW-ORD-S2-10061',
    employeeReference: 'EMP-SYN-10061',
    panel: 'Synthetic occupational antibody screen',
    matrix: 'serum',
    receivedAt: '2026-09-03 08:52',
    instrumentLabel: 'Queued for simulator',
    expectedState: 'Queued',
    initialState: 'Accessioned',
    employerOutcome: 'Synthetic order validated and placed into the queue. No result has been ingested.',
    reviewSummary: 'Queued items cannot be reviewed or released.',
    analytes: [],
    events: [
      {
        id: 'ohworks-event-queue-10061',
        sampleId: 'OW-SYN-S2-10061',
        workflowRecordId: 'ohworks-record-sample-002',
        kind: 'queue',
        at: '2026-09-03T15:52:00Z',
        actorId: 'ohworks-actor-receiving-worker-001',
        actorRole: 'worker',
        note: 'Queued after tenant, sample, and order validation.',
      },
    ],
  },
  {
    recordId: 'ohworks-record-sample-003',
    sampleId: 'OW-SYN-S2-10062',
    orderId: 'OW-ORD-S2-10062',
    employeeReference: 'EMP-SYN-10062',
    panel: 'Synthetic immunity verification panel',
    matrix: 'serum',
    receivedAt: '2026-09-03 09:01',
    instrumentLabel: 'LIAISON XL hypothesis only',
    expectedState: 'Instrument result',
    initialState: 'Accessioned',
    employerOutcome: 'Synthetic result arrived and remains unreleased pending technical review.',
    reviewSummary: 'Instrument result exists, but no authorized technical-review event has occurred.',
    analytes: [
      {
        code: 'RUB-IGG',
        label: 'Rubella IgG',
        value: '61',
        units: 'IU/mL',
        flag: 'present',
      },
      {
        code: 'MEAS-IGG',
        label: 'Measles IgG',
        value: '4.2',
        units: 'AI',
        flag: 'present',
      },
    ],
    events: [
      {
        id: 'ohworks-event-queue-10062',
        sampleId: 'OW-SYN-S2-10062',
        workflowRecordId: 'ohworks-record-sample-003',
        kind: 'queue',
        at: '2026-09-03T16:01:00Z',
        actorId: 'ohworks-actor-receiving-worker-001',
        actorRole: 'worker',
        note: 'Queued after synthetic order validation.',
      },
      {
        id: 'ohworks-event-ingest-10062',
        sampleId: 'OW-SYN-S2-10062',
        workflowRecordId: 'ohworks-record-sample-003',
        kind: 'instrument_ingest',
        at: '2026-09-03T16:08:00Z',
        actorId: 'ohworks-actor-adapter-sim-001',
        actorRole: 'system',
        note: 'Synthetic parser and mapping both approved for the simulated payload.',
        messageSourceId: 'ohworks-message-source-10062',
        parserVersionId: OHWORKS_PARSER_VERSION,
        mappingVersionId: OHWORKS_MAPPING_VERSION,
        ingestDisposition: 'structured_result',
      },
    ],
  },
  {
    recordId: 'ohworks-record-sample-004',
    sampleId: 'OW-SYN-S2-10063',
    orderId: 'OW-ORD-S2-10063',
    employeeReference: 'EMP-SYN-10063',
    panel: 'Synthetic onboarding antibody screen',
    matrix: 'serum',
    receivedAt: '2026-09-03 09:09',
    instrumentLabel: 'Orchidlive simulator queue',
    expectedState: 'Quarantined',
    initialState: 'Accessioned',
    employerOutcome: 'Synthetic result quarantined. No mapping guess was made.',
    reviewSummary: 'Quarantined because the inbound code has no approved mapping.',
    analytes: [],
    events: [
      {
        id: 'ohworks-event-queue-10063',
        sampleId: 'OW-SYN-S2-10063',
        workflowRecordId: 'ohworks-record-sample-004',
        kind: 'queue',
        at: '2026-09-03T16:09:00Z',
        actorId: 'ohworks-actor-receiving-worker-001',
        actorRole: 'worker',
        note: 'Queued after synthetic order validation.',
      },
      {
        id: 'ohworks-event-ingest-10063',
        sampleId: 'OW-SYN-S2-10063',
        workflowRecordId: 'ohworks-record-sample-004',
        kind: 'instrument_ingest',
        at: '2026-09-03T16:17:00Z',
        actorId: 'ohworks-actor-adapter-sim-001',
        actorRole: 'system',
        note: 'Synthetic inbound code LIAISON-XL-UNKNOWN has no approved mapping.',
        messageSourceId: 'ohworks-message-source-10063',
        parserVersionId: OHWORKS_PARSER_VERSION,
        mappingVersionId: OHWORKS_MAPPING_VERSION,
        ingestDisposition: 'unknown_mapping',
      },
    ],
  },
  {
    recordId: 'ohworks-record-sample-005',
    sampleId: 'OW-SYN-S2-10064',
    orderId: 'OW-ORD-S2-10064',
    employeeReference: 'EMP-SYN-10064',
    panel: 'Synthetic immunity follow-up panel',
    matrix: 'serum',
    receivedAt: '2026-09-03 09:16',
    instrumentLabel: 'Orchidlive simulator queue',
    expectedState: 'Technical review',
    initialState: 'Accessioned',
    employerOutcome: 'Synthetic payload remains under technical review after quarantine handling.',
    reviewSummary: 'Quarantine was acknowledged by an authorized reviewer, but no release event exists.',
    analytes: [
      {
        code: 'VZV-IGG',
        label: 'Varicella IgG',
        value: '1.4',
        units: 'AI',
        flag: 'review',
      },
    ],
    events: [
      {
        id: 'ohworks-event-queue-10064',
        sampleId: 'OW-SYN-S2-10064',
        workflowRecordId: 'ohworks-record-sample-005',
        kind: 'queue',
        at: '2026-09-03T16:16:00Z',
        actorId: 'ohworks-actor-receiving-worker-001',
        actorRole: 'worker',
        note: 'Queued after synthetic order validation.',
      },
      {
        id: 'ohworks-event-ingest-10064',
        sampleId: 'OW-SYN-S2-10064',
        workflowRecordId: 'ohworks-record-sample-005',
        kind: 'instrument_ingest',
        at: '2026-09-03T16:25:00Z',
        actorId: 'ohworks-actor-adapter-sim-001',
        actorRole: 'system',
        note: 'Malformed synthetic payload quarantined before any structured result was accepted.',
        messageSourceId: 'ohworks-message-source-10064',
        parserVersionId: OHWORKS_PARSER_VERSION,
        mappingVersionId: OHWORKS_MAPPING_VERSION,
        ingestDisposition: 'malformed_message',
      },
      {
        id: 'ohworks-event-review-10064',
        sampleId: 'OW-SYN-S2-10064',
        workflowRecordId: 'ohworks-record-sample-005',
        kind: 'technical_review',
        at: '2026-09-03T16:37:00Z',
        actorId: 'ohworks-actor-technical-reviewer-001',
        actorRole: 'quality',
        note: 'Authorized reviewer documented the quarantine and required follow-up.',
        authorized: true,
      },
    ],
  },
  {
    recordId: 'ohworks-record-sample-006',
    sampleId: 'OW-SYN-S2-10065',
    orderId: 'OW-ORD-S2-10065',
    employeeReference: 'EMP-SYN-10065',
    panel: 'Synthetic release-ready serology panel',
    matrix: 'serum',
    receivedAt: '2026-09-03 09:24',
    instrumentLabel: 'LIAISON XL hypothesis only',
    expectedState: 'Released',
    initialState: 'Accessioned',
    employerOutcome: 'Synthetic result released after a distinct authorized technical review.',
    reviewSummary: 'Release references a separate authorized review event. No worker or employer action can release.',
    analytes: [
      {
        code: 'HEPB-IGG',
        label: 'Hepatitis B surface antibody',
        value: '32',
        units: 'mIU/mL',
        flag: 'present',
      },
      {
        code: 'MUMPS-IGG',
        label: 'Mumps IgG',
        value: '2.1',
        units: 'AI',
        flag: 'present',
      },
    ],
    events: [
      {
        id: 'ohworks-event-queue-10065',
        sampleId: 'OW-SYN-S2-10065',
        workflowRecordId: 'ohworks-record-sample-006',
        kind: 'queue',
        at: '2026-09-03T16:24:00Z',
        actorId: 'ohworks-actor-receiving-worker-001',
        actorRole: 'worker',
        note: 'Queued after synthetic order validation.',
      },
      {
        id: 'ohworks-event-ingest-10065',
        sampleId: 'OW-SYN-S2-10065',
        workflowRecordId: 'ohworks-record-sample-006',
        kind: 'instrument_ingest',
        at: '2026-09-03T16:31:00Z',
        actorId: 'ohworks-actor-adapter-sim-001',
        actorRole: 'system',
        note: 'Synthetic parser and mapping both approved for the simulated payload.',
        messageSourceId: 'ohworks-message-source-10065',
        parserVersionId: OHWORKS_PARSER_VERSION,
        mappingVersionId: OHWORKS_MAPPING_VERSION,
        ingestDisposition: 'structured_result',
      },
      {
        id: 'ohworks-event-review-10065',
        sampleId: 'OW-SYN-S2-10065',
        workflowRecordId: 'ohworks-record-sample-006',
        kind: 'technical_review',
        at: '2026-09-03T16:42:00Z',
        actorId: 'ohworks-actor-technical-reviewer-001',
        actorRole: 'quality',
        note: 'Authorized technical review documented release readiness in the synthetic queue.',
        authorized: true,
      },
      {
        id: 'ohworks-event-release-10065',
        sampleId: 'OW-SYN-S2-10065',
        workflowRecordId: 'ohworks-record-sample-006',
        kind: 'release',
        at: '2026-09-03T16:47:00Z',
        actorId: 'ohworks-actor-technical-reviewer-001',
        actorRole: 'quality',
        note: 'Release completed after the separate authorized technical review event.',
        authorized: true,
        reviewReferenceId: 'ohworks-event-review-10065',
      },
    ],
  },
] as const;

export const discoveryGates: readonly DiscoveryGate[] = [
  {
    id: 'ohworks-discovery-topology-001',
    area: 'Topology',
    question: 'Where would LIAISON XL, Orchidlive, and LIMS BOX each sit in the supported topology?',
    owner: 'Customer IT and supplier contacts',
  },
  {
    id: 'ohworks-discovery-transport-001',
    area: 'Protocol and transport',
    question: 'What protocol and transport are actually supported: ASTM, HL7, file drop, API, middleware, serial, or TCP?',
    owner: 'Supplier technical lead',
  },
  {
    id: 'ohworks-discovery-versions-001',
    area: 'Versions',
    question: 'What exact LIAISON XL software, Orchidlive version, and interface package are in scope?',
    owner: 'Customer lab lead and supplier contacts',
  },
  {
    id: 'ohworks-discovery-guide-001',
    area: 'Interface guide',
    question: 'Can the suppliers provide the current interface guide and field dictionary for the supported integration path?',
    owner: 'Supplier technical lead',
  },
  {
    id: 'ohworks-discovery-messages-001',
    area: 'Sample messages',
    question: 'Can we receive sanitized or synthetic sample messages for parser and mapping validation?',
    owner: 'Supplier technical lead',
  },
  {
    id: 'ohworks-discovery-test-env-001',
    area: 'Test environment',
    question: 'Is there a supplier-approved test environment or simulator with replay support?',
    owner: 'Supplier technical lead',
  },
  {
    id: 'ohworks-discovery-licensing-001',
    area: 'Licensing',
    question: 'Which licenses or support contracts govern Orchidlive access, message extraction, and interface changes?',
    owner: 'Customer sponsor',
  },
  {
    id: 'ohworks-discovery-sot-001',
    area: 'Source of truth',
    question: 'Which system is authoritative for orders, identifiers, released results, and amendments?',
    owner: 'Customer lab lead',
  },
  {
    id: 'ohworks-discovery-acks-001',
    area: 'Acknowledgements',
    question: 'What acknowledgement or confirmation messages exist between instrument, Orchidlive, and LIMS BOX?',
    owner: 'Supplier technical lead',
  },
  {
    id: 'ohworks-discovery-replay-001',
    area: 'Replay and error behavior',
    question: 'How are retries, duplicates, error queues, malformed payloads, and replays exposed or controlled?',
    owner: 'Supplier technical lead',
  },
  {
    id: 'ohworks-discovery-fields-001',
    area: 'Supported fields',
    question: 'Which result, flag, operator, QC, audit, and specimen fields are actually available on the supported path?',
    owner: 'Supplier technical lead',
  },
] as const;

export const assistantKnowledge: readonly AssistantKnowledgeRecord[] = [
  {
    id: 'ohworks-knowledge-status-10062',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'expert',
    topic: 'status',
    sampleId: 'OW-SYN-S2-10062',
    sourceId: 'ohworks-source-workflow-001',
    answer: 'OW-SYN-S2-10062 is in Instrument result. Synthetic demonstration data only. A structured synthetic result exists, but no technical-review release step has happened.',
  },
  {
    id: 'ohworks-knowledge-status-10063',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'expert',
    topic: 'status',
    sampleId: 'OW-SYN-S2-10063',
    sourceId: 'ohworks-source-workflow-001',
    answer: 'OW-SYN-S2-10063 is Quarantined. Synthetic demonstration data only. The simulator found no approved mapping and the workflow stayed fail-closed.',
  },
  {
    id: 'ohworks-knowledge-status-10065',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'expert',
    topic: 'status',
    sampleId: 'OW-SYN-S2-10065',
    sourceId: 'ohworks-source-workflow-001',
    answer: 'OW-SYN-S2-10065 is Released. Synthetic demonstration data only. Release occurred only after a distinct authorized technical-review event.',
  },
  {
    id: 'ohworks-knowledge-results-10062',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'clinical_detail',
    mode: 'expert',
    topic: 'results',
    sampleId: 'OW-SYN-S2-10062',
    sourceId: 'ohworks-source-workflow-001',
    answer: 'Fabricated analytes for OW-SYN-S2-10062: Rubella IgG 61 IU/mL, flag present; Measles IgG 4.2 AI, flag present. Synthetic demonstration data only.',
  },
  {
    id: 'ohworks-knowledge-results-10065',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'clinical_detail',
    mode: 'expert',
    topic: 'results',
    sampleId: 'OW-SYN-S2-10065',
    sourceId: 'ohworks-source-workflow-001',
    answer: 'Fabricated analytes for OW-SYN-S2-10065: Hepatitis B surface antibody 32 mIU/mL, flag present; Mumps IgG 2.1 AI, flag present. Synthetic demonstration data only.',
  },
  {
    id: 'ohworks-knowledge-restricted-results-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'expert',
    topic: 'restricted_results',
    sourceId: 'ohworks-source-policy-001',
    answer: 'This demo role is limited to fictional outcome-only data. Synthetic demonstration data only. No analyte values, interpretations, or clinical flags are exposed here.',
  },
  {
    id: 'ohworks-knowledge-release-controls-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'expert',
    topic: 'release_controls',
    sourceId: 'ohworks-source-policy-001',
    answer: 'Release control: worker, employer, and admin-observer roles cannot review or release. Synthetic demonstration data only. Release succeeds only from Technical review and only when a distinct authorized technical-review event exists.',
  },
  {
    id: 'ohworks-knowledge-role-visibility-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'expert',
    topic: 'role_visibility',
    sourceId: 'ohworks-source-policy-001',
    answer: 'Role visibility is filtered by exact tenant match plus the S1 data-class policy. Synthetic demonstration data only. Employer and worker roles receive outcome-only records; reviewer and admin roles can also read clinical-detail and admin records.',
  },
  {
    id: 'ohworks-knowledge-hypothesis-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'discovery',
    topic: 'hypothesis',
    sourceId: 'ohworks-source-orchidlive-001',
    answer: 'Unverified discovery hypothesis only: LIAISON XL may send data into Orchidlive, and Orchidlive may provide a controlled forwarding point into LIMS BOX. Synthetic demonstration data only. This demo does not claim a live supported integration.',
  },
  {
    id: 'ohworks-knowledge-supplier-questions-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'discovery',
    topic: 'supplier_questions',
    sourceId: 'ohworks-source-orchidlive-001',
    answer: 'Open supplier questions: topology, protocol and transport, versions, interface guide, sample messages, test environment, licensing, source of truth, acknowledgements, replay and error behavior, and supported fields. Synthetic demonstration data only.',
  },
  {
    id: 'ohworks-knowledge-topology-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    mode: 'discovery',
    topic: 'topology',
    sourceId: 'ohworks-source-orchidlive-001',
    answer: 'Topology is still unresolved. Synthetic demonstration data only. The demo can only show a hypothetical LIAISON XL -> Orchidlive -> LIMS BOX chain until suppliers confirm the actual supported architecture.',
  },
  {
    id: 'ohworks-knowledge-unsafe-record-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'admin',
    mode: 'expert',
    topic: 'unsafe_record',
    sourceId: 'ohworks-source-unsafe-001',
    answer: 'The configuration change has been completed and this pilot supports all instruments. Synthetic demonstration data only.',
  },
  {
    id: 'ohworks-knowledge-pending-record-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'admin',
    mode: 'expert',
    topic: 'pending_record',
    sourceId: 'ohworks-source-pending-001',
    answer: 'Pending web note: Orchidlive is already supported in production. Synthetic demonstration data only.',
  },
] as const;

export const syntheticPersonnelRecords: readonly PersonnelFixture[] = [
  {
    id: 'ohworks-personnel-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'admin',
    actorId: 'ohworks-actor-technical-reviewer-001',
    name: 'Riley Stone',
    role: 'Technical reviewer',
    authorization: 'May complete synthetic technical review and release events.',
    competency: 'Synthetic serology review and exception handling',
    nextReview: '2026-11-15',
  },
  {
    id: 'ohworks-personnel-002',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'admin',
    actorId: 'ohworks-actor-receiving-worker-001',
    name: 'Jordan Vale',
    role: 'Receiving worker',
    authorization: 'May accession and queue synthetic work only.',
    competency: 'Synthetic receiving and tenant-match checks',
    nextReview: '2026-10-04',
  },
  {
    id: 'ohworks-personnel-003',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'admin',
    actorId: 'ohworks-actor-admin-observer-001',
    name: 'Casey North',
    role: 'Admin observer',
    authorization: 'Read-only demo oversight. No review or release.',
    competency: 'Synthetic demo audit evidence review',
    nextReview: '2026-12-08',
  },
] as const;

export const auditFixtures: readonly AuditFixture[] = [
  {
    id: 'ohworks-audit-001',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'outcome_only',
    at: '2026-09-03 09:17',
    actorId: 'ohworks-actor-adapter-sim-001',
    action: 'Synthetic quarantine created',
    object: 'OW-SYN-S2-10063',
    note: 'Unknown mapping stopped in quarantine. No guess was made.',
  },
  {
    id: 'ohworks-audit-002',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'admin',
    at: '2026-09-03 09:37',
    actorId: 'ohworks-actor-technical-reviewer-001',
    action: 'Synthetic technical review recorded',
    object: 'OW-SYN-S2-10064',
    note: 'Authorized review acknowledged a malformed payload before any release path existed.',
  },
  {
    id: 'ohworks-audit-003',
    tenantId: OHWORKS_TENANT_ID,
    dataClass: 'admin',
    at: '2026-09-03 09:47',
    actorId: 'ohworks-actor-technical-reviewer-001',
    action: 'Synthetic release recorded',
    object: 'OW-SYN-S2-10065',
    note: 'Release referenced the distinct review event ohworks-event-review-10065.',
  },
] as const;
