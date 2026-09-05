import type { AuditRecord, InstrumentRecord, ResultValue, SampleAction, SampleRecord, SampleState, TenantPrincipal } from '@/lib/ohworks-tenant/model';
import { TEST_TENANT_ID } from '@/lib/ohworks-tenant/model';
import { createSenaiteClient, type SenaiteClient, type SenaiteRecord } from './client';

type ActionMapping = { resource: 'analysisrequest'; transition: string; expectedState: string };
type ActionConfiguration = Record<SampleAction, ActionMapping>;

const ACTION_MAPPINGS: Readonly<ActionConfiguration> = Object.freeze({
  queue: Object.freeze({ resource: 'analysisrequest', transition: 'assign', expectedState: 'assigned' }),
  request_retest: Object.freeze({ resource: 'analysisrequest', transition: 'retract', expectedState: 'to_be_verified' }),
  quarantine: Object.freeze({ resource: 'analysisrequest', transition: 'reject', expectedState: 'rejected' }),
  reject: Object.freeze({ resource: 'analysisrequest', transition: 'reject', expectedState: 'rejected' }),
  technical_review: Object.freeze({ resource: 'analysisrequest', transition: 'verify', expectedState: 'verified' }),
  release: Object.freeze({ resource: 'analysisrequest', transition: 'publish', expectedState: 'published' }),
});

const SAMPLE_ACTIONS = Object.freeze(Object.keys(ACTION_MAPPINGS) as SampleAction[]);
const APPROVED_ACTOR_FIELD = 'Remarks';

export interface SenaiteConfiguration {
  clientUid: string;
  auditResource: string;
  instrumentResource: string;
  actorField: string;
  actions: Partial<ActionConfiguration>;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateActionConfiguration(value: unknown): Partial<ActionConfiguration> {
  if (!isRecord(value)) throw new Error('OHWORKS_SENAITE_ACTIONS_JSON must be a JSON object');
  const actions: Partial<ActionConfiguration> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (!SAMPLE_ACTIONS.includes(name as SampleAction)) throw new Error(`OHWORKS_SENAITE_ACTIONS_JSON contains unsupported action ${name}`);
    const action = name as SampleAction;
    const expected = ACTION_MAPPINGS[action];
    if (!isRecord(candidate)
      || Object.keys(candidate).sort().join(',') !== 'expectedState,resource,transition'
      || candidate.resource !== expected.resource
      || candidate.transition !== expected.transition
      || candidate.expectedState !== expected.expectedState) {
      throw new Error(`SENAITE action mapping for ${action} must be ${expected.resource}:${expected.transition}->${expected.expectedState}`);
    }
    actions[action] = expected;
  }
  return actions;
}

function validateConfiguration(config: SenaiteConfiguration): void {
  required(config.clientUid, 'OHWORKS_SENAITE_CLIENT_UID');
  required(config.auditResource, 'OHWORKS_SENAITE_AUDIT_RESOURCE');
  required(config.instrumentResource, 'OHWORKS_SENAITE_INSTRUMENT_RESOURCE');
  if (config.actorField !== APPROVED_ACTOR_FIELD) {
    throw new Error(`OHWORKS_SENAITE_ACTOR_FIELD must be ${APPROVED_ACTOR_FIELD}`);
  }
  validateActionConfiguration(config.actions);
}

export function configurationFromEnvironment(env: NodeJS.ProcessEnv = process.env): SenaiteConfiguration {
  let parsedActions: unknown;
  try { parsedActions = JSON.parse(required(env.OHWORKS_SENAITE_ACTIONS_JSON, 'OHWORKS_SENAITE_ACTIONS_JSON')); }
  catch (error) { throw new Error(error instanceof SyntaxError ? 'OHWORKS_SENAITE_ACTIONS_JSON must be valid JSON' : (error as Error).message); }
  const config = {
    clientUid: required(env.OHWORKS_SENAITE_CLIENT_UID, 'OHWORKS_SENAITE_CLIENT_UID'),
    auditResource: required(env.OHWORKS_SENAITE_AUDIT_RESOURCE, 'OHWORKS_SENAITE_AUDIT_RESOURCE'),
    instrumentResource: required(env.OHWORKS_SENAITE_INSTRUMENT_RESOURCE, 'OHWORKS_SENAITE_INSTRUMENT_RESOURCE'),
    actorField: required(env.OHWORKS_SENAITE_ACTOR_FIELD, 'OHWORKS_SENAITE_ACTOR_FIELD'),
    actions: validateActionConfiguration(parsedActions),
  };
  validateConfiguration(config);
  return config;
}

