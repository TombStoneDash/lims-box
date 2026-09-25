/**
 * Fail-closed synthetic POCT (point-of-care testing) device lockout
 * evaluator.
 *
 * Central-lab QC evaluation (see ohworks-qc-westgard.ts) and instrument flag
 * mapping (see ohworks-instrument-flags.ts) both assume results flow through
 * a central lab review workflow. Bedside POCT devices -- handheld glucose
 * meters, cartridge-based analyzers -- have no such intermediary: CLIA POCT
 * practice requires that a device failing its own internal or liquid QC
 * check be locked out from producing patient results until a documented
 * corrective QC run passes.
 *
 * This module is a pure, dependency-free, stateless evaluator: given a
 * device's most recent QC result and timing, plus the caller's declared QC
 * frequency and whether a lockout was already active, it decides only the
 * CURRENT lockout state. It does not track lockout history itself -- the
 * caller is responsible for persisting `locked` across calls. It performs
 * no I/O, reads no system clock (the caller supplies `now`), mutates no
 * SENAITE or database state, and touches no real device or patient data.
 */

export type PoctQcResult = 'pass' | 'fail' | 'not_run';

export type PoctLockoutInput = {
  /** Synthetic device identifier. */
  deviceId: string;
  lastQcResult: PoctQcResult;
  /** ISO 8601 timestamp of the last QC run, or null if none is on record. */
  lastQcAt: string | null;
  /** ISO 8601 timestamp of the current evaluation moment, caller-supplied. */
  now: string;
  /** How many hours a passing QC result remains valid before it is overdue. */
  qcFrequencyHours: number;
  /** Whether a lockout was already active going into this evaluation. */
  priorLockoutActive: boolean;
};

export type PoctLockoutState = {
  locked: boolean;
  /** Deterministic, privacy-safe human-readable reason for the current state. */
  reason: string;
  qcOverdue: boolean;
};

/**
 * Decide a POCT device's current lockout state from its most recent QC
 * result and timing.
 *
 * Rules:
 *   - `lastQcResult: 'fail'` -> always locked, regardless of timing.
 *   - `lastQcResult: 'not_run'` or a null `lastQcAt` -> locked, no QC on
 *     record.
 *   - `lastQcResult: 'pass'` within `qcFrequencyHours` of `now` -> unlocked.
 *   - `lastQcResult: 'pass'` beyond `qcFrequencyHours` of `now` -> locked,
 *     `qcOverdue: true` (a passed QC does not stay valid forever).
 *
 * `priorLockoutActive` is accepted for context but does not change the
 * decision: this function is stateless per call and derives the current
 * state solely from the current QC result and timing, so a fresh passing
 * QC within frequency always clears a prior lockout.
 */
export function evaluateLockoutState(input: PoctLockoutInput): PoctLockoutState {
  if (input.lastQcResult === 'fail') {
    return {
      locked: true,
      reason: `Device ${input.deviceId} is locked out: its last QC run failed.`,
      qcOverdue: false,
    };
  }

  if (input.lastQcResult === 'not_run' || input.lastQcAt === null) {
    return {
      locked: true,
      reason: `Device ${input.deviceId} is locked out: no QC on record.`,
      qcOverdue: false,
    };
  }

  const nowMs = Date.parse(input.now);
  const lastQcAtMs = Date.parse(input.lastQcAt);
  const elapsedHours = (nowMs - lastQcAtMs) / (1000 * 60 * 60);

  if (elapsedHours <= input.qcFrequencyHours) {
    return {
      locked: false,
      reason: `Device ${input.deviceId} is unlocked: its last QC run passed and is within the required ${input.qcFrequencyHours}-hour frequency.`,
      qcOverdue: false,
    };
  }

  return {
    locked: true,
    reason: `Device ${input.deviceId} is locked out: its last passing QC run is overdue for the required ${input.qcFrequencyHours}-hour frequency.`,
    qcOverdue: true,
  };
}

/**
 * Whether clearing a device's current lockout requires a documented
 * supervisor override, per CLIA POCT practice: true only when the device is
 * locked and its last QC result was a genuine failure. An overdue-but-not-
 * failed lockout clears itself with a fresh passing QC run and needs no
 * override.
 */
export function requiresSupervisorOverrideToUnlock(input: {
  locked: boolean;
  lastQcResult: PoctQcResult;
}): boolean {
  return input.locked && input.lastQcResult === 'fail';
}
