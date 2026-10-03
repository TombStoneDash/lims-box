import assert from 'node:assert/strict';
import test from 'node:test';
import { createOHWorksSenaiteSample } from '../../lib/ohworks-senaite-create';
import {
  generateOHWorksSyntheticSamples,
  type OHWorksSyntheticBatchOptions,
} from '../../lib/ohworks-synthetic-sample-batch';

const options: OHWorksSyntheticBatchOptions = {
  seed: 'SYNTHETIC-SEED-001',
  receivedFromIso: '2026-01-01T08:00:00.000Z',
  profiles: [
    { matrixCode: 'water-potable', analyses: ['SYNTHETIC-ANALYSIS-001'] },
    { matrixCode: 'water-waste', analyses: ['SYNTHETIC-ANALYSIS-002'] },
    { matrixCode: 'soil', analyses: ['SYNTHETIC-ANALYSIS-003', 'SYNTHETIC-ANALYSIS-004'] },
    { matrixCode: 'air-ambient', analyses: ['SYNTHETIC-ANALYSIS-005'] },
  ],
};

test('defaults to 60 unique fabricated sample and request IDs', () => {
  const samples = generateOHWorksSyntheticSamples(options);
  assert.equal(samples.length, 60);
  for (const key of ['sampleId', 'requestId'] as const) {
    assert.equal(new Set(samples.map(sample => sample[key])).size, 60);
    assert.ok(samples.every(sample => sample[key].startsWith('SYNTHETIC-')));
  }
});

test('same seed reproduces output; different string and numeric seeds vary it', () => {
  assert.deepEqual(generateOHWorksSyntheticSamples(options), generateOHWorksSyntheticSamples(options));
  assert.notDeepEqual(generateOHWorksSyntheticSamples(options), generateOHWorksSyntheticSamples({ ...options, seed: 'SYNTHETIC-SEED-002' }));
  assert.deepEqual(generateOHWorksSyntheticSamples({ ...options, seed: 0 }), generateOHWorksSyntheticSamples({ ...options, seed: 0 }));
  assert.notDeepEqual(generateOHWorksSyntheticSamples({ ...options, seed: 0 }), generateOHWorksSyntheticSamples({ ...options, seed: 1 }));
});

test('fixed 20 percent targets and balanced profiles, with deterministic remainders', () => {
  const samples = generateOHWorksSyntheticSamples(options);
  const states = ['received', 'to-be-verified', 'verified', 'published', 'rejected'];
  for (const state of states) assert.equal(samples.filter(sample => sample.targetState === state).length, 12);
  for (const profile of options.profiles) {
    const matching = samples.filter(sample => sample.matrixCode === profile.matrixCode);
    assert.equal(matching.length, 15);
    assert.ok(matching.every(sample => JSON.stringify(sample.analyses) === JSON.stringify(profile.analyses)));
  }
  const small = generateOHWorksSyntheticSamples({ ...options, count: 7 });
  assert.deepEqual(states.map(state => small.filter(sample => sample.targetState === state).length), [2, 2, 1, 1, 1]);
  assert.deepEqual(options.profiles.map(profile => small.filter(sample => sample.matrixCode === profile.matrixCode).length), [2, 2, 2, 1]);
  assert.deepEqual(generateOHWorksSyntheticSamples({ ...options, count: 0 }), []);
});

test('every payload passes the real create contract with an in-memory adapter', async () => {
  let calls = 0;
  for (const sample of generateOHWorksSyntheticSamples(options)) {
    const result = await createOHWorksSenaiteSample(sample, { tenantId: sample.tenantId }, {
      async createSample(request) {
        calls += 1;
        assert.deepEqual(request, sample);
        return [{ senaiteSampleId: `SYNTHETIC-SENAITE-${calls}`, tenantId: request.tenantId, matrixCode: request.matrixCode }];
      },
    });
    assert.equal(result.status, 'CREATED');
    assert.deepEqual(result.reasons, []);
  }
  assert.equal(calls, 60);
});

