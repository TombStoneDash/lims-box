import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePeerGroupComparison,
  summarizePeerGroupTrend,
  type PeerGroupComparisonInput,
  type PeerGroupComparisonResult,
} from '../lib/ohworks-peer-group-qc-comparison';

/**
 * All fabricated: synthetic analyte, method, and peer group statistics.
 * No real lab, instrument, or patient data, and no network call.
 */
function baselineInput(overrides: Partial<PeerGroupComparisonInput> = {}): PeerGroupComparisonInput {
  return {
    labResult: 100,
    analyte: 'GLUCOSE',
    methodCode: 'METHOD-SYNTHETIC-A',
    peerGroupMean: 100,
    peerGroupStdDev: 5,
    peerGroupN: 30,
    minPeerGroupN: 10,
    ...overrides,
  };
}

test('classifies exactly z=2 as acceptable (boundary)', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ labResult: 110 }));
  assert.equal(result.zScore, 2);
  assert.equal(result.sdi, 2);
  assert.equal(result.classification, 'acceptable');
  assert.equal(result.flaggedForReview, false);
});

test('classifies just above z=2 as marginal', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ labResult: 110.01 }));
  assert.ok(Math.abs(result.zScore) > 2);
  assert.equal(result.classification, 'marginal');
  assert.equal(result.flaggedForReview, true);
});

test('classifies exactly z=3 as marginal (boundary)', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ labResult: 115 }));
  assert.equal(result.zScore, 3);
  assert.equal(result.classification, 'marginal');
  assert.equal(result.flaggedForReview, true);
});

test('classifies just above z=3 as unacceptable', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ labResult: 115.01 }));
  assert.ok(Math.abs(result.zScore) > 3);
  assert.equal(result.classification, 'unacceptable');
  assert.equal(result.flaggedForReview, true);
});

test('classifies within 2 SD as acceptable and not flagged', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ labResult: 101 }));
  assert.equal(result.zScore, 0.2);
  assert.equal(result.classification, 'acceptable');
  assert.equal(result.flaggedForReview, false);
});

test('handles negative z-scores symmetrically: exactly -2 is acceptable', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ labResult: 90 }));
  assert.equal(result.zScore, -2);
  assert.equal(result.classification, 'acceptable');
  assert.equal(result.flaggedForReview, false);
});

test('handles negative z-scores symmetrically: beyond -3 is unacceptable', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ labResult: 84 }));
  assert.equal(result.zScore, -3.2);
  assert.equal(result.classification, 'unacceptable');
  assert.equal(result.flaggedForReview, true);
});

test('reports insufficient_peer_data when peerGroupN is below minPeerGroupN, regardless of z-score', () => {
  const result = evaluatePeerGroupComparison(
    baselineInput({ labResult: 1000, peerGroupN: 3, minPeerGroupN: 10 }),
  );
  assert.equal(result.classification, 'insufficient_peer_data');
  assert.equal(result.flaggedForReview, false);
});

test('reports insufficient_peer_data when peerGroupN equals minPeerGroupN minus one (boundary)', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ peerGroupN: 9, minPeerGroupN: 10 }));
  assert.equal(result.classification, 'insufficient_peer_data');
  assert.equal(result.flaggedForReview, false);
});

test('accepts when peerGroupN equals minPeerGroupN exactly (boundary)', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ peerGroupN: 10, minPeerGroupN: 10 }));
  assert.equal(result.classification, 'acceptable');
});

test('reports insufficient_peer_data when peerGroupStdDev is zero, without dividing by zero', () => {
  const result = evaluatePeerGroupComparison(baselineInput({ peerGroupStdDev: 0, labResult: 500 }));
  assert.equal(result.classification, 'insufficient_peer_data');
  assert.equal(result.flaggedForReview, false);
  assert.ok(Number.isFinite(result.zScore));
  assert.ok(!Number.isNaN(result.zScore));
});

function flagged(zScore: number, classification: 'marginal' | 'unacceptable' = 'marginal'): PeerGroupComparisonResult {
  return { zScore, sdi: zScore, classification, flaggedForReview: true };
}

function acceptable(zScore: number): PeerGroupComparisonResult {
  return { zScore, sdi: zScore, classification: 'acceptable', flaggedForReview: false };
}

function insufficient(): PeerGroupComparisonResult {
  return { zScore: 0, sdi: 0, classification: 'insufficient_peer_data', flaggedForReview: false };
}

test('summarizePeerGroupTrend detects a run of same-direction positive flags as high', () => {
  const summary = summarizePeerGroupTrend([acceptable(0.5), flagged(2.1), flagged(2.5), flagged(3.5, 'unacceptable')]);
  assert.equal(summary.consecutiveSameDirectionFlags, 3);
  assert.equal(summary.trendDirection, 'high');
});

test('summarizePeerGroupTrend detects a run of same-direction negative flags as low', () => {
  const summary = summarizePeerGroupTrend([flagged(-2.2), flagged(-2.4), flagged(-3.1, 'unacceptable')]);
  assert.equal(summary.consecutiveSameDirectionFlags, 3);
  assert.equal(summary.trendDirection, 'low');
});

test('summarizePeerGroupTrend reports none for a mixed-sign run', () => {
  const summary = summarizePeerGroupTrend([flagged(2.1), flagged(-2.4), flagged(2.9)]);
  assert.equal(summary.consecutiveSameDirectionFlags, 3);
  assert.equal(summary.trendDirection, 'none');
});

test('summarizePeerGroupTrend reports none/zero for an empty run (all acceptable)', () => {
  const summary = summarizePeerGroupTrend([acceptable(0.1), acceptable(-0.3), insufficient()]);
  assert.equal(summary.consecutiveSameDirectionFlags, 0);
  assert.equal(summary.trendDirection, 'none');
});

test('summarizePeerGroupTrend only counts the trailing run, stopping at a non-flagged break', () => {
  const summary = summarizePeerGroupTrend([flagged(2.1), flagged(2.5), acceptable(0.2), flagged(2.8), flagged(3.2)]);
  assert.equal(summary.consecutiveSameDirectionFlags, 2);
  assert.equal(summary.trendDirection, 'high');
});

test('summarizePeerGroupTrend returns zero/none for an empty input array', () => {
  const summary = summarizePeerGroupTrend([]);
  assert.equal(summary.consecutiveSameDirectionFlags, 0);
  assert.equal(summary.trendDirection, 'none');
});
