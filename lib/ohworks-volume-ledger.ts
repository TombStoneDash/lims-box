/**
 * Fail-closed, deterministic specimen volume ledger for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free reducer: given a fabricated
 * specimen (an accession id, an initial volume, and a declared dead volume)
 * plus an ordered list of caller-supplied events, it replays the events in
 * order and returns either the full applied ledger (including the running
 * balance after every event) or the first rule the ledger breaks.
 *
 * Two kinds of event are supported:
 *
 *   - CONSUMPTION — a test run, aliquot, waste, or evaporation adjustment
 *                    that removes a positive amount from the specimen's
 *                    remaining volume. Consumption may dip into the
 *                    specimen's declared dead volume, but never beyond it:
 *                    an event's amount must not exceed the remaining volume
 *                    plus the dead volume.
 *   - REVERSAL     — undoes exactly one prior CONSUMPTION event, restoring
 *                    its amount to the remaining volume. A reversal must
 *                    carry a reason and must target the single most recent
 *                    event in the whole ledger (by event order, not just
 *                    the most recent consumption) — reversing anything else
 *                    is rejected, as is reversing an event twice.
 *
 * Every event carries a caller-supplied timestamp. Events must arrive in
 * non-decreasing timestamp order; an out-of-order timestamp is rejected.
 *
 * A ledger is rejected, in this order, for the first rule broken:
 *
 *   1. initial-volume-invalid  — the specimen's initial volume is zero or
 *                                 negative
 *   2. dead-volume-invalid     — the declared dead volume is negative
 *   3. (per event, in order)   — duplicate-event-id, timestamp-unordered,
 *                                 then for a CONSUMPTION event:
 *                                 amount-invalid, kind-unknown,
 *                                 over-consumption; or for a REVERSAL
 *                                 event: reason-empty, target-not-found,
 *                                 target-already-reversed, target-not-latest
 *
 * Structurally unusable input (not an object, a missing required field, or
 * the wrong type) throws a typed error instead of guessing at a summary.
 * Every fixture used to exercise this module is synthetic: it names no
 * real specimen, patient, or lab record.
 */

/** Bounded, synthetic consumption event kind registry. */
export type VolumeLedgerEventKind = 'TEST_RUN' | 'ALIQUOT' | 'WASTE' | 'EVAPORATION_ADJUSTMENT';

const KNOWN_EVENT_KINDS: ReadonlySet<string> = new Set<VolumeLedgerEventKind>([
  'TEST_RUN',
  'ALIQUOT',
  'WASTE',
  'EVAPORATION_ADJUSTMENT',
]);

export type SpecimenVolumeState = {
  /** Synthetic accession identifier. Never a real specimen id. */
  accessionId: string;
  initialVolume: number;
  deadVolume: number;
};

export type ConsumptionEventInput = {
  entryType: 'CONSUMPTION';
  eventId: string;
  kind: VolumeLedgerEventKind;
  amount: number;
  timestamp: number;
};

export type ReversalEventInput = {
  entryType: 'REVERSAL';
  eventId: string;
  targetEventId: string;
  reason: string;
  timestamp: number;
};

export type VolumeLedgerEventInput = ConsumptionEventInput | ReversalEventInput;

export type VolumeLedgerInput = {
  specimen: SpecimenVolumeState;
  events: VolumeLedgerEventInput[];
};

export type AppliedConsumptionEvent = {
  entryType: 'CONSUMPTION';
  eventId: string;
  kind: VolumeLedgerEventKind;
  amount: number;
  timestamp: number;
  remainingVolumeAfter: number;
  reversed: boolean;
};

export type AppliedReversalEvent = {
  entryType: 'REVERSAL';
  eventId: string;
  targetEventId: string;
  reason: string;
  timestamp: number;
  remainingVolumeAfter: number;
};

export type AppliedVolumeLedgerEvent = AppliedConsumptionEvent | AppliedReversalEvent;

export type VolumeLedgerReasonCode =
  | 'initial-volume-invalid'
  | 'dead-volume-invalid'
  | 'duplicate-event-id'
  | 'timestamp-unordered'
  | 'amount-invalid'
  | 'kind-unknown'
  | 'over-consumption'
  | 'reason-empty'
  | 'target-not-found'
  | 'target-already-reversed'
  | 'target-not-latest';

