import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOHWorksSenaiteSample,
  type OHWorksSampleCreateRequest,
  type SampleCreateContext,
  type SenaiteSampleAdapter,
  type SenaiteSampleCreateOutcome,
} from '../../lib/ohworks-senaite-create';

/**
 * All fabricated: synthetic request/tenant/client/sample identifiers and a
 * fake in-memory adapter. No network call, credential, or production state
 * is ever touched by this test.
 */
function baselineContext(): SampleCreateContext {
  return { tenantId: 'tenant-synthetic-a' };
}

function baselineRequest(): OHWorksSampleCreateRequest {
  return {
    requestId: 'request-synthetic-1',
    tenantId: 'tenant-synthetic-a',
    clientId: 'client-synthetic-a',
    sampleId: 'sample-synthetic-1',
    matrixCode: 'water-potable',
    dateSampled: '2026-01-01T09:00:00.000Z',
    dateReceived: '2026-01-01T11:00:00.000Z',
    analyses: ['ANALYTE-SYNTH-A', 'ANALYTE-SYNTH-B'],
  };
}

function baselineOutcome(): SenaiteSampleCreateOutcome {
  return {
    senaiteSampleId: 'senaite-synthetic-water-0001',
    tenantId: 'tenant-synthetic-a',
    matrixCode: 'water-potable',
  };
}

/** Fake adapter: never touches a network, an environment variable, or any real SENAITE instance. */
function fakeAdapter(
  respond: (request: OHWorksSampleCreateRequest) => ReadonlyArray<unknown> | Promise<ReadonlyArray<unknown>>,
): SenaiteSampleAdapter {
  return { createSample: async (request) => respond(request) as unknown as ReadonlyArray<SenaiteSampleCreateOutcome> };
}

test('an outcome with an empty-string senaiteSampleId fails closed to REJECTED, not CREATED', async () => {
  const adapter = fakeAdapter(() => [{ ...baselineOutcome(), senaiteSampleId: '' }]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
  assert.equal(result.senaiteSampleId, undefined);
});

test('an outcome with a whitespace-only senaiteSampleId fails closed to REJECTED', async () => {
  const adapter = fakeAdapter(() => [{ ...baselineOutcome(), senaiteSampleId: '   ' }]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
  assert.equal(result.senaiteSampleId, undefined);
});

test('an outcome missing senaiteSampleId entirely fails closed to REJECTED', async () => {
  const outcome = baselineOutcome() as unknown as Record<string, unknown>;
  delete outcome.senaiteSampleId;
  const adapter = fakeAdapter(() => [outcome]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
  assert.equal(result.senaiteSampleId, undefined);
});

test('an outcome with a non-string senaiteSampleId fails closed to REJECTED', async () => {
  const adapter = fakeAdapter(() => [{ ...baselineOutcome(), senaiteSampleId: 12345 }]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
  assert.equal(result.senaiteSampleId, undefined);
});

test('a null outcome in the array fails closed to REJECTED instead of throwing', async () => {
  const adapter = fakeAdapter(() => [null]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
  assert.equal(result.senaiteSampleId, undefined);
});

test('an outcome with a blank tenantId fails closed to REJECTED', async () => {
  const adapter = fakeAdapter(() => [{ ...baselineOutcome(), tenantId: '   ' }]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
  assert.equal(result.senaiteSampleId, undefined);
});

test('an outcome with a blank matrixCode fails closed to REJECTED', async () => {
  const adapter = fakeAdapter(() => [{ ...baselineOutcome(), matrixCode: '' }]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
  assert.equal(result.senaiteSampleId, undefined);
});

test('a valid single outcome is still CREATED', async () => {
  const adapter = fakeAdapter(() => [baselineOutcome()]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'CREATED');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.senaiteSampleId, 'senaite-synthetic-water-0001');
});
