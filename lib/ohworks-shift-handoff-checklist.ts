/**
 * Pure, dependency-free OHWorks shift handoff checklist builder.
 *
 * This module composes state that already exists elsewhere in the OHWorks
 * module family (open worklist items, pending critical values, QC
 * out-of-range counts, and down instruments) into a single deterministic
 * checklist an outgoing analyst can hand to the incoming one. It performs
 * no I/O, reads no system clock (the caller supplies `now`), and touches no
 * SENAITE, database, or real patient/customer data.
 *
 * Severity rules:
 *
 *   - A pending critical value without a valid notification timestamp at or before now is `blocking`:
 *     a critical result must be acknowledged before handoff, never silently
 *     passed along.
 *   - An open worklist item with `stat` or `critical` priority that has
 *     been open for at least STALE_STAT_MINUTES is `blocking`; the same
 *     priorities under that age are `info`. `routine` items are always
 *     `attention` regardless of age, and are never promoted to `blocking`
 *     purely by staleness. Invalid enteredAt or now timestamps are blocking.
 *   - `qcOutOfRangeCount > 0` is `attention`, unless it meets or exceeds
 *     QC_BLOCKING_THRESHOLD, in which case it is `blocking`.
 *   - Any down instrument is `attention`.
 *
 * `readyForHandoff` is true only when no item is `blocking`. Items are
 * sorted blocking-first, then attention, then info; within a severity
 * group, items are sorted by category name for a deterministic order that
 * does not depend on input ordering.
 */

/** Minutes a stat/critical open worklist item may remain open before it becomes blocking. */
export const STALE_STAT_MINUTES = 60;

/** Number of out-of-range QC results at or above which the QC item becomes blocking. */
export const QC_BLOCKING_THRESHOLD = 3;

export type OpenWorklistItemPriority = 'routine' | 'stat' | 'critical';
export type OpenWorklistItemStatus = 'pending' | 'in_progress' | 'held';

/** Fabricated open worklist item awaiting handoff review. Never a real specimen or accession record. */
export type OpenWorklistItem = {
  specimenId: string;
  testCode: string;
  status: OpenWorklistItemStatus;
  priority: OpenWorklistItemPriority;
  /** ISO-8601 timestamp the item entered the worklist. */
  enteredAt: string;
};

/** Fabricated pending critical value awaiting acknowledgement. Never a real patient result. */
export type PendingCriticalValue = {
  specimenId: string;
  analyte: string;
  value: number;
  /** ISO-8601 timestamp the physician/caregiver was notified, or null if not yet acknowledged. */
  notifiedAt: string | null;
};

/** Fabricated down instrument awaiting return to service. */
export type DownInstrument = {
  instrumentId: string;
  reason: string;
};

export type ShiftHandoffChecklistInput = {
  openWorklistItems: OpenWorklistItem[];
  pendingCriticalValues: PendingCriticalValue[];
  qcOutOfRangeCount: number;
  instrumentsDown: DownInstrument[];
  /** ISO-8601 timestamp treated as "now" for staleness calculations. */
  now: string;
};

export type HandoffItemCategory = 'open_worklist' | 'critical_value' | 'qc' | 'instrument';
export type HandoffItemSeverity = 'info' | 'attention' | 'blocking';

export type HandoffItem = {
  category: HandoffItemCategory;
  description: string;
  severity: HandoffItemSeverity;
};

export type ShiftHandoffChecklist = {
  generatedAt: string;
  items: HandoffItem[];
  readyForHandoff: boolean;
  blockingIssueCount: number;
};

const SEVERITY_RANK: Record<HandoffItemSeverity, number> = {
  blocking: 0,
  attention: 1,
  info: 2,
};

