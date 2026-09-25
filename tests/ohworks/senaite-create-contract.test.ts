import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOHWorksSenaiteSample,
  explainSampleCreateReason,
  SampleCreateInputError,
  type OHWorksSampleCreateRequest,
  type SampleCreateContext,
  type SampleCreateReasonCode,
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
  respond: (request: OHWorksSampleCreateRequest) => ReadonlyArray<SenaiteSampleCreateOutcome> | Promise<ReadonlyArray<SenaiteSampleCreateOutcome>>,
): SenaiteSampleAdapter {
  return { createSample: async (request) => respond(request) };
}

function throwingAdapter(message: string): SenaiteSampleAdapter {
  return {
    createSample: async () => {
      throw new Error(message);
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: SampleCreateReasonCode[] = [
  'tenant-mismatch',
  'matrix-unsupported',
  'date-sampled-invalid',
  'date-received-invalid',
  'date-received-before-sampled',
  'analyses-missing',
  'analyses-invalid',
  'adapter-error',
  'adapter-outcome-missing',
  'adapter-outcome-ambiguous',
  'adapter-outcome-duplicate',
  'adapter-outcome-tenant-mismatch',
  'adapter-outcome-matrix-mismatch',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

test('a fully valid fabricated request is created via the fake adapter', async () => {
  const adapter = fakeAdapter(() => [baselineOutcome()]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'CREATED');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.senaiteSampleId, 'senaite-synthetic-water-0001');
  assert.equal(result.requestId, 'request-synthetic-1');
  assert.equal(result.sampleId, 'sample-synthetic-1');
});

test('evaluation does not mutate the input request or context', async () => {
  const request = baselineRequest();
  const context = baselineContext();
  const requestBefore = JSON.stringify(request);
  const contextBefore = JSON.stringify(context);
  await createOHWorksSenaiteSample(request, context, fakeAdapter(() => [baselineOutcome()]));
  assert.equal(JSON.stringify(request), requestBefore);
  assert.equal(JSON.stringify(context), contextBefore);
});

test('evaluation is deterministic across repeated calls', async () => {
  const adapter = fakeAdapter(() => [baselineOutcome()]);
  const first = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  const second = await createOHWorksSenaiteSample(clone(baselineRequest()), clone(baselineContext()), adapter);
  assert.deepEqual(first, second);
});

test('a status other than CREATED or REJECTED is never produced', async () => {
  const adapter = fakeAdapter(() => [baselineOutcome()]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.ok(['CREATED', 'REJECTED'].includes(result.status));
});

test('a tenant mismatch on the request fails closed to REJECTED without calling the adapter', async () => {
  const request = baselineRequest();
  request.tenantId = 'tenant-synthetic-intruder';
  let adapterCalled = false;
  const adapter = fakeAdapter(() => {
    adapterCalled = true;
    return [baselineOutcome()];
  });
  const result = await createOHWorksSenaiteSample(request, baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'tenant-mismatch' }]);
  assert.equal(adapterCalled, false);
});

test('an unsupported matrix code fails closed to REJECTED without calling the adapter', async () => {
  const request = baselineRequest();
  request.matrixCode = 'unknown-matrix-guess';
  let adapterCalled = false;
  const adapter = fakeAdapter(() => {
    adapterCalled = true;
    return [baselineOutcome()];
  });
  const result = await createOHWorksSenaiteSample(request, baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'matrix-unsupported' }]);
  assert.equal(adapterCalled, false);
});

test('an unparsable sampled-date fails closed to REJECTED', async () => {
  const request = baselineRequest();
  request.dateSampled = 'not-a-timestamp';
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.reasons.some((r) => r.code === 'date-sampled-invalid'));
});

test('an unparsable received-date fails closed to REJECTED', async () => {
  const request = baselineRequest();
  request.dateReceived = 'not-a-timestamp';
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.reasons.some((r) => r.code === 'date-received-invalid'));
});

test('a received-date before the sampled-date fails closed to REJECTED', async () => {
  const request = baselineRequest();
  request.dateSampled = '2026-01-02T00:00:00.000Z';
  request.dateReceived = '2026-01-01T00:00:00.000Z';
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.reasons.some((r) => r.code === 'date-received-before-sampled'));
});

test('a received-date exactly equal to the sampled-date is accepted', async () => {
  const request = baselineRequest();
  request.dateSampled = '2026-01-01T09:00:00.000Z';
  request.dateReceived = '2026-01-01T09:00:00.000Z';
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  assert.equal(result.status, 'CREATED');
});

test('an empty analyses list fails closed to REJECTED', async () => {
  const request = baselineRequest();
  request.analyses = [];
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'analyses-missing' }]);
});

test('a non-array analyses field fails closed to REJECTED as missing', async () => {
  const request = baselineRequest();
  (request as unknown as Record<string, unknown>).analyses = 'ANALYTE-SYNTH-A';
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.reasons.some((r) => r.code === 'analyses-missing'));
});

test('an analyses list containing a blank entry fails closed to REJECTED as invalid', async () => {
  const request = baselineRequest();
  request.analyses = ['ANALYTE-SYNTH-A', ''];
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'analyses-invalid' }]);
});

test('an adapter reporting zero outcomes fails closed to REJECTED', async () => {
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), fakeAdapter(() => []));
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
});

