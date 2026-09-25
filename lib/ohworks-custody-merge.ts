/**
 * Fail-closed, deterministic custody-chain merging for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free merger: given a fabricated parent
 * specimen's custody events and the custody events of each of its aliquots
 * (which may themselves be parents of further aliquots, up to whatever depth
 * the caller supplies), it merges every specimen's events into a single
 * combined timeline ordered by time, with the originating specimen
 * identifier attached to every row. It performs no I/O and touches no real
 * specimen, patient, or customer data — every id, actor, action, and
 * timestamp is caller-supplied and fabricated for tests.
 *
 * A specimen chain is a caller-supplied `specimenId` plus an ordered-or-not
 * list of custody events (an actor, an action, a caller-supplied timestamp,
 * and an optional location). Every non-root specimen also carries a
 * `parentId` naming the specimen it was derived from, which must resolve to
 * either the root parent or another supplied child.
 *
 * Referential integrity is fail-closed and throws instead of guessing at a
 * summary, checked in this order:
 *
 *   1. input-malformed / parent-malformed / children-not-array /
 *      child-malformed / max-gap-malformed — structurally unusable input
 *   2. specimen-id-duplicate      — two supplied specimens share an id
 *   3. unknown-child-identifier   — a child's parentId does not resolve to
 *                                    the root parent or another supplied
 *                                    child
 *   4. cyclic-parent-reference    — following parentId pointers among the
 *                                    supplied specimens loops without ever
 *                                    reaching the root parent
 *
 * Once referential integrity holds, business rules are checked in this
 * order and return an INVALID summary (not a throw) naming the first rule
 * broken:
 *
 *   1. max-gap-invalid            — the declared maximum gap is not a
 *                                    positive number
 *   2. timestamp-invalid          — a custody event's timestamp is not a
 *                                    strict, calendar-valid ISO 8601
 *                                    date-time with an explicit timezone
 *                                    designator (Z or a numeric offset)
 *   3. derivation-event-missing / derivation-event-duplicate — a specimen
 *      referenced as a parent must carry exactly one event whose action is
 *      the derivation marker ('SPLIT')
 *   4. child-precedes-derivation  — a child's earliest event precedes its
 *      immediate parent's derivation event
 *
 * When every rule passes, the merge returns the full combined timeline
 * (every specimen's events, tagged with specimenId, sorted by time) and the
 * list of gaps between chronologically consecutive rows that exceed the
 * declared maximum.
 */

/** The custody event action that marks a specimen's derivation into aliquots. */
export const DERIVATION_ACTION = 'SPLIT';

export type CustodyEvent = {
  /** Synthetic actor identifier. Never a real name. */
  actor: string;
  action: string;
  /** Caller-supplied timestamp, e.g. an ISO 8601 string. Not assumed to be pre-sorted. */
  timestamp: string;
  location?: string;
};

export type SpecimenCustodyChain = {
  /** Synthetic specimen identifier. Never a real specimen id. */
  specimenId: string;
  events: CustodyEvent[];
};

export type ChildCustodyChain = SpecimenCustodyChain & {
  /** The specimenId this specimen was derived from: the root parent or another supplied child. */
  parentId: string;
};

export type CustodyMergeInput = {
  parent: SpecimenCustodyChain;
  children: ChildCustodyChain[];
  /** Milliseconds; a gap between chronologically consecutive timeline rows longer than this is flagged. */
  maxGapMs: number;
};

export type TimelineRow = {
  specimenId: string;
  actor: string;
  action: string;
  timestamp: string;
  location?: string;
};

export type CustodyGapFlag = {
  afterSpecimenId: string;
  afterTimestamp: string;
  beforeSpecimenId: string;
  beforeTimestamp: string;
  gapMs: number;
};

export type CustodyMergeReasonCode =
  | 'max-gap-invalid'
  | 'timestamp-invalid'
  | 'derivation-event-missing'
  | 'derivation-event-duplicate'
  | 'child-precedes-derivation';

