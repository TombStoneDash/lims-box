import assert from 'node:assert/strict';
import test from 'node:test';
import { generateOHWorksSyntheticSamples, type OHWorksSyntheticBatchOptions } from '../../lib/ohworks-synthetic-sample-batch';

const options: OHWorksSyntheticBatchOptions = {
  seed: 'SYNTHETIC-SEED-001',
  receivedFromIso: '2026-01-01T08:00:00.000Z',
  profiles: [
    { matrixCode: 'water-potable', analyses: ['SYNTHETIC-ANALYSIS-001'] },
    { matrixCode: 'water-waste', analyses: ['SYNTHETIC-ANALYSIS-002'] },
  ],
};

test('rejects an analyses array consisting only of a hole', () => {
  assert.throws(() => generateOHWorksSyntheticSamples({
    ...options,
    profiles: [{ matrixCode: 'soil', analyses: new Array(1) }],
  }), /Profiles require supported matrices and synthetic numeric analysis codes\./);
});

test('rejects a middle hole in an otherwise valid analyses array', () => {
  const analyses: string[] = ['SYNTHETIC-ANALYSIS-001', , 'SYNTHETIC-ANALYSIS-002'] as unknown as string[];
  assert.throws(() => generateOHWorksSyntheticSamples({
    ...options,
    profiles: [{ matrixCode: 'soil', analyses }],
  }), /Profiles require supported matrices and synthetic numeric analysis codes\./);
});

test('rejects a hole in the profiles array', () => {
  const profiles = [
    { matrixCode: 'water-potable', analyses: ['SYNTHETIC-ANALYSIS-001'] },
    ,
    { matrixCode: 'soil', analyses: ['SYNTHETIC-ANALYSIS-003'] },
  ] as unknown as OHWorksSyntheticBatchOptions['profiles'];
  assert.throws(() => generateOHWorksSyntheticSamples({ ...options, profiles }),
    /Profiles require supported matrices and synthetic numeric analysis codes\./);
});

test('a dense valid batch is unaffected by the hole check', () => {
  const samples = generateOHWorksSyntheticSamples({ ...options, count: 4 });
  assert.equal(samples.length, 4);
  assert.deepEqual(samples.map(sample => sample.analyses), [
    ['SYNTHETIC-ANALYSIS-001'],
    ['SYNTHETIC-ANALYSIS-002'],
    ['SYNTHETIC-ANALYSIS-001'],
    ['SYNTHETIC-ANALYSIS-002'],
  ]);
});
