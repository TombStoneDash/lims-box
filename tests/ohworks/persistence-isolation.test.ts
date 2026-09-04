import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createInitialStore } from '../../lib/ohworks-tenant/fixtures';
import type { TenantPrincipal } from '../../lib/ohworks-tenant/model';
import { TEST_TENANT_ID } from '../../lib/ohworks-tenant/model';
import { applySampleAction, readTenantStore, validateStore, visibleStore } from '../../lib/ohworks-tenant/store';

const manager: TenantPrincipal = { accountId: 'acct-manager', username: 'configured-user', displayName: 'Morgan Vale', role: 'laboratory_manager' };
const reviewer: TenantPrincipal = { accountId: 'acct-reviewer', username: 'configured-reviewer', displayName: 'Priya North', role: 'reviewer' };
const approver: TenantPrincipal = { accountId: 'acct-approver', username: 'configured-approver', displayName: 'Avery Hart', role: 'approver' };

test('fixtures fail closed on tenant and data-domain boundary violations', () => {
  const valid = createInitialStore();
  assert.doesNotThrow(() => validateStore(valid));
  const crossed = structuredClone(valid);
  crossed.samples[0].tenantId = 'customer-production' as typeof TEST_TENANT_ID;
  assert.throws(() => validateStore(crossed), /Cross-tenant/);
  const production = structuredClone(valid);
  production.audit[0].dataDomain = 'production' as 'synthetic_test';
  assert.throws(() => validateStore(production), /non-test data/);
});

test('workflow persists through a complete accession-to-release walkthrough', async () => {
  const previous = process.env.OHWORKS_DATA_DIR;
  const directory = await mkdtemp(join(tmpdir(), 'ohworks-tenant-test-'));
  process.env.OHWORKS_DATA_DIR = directory;
  try {
    const accessioned = await applySampleAction(manager, 'accession');
    await applySampleAction(manager, 'queue', accessioned.id);
    await applySampleAction(manager, 'record_result', accessioned.id);
    await applySampleAction(reviewer, 'technical_review', accessioned.id);
    await assert.rejects(() => applySampleAction(reviewer, 'release', accessioned.id), /not permitted/);
    await applySampleAction(approver, 'release', accessioned.id);
    const reloaded = await readTenantStore();
    const persisted = reloaded.samples.find((sample) => sample.id === accessioned.id);
    assert.equal(persisted?.state, 'Released');
    assert.ok(persisted?.review);
    assert.ok(persisted?.release?.reportId);
    assert.ok(reloaded.audit.some((event) => event.objectId === accessioned.id && event.action === 'Report released'));
    assert.equal(reloaded.instruments[0].queueDepth, reloaded.samples.filter((sample) => sample.state === 'Queued').length);
    const onDisk = JSON.parse(await readFile(join(directory, 'tenant-state.json'), 'utf8'));
    assert.equal(onDisk.tenantId, TEST_TENANT_ID);
  } finally {
    if (previous === undefined) delete process.env.OHWORKS_DATA_DIR;
    else process.env.OHWORKS_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejection is terminal and cannot produce a released report', async () => {
  const previous = process.env.OHWORKS_DATA_DIR;
  const directory = await mkdtemp(join(tmpdir(), 'ohworks-rejection-test-'));
  process.env.OHWORKS_DATA_DIR = directory;
  try {
    const sample = await applySampleAction(manager, 'accession');
    await applySampleAction(manager, 'queue', sample.id);
    await applySampleAction(manager, 'record_result', sample.id);
    await applySampleAction(reviewer, 'reject', sample.id);
    await assert.rejects(() => applySampleAction(approver, 'release', sample.id), /not available/);
    const persisted = (await readTenantStore()).samples.find((candidate) => candidate.id === sample.id);
    assert.equal(persisted?.state, 'Rejected');
    assert.equal(persisted?.release, undefined);
    const store = await readTenantStore();
    assert.equal(store.instruments[0].queueDepth, store.samples.filter((candidate) => candidate.state === 'Queued').length);
  } finally {
    if (previous === undefined) delete process.env.OHWORKS_DATA_DIR;
    else process.env.OHWORKS_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('receiving role never receives result values, personnel, or audit records', () => {
  const receiving: TenantPrincipal = { accountId: 'acct-receiving', username: 'configured-user', displayName: 'Elliot Mercer', role: 'receiving' };
  const visible = visibleStore(createInitialStore(), receiving);
  assert.ok(visible.samples.every((sample) => sample.results.length === 0));
  assert.equal(visible.personnel.length, 0);
  assert.equal(visible.audit.length, 0);
});