const REASON_MESSAGES: Record<CustodyMergeReasonCode, string> = {
  'max-gap-invalid': 'The declared maximum gap must be a positive number of milliseconds.',
  'timestamp-invalid': 'A custody event timestamp could not be parsed.',
  'derivation-event-missing': `A specimen referenced as a parent has no '${DERIVATION_ACTION}' custody event.`,
  'derivation-event-duplicate': `A specimen referenced as a parent has more than one '${DERIVATION_ACTION}' custody event.`,
  'child-precedes-derivation': "A child's earliest custody event precedes its immediate parent's derivation event.",
};

/** Deterministic, human-readable text for a fail-closed reason code. */
export function explainCustodyMergeReason(code: CustodyMergeReasonCode): string {
  return REASON_MESSAGES[code];
}

export type CustodyMergeFailure = {
  /** The specimen the rule was broken for. */
  specimenId: string;
  /** For child-precedes-derivation, the immediate parent the child was checked against. */
  relatedSpecimenId?: string;
  code: CustodyMergeReasonCode;
};

export type CustodyMergeSummary =
  | { status: 'VALID'; parentId: string; timeline: TimelineRow[]; gaps: CustodyGapFlag[] }
  | { status: 'INVALID'; parentId: string; failure: CustodyMergeFailure };

export type CustodyMergeInputErrorCode =
  | 'input-malformed'
  | 'parent-malformed'
  | 'children-not-array'
  | 'child-malformed'
  | 'max-gap-malformed'
  | 'specimen-id-duplicate'
  | 'unknown-child-identifier'
  | 'cyclic-parent-reference';

const INPUT_ERROR_MESSAGES: Record<CustodyMergeInputErrorCode, string> = {
  'input-malformed': 'The merge input is not an object.',
  'parent-malformed': 'The parent specimen is missing a required field or has the wrong shape.',
  'children-not-array': 'The children input is not a list.',
  'child-malformed': 'A child specimen is missing a required field or has the wrong shape.',
  'max-gap-malformed': 'The declared maximum gap is not a finite number.',
  'specimen-id-duplicate': 'Two supplied specimens share the same specimen id.',
  'unknown-child-identifier': "A child's parentId does not resolve to the root parent or another supplied child.",
  'cyclic-parent-reference': 'Following parentId references among the supplied specimens loops without reaching the root parent.',
};

/** Thrown for structurally unusable or referentially unsafe input that cannot be safely assigned a fail-closed summary. */
export class CustodyMergeInputError extends Error {
  readonly code: CustodyMergeInputErrorCode;

  constructor(code: CustodyMergeInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'CustodyMergeInputError';
    this.code = code;
  }
}

function fail(code: CustodyMergeInputErrorCode): never {
  throw new CustodyMergeInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStructurallyValidEvent(raw: unknown): raw is CustodyEvent {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.actor) &&
    isNonEmptyString(raw.action) &&
    isNonEmptyString(raw.timestamp) &&
    (raw.location === undefined || isNonEmptyString(raw.location))
  );
}

function validateEvents(raw: unknown, errorCode: CustodyMergeInputErrorCode): CustodyEvent[] {
  if (!Array.isArray(raw)) {
    fail(errorCode);
  }
  return raw.map((event) => {
    if (!isStructurallyValidEvent(event)) {
      fail(errorCode);
    }
    return event;
  });
}

/**
 * Strict ISO 8601 date-time with an explicit timezone designator (Z or a
 * numeric +HH:MM/-HH:MM offset). Date.parse() also accepts date-only,
 * locale-style, and timezone-less shapes whose absolute instant depends on
 * the host's local timezone; this module never accepts those.
 */
