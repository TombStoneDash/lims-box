/**
 * Pure, dependency-free blood bank crossmatch hold evaluator for the
 * synthetic OHWorks pilot.
 *
 * Transfusion/blood bank work has hold rules distinct from a general
 * specimen-rejection or QC check: a stale type-and-screen sample can miss a
 * newly formed antibody, so sample age is checked before antibody status
 * even matters. Given a fabricated type-and-screen snapshot for a single
 * patient/order, this module returns one conservative disposition:
 *
 *   - hold_sample_expired: the sample is older than the facility's policy
 *     limit for this patient and must be redrawn before any antibody result
 *     can be trusted.
 *   - hold_pending_screen: the antibody screen has not resulted yet.
 *   - hold_antibody_workup: a current positive screen or any antibody
 *     already on record requires a full serologic crossmatch.
 *   - clear_to_crossmatch: ABO/Rh are on file, the screen is negative, and
 *     there is no antibody history, so an electronic crossmatch is eligible.
 *
 * It performs no I/O and touches no real patient or SENAITE data.
 */

export type AboType = 'A' | 'B' | 'AB' | 'O';
export type RhDType = 'positive' | 'negative';
export type AntibodyScreenResult = 'negative' | 'positive' | 'pending';

export type CrossmatchHoldStatus =
  | 'clear_to_crossmatch'
  | 'hold_antibody_workup'
  | 'hold_sample_expired'
  | 'hold_pending_screen';

export type CrossmatchHoldInput = {
  abo: AboType;
  rhD: RhDType;
  antibodyScreenResult: AntibodyScreenResult;
  /** Prior identified antibodies on record, e.g. ['Anti-K']. Empty if none on record. */
  priorAntibodyIdentified: string[];
  requestedUnitCount: number;
  sampleAgeHours: number;
  /** The facility's policy limit for this patient, e.g. 72 for recent transfusion/pregnancy history, else a larger number. */
  maxSampleAgeHoursForType: number;
};

export type CrossmatchHoldDecision = {
  status: CrossmatchHoldStatus;
  requiresExtendedCrossmatch: boolean;
  reason: string;
};

/**
 * Evaluate a fabricated type-and-screen snapshot and return one conservative
 * crossmatch disposition.
 *
 * Rules, in priority order:
 *   1. sampleAgeHours > maxSampleAgeHoursForType -> hold_sample_expired.
 *      Checked before antibody status because an expired sample makes any
 *      antibody result unusable.
 *   2. antibodyScreenResult === 'pending' -> hold_pending_screen.
 *   3. antibodyScreenResult === 'positive' or priorAntibodyIdentified is
 *      non-empty -> hold_antibody_workup, requiresExtendedCrossmatch true.
 *   4. Otherwise -> clear_to_crossmatch, requiresExtendedCrossmatch false.
 *
 * requestedUnitCount is validated but never changes the status: a value
 * less than 1 throws instead of silently proceeding with a nonsensical
 * order.
 */
export function evaluateCrossmatchHold(input: CrossmatchHoldInput): CrossmatchHoldDecision {
  if (input.requestedUnitCount < 1) {
    throw new Error(`requestedUnitCount must be at least 1, received ${input.requestedUnitCount}`);
  }

  if (input.sampleAgeHours > input.maxSampleAgeHoursForType) {
    return {
      status: 'hold_sample_expired',
      requiresExtendedCrossmatch: false,
      reason:
        'The type-and-screen sample is older than the facility policy limit for this patient; a fresh sample must be redrawn before crossmatch because a stale sample can miss a newly formed antibody.',
    };
  }

  if (input.antibodyScreenResult === 'pending') {
    return {
      status: 'hold_pending_screen',
      requiresExtendedCrossmatch: false,
      reason: 'The antibody screen has not resulted yet; crossmatch cannot proceed until it does.',
    };
  }

  if (input.antibodyScreenResult === 'positive' || input.priorAntibodyIdentified.length > 0) {
    return {
      status: 'hold_antibody_workup',
      requiresExtendedCrossmatch: true,
      reason:
        'A current positive antibody screen or a previously identified antibody on record requires a full serologic crossmatch, not an electronic or immediate-spin crossmatch.',
    };
  }

  return {
    status: 'clear_to_crossmatch',
    requiresExtendedCrossmatch: false,
    reason:
      'ABO/Rh are on file, the antibody screen is negative, the sample is within the facility policy age limit, and there is no antibody history, so an electronic crossmatch is eligible.',
  };
}
