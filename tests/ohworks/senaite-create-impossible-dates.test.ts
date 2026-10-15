import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOHWorksSenaiteSample,
  type OHWorksSampleCreateRequest,
  type SenaiteSampleAdapter,
  type SenaiteSampleCreateOutcome,
} from '../../lib/ohworks-senaite-create';

// Synthetic fixtures and an in-memory adapter only; no external systems.
function baselineRequest(): OHWorksSampleCreateRequest {
  return {
    requestId: 'request-synthetic-1',
    tenantId: 'tenant-synthetic-a',
    clientId: 'client-synthetic-a',
    sampleId: 'sample-synthetic-1',
    matrixCode: 'water-potable',
    dateSampled: '2026-01-01T09:00:00Z',
    dateReceived: '2026-12-31T11:00:00Z',
    analyses: ['ANALYTE-SYNTH-A'],
  };
}

function fakeAdapter(
  respond: (request: OHWorksSampleCreateRequest) => ReadonlyArray<SenaiteSampleCreateOutcome>,
): SenaiteSampleAdapter {
  return { createSample: async (request) => respond(request) };
}

async function evaluate(dates: Partial<Pick<OHWorksSampleCreateRequest, 'dateSampled' | 'dateReceived'>>) {
  let adapterCalls = 0;
  const request = { ...baselineRequest(), ...dates };
  const result = await createOHWorksSenaiteSample(request, { tenantId: 'tenant-synthetic-a' }, fakeAdapter(() => {
    adapterCalls += 1;
    return [{
      senaiteSampleId: 'senaite-synthetic-water-0001',
      tenantId: 'tenant-synthetic-a',
      matrixCode: 'water-potable',
    }];
  }));
  return { result, adapterCalls };
}

for (const [field, reason] of [
  ['dateSampled', 'date-sampled-invalid'],
  ['dateReceived', 'date-received-invalid'],
] as const) {
  for (const date of [
    '2026-02-30T09:00:00Z',
    '2026-02-29T09:00:00Z',
    '2026-04-31T09:00:00Z',
    '1900-02-29T09:00:00Z',
    '2100-02-29T09:00:00Z',
    '2026-02-30T00:30:00+05:30',
    '2026-02-30T23:30:00-0800',
    '2026-00-10T09:00:00Z',
    '2026-13-10T09:00:00Z',
    '2026-01-00T09:00:00Z',
  ]) {
    test(`${field} rejects impossible calendar date ${date} before calling adapter`, async () => {
      const { result, adapterCalls } = await evaluate({ [field]: date });
      assert.equal(result.status, 'REJECTED');
      assert.deepEqual(result.reasons, [{ code: reason }]);
      assert.equal(adapterCalls, 0);
    });
  }
}

for (const [sampled, received] of [
  ['2024-02-29T09:00:00Z', '2024-02-29T11:00:00Z'],
  ['2000-02-29T09:00:00.123Z', '2000-02-29T11:00:00.456Z'],
  ['2026-01-01T09:00:00Z', '2026-01-01T11:00:00Z'],
  ['2024-02-29T00:30:00+05:30', '2024-02-29T01:00:00+05:30'],
  ['2024-02-29T23:30:00-0800', '2024-03-01T00:30:00-0800'],
  ['2026-01-01T10:00:00+02:00', '2026-01-01T08:00:00Z'],
]) {
  test(`valid timestamps ${sampled} and ${received} still create`, async () => {
    const { result, adapterCalls } = await evaluate({ dateSampled: sampled, dateReceived: received });
    assert.equal(result.status, 'CREATED');
    assert.deepEqual(result.reasons, []);
    assert.equal(adapterCalls, 1);
    assert.equal(result.senaiteSampleId, 'senaite-synthetic-water-0001');
  });
}

for (const [sampled, received] of [
  ['2026-01-01T11:00:00Z', '2026-01-01T09:00:00Z'],
  ['2026-01-01T09:00:00Z', '2026-01-01T10:00:00+02:00'],
]) {
  test(`received-before-sampled remains rejected for ${received}`, async () => {
    const { result, adapterCalls } = await evaluate({ dateSampled: sampled, dateReceived: received });
    assert.equal(result.status, 'REJECTED');
    assert.deepEqual(result.reasons, [{ code: 'date-received-before-sampled' }]);
    assert.equal(adapterCalls, 0);
  });
}