const STRICT_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Days since the Unix epoch for a proleptic-Gregorian calendar date
 * (Howard Hinnant's days_from_civil algorithm). Pure integer arithmetic —
 * consults no Date object and no host timezone.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Parse a strict, explicit-timezone ISO 8601 timestamp into epoch
 * milliseconds, or NaN if it is malformed or names a calendar-invalid date
 * (e.g. 2026-02-30, which Date.parse silently rolls over into March).
 * Computed entirely from the parsed digits and the parsed offset — never
 * from a Date object or the host timezone — so merge ordering is identical
 * no matter what timezone the process runs in.
 */
function parseStrictTimestamp(raw: string): number {
  const match = STRICT_TIMESTAMP_PATTERN.exec(raw);
  if (!match) {
    return NaN;
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fractionStr, tz] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) {
    return NaN;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return NaN;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return NaN;
  }

  let offsetMinutes = 0;
  if (tz !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1;
    const offsetHours = Number(tz.slice(1, 3));
    const offsetMins = Number(tz.slice(4, 6));
    if (offsetHours > 23 || offsetMins > 59) {
      return NaN;
    }
    offsetMinutes = sign * (offsetHours * 60 + offsetMins);
  }

  const fractionMs = fractionStr ? Math.round(Number(`0.${fractionStr}`) * 1000) : 0;
  const utcMs =
    daysFromCivil(year, month, day) * 86_400_000 +
    hour * 3_600_000 +
    minute * 60_000 +
    second * 1_000 +
    fractionMs;

  return utcMs - offsetMinutes * 60_000;
}

type SpecimenNode = {
  specimenId: string;
  parentId: string | null;
  events: CustodyEvent[];
};

/**
 * Merge a parent specimen's custody chain with the custody chains of its
 * aliquots into one combined timeline.
 *
 * Fail-closed: structural and referential-integrity problems (see module doc
 * comment) throw CustodyMergeInputError instead of guessing at a summary.
 * Business rules are checked in a fixed order and this returns the first one
 * the merge breaks, or the full combined timeline and gap flags if every
 * rule passes.
 */
