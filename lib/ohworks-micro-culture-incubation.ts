/**
 * Deterministic, pure OHWorks microbiology culture incubation read
 * scheduler for the synthetic pilot.
 *
 * Given a fabricated specimen's type, the timestamp it was plated, and
 * whether it requires extended incubation (e.g. suspected fastidious
 * organism or prior antibiotic exposure), this module computes the fixed
 * calendar of manual reads and the timestamp at which the culture may be
 * called a final negative under this lab's manual/extended-incubation
 * policy. This is a distinct timing domain from chemistry
 * turnaround-time (lib/ohworks-turnaround-time.ts) and specimen stability
 * windows (lib/ohworks-stability-window.ts): reads are fixed offsets from
 * a single plating timestamp, not stage-to-stage durations or
 * storage-condition segments.
 *
 * This module performs no I/O and reads no clock: every timestamp it
 * reasons about is supplied by the caller.
 */

export type MicroSpecimenType = 'blood' | 'urine' | 'wound' | 'respiratory' | 'stool';

export type ComputeReadScheduleInput = {
  specimenType: MicroSpecimenType;
  /** ISO 8601 UTC timestamp the specimen was plated. */
  platedAt: string;
  /** Whether the culture requires extended incubation, e.g. suspected fastidious organism or prior antibiotic exposure. */
  requiresExtendedIncubation: boolean;
};

export type ScheduledRead = {
  label: string;
  dueAt: string;
};

export type ReadSchedule = {
  reads: ScheduledRead[];
  finalNegativeAt: string;
};

const HOUR_MS = 60 * 60 * 1000;

function addHours(fromMs: number, hours: number): string {
  return new Date(fromMs + hours * HOUR_MS).toISOString();
}

/**
 * Compute the fixed manual read schedule and final-negative timestamp for
 * a plated microbiology culture, per this lab's standard read intervals:
 *
 *   - blood: reads at 24h ("Day 1") and 48h ("Day 2"); if
 *     requiresExtendedIncubation, an additional read at 5 days ("Day 5
 *     extended"). finalNegativeAt is 5 days when extended, else 48h.
 *   - urine: a single read at 18h; finalNegativeAt equals that same 18h
 *     read.
 *   - wound / respiratory: reads at 24h and 48h; finalNegativeAt at 48h,
 *     or 72h when requiresExtendedIncubation.
 *   - stool: reads at 24h, 48h, and 72h; finalNegativeAt is always 72h,
 *     regardless of requiresExtendedIncubation (enteric pathogen
 *     protocols require the full window either way).
 */
export function computeReadSchedule(input: ComputeReadScheduleInput): ReadSchedule {
  const platedAtMs = Date.parse(input.platedAt);
  const extended = input.requiresExtendedIncubation;

  switch (input.specimenType) {
    case 'blood': {
      const reads: ScheduledRead[] = [
        { label: 'Day 1', dueAt: addHours(platedAtMs, 24) },
        { label: 'Day 2', dueAt: addHours(platedAtMs, 48) },
      ];
      if (extended) {
        reads.push({ label: 'Day 5 extended', dueAt: addHours(platedAtMs, 24 * 5) });
      }
      return {
        reads,
        finalNegativeAt: extended ? addHours(platedAtMs, 24 * 5) : addHours(platedAtMs, 48),
      };
    }
    case 'urine': {
      const dueAt = addHours(platedAtMs, 18);
      return {
        reads: [{ label: '18h read', dueAt }],
        finalNegativeAt: dueAt,
      };
    }
    case 'wound':
    case 'respiratory': {
      return {
        reads: [
          { label: 'Day 1', dueAt: addHours(platedAtMs, 24) },
          { label: 'Day 2', dueAt: addHours(platedAtMs, 48) },
        ],
        finalNegativeAt: extended ? addHours(platedAtMs, 72) : addHours(platedAtMs, 48),
      };
    }
    case 'stool': {
      return {
        reads: [
          { label: 'Day 1', dueAt: addHours(platedAtMs, 24) },
          { label: 'Day 2', dueAt: addHours(platedAtMs, 48) },
          { label: 'Day 3', dueAt: addHours(platedAtMs, 72) },
        ],
        finalNegativeAt: addHours(platedAtMs, 72),
      };
    }
  }
}

export type IsReadOverdueInput = {
  /** ISO 8601 UTC timestamp the read was due. */
  dueAt: string;
  /** ISO 8601 UTC timestamp representing the current moment. */
  now: string;
  /** Hours of grace after dueAt before the read is considered overdue. */
  gracePeriodHours: number;
};

/**
 * True when `now` is strictly more than `gracePeriodHours` past `dueAt`.
 * Exactly at the grace-period boundary is not overdue.
 */
export function isReadOverdue(input: IsReadOverdueInput): boolean {
  const dueAtMs = Date.parse(input.dueAt);
  const nowMs = Date.parse(input.now);
  const graceMs = input.gracePeriodHours * HOUR_MS;
  return nowMs > dueAtMs + graceMs;
}