const REASON_MESSAGES: Record<VolumeLedgerReasonCode, string> = {
  'initial-volume-invalid': 'The specimen initial volume must be a positive number.',
  'dead-volume-invalid': 'The declared dead volume must not be negative.',
  'duplicate-event-id': 'The event id duplicates an event id already recorded in this ledger.',
  'timestamp-unordered': "The event's timestamp is earlier than the previously recorded event's timestamp.",
  'amount-invalid': 'The consumption amount must be a positive number.',
  'kind-unknown': 'The consumption kind is not on the bounded known kind list.',
  'over-consumption': 'The consumption amount exceeds the remaining volume plus the declared dead volume.',
  'reason-empty': 'A reversal must carry a non-empty reason.',
  'target-not-found': 'The reversal target event id does not match a recorded consumption event.',
  'target-already-reversed': 'The reversal target event has already been reversed.',
  'target-not-latest': 'A reversal must target the single most recent event recorded in the ledger.',
};

/** Deterministic, human-readable text for a fail-closed reason code. */
export function explainVolumeLedgerReason(code: VolumeLedgerReasonCode): string {
  return REASON_MESSAGES[code];
}

export type VolumeLedgerFailure = {
  /** Present only for failures tied to a specific event in the input list. */
  eventIndex?: number;
  code: VolumeLedgerReasonCode;
};

export type VolumeLedgerSummary =
  | {
      status: 'VALID';
      accessionId: string;
      initialVolume: number;
      deadVolume: number;
      remainingVolume: number;
      events: AppliedVolumeLedgerEvent[];
    }
  | { status: 'INVALID'; accessionId: string; failure: VolumeLedgerFailure };

export type ValidVolumeLedgerSummary = Extract<VolumeLedgerSummary, { status: 'VALID' }>;

export type VolumeLedgerInputErrorCode =
  | 'input-malformed'
  | 'specimen-malformed'
  | 'events-not-array'
  | 'event-malformed'
  | 'timestamp-malformed';

