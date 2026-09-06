import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import storeNamespace from '../lib/ohworks-tenant/store.ts';

const { readTenantStore } = storeNamespace;

const root = resolve(import.meta.dirname, '..');

test('built candidate contains the OHWorks routes and fails closed without SENAITE', async () => {
  await access(resolve(root, '.next/BUILD_ID'));
  const manifest = JSON.parse(await readFile(resolve(root, '.next/server/app-paths-manifest.json'), 'utf8'));
  for (const route of [
    '/pilot/ohworks/page',
    '/pilot/ohworks/samples/page',
    '/pilot/ohworks/results/page',
    '/pilot/ohworks/audit/page',
    '/pilot/ohworks/instrument/page',
    '/pilot/ohworks/api/actions/route',
    '/pilot/ohworks/api/health/route',
  ]) assert.ok(manifest[route], route);

  const personnelDirectory = await mkdtemp(resolve(tmpdir(), 'ohworks-personnel-runtime-'));
  const previousDirectory = process.env.OHWORKS_PERSONNEL_DATA_DIR;
  const previousUrl = process.env.SENAITE_URL;
  process.env.OHWORKS_PERSONNEL_DATA_DIR = personnelDirectory;
  delete process.env.SENAITE_URL;
  try {
    const store = await readTenantStore();
    assert.equal(store.laboratory.available, false);
    assert.deepEqual(store.samples, []);
    assert.deepEqual(store.instruments, []);
    assert.deepEqual(store.audit, []);
    assert.ok(store.personnel.length > 0);
    await assert.rejects(readFile(resolve(personnelDirectory, 'tenant-state.json'), 'utf8'), /ENOENT/);
    await access(resolve(personnelDirectory, 'personnel-state.json'));
  } finally {
    if (previousDirectory === undefined) delete process.env.OHWORKS_PERSONNEL_DATA_DIR;
    else process.env.OHWORKS_PERSONNEL_DATA_DIR = previousDirectory;
    if (previousUrl === undefined) delete process.env.SENAITE_URL;
    else process.env.SENAITE_URL = previousUrl;
    await rm(personnelDirectory, { recursive: true, force: true });
  }
});

test('built action route exposes no interactive result-entry action', async () => {
  const routeSource = await readFile(resolve(root, 'app/pilot/ohworks/api/actions/route.ts'), 'utf8');
  assert.doesNotMatch(routeSource, /record_result|result:record/);
});
