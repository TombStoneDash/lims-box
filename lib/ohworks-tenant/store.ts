import type { SampleAction, SampleRecord, TenantPrincipal, TenantStore } from './model';
import { TEST_TENANT_ID } from './model';
import { authorizeAction, hasPermission } from './permissions';
import { readPersonnel } from './personnel-store';
import { defaultSenaiteRuntime, mutateSenaiteSample, readSenaiteLaboratory } from '@/lib/ohworks-senaite/adapter';

export async function readTenantStore(): Promise<TenantStore> {
  const personnel = await readPersonnel();
  const checkedAt = new Date().toISOString();
  try {
    const { client, config } = defaultSenaiteRuntime();
    const laboratory = await readSenaiteLaboratory(client, config);
    return { schemaVersion: 3, tenantId: TEST_TENANT_ID, laboratory: { available: true, source: 'senaite', checkedAt }, personnel, ...laboratory };
  } catch {
    return {
      schemaVersion: 3,
      tenantId: TEST_TENANT_ID,
      laboratory: { available: false, source: 'senaite', checkedAt, reason: 'SENAITE laboratory service is unavailable.' },
      samples: [],
      instruments: [],
      audit: [],
      personnel,
    };
  }
}

export async function applySampleAction(principal: TenantPrincipal, action: SampleAction, sampleId?: string): Promise<SampleRecord> {
  if (!sampleId) throw new Error('Sample ID is required');
  const store = await readTenantStore();
  if (!store.laboratory.available) throw new Error('SENAITE laboratory service is unavailable. No local fallback was used.');
  const sample = store.samples.find((candidate) => candidate.id === sampleId);
  if (!sample) throw new Error('Sample not found');
  const authorization = authorizeAction(principal, action, sample.state);
  if ('reason' in authorization) throw new Error(authorization.reason);
  const { client, config } = defaultSenaiteRuntime();
  return mutateSenaiteSample(client, config, principal, action, sample);
}

export function visibleStore(store: TenantStore, principal: TenantPrincipal): TenantStore {
  return {
    ...store,
    samples: store.samples.map((sample) => hasPermission(principal, 'result:read') ? sample : { ...sample, results: [], review: undefined, release: sample.release ? { ...sample.release, actor: 'Authorized approver' } : undefined }),
    personnel: hasPermission(principal, 'personnel:read') ? store.personnel : [],
    audit: hasPermission(principal, 'audit:read') ? store.audit : [],
  };
}