const INPUT_ERROR_MESSAGES: Record<VolumeLedgerInputErrorCode, string> = {
  'input-malformed': 'The ledger input is not an object.',
  'specimen-malformed': 'The specimen is missing a required field or has the wrong shape.',
  'events-not-array': 'The ledger events input is not a list.',
  'event-malformed': 'A ledger event is missing a required field or has the wrong shape.',
  'timestamp-malformed': 'The queried timestamp is not a finite number.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed summary. */
export class VolumeLedgerInputError extends Error {
  readonly code: VolumeLedgerInputErrorCode;

  constructor(code: VolumeLedgerInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'VolumeLedgerInputError';
    this.code = code;
  }
}

function fail(code: VolumeLedgerInputErrorCode): never {
  throw new VolumeLedgerInputError(code);
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

function isStructurallyValidSpecimen(raw: unknown): raw is SpecimenVolumeState {
  if (!isPlainObject(raw)) {
    return false;
  }
  return isNonEmptyString(raw.accessionId) && isFiniteNumber(raw.initialVolume) && isFiniteNumber(raw.deadVolume);
}

function isStructurallyValidEvent(raw: unknown): raw is VolumeLedgerEventInput {
  if (!isPlainObject(raw)) {
    return false;
  }
  if (!isNonEmptyString(raw.eventId) || !isFiniteNumber(raw.timestamp)) {
    return false;
  }
  if (raw.entryType === 'CONSUMPTION') {
    return typeof raw.kind === 'string' && isFiniteNumber(raw.amount);
  }
  if (raw.entryType === 'REVERSAL') {
    return isNonEmptyString(raw.targetEventId) && typeof raw.reason === 'string';
  }
  return false;
}

/**
 * Replay a synthetic specimen volume ledger.
 *
 * Fail-closed: rules are checked in a fixed order (see module doc comment)
 * and this returns the first one the ledger breaks, or the full applied
 * event history if every rule passes. Structurally unusable input (not an
 * object, a missing required field, or the wrong type) throws
 * VolumeLedgerInputError instead of guessing at a summary.
 */
export function applyVolumeLedgerEvents(rawInput: unknown): VolumeLedgerSummary {
  if (!isPlainObject(rawInput)) {
    fail('input-malformed');
  }

  const { specimen, events } = rawInput;

  if (!isStructurallyValidSpecimen(specimen)) {
    fail('specimen-malformed');
  }
  if (!Array.isArray(events)) {
    fail('events-not-array');
  }

  const validatedEvents: VolumeLedgerEventInput[] = events.map((raw) => {
    if (!isStructurallyValidEvent(raw)) {
      fail('event-malformed');
    }
    return raw;
  });

  const accessionId = specimen.accessionId;

  const invalid = (code: VolumeLedgerReasonCode, eventIndex?: number): VolumeLedgerSummary => ({
    status: 'INVALID',
    accessionId,
    failure: eventIndex === undefined ? { code } : { code, eventIndex },
  });

  if (specimen.initialVolume <= 0) {
    return invalid('initial-volume-invalid');
  }
  if (specimen.deadVolume < 0) {
    return invalid('dead-volume-invalid');
  }

  let remainingVolume = specimen.initialVolume;
  let lastEvent: { eventId: string; timestamp: number } | null = null;
  const seenEventIds = new Set<string>();
  const consumptionIndexById = new Map<string, number>();
  const appliedEvents: AppliedVolumeLedgerEvent[] = [];

  for (let index = 0; index < validatedEvents.length; index += 1) {
    const event = validatedEvents[index];

    if (seenEventIds.has(event.eventId)) {
      return invalid('duplicate-event-id', index);
    }
    if (lastEvent !== null && event.timestamp < lastEvent.timestamp) {
      return invalid('timestamp-unordered', index);
    }

    if (event.entryType === 'CONSUMPTION') {
      if (event.amount <= 0) {
        return invalid('amount-invalid', index);
      }
      if (!KNOWN_EVENT_KINDS.has(event.kind)) {
        return invalid('kind-unknown', index);
      }
      if (event.amount > remainingVolume + specimen.deadVolume) {
        return invalid('over-consumption', index);
      }

      remainingVolume -= event.amount;
      seenEventIds.add(event.eventId);
      consumptionIndexById.set(event.eventId, appliedEvents.length);
      lastEvent = { eventId: event.eventId, timestamp: event.timestamp };
      appliedEvents.push({
        entryType: 'CONSUMPTION',
        eventId: event.eventId,
        kind: event.kind,
        amount: event.amount,
        timestamp: event.timestamp,
        remainingVolumeAfter: remainingVolume,
        reversed: false,
      });
    } else {
      if (event.reason.length === 0) {
        return invalid('reason-empty', index);
      }

      const targetIndex = consumptionIndexById.get(event.targetEventId);
      if (targetIndex === undefined) {
        return invalid('target-not-found', index);
      }

      const targetApplied = appliedEvents[targetIndex] as AppliedConsumptionEvent;
      if (targetApplied.reversed) {
        return invalid('target-already-reversed', index);
      }
      if (lastEvent === null || lastEvent.eventId !== event.targetEventId) {
        return invalid('target-not-latest', index);
      }

      remainingVolume += targetApplied.amount;
      targetApplied.reversed = true;
      seenEventIds.add(event.eventId);
      lastEvent = { eventId: event.eventId, timestamp: event.timestamp };
      appliedEvents.push({
        entryType: 'REVERSAL',
        eventId: event.eventId,
        targetEventId: event.targetEventId,
        reason: event.reason,
        timestamp: event.timestamp,
        remainingVolumeAfter: remainingVolume,
      });
    }
  }

  return {
    status: 'VALID',
    accessionId,
    initialVolume: specimen.initialVolume,
    deadVolume: specimen.deadVolume,
    remainingVolume,
    events: appliedEvents,
  };
}

/**
 * Report the specimen's remaining volume as of a queried timestamp.
 *
 * Replays the applied event history up to and including the last event at
 * or before the queried timestamp; querying before the first event returns
 * the specimen's initial volume. Throws VolumeLedgerInputError if the
 * queried timestamp is not a finite number.
 */
export function balanceAtTimestamp(ledger: ValidVolumeLedgerSummary, timestamp: number): number {
  if (!isFiniteNumber(timestamp)) {
    fail('timestamp-malformed');
  }

  let balance = ledger.initialVolume;
  for (const event of ledger.events) {
    if (event.timestamp > timestamp) {
      break;
    }
    balance = event.remainingVolumeAfter;
  }
  return balance;
}