export function mergeCustodyChains(rawInput: unknown): CustodyMergeSummary {
  if (!isPlainObject(rawInput)) {
    fail('input-malformed');
  }

  const { parent, children, maxGapMs } = rawInput;

  if (!isPlainObject(parent) || !isNonEmptyString(parent.specimenId)) {
    fail('parent-malformed');
  }
  const parentEvents = validateEvents(parent.events, 'parent-malformed');
  const parentId = parent.specimenId;

  if (!Array.isArray(children)) {
    fail('children-not-array');
  }
  const validatedChildren: ChildCustodyChain[] = children.map((raw) => {
    if (!isPlainObject(raw) || !isNonEmptyString(raw.specimenId) || !isNonEmptyString(raw.parentId)) {
      fail('child-malformed');
    }
    const events = validateEvents(raw.events, 'child-malformed');
    return { specimenId: raw.specimenId, parentId: raw.parentId, events };
  });

  if (!isFiniteNumber(maxGapMs)) {
    fail('max-gap-malformed');
  }

  const nodes = new Map<string, SpecimenNode>();
  nodes.set(parentId, { specimenId: parentId, parentId: null, events: parentEvents });
  for (const child of validatedChildren) {
    if (nodes.has(child.specimenId)) {
      fail('specimen-id-duplicate');
    }
    nodes.set(child.specimenId, { specimenId: child.specimenId, parentId: child.parentId, events: child.events });
  }

  for (const child of validatedChildren) {
    if (!nodes.has(child.parentId)) {
      fail('unknown-child-identifier');
    }
  }

  for (const id of nodes.keys()) {
    let current: string | null = id;
    let steps = 0;
    while (current !== null) {
      const node = nodes.get(current);
      if (!node) {
        break;
      }
      current = node.parentId;
      steps += 1;
      if (steps > nodes.size) {
        fail('cyclic-parent-reference');
      }
    }
  }

  const invalid = (specimenId: string, code: CustodyMergeReasonCode, relatedSpecimenId?: string): CustodyMergeSummary => ({
    status: 'INVALID',
    parentId,
    failure: relatedSpecimenId === undefined ? { specimenId, code } : { specimenId, code, relatedSpecimenId },
  });

  if (maxGapMs <= 0) {
    return invalid(parentId, 'max-gap-invalid');
  }

  const timestampMsByNode = new Map<string, number[]>();
  for (const [specimenId, node] of nodes) {
    const parsed: number[] = [];
    for (const event of node.events) {
      const ms = parseStrictTimestamp(event.timestamp);
      if (!Number.isFinite(ms)) {
        return invalid(specimenId, 'timestamp-invalid');
      }
      parsed.push(ms);
    }
    timestampMsByNode.set(specimenId, parsed);
  }

  const referencedParentIds: string[] = [];
  const seenReferencedParentIds = new Set<string>();
  for (const child of validatedChildren) {
    if (!seenReferencedParentIds.has(child.parentId)) {
      seenReferencedParentIds.add(child.parentId);
      referencedParentIds.push(child.parentId);
    }
  }

  const derivationMsByNode = new Map<string, number>();
  for (const ancestorId of referencedParentIds) {
    const node = nodes.get(ancestorId);
    const times = timestampMsByNode.get(ancestorId);
    if (!node || !times) {
      continue;
    }
    let derivationIndex = -1;
    let matchCount = 0;
    for (let index = 0; index < node.events.length; index += 1) {
      if (node.events[index].action === DERIVATION_ACTION) {
        matchCount += 1;
        derivationIndex = index;
      }
    }
    if (matchCount === 0) {
      return invalid(ancestorId, 'derivation-event-missing');
    }
    if (matchCount > 1) {
      return invalid(ancestorId, 'derivation-event-duplicate');
    }
    derivationMsByNode.set(ancestorId, times[derivationIndex]);
  }

  for (const child of validatedChildren) {
    const childTimes = timestampMsByNode.get(child.specimenId);
    if (!childTimes || childTimes.length === 0) {
      continue;
    }
    const derivationMs = derivationMsByNode.get(child.parentId);
    if (derivationMs === undefined) {
      continue;
    }
    const earliestChildMs = Math.min(...childTimes);
    if (earliestChildMs < derivationMs) {
      return invalid(child.specimenId, 'child-precedes-derivation', child.parentId);
    }
  }

  type SortableRow = TimelineRow & { __ms: number; __order: number };
  const rows: SortableRow[] = [];
  let order = 0;
  for (const [specimenId, node] of nodes) {
    const times = timestampMsByNode.get(specimenId) ?? [];
    for (let index = 0; index < node.events.length; index += 1) {
      const event = node.events[index];
      const row: SortableRow = {
        specimenId,
        actor: event.actor,
        action: event.action,
        timestamp: event.timestamp,
        __ms: times[index],
        __order: order,
      };
      if (event.location !== undefined) {
        row.location = event.location;
      }
      rows.push(row);
      order += 1;
    }
  }

  rows.sort((a, b) => {
    if (a.__ms !== b.__ms) {
      return a.__ms - b.__ms;
    }
    if (a.specimenId !== b.specimenId) {
      return a.specimenId < b.specimenId ? -1 : 1;
    }
    return a.__order - b.__order;
  });

  const gaps: CustodyGapFlag[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const gapMs = current.__ms - previous.__ms;
    if (gapMs > maxGapMs) {
      gaps.push({
        afterSpecimenId: previous.specimenId,
        afterTimestamp: previous.timestamp,
        beforeSpecimenId: current.specimenId,
        beforeTimestamp: current.timestamp,
        gapMs,
      });
    }
  }

  const timeline: TimelineRow[] = rows.map((row) => {
    const timelineRow: TimelineRow = {
      specimenId: row.specimenId,
      actor: row.actor,
      action: row.action,
      timestamp: row.timestamp,
    };
    if (row.location !== undefined) {
      timelineRow.location = row.location;
    }
    return timelineRow;
  });

  return { status: 'VALID', parentId, timeline, gaps };
}
