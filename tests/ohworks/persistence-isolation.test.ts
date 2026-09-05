import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readPersonnel } from '../../lib/ohworks-tenant/personnel-store';
import { readTenantStore, visibleStore } from '../../lib/ohworks-tenant/store';
import type { TenantPrincipal } from '../../lib/ohworks-tenant/model';

test('personnel persists in its own module and no tenant-state laboratory fixture is created', async () => {
  const previous = process.env.OHWORKS_PERSONNEL_DATA_DIR;
  const directory = await mkdtemp(join(tmpdir(), 'ohworks-personnel-test-'));
  process.env.OHWORKS_PERSONNEL_DATA_DIR = directory;
  try {
    const personnel = await readPersonnel();
    assert.ok(personnel.length > 0);
    const onDisk = JSON.parse(await readFile(join(directory, 'personnel-state.json'), 'utf8'));
    assert.deepEqual(onDisk.personnel, personnel);
    await assert.rejects(readFile(join(directory, 'tenant-state.json'), 'utf8'), /ENOENT/);
  } finally {
    if (previous === undefined) delete process.env.OHWORKS_PERSONNEL_DATA_DIR;
    else process.env.OHWORKS_PERSONNEL_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing SENAITE configuration returns unavailable with zero laboratory fixture data', async () => {
  const previous = process.env.OHWORKS_PERSONNEL_DATA_DIR;
  const directory = await mkdtemp(join(tmpdir(), 'ohworks-outage-test-'));
  process.env.OHWORKS_PERSONNEL_DATA_DIR = directory;
  try {
    const store = await readTenantStore();
    assert.equal(store.laboratory.available, false);
    assert.deepEqual(store.samples, []);
    assert.deepEqual(store.instruments, []);
    assert.deepEqual(store.audit, []);
    assert.ok(store.personnel.length > 0);
  } finally {
    if (previous === undefined) delete process.env.OHWORKS_PERSONNEL_DATA_DIR;
    else process.env.OHWORKS_PERSONNEL_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('receiving role never receives result values, personnel, or audit records', () => {
  const receiving: TenantPrincipal = { accountId: 'acct-receiving', username: 'configured-user', displayName: 'Elliot Mercer', role: 'receiving' };
  const visible = visibleStore({
    schemaVersion: 3,
    tenantId: 'ohworks-test-tenant',
    laboratory: { available: true, source: 'senaite', checkedAt: new Date().toISOString() },
    samples: [{ uid: 'uid-1', id: 'AR-1', tenantId: 'ohworks-test-tenant', dataDomain: 'senaite', state: 'Awaiting verification', senaiteState: 'to_be_verified', results: [{ uid: 'analysis-1', code: 'confirmed-code', analyte: 'Confirmed service', value: 'observed', reviewState: 'to_be_verified' }] }],
    personnel: [{ id: 'PER-1', tenantId: 'ohworks-test-tenant', dataDomain: 'synthetic_test', name: 'Test Person', jobTitle: 'Test Role', competency: 'Current', instrumentAuthorization: 'Test only', nextReview: 'Test only' }],
    instruments: [],
    audit: [{ id: 'AUD-1', tenantId: 'ohworks-test-tenant', dataDomain: 'senaite', at: '', actor: '', action: '', objectId: 'AR-1', detail: '' }],
  }, receiving);
  assert.ok(visible.samples.every((sample) => sample.results.length === 0));
  assert.equal(visible.personnel.length, 0);
  assert.equal(visible.audit.length, 0);
});