function field(record: SenaiteRecord | undefined | null, aliases: string[]): unknown {
  for (const alias of aliases) if (record?.[alias] !== undefined && record[alias] !== null) return record[alias];
  return undefined;
}

function text(record: SenaiteRecord | undefined | null, aliases: string[]): string {
  const value = field(record, aliases);
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const nested = value as Record<string, unknown>;
    const candidate = nested.title ?? nested.Title ?? nested.id ?? nested.getId ?? nested.uid ?? nested.UID;
    if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
  }
  return '';
}

function stateFromSenaite(value: string): SampleState {
  return ({
    sample_received: 'Accessioned',
    unassigned: 'Queued',
    assigned: 'Queued',
    to_be_verified: 'Awaiting verification',
    verified: 'Technical review',
    published: 'Released',
    rejected: 'Rejected',
    cancelled: 'Rejected',
  } as Record<string, SampleState>)[value] ?? 'Unknown';
}

function requestId(record: SenaiteRecord): string {
  return text(record, ['getRequestID', 'RequestID', 'request_id', 'getId', 'id']);
}

function normalizeResult(record: SenaiteRecord): ResultValue {
  const uid = text(record, ['uid', 'UID']);
  if (!uid) throw new Error('SENAITE analysis record is missing UID');
  return {
    uid,
    code: text(record, ['getKeyword', 'Keyword', 'keyword']),
    analyte: text(record, ['title', 'Title', 'getServiceTitle']),
    value: text(record, ['Result', 'result']),
    ...(text(record, ['Unit', 'unit']) ? { units: text(record, ['Unit', 'unit']) } : {}),
    ...(text(record, ['ReferenceRange', 'reference_range']) ? { reference: text(record, ['ReferenceRange', 'reference_range']) } : {}),
    ...(text(record, ['ResultType', 'result_type']) ? { flag: text(record, ['ResultType', 'result_type']) } : {}),
    reviewState: text(record, ['review_state', 'reviewState']),
  };
}

function normalizeSample(record: SenaiteRecord, results: ResultValue[]): SampleRecord {
  const uid = text(record, ['uid', 'UID']);
  const id = requestId(record);
  if (!uid || !id) throw new Error('SENAITE sample record is missing UID or request ID');
  const senaiteState = text(record, ['review_state', 'reviewState']);
  const reviewActor = text(record, ['Reviewer', 'reviewer']);
  const releaseActor = text(record, ['Publisher', 'publisher']);
  return {
    uid,
    id,
    tenantId: TEST_TENANT_ID,
    dataDomain: 'senaite',
    ...(text(record, ['ClientOrderNumber', 'OrderID']) ? { orderId: text(record, ['ClientOrderNumber', 'OrderID']) } : {}),
    ...(text(record, ['ClientReference', 'PatientID']) ? { subjectReference: text(record, ['ClientReference', 'PatientID']) } : {}),
    ...(text(record, ['Profiles', 'profile']) ? { panel: text(record, ['Profiles', 'profile']) } : {}),
    ...(text(record, ['SampleType', 'sample_type']) ? { specimen: text(record, ['SampleType', 'sample_type']) } : {}),
    ...(text(record, ['DateReceived', 'created']) ? { receivedAt: text(record, ['DateReceived', 'created']) } : {}),
    ...(text(record, ['Priority', 'priority']) ? { priority: text(record, ['Priority', 'priority']) } : {}),
    state: stateFromSenaite(senaiteState),
    senaiteState,
    results,
    ...(reviewActor ? { review: { actor: reviewActor, at: text(record, ['DateVerified']), outcome: 'verified' } } : {}),
    ...(releaseActor ? { release: { actor: releaseActor, at: text(record, ['DatePublished']), reportId: text(record, ['getId', 'id']) } } : {}),
    ...(text(record, ['Remarks', 'remarks']) ? { remarks: text(record, ['Remarks', 'remarks']) } : {}),
  };
}