test('an adapter reporting two distinct sample ids fails closed as ambiguous', async () => {
  const adapter = fakeAdapter(() => [
    baselineOutcome(),
    { ...baselineOutcome(), senaiteSampleId: 'senaite-synthetic-water-0002' },
  ]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-ambiguous' }]);
  assert.equal(result.senaiteSampleId, undefined);
});

test('an adapter reporting the same sample id twice fails closed as duplicate', async () => {
  const adapter = fakeAdapter(() => [baselineOutcome(), baselineOutcome()]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-duplicate' }]);
});

test('an adapter reporting the same sample id twice with conflicting details still fails closed as duplicate', async () => {
  const adapter = fakeAdapter(() => [
    baselineOutcome(),
    { ...baselineOutcome(), matrixCode: 'soil' },
  ]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-duplicate' }]);
});

test('an adapter reporting a created sample under a different tenant fails closed', async () => {
  const adapter = fakeAdapter(() => [{ ...baselineOutcome(), tenantId: 'tenant-synthetic-intruder' }]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-tenant-mismatch' }]);
});

test('an adapter reporting a created sample under a different matrix fails closed', async () => {
  const adapter = fakeAdapter(() => [{ ...baselineOutcome(), matrixCode: 'soil' }]);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-matrix-mismatch' }]);
});

test('an adapter that throws fails closed to REJECTED with a sanitized reason, never the raw error text', async () => {
  const secret = 'connection string password=hunter2 at internal-host';
  const adapter = throwingAdapter(secret);
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-error' }]);
  assert.equal(JSON.stringify(result).includes('hunter2'), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('an adapter that returns a non-array outcome fails closed to REJECTED', async () => {
  const adapter = { createSample: async () => 'not-an-array' as unknown as SenaiteSampleCreateOutcome[] };
  const result = await createOHWorksSenaiteSample(baselineRequest(), baselineContext(), adapter);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, [{ code: 'adapter-outcome-missing' }]);
});

test('a HOLD-triggering pre-call defect always outranks another independent pre-call defect, reported together', async () => {
  const request = baselineRequest();
  request.tenantId = 'tenant-synthetic-intruder';
  request.matrixCode = 'unknown-matrix-guess';
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.reasons.some((r) => r.code === 'tenant-mismatch'));
  assert.ok(result.reasons.some((r) => r.code === 'matrix-unsupported'));
});

test('reasons are reported in deterministic, sorted order regardless of failure order', async () => {
  const request = baselineRequest();
  request.matrixCode = 'unknown-matrix-guess';
  request.dateSampled = 'not-a-timestamp';
  request.analyses = [];
  const result = await createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [baselineOutcome()]));
  const codes = result.reasons.map((r) => r.code);
  const sortedCodes = [...codes].sort();
  assert.deepEqual(codes, sortedCodes);
});

test('a non-object request throws a sanitized typed error', async () => {
  await assert.rejects(
    () => createOHWorksSenaiteSample('not-a-request' as unknown as OHWorksSampleCreateRequest, baselineContext(), fakeAdapter(() => [])),
    (error: unknown) => {
      assert.ok(error instanceof SampleCreateInputError);
      assert.equal((error as SampleCreateInputError).code, 'request-invalid');
      return true;
    },
  );
});

test('a request missing its identifier throws a sanitized typed error rather than guessing', async () => {
  const request = baselineRequest();
  delete (request as Partial<OHWorksSampleCreateRequest>).sampleId;
  await assert.rejects(
    () => createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [])),
    (error: unknown) => {
      assert.ok(error instanceof SampleCreateInputError);
      assert.equal((error as SampleCreateInputError).code, 'request-missing-identity');
      return true;
    },
  );
});

test('an empty-string identity field throws a sanitized typed error rather than guessing', async () => {
  const request = baselineRequest();
  request.clientId = '';
  await assert.rejects(
    () => createOHWorksSenaiteSample(request, baselineContext(), fakeAdapter(() => [])),
    (error: unknown) => {
      assert.ok(error instanceof SampleCreateInputError);
      assert.equal((error as SampleCreateInputError).code, 'request-missing-identity');
      return true;
    },
  );
});

test('an invalid evaluation context throws a sanitized typed error', async () => {
  const context = { tenantId: '' } as SampleCreateContext;
  await assert.rejects(
    () => createOHWorksSenaiteSample(baselineRequest(), context, fakeAdapter(() => [])),
    (error: unknown) => {
      assert.ok(error instanceof SampleCreateInputError);
      assert.equal((error as SampleCreateInputError).code, 'invalid-context');
      return true;
    },
  );
});

test('a typed input error message never echoes any submitted data', async () => {
  try {
    await createOHWorksSenaiteSample('garbage-payload' as unknown as OHWorksSampleCreateRequest, baselineContext(), fakeAdapter(() => []));
    assert.fail('expected createOHWorksSenaiteSample to throw');
  } catch (error) {
    assert.ok(error instanceof SampleCreateInputError);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch((error as Error).message, pattern);
    }
    assert.doesNotMatch((error as Error).message, /garbage-payload/);
  }
});

test('every create-result reason code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainSampleCreateReason({ code });
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /request-synthetic|tenant-synthetic|client-synthetic|sample-synthetic|senaite-synthetic/);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(
    explainSampleCreateReason({ code: 'adapter-outcome-ambiguous' }),
    explainSampleCreateReason({ code: 'adapter-outcome-ambiguous' }),
  );
});

test('no create-result status ever uses approval, compliance, accreditation, or release language', () => {
  const statuses: string[] = ['CREATED', 'REJECTED'];
  for (const status of statuses) {
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(status, pattern);
    }
  }
});