test('dates derive only from the provided instant, including year rollover', () => {
  const first = generateOHWorksSyntheticSamples(options);
  const shifted = generateOHWorksSyntheticSamples({ ...options, receivedFromIso: '2026-01-02T08:00:00Z' });
  first.forEach((sample, index) => {
    assert.equal(Date.parse(sample.dateReceived), Date.parse(options.receivedFromIso) + index * 60_000);
    assert.ok(Date.parse(sample.dateSampled) < Date.parse(sample.dateReceived));
    for (const key of ['dateSampled', 'dateReceived'] as const) {
      assert.equal(Date.parse(shifted[index][key]) - Date.parse(sample[key]), 86_400_000);
    }
  });
  const midnight = generateOHWorksSyntheticSamples({ ...options, count: 1, receivedFromIso: '2026-01-01T00:00:00Z' });
  assert.ok(midnight[0].dateSampled.startsWith('2025-12-31'));
});

test('field scan permits only fabricated identifiers, catalogue literals, states and ISO dates', () => {
  // A closed vocabulary is stronger than a blacklist of some real people's names.
  const grammar: Record<string, RegExp> = {
    requestId: /^SYNTHETIC-REQUEST-[a-f0-9]{4}-[a-f0-9]{4}-\d{6}$/,
    tenantId: /^SYNTHETIC-TENANT-001$/,
    clientId: /^SYNTHETIC-CLIENT-\d{6}$/,
    sampleId: /^SYNTHETIC-SAMPLE-[a-f0-9]{4}-[a-f0-9]{4}-\d{6}$/,
    matrixCode: /^(water-potable|water-waste|soil|air-ambient)$/,
    dateSampled: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    dateReceived: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    analyses: /^SYNTHETIC-ANALYSIS-\d{1,6}$/,
    targetState: /^(received|to-be-verified|verified|published|rejected)$/,
  };
  for (const sample of generateOHWorksSyntheticSamples(options)) {
    assert.deepEqual(Object.keys(sample).sort(), Object.keys(grammar).sort());
    for (const [key, field] of Object.entries(sample)) {
      for (const value of Array.isArray(field) ? field : [field]) {
        assert.match(value, grammar[key]);
        assert.doesNotMatch(value, /[^\s@]+@[^\s@]+\.[^\s@]+/);
        assert.doesNotMatch(value, /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/);
        assert.doesNotMatch(value, /^\+?\d[\d ().-]{7,}\d$/);
      }
    }
  }
});

test('rejects invalid counts, timestamps, profiles and non-synthetic codes', () => {
  for (const count of [-1, 1.5, NaN, Infinity, 100_001]) {
    assert.throws(() => generateOHWorksSyntheticSamples({ ...options, count }));
  }
  for (const receivedFromIso of ['', 'invalid', '2026-02-30T00:00:00Z', '2026-01-01', '2026-01-01T00:00:00']) {
    assert.throws(() => generateOHWorksSyntheticSamples({ ...options, receivedFromIso }));
  }
  for (const profiles of [[], [{ matrixCode: 'unsupported', analyses: ['SYNTHETIC-ANALYSIS-001'] }],
    [{ matrixCode: 'soil', analyses: [] }], [{ matrixCode: 'soil', analyses: ['NOT-SYNTHETIC'] }],
    [{ matrixCode: 'soil', analyses: ['SYNTHETIC-ARBITRARY-TEXT'] }]]) {
    assert.throws(() => generateOHWorksSyntheticSamples({ ...options, profiles }));
  }
  assert.throws(() => generateOHWorksSyntheticSamples({ ...options, seed: Infinity }));
});

test('does not mutate profiles or share analysis arrays across generated samples', () => {
  const profiles = Object.freeze(options.profiles.map(profile => Object.freeze({
    ...profile, analyses: Object.freeze([...profile.analyses]),
  })));
  const samples = generateOHWorksSyntheticSamples({ ...options, profiles });
  samples[0].analyses.push('SYNTHETIC-ANALYSIS-999');
  assert.deepEqual(samples[4].analyses, profiles[0].analyses);
  assert.deepEqual(profiles, options.profiles);
});
