/**
 * Pure, dependency-free OHWorks critical-value ESCALATION planner.
 *
 * lib/ohworks-critical-value-log.ts records a single notification attempt
 * chain and whether it was ultimately acknowledged (via its `reached`-style
 * `readBackConfirmed` field on each attempt). This module answers a
 * different, upstream question: given a fabricated escalation chain
 * (ordering provider -> covering provider -> charge nurse/unit -> lab
 * director) and the attempts logged so far, who should be contacted next —
 * or, if the entire chain has been exhausted without anyone acknowledging
 * the critical result, that fact must be surfaced as a hard alert rather
 * than silently dropped, since an unacknowledged critical result is a
 * patient-safety event.
 *
 * It performs no I/O, reads no system clock (the caller supplies `now`),
 * mutates no SENAITE or database state, and touches no real subject,
 * sample, or contact data.
 */

export type EscalationRole = 'ordering_provider' | 'covering_provider' | 'charge_nurse' | 'lab_director';

export type EscalationContact = {
  role: EscalationRole;
  name: string;
  contactMethod: string;
};

export type EscalationAttemptRecord = {
  /** Index into the caller-supplied escalationChain this attempt targeted. */
  chainIndex: number;
  /** Caller-supplied ISO 8601 timestamp this attempt was made. */
  attemptedAt: string;
  /** Whether the contact was reached (acknowledged). Mirrors the notification-attempt shape in ohworks-critical-value-log.ts. */
  reached: boolean;
};

export type PlanNextEscalationContactInput = {
  /** Ordered escalation chain: ordering provider -> covering provider -> charge nurse/unit -> lab director. */
  escalationChain: EscalationContact[];
  attemptsSoFar: EscalationAttemptRecord[];
  /** Attempts allowed against a single chain entry, with none reached, before it is considered exhausted for this cycle. */
  maxAttemptsPerContact: number;
  /** Caller-supplied ISO 8601 "current" timestamp. Never read from the system clock. */
  now: string;
  /** Minimum minutes required between two attempts to the same chain entry. */
  minMinutesBetweenAttemptsToSameContact: number;
};

export type EscalationAction = 'contact_now' | 'wait' | 'escalation_chain_exhausted';

export type EscalationPlan = {
  action: EscalationAction;
  targetChainIndex: number | null;
  targetContact: EscalationContact | null;
  waitMinutes: number;
  reason: string;
};

/**
 * Decide who to contact next for an unacknowledged critical result, walking
 * the escalation chain in order.
 *
 * IMPORTANT: a caller must check attemptsSoFar for a `reached: true` entry
 * as the PRIMARY signal that the critical result has already been
 * acknowledged. The 'already acknowledged, no further escalation needed'
 * reason returned here is a convenience sentinel, not the source of truth —
 * once acknowledged, further escalation is not meaningful, and this
 * function short-circuits immediately rather than computing a target.
 */
export function planNextEscalationContact(input: PlanNextEscalationContactInput): EscalationPlan {
  const { escalationChain, attemptsSoFar, maxAttemptsPerContact, now, minMinutesBetweenAttemptsToSameContact } = input;

  if (attemptsSoFar.some((attempt) => attempt.reached)) {
    return {
      action: 'contact_now',
      targetChainIndex: null,
      targetContact: null,
      waitMinutes: 0,
      reason: 'already acknowledged, no further escalation needed',
    };
  }

  const nowTime = Date.parse(now);

  let targetIndex: number | null = null;
  for (let index = 0; index < escalationChain.length; index += 1) {
    const attemptsForContact = attemptsSoFar.filter((attempt) => attempt.chainIndex === index);
    const failedAttemptCount = attemptsForContact.filter((attempt) => !attempt.reached).length;
    const exhausted = failedAttemptCount >= maxAttemptsPerContact;
    if (!exhausted) {
      targetIndex = index;
      break;
    }
  }

  if (targetIndex === null) {
    return {
      action: 'escalation_chain_exhausted',
      targetChainIndex: null,
      targetContact: null,
      waitMinutes: 0,
      reason: 'every contact in the escalation chain has been exhausted without acknowledgment; this is a hard alert',
    };
  }

  const targetContact = escalationChain[targetIndex];
  const attemptsForTarget = attemptsSoFar.filter((attempt) => attempt.chainIndex === targetIndex);

  let mostRecentAttemptTime: number | null = null;
  for (const attempt of attemptsForTarget) {
    const attemptTime = Date.parse(attempt.attemptedAt);
    if (mostRecentAttemptTime === null || attemptTime > mostRecentAttemptTime) {
      mostRecentAttemptTime = attemptTime;
    }
  }

  if (mostRecentAttemptTime !== null) {
    const minutesSinceLastAttempt = (nowTime - mostRecentAttemptTime) / 60000;
    if (minutesSinceLastAttempt < minMinutesBetweenAttemptsToSameContact) {
      const waitMinutes = minMinutesBetweenAttemptsToSameContact - minutesSinceLastAttempt;
      return {
        action: 'wait',
        targetChainIndex: targetIndex,
        targetContact,
        waitMinutes,
        reason: `next attempt to ${targetContact.role} must wait until the minimum between-attempt interval has elapsed`,
      };
    }
  }

  return {
    action: 'contact_now',
    targetChainIndex: targetIndex,
    targetContact,
    waitMinutes: 0,
    reason: `${targetContact.role} is the next non-exhausted, unreached contact in the escalation chain and is ready to be contacted now`,
  };
}
