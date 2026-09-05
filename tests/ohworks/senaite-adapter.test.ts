import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutateSenaiteSample, readSenaiteLaboratory, type SenaiteConfiguration } from '../../lib/ohworks-senaite/adapter';
import { createSenaiteClient, type SenaiteClient, type SenaiteRecord } from '../../lib/ohworks-senaite/client';
import type { TenantPrincipal } from '../../lib/ohworks-tenant/model';

function configuration(): SenaiteConfiguration {
  return {
    clientUid: 'ohworks-client-uid',
    auditResource: 'audit-history',
    instrumentResource: 'instrument',
    actorField: 'Remarks',
    actions: { technical_review: { resource: 'analysisrequest', transition: 'configured-verify-transition', expectedState: 'verified' } },
  };
}

function fakeClient(): SenaiteClient & { sample: SenaiteRecord; updates: Record<string, unknown>[] } {
  const client = {
    site: 'senaite',
    sample: { UID: 'sample-uid', getId: 'AR-001', review_state: 'to_be_verified', ClientOrderNumber: 'ORDER-001', ClientReference: 'SUBJECT-001', SampleType: { title: 'Confirmed sample type' }, Remarks: '' },
    updates: [] as Record<string, unknown>[],
    async healthCheck() { return { ok: true }; },
    async read(resource: string) {
      if (resource === 'analysisrequest') return { items: [client.sample] };
      if (resource === 'analysis') return { items: [{ UID: 'analysis-uid', getRequestID: 'AR-001', getKeyword: 'confirmed-keyword', Title: 'Confirmed service', Result: 'observed-value', Unit: 'confirmed-unit', review_state: 'to_be_verified' }] };
      if (resource === 'audit-history') return { items: [{ UID: 'audit-uid', timestamp: '2026-09-05T00:00:00Z', actor: 'service-account', action: 'submit', object_id: 'AR-001', detail: 'SENAITE event' }] };
      if (resource === 'instrument') return { items: [{ UID: 'instrument-uid', Title: 'Configured instrument', review_state: 'active' }] };
      return { items: [] };
    },
    async readOne() { return client.sample; },
    async create() { throw new Error('not used'); },
    async update(_resource: string, _uid: string, fields: Record<string, unknown>) {
      client.updates.push(fields);
      client.sample = { ...client.sample, ...fields, review_state: 'verified' };
      return client.sample;
    },
  };
  return client;
}

test('adapter reads samples, results, workflow, audit, and instruments only from SENAITE responses', async () => {
  const client = fakeClient();
  const snapshot = await readSenaiteLaboratory(client, configuration());
  assert.equal(snapshot.samples.length, 1);
  assert.equal(snapshot.samples[0].dataDomain, 'senaite');
  assert.equal(snapshot.samples[0].state, 'Awaiting verification');
  assert.equal(snapshot.samples[0].results[0].value, 'observed-value');
  assert.equal(snapshot.audit[0].detail, 'SENAITE event');
  assert.equal(snapshot.instruments[0].name, 'Configured instrument');
});

test('adapter fails closed when SENAITE health fails', async () => {
  const client = fakeClient();
  client.healthCheck = async () => ({ ok: false, error: 'offline' });
  await assert.rejects(() => readSenaiteLaboratory(client, configuration()), /health check failed/);
});

test('allowed mutation reaches SENAITE and independently reads back state plus human actor attribution', async () => {
  const client = fakeClient();
  const snapshot = await readSenaiteLaboratory(client, configuration());
  const principal: TenantPrincipal = { accountId: 'acct-reviewer', username: 'reviewer', displayName: 'Review Person', role: 'reviewer' };
  const after = await mutateSenaiteSample(client, configuration(), principal, 'technical_review', snapshot.samples[0]);
  assert.equal(after.state, 'Technical review');
  assert.deepEqual(Object.keys(client.updates[0]).sort(), ['Remarks', 'transition']);
  assert.equal(client.updates[0].transition, 'configured-verify-transition');
  assert.match(String(client.updates[0].Remarks), /OHWORKS_ACTOR account=acct-reviewer name=Review Person action=technical_review/);
});

test('mutation rejects a read-back that loses human actor attribution', async () => {
  const client = fakeClient();
  const snapshot = await readSenaiteLaboratory(client, configuration());
  client.readOne = async () => ({ ...client.sample, Remarks: '', review_state: 'verified' });
  const principal: TenantPrincipal = { accountId: 'acct-reviewer', username: 'reviewer', displayName: 'Review Person', role: 'reviewer' };
  await assert.rejects(() => mutateSenaiteSample(client, configuration(), principal, 'technical_review', snapshot.samples[0]), /actor attribution was not preserved/);
});

test('SENAITE client redacts structurally escaped credentials from server failures', async () => {
  const reflected = 'VISIBLE_PREFIX ' + JSON.stringify({ Authorization: 'Bearer DO_NOT_EXPOSE_AUTH', Cookie: 'session=DO_NOT_EXPOSE_COOKIE', password: 'DO_NOT_EXPOSE_PASSWORD' });
  const client = createSenaiteClient({
    env: { NODE_ENV: 'test', SENAITE_URL: 'http://senaite:8080', SENAITE_USER: 'service-user', SENAITE_PASS: 'service-password', SENAITE_SITE: 'senaite' },
    fetchImpl: async () => new Response(JSON.stringify({ message: reflected }), { status: 500, headers: { 'content-type': 'application/json' } }),
  });
  await assert.rejects(client.read('analysisrequest'), (error: Error) => {
    assert.doesNotMatch(error.message, /DO_NOT_EXPOSE/);
    assert.match(error.message, /authorization=\[redacted\]/);
    assert.match(error.message, /cookie=\[redacted\]/);
    assert.match(error.message, /password=\[redacted\]/);
    return true;
  });
});
