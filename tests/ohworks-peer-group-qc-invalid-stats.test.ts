import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePeerGroupComparison,
  type PeerGroupComparisonInput,
} from '../lib/ohworks-peer-group-qc-comparison';

function input(overrides: Partial<PeerGroupComparisonInput> = {}): PeerGroupComparisonInput {
  return {
    labResult: 100,
    analyte: 'SYNTHETIC',
    methodCode: 'METHOD-SYNTHETIC',
    peerGroupMean: 100,
    peerGroupStdDev: 5,
    peerGroupN: 30,
    minPeerGroupN: 10,
    ...overrides,
  };
}

const invalidCases: Array<[string, Partial<PeerGroupComparisonInput>]> = [
  ['infinite lab result', { labResult: Infinity }],
  ['NaN lab result', { labResult: NaN }],
  ['infinite peer mean', { peerGroupMean: Infinity }],
  ['NaN peer mean', { peerGroupMean: NaN }],
  ['infinite peer standard deviation', { peerGroupStdDev: Infinity }],
  ['NaN peer standard deviation', { peerGroupStdDev: NaN }],
  ['negative peer standard deviation', { peerGroupStdDev: -5 }],
  ['zero peer standard deviation', { peerGroupStdDev: 0 }],
  ['fractional peer count', { peerGroupN: 30.5 }],
  ['negative peer count', { peerGroupN: -1 }],
  ['infinite peer count', { peerGroupN: Infinity }],
  ['fractional minimum count', { minPeerGroupN: 10.5 }],
  ['negative minimum count', { minPeerGroupN: -1 }],
  ['NaN minimum count', { minPeerGroupN: NaN }],
  ['overflowing subtraction', { labResult: Number.MAX_VALUE, peerGroupMean: -Number.MAX_VALUE }],
  ['overflowing division', { labResult: 100, peerGroupMean: 0, peerGroupStdDev: Number.MIN_VALUE }],
];

for (const [name, overrides] of invalidCases) {
  test(`${name} is insufficient peer data`, () => {
    assert.deepEqual(evaluatePeerGroupComparison(input(overrides)), {
      zScore: 0,
      sdi: 0,
      classification: 'insufficient_peer_data',
      flaggedForReview: false,
    });
  });
}

test('valid z=2 and z=3 boundaries retain their classifications', () => {
  assert.deepEqual(evaluatePeerGroupComparison(input({ labResult: 110 })), {
    zScore: 2,
    sdi: 2,
    classification: 'acceptable',
    flaggedForReview: false,
  });
  assert.deepEqual(evaluatePeerGroupComparison(input({ labResult: 115 })), {
    zScore: 3,
    sdi: 3,
    classification: 'marginal',
    flaggedForReview: true,
  });
});
