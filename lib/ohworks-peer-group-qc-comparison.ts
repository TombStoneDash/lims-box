/**
 * Pure, dependency-free peer-group (interlaboratory / PT-adjacent) QC
 * comparison for OHWorks-shaped QC results.
 *
 * This is distinct from lib/ohworks-qc-westgard.ts, which evaluates a
 * single lab's own run-to-run QC sequence against the Westgard multirule
 * set. This module instead compares one lab's QC result for a given
 * analyte/method/lot against the peer group of other labs running the same
 * method/instrument/lot -- a comparison that can surface calibration drift
 * a lab's own internal rules never see, because every one of that lab's
 * own results can look internally consistent while still drifting away
 * from the rest of the peer group.
 *
 * It performs no I/O, reads no system clock, mutates no SENAITE or
 * database state, and touches no real instrument or customer data.
 */

export type PeerGroupComparisonClassification = 'acceptable' | 'marginal' | 'unacceptable' | 'insufficient_peer_data';

export type PeerGroupComparisonInput = {
  /** Fabricated observed QC result for this lab. */
  labResult: number;
  /** Synthetic analyte identifier, e.g. "GLUCOSE". */
  analyte: string;
  /** Synthetic method/instrument identifier shared by the peer group. */
  methodCode: string;
  /** Fabricated peer group mean for this analyte/method/lot. */
  peerGroupMean: number;
  /** Fabricated peer group standard deviation for this analyte/method/lot. */
  peerGroupStdDev: number;
  /** Number of peer labs contributing to the peer group statistics. */
  peerGroupN: number;
  /** Minimum peer group size required to trust the comparison. */
  minPeerGroupN: number;
};

export type PeerGroupComparisonResult = {
  /** (labResult - peerGroupMean) / peerGroupStdDev. */
  zScore: number;
  /** Standard Deviation Index -- the same value as zScore, exported under the term labs expect. */
  sdi: number;
  classification: PeerGroupComparisonClassification;
  flaggedForReview: boolean;
};

/**
 * Compare a single lab's QC result against its peer group's statistics.
 *
 * When `peerGroupN` is below `minPeerGroupN`, or `peerGroupStdDev` is zero,
 * there is not enough trustworthy peer data to compute a meaningful z-score,
 * so the classification is `insufficient_peer_data` and the result is never
 * flagged for review on that basis alone -- there is nothing yet to review.
 *
 * Otherwise, zScore = (labResult - peerGroupMean) / peerGroupStdDev, and:
 *   - |zScore| <= 2: acceptable
 *   - 2 < |zScore| <= 3: marginal (flagged for review)
 *   - |zScore| > 3: unacceptable (flagged for review)
 */
export function evaluatePeerGroupComparison(input: PeerGroupComparisonInput): PeerGroupComparisonResult {
  if (input.peerGroupN < input.minPeerGroupN || input.peerGroupStdDev === 0) {
    return {
      zScore: 0,
      sdi: 0,
      classification: 'insufficient_peer_data',
      flaggedForReview: false,
    };
  }

  const zScore = (input.labResult - input.peerGroupMean) / input.peerGroupStdDev;
  const absZ = Math.abs(zScore);

  let classification: PeerGroupComparisonClassification;
  if (absZ <= 2) {
    classification = 'acceptable';
  } else if (absZ <= 3) {
    classification = 'marginal';
  } else {
    classification = 'unacceptable';
  }

  return {
    zScore,
    sdi: zScore,
    classification,
    flaggedForReview: classification === 'marginal' || classification === 'unacceptable',
  };
}

export type PeerGroupTrendDirection = 'high' | 'low' | 'none';

export type PeerGroupTrendSummary = {
  /** Length of the trailing run of consecutive same-direction marginal/unacceptable results. */
  consecutiveSameDirectionFlags: number;
  trendDirection: PeerGroupTrendDirection;
};

/**
 * Detect a trailing run of consecutive flagged (marginal or unacceptable)
 * results whose z-scores all share the same sign -- a drift signal distinct
 * from any single out-of-range point. Non-flagged (`acceptable` or
 * `insufficient_peer_data`) results break the run.
 *
 * `recentResults` is expected in chronological order; only the trailing run
 * ending at the most recent result is measured. `trendDirection` is `high`
 * when every result in that run has a positive zScore, `low` when every
 * result has a negative zScore, and `none` when the run is empty or its
 * signs are mixed.
 */
export function summarizePeerGroupTrend(recentResults: PeerGroupComparisonResult[]): PeerGroupTrendSummary {
  const run: PeerGroupComparisonResult[] = [];
  for (let i = recentResults.length - 1; i >= 0; i -= 1) {
    const result = recentResults[i];
    if (result.classification !== 'marginal' && result.classification !== 'unacceptable') {
      break;
    }
    run.push(result);
  }

  if (run.length === 0) {
    return { consecutiveSameDirectionFlags: 0, trendDirection: 'none' };
  }

  const allPositive = run.every((result) => result.zScore > 0);
  const allNegative = run.every((result) => result.zScore < 0);

  const trendDirection: PeerGroupTrendDirection = allPositive ? 'high' : allNegative ? 'low' : 'none';

  return { consecutiveSameDirectionFlags: run.length, trendDirection };
}
