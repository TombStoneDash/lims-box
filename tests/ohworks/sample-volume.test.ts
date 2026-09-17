import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSampleVolumeSufficiency,
  explainSampleVolumeError,
  SampleVolumeError,
  type SampleVolumeErrorCode,
  type SampleVolumeTestRequest,
} from '../../lib/ohworks-sample-volume';

/**
 * All fabricated: synthetic test codes, made-up specimen volumes, and
 * made-up container dead volumes. None of this represents a real patient,
 * specimen, or order.
 */
function request(overrides: Partial<SampleVolumeTestRequest> = {}): SampleVolumeTestRequest {
  return {
    testCode: 'GLUCOSE',
    requiredVolumeMl: 1,
    priority: 'routine',
    sequence: 0,
    ...overrides,
  };
}

test('runs a single test that fits within the available volume', () => {
  const result = evaluateSampleVolumeSufficiency(10, 2, [request({ requiredVolumeMl: 3 })]);
  assert.equal(result.availableVolumeMl, 8);
  assert.equal(result.runnableTestCodes.length, 1);
  assert.deepEqual(result.runnableTestCodes, ['GLUCOSE']);
  assert.deepEqual(result.shortTestCodes, []);
  assert.deepEqual(result.outcomes[0], {
    testCode: 'GLUCOSE',
    status: 'runnable',
    allocatedVolumeMl: 3,
    remainingVolumeAfterMl: 5,
  });
});

test('marks a test short when it exceeds the available volume, reporting the exact shortfall', () => {
  const result = evaluateSampleVolumeSufficiency(5, 0, [request({ requiredVolumeMl: 8 })]);
  assert.deepEqual(result.shortTestCodes, ['GLUCOSE']);
  assert.deepEqual(result.outcomes[0], {
    testCode: 'GLUCOSE',
    status: 'short',
    shortfallMl: 3,
    remainingVolumeAfterMl: 5,
  });
});

test('allows a test whose required volume exactly equals the available volume', () => {
  const result = evaluateSampleVolumeSufficiency(5, 0, [request({ requiredVolumeMl: 5 })]);
  assert.equal(result.outcomes[0].status, 'runnable');
  assert.equal(result.outcomes[0].status === 'runnable' && result.outcomes[0].remainingVolumeAfterMl, 0);
});

test('floors available volume at zero when dead volume exceeds specimen volume', () => {
  const result = evaluateSampleVolumeSufficiency(2, 5, [request({ requiredVolumeMl: 1 })]);
  assert.equal(result.availableVolumeMl, 0);
  assert.equal(result.outcomes[0].status, 'short');
  assert.equal(result.outcomes[0].status === 'short' && result.outcomes[0].shortfallMl, 1);
});

test('allows a test requiring zero volume even with zero available volume', () => {
  const result = evaluateSampleVolumeSufficiency(0, 0, [request({ requiredVolumeMl: 0 })]);
  assert.equal(result.outcomes[0].status, 'runnable');
});

test('runs stat tests before urgent and routine tests regardless of list order', () => {
  const tests: SampleVolumeTestRequest[] = [
    request({ testCode: 'CBC', requiredVolumeMl: 4, priority: 'routine', sequence: 0 }),
    request({ testCode: 'TSH', requiredVolumeMl: 4, priority: 'stat', sequence: 1 }),
  ];
  const result = evaluateSampleVolumeSufficiency(6, 0, tests);
  assert.deepEqual(result.runnableTestCodes, ['TSH']);
  assert.deepEqual(result.shortTestCodes, ['CBC']);
});

test('orders same-priority tests by ascending sequence, not list order', () => {
  const tests: SampleVolumeTestRequest[] = [
    request({ testCode: 'CBC', requiredVolumeMl: 4, priority: 'routine', sequence: 2 }),
    request({ testCode: 'TSH', requiredVolumeMl: 4, priority: 'routine', sequence: 1 }),
  ];
  const result = evaluateSampleVolumeSufficiency(6, 0, tests);
  assert.deepEqual(result.runnableTestCodes, ['TSH']);
  assert.deepEqual(result.shortTestCodes, ['CBC']);
});

test('a short higher-priority test does not consume volume needed by a lower-priority test', () => {
  const tests: SampleVolumeTestRequest[] = [
    request({ testCode: 'TSH', requiredVolumeMl: 10, priority: 'stat', sequence: 0 }),
    request({ testCode: 'CBC', requiredVolumeMl: 2, priority: 'routine', sequence: 1 }),
  ];
  const result = evaluateSampleVolumeSufficiency(5, 0, tests);
  assert.deepEqual(result.shortTestCodes, ['TSH']);
  assert.deepEqual(result.runnableTestCodes, ['CBC']);
  const cbcOutcome = result.outcomes.find((outcome) => outcome.testCode === 'CBC');
  assert.equal(cbcOutcome?.status, 'runnable');
});