function normalizeAudit(record: SenaiteRecord, index: number): AuditRecord {
  return {
    id: text(record, ['uid', 'UID', 'id']) || `senaite-audit-${index}`,
    tenantId: TEST_TENANT_ID,
    dataDomain: 'senaite',
    at: text(record, ['timestamp', 'created', 'date']),
    actor: text(record, ['actor', 'principal', 'user', 'Creator']),
    action: text(record, ['action', 'transition', 'title']),
    objectId: text(record, ['object_id', 'getRequestID', 'id']),
    detail: text(record, ['detail', 'comment', 'description']),
  };
}

function normalizeInstrument(record: SenaiteRecord, queued: number, index: number): InstrumentRecord {
  return {
    id: text(record, ['getId', 'id', 'uid']) || `senaite-instrument-${index}`,
    tenantId: TEST_TENANT_ID,
    dataDomain: 'senaite',
    name: text(record, ['title', 'Title']),
    status: text(record, ['review_state', 'status']) || 'unknown',
    queueDepth: queued,
    ...(text(record, ['modified', 'last_import_at']) ? { lastImportAt: text(record, ['modified', 'last_import_at']) } : {}),
    connection: 'SENAITE result importer',
  };
}

export interface LaboratorySnapshot { samples: SampleRecord[]; audit: AuditRecord[]; instruments: InstrumentRecord[] }

export async function readSenaiteLaboratory(client: SenaiteClient, config: SenaiteConfiguration): Promise<LaboratorySnapshot> {
  const health = await client.healthCheck();
  if (!health.ok) throw new Error(`SENAITE health check failed: ${health.error ?? 'unavailable'}`);
  const [requests, analyses, auditResponse, instrumentResponse] = await Promise.all([
    client.read('analysisrequest', { getClientUID: config.clientUid, complete: true, limit: 1000 }),
    client.read('analysis', { getClientUID: config.clientUid, complete: true, limit: 5000 }),
    client.read(config.auditResource, { getClientUID: config.clientUid, complete: true, limit: 1000 }),
    client.read(config.instrumentResource, { complete: true, limit: 1000 }),
  ]);
  const resultsByRequest = new Map<string, ResultValue[]>();
  for (const analysis of analyses.items) {
    const id = requestId(analysis);
    if (!id) throw new Error('SENAITE analysis is missing its request ID');
    const result = normalizeResult(analysis);
    if (result.value === '') continue;
    resultsByRequest.set(id, [...(resultsByRequest.get(id) ?? []), result]);
  }
  const samples = requests.items.map((record) => normalizeSample(record, resultsByRequest.get(requestId(record)) ?? []));
  const queued = samples.filter((sample) => sample.state === 'Queued').length;
  return {
    samples,
    audit: auditResponse.items.map(normalizeAudit),
    instruments: instrumentResponse.items.map((record, index) => normalizeInstrument(record, queued, index)),
  };
}

function actorMarker(principal: TenantPrincipal, action: SampleAction): string {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9 ._@-]/g, '').slice(0, 100);
  return `[OHWORKS_ACTOR account=${safe(principal.accountId)} name=${safe(principal.displayName)} action=${action}]`;
}

export async function mutateSenaiteSample(client: SenaiteClient, config: SenaiteConfiguration, principal: TenantPrincipal, action: SampleAction, sample: SampleRecord): Promise<SampleRecord> {
  validateConfiguration(config);
  const actionConfig = config.actions[action];
  if (!actionConfig) {
    throw new Error(`SENAITE mutation ${action} is not configured`);
  }
  const marker = actorMarker(principal, action);
  const remarks = [sample.remarks, marker].filter(Boolean).join('\n');
  await client.update(actionConfig.resource, sample.uid, { transition: actionConfig.transition, [config.actorField]: remarks });
  const after = await client.readOne(actionConfig.resource, sample.uid);
  if (!after) throw new Error('SENAITE mutation read-back returned no record');
  const afterState = text(after, ['review_state', 'reviewState']);
  const afterActorField = text(after, [config.actorField]);
  if (afterState !== actionConfig.expectedState) throw new Error(`SENAITE mutation postcondition failed: expected ${actionConfig.expectedState}, received ${afterState || 'missing'}`);
  if (!afterActorField.includes(marker)) throw new Error('SENAITE mutation postcondition failed: human actor attribution was not preserved');
  return normalizeSample(after, sample.results);
}

export function defaultSenaiteRuntime(): { client: SenaiteClient; config: SenaiteConfiguration } {
  return { client: createSenaiteClient(), config: configurationFromEnvironment() };
}
