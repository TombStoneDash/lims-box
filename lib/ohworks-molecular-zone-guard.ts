/**
 * Molecular/PCR contamination-control zone guard for the synthetic OHWorks
 * pilot.
 *
 * Molecular/PCR testing requires a technologist to move in one direction
 * through four physically separated zones over a shift — reagent prep,
 * specimen prep/extraction, amplification/PCR setup, then
 * post-amplification/detection — and never re-enter an earlier zone after
 * visiting a later one, since post-amplification amplicon contamination of
 * an earlier zone (especially reagent prep) is a classic false-positive
 * source. This module is a pure, dependency-free validator: given a
 * technologist's ordered zone visitation history for the shift and a
 * proposed next zone, it reports whether the move is allowed and, if not,
 * why. It performs no I/O and touches no real technologist, patient, or
 * customer data — only synthetic identifiers and bounded zone names ever
 * appear in its input or output.
 */

/** The mandated one-way zone order for a molecular/PCR shift. */
export const ZONE_ORDER = ['reagent_prep', 'specimen_prep', 'amplification', 'post_amplification'] as const;

export type MolecularZone = (typeof ZONE_ORDER)[number];

const ZONE_INDEX: ReadonlyMap<string, number> = new Map(ZONE_ORDER.map((zone, index) => [zone, index]));

export type ZoneTransitionViolationType = 'backward_movement' | 'invalid_zone' | null;

export type ZoneTransitionInput = {
  technologistId: string;
  /** Zone names visited so far this shift, in visitation order. */
  priorZonesVisitedThisShift: string[];
  proposedZone: string;
};

export type ZoneTransitionResult = {
  allowed: boolean;
  violationType: ZoneTransitionViolationType;
  reason: string;
};

/**
 * Validate a technologist's proposed move into a molecular/PCR zone against
 * the mandated one-way zone order for the shift so far.
 *
 * Rules, checked in order:
 *   1. The proposed zone must be one of ZONE_ORDER, else it is rejected as
 *      'invalid_zone'.
 *   2. If no zone has been visited yet this shift, any valid zone is
 *      allowed as a starting point (the reason notes when the start is not
 *      'reagent_prep', without blocking it).
 *   3. Otherwise, the proposed zone's index is compared against the
 *      highest zone index reached so far. Moving to an earlier zone is
 *      rejected as 'backward_movement'; staying in the same zone or
 *      advancing forward is allowed.
 */
export function validateZoneTransition(input: ZoneTransitionInput): ZoneTransitionResult {
  const { technologistId, priorZonesVisitedThisShift, proposedZone } = input;

  const proposedIndex = ZONE_INDEX.get(proposedZone);
  if (proposedIndex === undefined) {
    return {
      allowed: false,
      violationType: 'invalid_zone',
      reason: `Technologist ${technologistId} proposed zone "${proposedZone}", which is not a recognized molecular/PCR zone.`,
    };
  }

  if (priorZonesVisitedThisShift.length === 0) {
    const startNote =
      proposedZone === 'reagent_prep'
        ? ''
        : ` Starting the shift in "${proposedZone}" rather than "reagent_prep" is unusual but is not blocked.`;
    return {
      allowed: true,
      violationType: null,
      reason: `Technologist ${technologistId} has not visited any zone yet this shift, so "${proposedZone}" is allowed as the starting zone.${startNote}`,
    };
  }

  let highestIndexReached = -1;
  for (const visitedZone of priorZonesVisitedThisShift) {
    const visitedIndex = ZONE_INDEX.get(visitedZone);
    if (visitedIndex !== undefined && visitedIndex > highestIndexReached) {
      highestIndexReached = visitedIndex;
    }
  }
  const highestZoneReached = ZONE_ORDER[highestIndexReached];

  if (proposedIndex < highestIndexReached) {
    return {
      allowed: false,
      violationType: 'backward_movement',
      reason: `Technologist ${technologistId} has already reached "${highestZoneReached}" this shift and may not move back to "${proposedZone}": re-entering an earlier zone risks carrying post-amplification amplicon contamination backward.`,
    };
  }

  return {
    allowed: true,
    violationType: null,
    reason: `Technologist ${technologistId} moving from having reached "${highestZoneReached}" to "${proposedZone}" is not a backward move and is allowed.`,
  };
}

/**
 * Whether moving between two zones requires a full PPE changeout. True
 * whenever the zones differ — standard molecular lab practice requires a
 * full PPE changeout for any zone change, not only when moving into
 * post_amplification.
 */
export function requiresFullPpeChangeout(fromZone: string, toZone: string): boolean {
  return fromZone !== toZone;
}
