import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInitialStore } from './fixtures';
import type { AuditRecord, ResultValue, SampleAction, SampleRecord, TenantPrincipal, TenantStore } from './model';
import { TEST_DATA_DOMAIN, TEST_TENANT_ID } from './model';
import { authorizeAction, hasPermission } from './permissions';

const dataDir = () => process.env.OHWORKS_DATA_DIR ?? join(process.cwd(), '.ohworks-test-data');
const storePath = () => join(dataDir(), 'tenant-state.json');
let mutationQueue: Promise<void> = Promise.resolve();

export function validateStore(value: unknown): asserts value is TenantStore {
  const store = value as TenantStore;
  if (store?.schemaVersion !== 2 || store.tenantId !== TEST_TENANT_ID || store.dataDomain !== TEST_DATA_DOMAIN) {
    throw new Error('Tenant store boundary validation failed');
  }
  for (const record of [...store.samples, ...store.personnel, ...store.instruments, ...store.audit]) {
    if (record.tenantId !== TEST_TENANT_ID || record.dataDomain !== TEST_DATA_DOMAIN) {
      throw new Error('Cross-tenant or non-test data was rejected');
    }
  }
  for (const sample of store.samples) {
    if (sample.review && !sample.review.accountId) throw new Error('Technical review identity is required');
    if (sample.release && !sample.release.accountId) throw new Error('Release identity is required');
  }
}

async function persist(store: TenantStore): Promise<void> {
  store.instruments[0].queueDepth = store.samples.filter((sample) => sample.state === 'Queued').length;
  validateStore(store);
  const tmp = `${storePath()}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, storePath());
}

async function initialize(): Promise<void> {
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  try {
    await readFile(storePath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await persist(createInitialStore());
  }
}

export async function readTenantStore(): Promise<TenantStore> {
  await initialize();
  const parsed = JSON.parse(await readFile(storePath(), 'utf8')) as unknown;
  validateStore(parsed);
  return parsed;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let releaseQueue: () => void = () => undefined;
  const previous = mutationQueue;
  mutationQueue = new Promise<void>((resolveQueue) => { releaseQueue = resolveQueue; });
  await previous;
  try {
    return await fn();
  } finally {
    releaseQueue();
  }
}

function audit(principal: TenantPrincipal, action: string, objectId: string, detail: string): AuditRecord {
  return {
    id: `AUD-${randomUUID()}`,
    tenantId: TEST_TENANT_ID,
    dataDomain: TEST_DATA_DOMAIN,
    at: new Date().toISOString(),
    actor: principal.displayName,
    action,
    objectId,
    detail,
  };
}

function generatedResults(sample: SampleRecord): ResultValue[] {
  if (sample.panel === 'Hepatitis B immunity') {
    return [{ code: 'HBS-AB', analyte: 'Hepatitis B surface antibody', value: '24.0', units: 'mIU/mL', reference: '>= 10.0', flag: 'Within range' }];
  }
  return [
    { code: 'RUB-IGG', analyte: 'Rubella IgG', value: '44.0', units: 'IU/mL', reference: '>= 10.0', flag: 'Within range' },
    { code: 'MEAS-IGG', analyte: 'Measles IgG', value: '158', units: 'AU/mL', reference: '>= 16.5', flag: 'Within range' },
  ];
}

export async function applySampleAction(principal: TenantPrincipal, action: SampleAction, sampleId?: string): Promise<SampleRecord> {
  return withLock(async () => {
    const store = await readTenantStore();
    if (action === 'accession') {
      const authorization = authorizeAction(principal, action);
      if ('reason' in authorization) throw new Error(authorization.reason);
      const next = store.sequence + 1;
      const sample: SampleRecord = {
        id: `OW-260904-${next}`,
        tenantId: TEST_TENANT_ID,
        dataDomain: TEST_DATA_DOMAIN,
        orderId: `ORD-${62000 + next}`,
        subjectReference: `EMP-${4100 + next}`,
        panel: next % 2 === 0 ? 'Hepatitis B immunity' : 'Immunity screen',
        specimen: 'Serum',
        receivedAt: new Date().toISOString(),
        priority: 'Routine',
        state: 'Accessioned',
        instrument: 'LIAISON XL',
        rackPosition: `B${String(next - 108).padStart(2, '0')}`,
        results: [],
        revision: 1,
      };
      store.sequence = next;
      store.samples.unshift(sample);
      store.audit.unshift(audit(principal, 'Sample accessioned', sample.id, `${sample.orderId} received into Sample Reception.`));
      await persist(store);
      return sample;
    }

    const sample = store.samples.find((candidate) => candidate.id === sampleId);
    if (!sample) throw new Error('Sample not found');
    const authorization = authorizeAction(principal, action, sample.state);
    if ('reason' in authorization) throw new Error(authorization.reason);
    const now = new Date().toISOString();

    if (action === 'queue') {
      sample.state = 'Queued';
      sample.exception = undefined;
      store.audit.unshift(audit(principal, 'Sample queued', sample.id, 'Added to the LIAISON XL worklist.'));
    } else if (action === 'record_result') {
      sample.state = 'Result available';
      sample.results = generatedResults(sample);
      store.instruments[0].lastImportAt = now;
      store.audit.unshift(audit(principal, 'Instrument results imported', sample.id, 'Result set recorded from the configured test file workflow.'));
    } else if (action === 'request_retest') {
      sample.state = 'Retest requested';
      sample.exception = { reason: 'Repeat requested after technical assessment', at: now };
      store.audit.unshift(audit(principal, 'Retest requested', sample.id, 'Repeat added for a new instrument run.'));
    } else if (action === 'quarantine') {
      sample.state = 'Quarantined';
      sample.exception = { reason: 'Held for sample and worklist reconciliation', at: now };
      store.audit.unshift(audit(principal, 'Sample quarantined', sample.id, 'Release path stopped pending reconciliation.'));
    } else if (action === 'reject') {
      sample.state = 'Rejected';
      sample.exception = { reason: 'Specimen rejected after technical assessment', at: now };
      store.audit.unshift(audit(principal, 'Sample rejected', sample.id, 'Specimen acceptance failed; no report can be released.'));
    } else if (action === 'technical_review') {
      sample.state = 'Technical review';
      sample.review = { accountId: principal.accountId, actor: principal.displayName, at: now, outcome: 'Accepted' };
      store.audit.unshift(audit(principal, 'Technical review completed', sample.id, 'Result set accepted for release.'));
    } else if (action === 'release') {
      if (!sample.review) throw new Error('A completed technical review is required before release.');
      if (sample.review.accountId === principal.accountId) throw new Error('Release requires an approver other than the technical reviewer.');
      sample.state = 'Released';
      sample.release = { accountId: principal.accountId, actor: principal.displayName, at: now, reportId: `RPT-${sample.id.slice(3)}` };
      store.audit.unshift(audit(principal, 'Report released', sample.id, `${sample.release.reportId} created after technical review.`));
    }
    sample.revision += 1;
    await persist(store);
    return sample;
  });
}

export function visibleStore(store: TenantStore, principal: TenantPrincipal): TenantStore {
  return {
    ...store,
    samples: store.samples.map((sample) => hasPermission(principal, 'result:read') ? sample : { ...sample, results: [], review: undefined, release: sample.release ? { ...sample.release, actor: 'Authorized approver' } : undefined }),
    personnel: hasPermission(principal, 'personnel:read') ? store.personnel : [],
    audit: hasPermission(principal, 'audit:read') ? store.audit : [],
  };
}
