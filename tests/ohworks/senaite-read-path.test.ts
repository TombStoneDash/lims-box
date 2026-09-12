import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  readSenaiteConfigFromEnv,
  readSenaiteSamples,
  resolveOHWorksSenaiteMode,
  type SenaiteFetch,
} from '../../lib/ohworks-senaite';

const root = resolve(import.meta.dirname, '../..');

const FULL_ENV = {
  OHWORKS_SENAITE_BASE_URL: 'https://senaite.example.test',
  OHWORKS_SENAITE_USERNAME: 'reader',
  OHWORKS_SENAITE_PASSWORD: 'secret',
} as NodeJS.ProcessEnv;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

test('resolveOHWorksSenaiteMode defaults to synthetic and only real on exact opt-in', () => {
  assert.equal(resolveOHWorksSenaiteMode({} as NodeJS.ProcessEnv), 'synthetic');
  assert.equal(resolveOHWorksSenaiteMode({ OHWORKS_SENAITE_MODE: 'REAL' } as NodeJS.ProcessEnv), 'synthetic');
  assert.equal(resolveOHWorksSenaiteMode({ OHWORKS_SENAITE_MODE: 'live' } as NodeJS.ProcessEnv), 'synthetic');
  assert.equal(resolveOHWorksSenaiteMode({ OHWORKS_SENAITE_MODE: 'real' } as NodeJS.ProcessEnv), 'real');
});

test('readSenaiteConfigFromEnv requires all three server-only variables and a valid URL', () => {
  assert.equal(readSenaiteConfigFromEnv({} as NodeJS.ProcessEnv), undefined);
  assert.equal(
    readSenaiteConfigFromEnv({ ...FULL_ENV, OHWORKS_SENAITE_PASSWORD: '' } as NodeJS.ProcessEnv),
    undefined,
  );
  assert.equal(
    readSenaiteConfigFromEnv({ ...FULL_ENV, OHWORKS_SENAITE_BASE_URL: 'not-a-url' } as NodeJS.ProcessEnv),
    undefined,
  );
  const config = readSenaiteConfigFromEnv({ ...FULL_ENV, OHWORKS_SENAITE_BASE_URL: 'https://senaite.example.test/' } as NodeJS.ProcessEnv);
  assert.deepEqual(config, {
    baseUrl: 'https://senaite.example.test',
    username: 'reader',
    password: 'secret',
  });
});

test('readSenaiteSamples returns unavailable/not_configured and never calls fetch when config is missing', async () => {
  let calls = 0;
  const fetchImpl: SenaiteFetch = async () => {
    calls += 1;
    throw new Error('should not be called');
  };
  const result = await readSenaiteSamples({ env: {} as NodeJS.ProcessEnv, fetchImpl });
  assert.deepEqual(result, {
    status: 'unavailable',
    reason: 'not_configured',
    detail: 'OHWORKS_SENAITE_BASE_URL, OHWORKS_SENAITE_USERNAME, and OHWORKS_SENAITE_PASSWORD must all be set',
  });
  assert.equal(calls, 0);
});

test('readSenaiteSamples normalizes a valid stubbed response into ok with real_senaite source', async () => {
  const fetchImpl: SenaiteFetch = async () =>
    jsonResponse(200, {
      items: [
        { getId: 'SEN-0001', review_state: 'sample_received', SampleType: 'Water', getClientID: 'client-9' },
      ],
    });
  const result = await readSenaiteSamples({ env: FULL_ENV, fetchImpl });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.source, 'real_senaite');
    assert.deepEqual(result.samples, [
      {
        source: 'real_senaite',
        id: 'SEN-0001',
        sampleType: 'Water',
        reviewState: 'sample_received',
        clientId: 'client-9',
        dateReceived: null,
      },
    ]);
  }
});

test('readSenaiteSamples returns empty (not synthetic) when the real response has zero items', async () => {
  const fetchImpl: SenaiteFetch = async () => jsonResponse(200, { items: [] });
  const result = await readSenaiteSamples({ env: FULL_ENV, fetchImpl });
  assert.deepEqual(result, { status: 'empty', source: 'real_senaite' });
});

test('readSenaiteSamples returns invalid when the response shape is not an items array', async () => {
  const fetchImpl: SenaiteFetch = async () => jsonResponse(200, { unexpected: true });
  const result = await readSenaiteSamples({ env: FULL_ENV, fetchImpl });
  assert.equal(result.status, 'invalid');
});

test('readSenaiteSamples returns invalid when a sample record is malformed', async () => {
  const fetchImpl: SenaiteFetch = async () => jsonResponse(200, { items: [{ review_state: 'sample_received' }] });
  const result = await readSenaiteSamples({ env: FULL_ENV, fetchImpl });
  assert.equal(result.status, 'invalid');
});

test('readSenaiteSamples returns unavailable/http_error on a non-2xx response', async () => {
  const fetchImpl: SenaiteFetch = async () => jsonResponse(503, { error: 'down' });
  const result = await readSenaiteSamples({ env: FULL_ENV, fetchImpl });
  assert.equal(result.status, 'unavailable');
  if (result.status === 'unavailable') {
    assert.equal(result.reason, 'http_error');
  }
});

test('readSenaiteSamples returns unavailable/network_error when fetch rejects', async () => {
  const fetchImpl: SenaiteFetch = async () => {
    throw new Error('connection refused');
  };
  const result = await readSenaiteSamples({ env: FULL_ENV, fetchImpl });
  assert.deepEqual(result, {
    status: 'unavailable',
    reason: 'network_error',
    detail: 'connection refused',
  });
});

test('the samples page gates the real adapter behind an explicit mode check and imports server-only', () => {
  const adapter = readFileSync(resolve(root, 'lib/ohworks-senaite.ts'), 'utf8');
  const page = readFileSync(resolve(root, 'app/pilot/ohworks/samples/page.tsx'), 'utf8');
  assert.match(adapter, /^import 'server-only';/m);
  assert.match(page, /resolveOHWorksSenaiteMode\(\)/);
  assert.match(page, /senaiteMode === 'real' \? await readSenaiteSamples\(\) : undefined/);
});