/** Validate zoned ISO timestamps before Date.parse can normalize impossible dates. */
function timestampMillis(value: string | null): number | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = parts;
  const y = Number(year);
  const m = Number(month);
  const leapYear = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    m < 1 || m > 12 || Number(day) < 1 || Number(day) > daysInMonth[m - 1] ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
    (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
  ) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function buildWorklistItems(input: ShiftHandoffChecklistInput, now: number | null): HandoffItem[] {
  return input.openWorklistItems.map((item) => {
    const enteredAt = timestampMillis(item.enteredAt);
    const invalidTime = enteredAt === null || now === null;
    const severity: HandoffItemSeverity = invalidTime
      ? 'blocking'
      : item.priority === 'routine'
        ? 'attention'
        : (now - enteredAt) / 60000 >= STALE_STAT_MINUTES ? 'blocking' : 'info';
    return {
      category: 'open_worklist',
      description: invalidTime
        ? `${item.priority} ${item.testCode} for specimen ${item.specimenId} is ${item.status}; age cannot be determined because ${enteredAt === null ? 'enteredAt is invalid' : 'now is invalid'}.`
        : `${item.priority} ${item.testCode} for specimen ${item.specimenId} is ${item.status} (entered ${item.enteredAt}).`,
      severity,
    } satisfies HandoffItem;
  });
}

function buildCriticalValueItems(input: ShiftHandoffChecklistInput, now: number | null): HandoffItem[] {
  return input.pendingCriticalValues.map((entry) => {
    const notifiedAt = timestampMillis(entry.notifiedAt);
    const acknowledged = notifiedAt !== null && now !== null && notifiedAt <= now;
    return {
      category: 'critical_value',
      description: acknowledged
        ? `Critical value for ${entry.analyte} on specimen ${entry.specimenId} was notified at ${entry.notifiedAt}.`
        : notifiedAt === null
          ? `Critical value for ${entry.analyte} on specimen ${entry.specimenId} has no valid notification timestamp; notification is unverified.`
          : now === null
            ? `Critical value for ${entry.analyte} on specimen ${entry.specimenId} cannot be verified because the checklist time is invalid.`
            : `Critical value for ${entry.analyte} on specimen ${entry.specimenId} has a notification time after the checklist time; notification is unverified.`,
      severity: acknowledged ? 'info' : 'blocking',
    } satisfies HandoffItem;
  });
}

function buildQCItem(input: ShiftHandoffChecklistInput): HandoffItem[] {
  if (input.qcOutOfRangeCount <= 0) {
    return [];
  }
  const severity: HandoffItemSeverity =
    input.qcOutOfRangeCount >= QC_BLOCKING_THRESHOLD ? 'blocking' : 'attention';
  return [
    {
      category: 'qc',
      description: `${input.qcOutOfRangeCount} QC result(s) out of range.`,
      severity,
    } satisfies HandoffItem,
  ];
}

function buildInstrumentItems(input: ShiftHandoffChecklistInput): HandoffItem[] {
  return input.instrumentsDown.map(
    (instrument) =>
      ({
        category: 'instrument',
        description: `Instrument ${instrument.instrumentId} is down: ${instrument.reason}.`,
        severity: 'attention',
      }) satisfies HandoffItem,
  );
}

function compareItems(a: HandoffItem, b: HandoffItem): number {
  const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }
  return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
}

/**
 * Build a deterministic shift handoff checklist from the current state of
 * open worklist items, pending critical values, QC out-of-range count, and
 * down instruments. Items are sorted blocking-first, then attention, then
 * info, and by category name within each severity group.
 */
export function buildShiftHandoffChecklist(input: ShiftHandoffChecklistInput): ShiftHandoffChecklist {
  const now = timestampMillis(input.now);
  const items: HandoffItem[] = [
    ...(now === null ? [{
      category: 'open_worklist' as const,
      description: 'Checklist now timestamp is invalid; handoff readiness cannot be verified.',
      severity: 'blocking' as const,
    }] : []),
    ...buildWorklistItems(input, now),
    ...buildCriticalValueItems(input, now),
    ...buildQCItem(input),
    ...buildInstrumentItems(input),
  ].sort(compareItems);

  const blockingIssueCount = items.filter((item) => item.severity === 'blocking').length;

  return {
    generatedAt: input.now,
    items,
    readyForHandoff: blockingIssueCount === 0,
    blockingIssueCount,
  };
}
