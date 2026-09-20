/**
 * Fail-closed synthetic OHWorks add-on test eligibility evaluator.
 *
 * When a provider calls after the fact to add a new test onto a specimen
 * that was already collected — and possibly already partially used — the
 * lab needs one composed yes/no/conditional answer instead of three
 * separate checks. This module is a pure, dependency-free evaluator that
 * composes three independent facts about a fabricated specimen:
 *
 *   - whether the specimen has already been discarded or fully consumed,
 *     which makes an add-on impossible regardless of anything else;
 *   - whether the specimen is still within the analyte's stability window,
 *     using the same elapsed-time notion as `ohworks-stability-window`
 *     (see that module for the richer per-storage-condition segment
 *     evaluator this simplified single-window check does not replace);
 *   - whether there is enough remaining volume for the new test, and
 *     whether honoring the add-on would leave the specimen with no safety
 *     buffer for any future add-on or repeat, mirroring the
 *     runnable/short distinction in `ohworks-sample-volume`.
 *
 * It performs no I/O, reads no system clock (the caller supplies `now`),
 * mutates no SENAITE or database state, and touches no real subject,
 * specimen, or customer data.
 */

export type AddOnSpecimenStatus = 'available' | 'discarded' | 'fully_consumed';

export type AddOnEligibilityStatus =
  | 'eligible'
  | 'specimen_unavailable'
  | 'stability_expired'
  | 'insufficient_volume'
  | 'eligible_with_buffer_warning';

export type AddOnEligibilityInput = {
  specimenStatus: AddOnSpecimenStatus;
  /** ISO 8601 timestamp the specimen was collected. */
  collectedAt: string;
  /** ISO 8601 timestamp the add-on request is being evaluated. */
  now: string;
  /** Maximum hours the analyte remains stable in this specimen since collection. */
  stabilityHoursForAnalyte: number;
  /** Volume, in microliters, currently remaining in the specimen. */
  remainingVolumeMicroliters: number;
  /** Volume, in microliters, the new add-on test requires. */
  requiredVolumeMicroliters: number;
  /** Minimum volume, in microliters, that must remain after this test for any future add-on or repeat. */
  requiresMinimumBufferMicroliters: number;
};

export type AddOnEligibilityResult = {
  eligible: boolean;
  status: AddOnEligibilityStatus;
  hoursSinceCollection: number;
  issues: string[];
};

function result(
  eligible: boolean,
  status: AddOnEligibilityStatus,
  hoursSinceCollection: number,
  issues: string[],
): AddOnEligibilityResult {
  return { eligible, status, hoursSinceCollection, issues: [...issues] };
}

/**
 * Decide whether a new test can be added onto a fabricated, already-
 * collected specimen, composing specimen availability, analyte stability,
 * and remaining volume into a single eligible / ineligible / eligible-with-
 * warning outcome.
 *
 * A discarded or fully consumed specimen short-circuits to
 * `specimen_unavailable` without evaluating stability or volume, since
 * those checks are moot once the specimen no longer exists to draw from.
 * Otherwise, stability is checked first (an expired specimen cannot host
 * any add-on no matter how much volume remains), then volume sufficiency,
 * then whether honoring the test would leave less than the required safety
 * buffer for a future add-on or repeat.
 */
export function evaluateAddOnEligibility(input: AddOnEligibilityInput): AddOnEligibilityResult {
  const hoursSinceCollection = (Date.parse(input.now) - Date.parse(input.collectedAt)) / (1000 * 60 * 60);

  if (input.specimenStatus === 'discarded' || input.specimenStatus === 'fully_consumed') {
    return result(false, 'specimen_unavailable', hoursSinceCollection, [
      `Specimen is ${input.specimenStatus.replace('_', ' ')} and cannot host an add-on test.`,
    ]);
  }

  if (hoursSinceCollection > input.stabilityHoursForAnalyte) {
    return result(false, 'stability_expired', hoursSinceCollection, [
      `Specimen is ${hoursSinceCollection.toFixed(2)}h post-collection, exceeding the analyte's ${input.stabilityHoursForAnalyte}h stability window.`,
    ]);
  }

  if (input.remainingVolumeMicroliters < input.requiredVolumeMicroliters) {
    return result(false, 'insufficient_volume', hoursSinceCollection, [
      `Remaining volume ${input.remainingVolumeMicroliters}uL is less than the ${input.requiredVolumeMicroliters}uL required for this test.`,
    ]);
  }

  const remainingAfterTest = input.remainingVolumeMicroliters - input.requiredVolumeMicroliters;
  if (remainingAfterTest < input.requiresMinimumBufferMicroliters) {
    return result(true, 'eligible_with_buffer_warning', hoursSinceCollection, [
      `Running this test leaves ${remainingAfterTest}uL, below the required ${input.requiresMinimumBufferMicroliters}uL safety buffer for future add-ons or repeats.`,
    ]);
  }

  return result(true, 'eligible', hoursSinceCollection, []);
}