test('depletes available volume across multiple runnable tests in priority order', () => {
  const tests: SampleVolumeTestRequest[] = [
    request({ testCode: 'TSH', requiredVolumeMl: 3, priority: 'stat', sequence: 0 }),
    request({ testCode: 'CBC', requiredVolumeMl: 3, priority: 'urgent', sequence: 0 }),
    request({ testCode: 'GLUCOSE', requiredVolumeMl: 3, priority: 'routine', sequence: 0 }),
  ];
  const result = evaluateSampleVolumeSufficiency(7, 1, tests);
  assert.equal(result.availableVolumeMl, 6);
  assert.deepEqual(result.runnableTestCodes, ['TSH', 'CBC']);
  assert.deepEqual(result.shortTestCodes, ['GLUCOSE']);
});

test('accepts an empty test panel', () => {
  const result = evaluateSampleVolumeSufficiency(10, 2, []);
  assert.equal(result.availableVolumeMl, 8);
  assert.deepEqual(result.outcomes, []);
  assert.deepEqual(result.runnableTestCodes, []);
  assert.deepEqual(result.shortTestCodes, []);
});

test('fails closed on a negative specimen volume', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(-1, 0, []),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'specimen-volume-invalid',
  );
});

test('fails closed on a non-finite specimen volume', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(Number.POSITIVE_INFINITY, 0, []),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'specimen-volume-invalid',
  );
});

test('fails closed on a negative container dead volume', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(10, -1, []),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'container-dead-volume-invalid',
  );
});

test('fails closed on a non-finite container dead volume', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(10, Number.NaN, []),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'container-dead-volume-invalid',
  );
});

test('fails closed on an unknown test code', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(10, 0, [request({ testCode: 'UNOBTANIUM' })]),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'test-code-unknown',
  );
});

test('fails closed on a duplicate test code', () => {
  assert.throws(
    () =>
      evaluateSampleVolumeSufficiency(10, 0, [
        request({ testCode: 'GLUCOSE', sequence: 0 }),
        request({ testCode: 'GLUCOSE', sequence: 1 }),
      ]),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'test-code-duplicate',
  );
});

test('fails closed on a negative test required volume', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(10, 0, [request({ requiredVolumeMl: -1 })]),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'test-required-volume-invalid',
  );
});

test('fails closed on a non-finite test required volume', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(10, 0, [request({ requiredVolumeMl: Number.POSITIVE_INFINITY })]),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'test-required-volume-invalid',
  );
});

test('fails closed on an unknown test priority', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(10, 0, [request({ priority: 'whenever' })]),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'test-priority-unknown',
  );
});

test('fails closed on a non-finite test sequence', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(10, 0, [request({ sequence: Number.NaN })]),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'test-sequence-invalid',
  );
});

test('checks the specimen volume before the container dead volume', () => {
  assert.throws(
    () => evaluateSampleVolumeSufficiency(-1, -1, []),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'specimen-volume-invalid',
  );
});

test('checks duplicate test codes before unknown priority on a later entry', () => {
  assert.throws(
    () =>
      evaluateSampleVolumeSufficiency(10, 0, [
        request({ testCode: 'GLUCOSE', sequence: 0 }),
        request({ testCode: 'GLUCOSE', priority: 'whenever', sequence: 1 }),
      ]),
    (error: unknown) => error instanceof SampleVolumeError && error.code === 'test-code-duplicate',
  );
});

test('explainSampleVolumeError returns deterministic, non-empty text for every error code', () => {
  const codes: SampleVolumeErrorCode[] = [
    'specimen-volume-invalid',
    'container-dead-volume-invalid',
    'test-code-duplicate',
    'test-code-unknown',
    'test-required-volume-invalid',
    'test-priority-unknown',
    'test-sequence-invalid',
  ];
  for (const code of codes) {
    const message = explainSampleVolumeError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('is deterministic: identical inputs always produce identical output', () => {
  const tests: SampleVolumeTestRequest[] = [
    request({ testCode: 'TSH', requiredVolumeMl: 3, priority: 'stat', sequence: 0 }),
    request({ testCode: 'CBC', requiredVolumeMl: 3, priority: 'urgent', sequence: 0 }),
    request({ testCode: 'GLUCOSE', requiredVolumeMl: 3, priority: 'routine', sequence: 0 }),
  ];
  const first = evaluateSampleVolumeSufficiency(7, 1, tests);
  const second = evaluateSampleVolumeSufficiency(7, 1, tests);
  assert.deepEqual(first, second);
});
