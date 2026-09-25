/**
 * Fail-closed, privacy-safe test order authorization for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free decision function: given a
 * fabricated authorization matrix (which roles may order which test
 * classes, and whether a class requires a co-signature), a fabricated
 * requester credential (a bounded role and a validity window), and a
 * fabricated order (a test class, a caller-supplied "as of" timestamp, and
 * an optional co-signer id), it returns a deterministic
 * authorized/needs_cosign/refused decision naming the single rule that
 * decided it. It performs no I/O and touches no real requester, patient, or
 * customer data.
 *
 * Authorization requires, in this order:
 *
 *   1. a parsable "as of" timestamp
 *   2. at least one matrix entry declared for the exact test class (any
 *      role) -- an unrecognized test class is refused rather than treated
 *      as unrestricted
 *   3. a requester credential validity window that is current as of the
 *      timestamp (started at or before it, not yet expired)
 *   4. a matrix entry granting the requester's exact role permission to
 *      order the exact test class
 *   5. for classes flagged as requiring a co-signature, a co-signer id
 *      distinct from the requester
 *
 * Every caller-supplied timestamp (the evaluation timestamp and a
 * credential's validFrom/validUntil) must be a real calendar instant
 * written with an explicit UTC "Z" or numeric offset. Timezone-naive
 * strings and calendar-invalid dates (e.g. a rolled-over "2026-02-30") are
 * rejected rather than guessed at, and validity is evaluated
 * timezone-independently so the same instant decides identically no matter
 * which explicit offset it was written with.
 *
 * Fail-closed: an unparsable timestamp, a test class absent from the
 * matrix entirely, an unparsable or internally inconsistent (validFrom
 * after validUntil) credential window, a credential window that has not
 * started or has expired as of the evaluation timestamp, a role with no
 * matrix entry for the test class, or a supplied co-signer equal to the
 * requester are all refused rather than guessed at. A class requiring a
 * co-signature with none supplied is reported as needs_cosign rather than
 * authorized or refused, since the order may still be completed once a
 * co-signer is attached. Structurally unusable input (wrong shape, missing
 * required field) throws a typed error instead of returning a decision.
 */

export type OrderAuthorizationMatrixEntry = {
  /** Synthetic role name, e.g. "PHLEBOTOMIST". Never a real identity. */
  role: string;
  /** The exact test class this entry grants, e.g. "TOX-PANEL-7". */
  testClass: string;
  requiresCosign: boolean;
};

export type OrderAuthorizationMatrix = OrderAuthorizationMatrixEntry[];

export type RequesterCredential = {
  /** Synthetic requester identifier. Never a real name. */
  requesterId: string;
  role: string;
  /** Caller-supplied timestamp the credential becomes valid. */
  validFrom: string;
  /** Caller-supplied timestamp the credential expires. */
  validUntil: string;
};

export type OrderRequest = {
  /** Synthetic order identifier. Never a real name. */
  orderId: string;
  testClass: string;
  /** Caller-supplied "as of" timestamp the order decision is evaluated against. */
  timestamp: string;
  /** Synthetic identifier of a co-signer, if one was recorded. Never a real name. */
  cosignerId?: string;
};

export type OrderAuthorizationDecision = 'AUTHORIZED' | 'NEEDS_COSIGN' | 'REFUSED';

export type OrderAuthorizationRuleCode =
  | 'timestamp-invalid'
  | 'test-class-unknown'
  | 'credential-not-yet-valid'
  | 'credential-expired'
  | 'role-not-authorized'
  | 'cosign-required'
  | 'cosigner-same-as-requester'
  | 'authorized-no-cosign-required'
  | 'authorized-with-cosign';

const RULE_MESSAGES: Record<OrderAuthorizationRuleCode, string> = {
  'timestamp-invalid': 'The order evaluation timestamp could not be parsed.',
  'test-class-unknown': 'The matrix declares no role permitted to order this exact test class.',
  'credential-not-yet-valid': "The requester's credential validity window has not started as of the evaluation timestamp.",
  'credential-expired': "The requester's credential validity window is not current as of the evaluation timestamp.",
  'role-not-authorized': 'The matrix has no entry granting this exact role permission to order this test class.',
  'cosign-required': 'This test class requires a co-signature and none was supplied.',
  'cosigner-same-as-requester': 'The supplied co-signer is the same requester placing the order.',
  'authorized-no-cosign-required': 'The requester holds a current credential and matrix permission, and the class requires no co-signature.',
  'authorized-with-cosign': 'The requester holds a current credential and matrix permission, and a distinct co-signer was supplied for this restricted class.',
};

/** Deterministic, privacy-safe human-readable text for a rule code, suitable for UI display. */
export function explainOrderAuthorizationRule(code: OrderAuthorizationRuleCode): string {
  return RULE_MESSAGES[code];
}

/** The privacy-safe decision. No requester id or role ever appears in this output. */
export type OrderAuthorizationSummary = {
  orderId: string;
  decision: OrderAuthorizationDecision;
  rule: OrderAuthorizationRuleCode;
};

export type OrderAuthorizationInputErrorCode = 'matrix-malformed' | 'credential-malformed' | 'order-malformed';

const INPUT_ERROR_MESSAGES: Record<OrderAuthorizationInputErrorCode, string> = {
  'matrix-malformed': 'The authorization matrix is missing a required field or has the wrong shape.',
  'credential-malformed': 'The requester credential is missing a required field or has the wrong shape.',
  'order-malformed': 'The order request is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned an authorization decision. */
export class OrderAuthorizationInputError extends Error {
  readonly code: OrderAuthorizationInputErrorCode;

  constructor(code: OrderAuthorizationInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'OrderAuthorizationInputError';
    this.code = code;
  }
}

function fail(code: OrderAuthorizationInputErrorCode): never {
  throw new OrderAuthorizationInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStructurallyValidMatrixEntry(raw: unknown): raw is OrderAuthorizationMatrixEntry {
  if (!isPlainObject(raw)) {
    return false;
  }
  return isNonEmptyString(raw.role) && isNonEmptyString(raw.testClass) && typeof raw.requiresCosign === 'boolean';
}

function isStructurallyValidMatrix(raw: unknown): raw is OrderAuthorizationMatrix {
  return Array.isArray(raw) && raw.every(isStructurallyValidMatrixEntry);
}

function isStructurallyValidCredential(raw: unknown): raw is RequesterCredential {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.requesterId) &&
    isNonEmptyString(raw.role) &&
    isNonEmptyString(raw.validFrom) &&
    isNonEmptyString(raw.validUntil)
  );
}

function isStructurallyValidOrder(raw: unknown): raw is OrderRequest {
  if (!isPlainObject(raw)) {
    return false;
  }
  return (
    isNonEmptyString(raw.orderId) &&
    isNonEmptyString(raw.testClass) &&
    isNonEmptyString(raw.timestamp) &&
    (raw.cosignerId === undefined || isNonEmptyString(raw.cosignerId))
  );
}

/**
 * Matches only the explicit-zone ISO 8601 date-time form: a full calendar
 * date and time of day followed by either "Z" or a numeric "+HH:MM" /
 * "-HH:MM" offset. Timezone-naive strings (no trailing zone) do not match
 * and are rejected outright rather than resolved against an ambient
 * default timezone.
 */
const EXPLICIT_ZONE_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses a caller-supplied timestamp into a UTC epoch millisecond instant,
 * or undefined if it is not a real calendar instant written with an
 * explicit zone. Calendar validity (e.g. rejecting a rolled-over
 * "2026-02-30") is checked via a UTC round trip on the written fields
 * themselves, independent of the offset attached to them, so the same
 * written instant is judged identically regardless of which explicit
 * offset expressed it.
 */
function parseExplicitZoneInstant(value: string): number | undefined {
  const match = EXPLICIT_ZONE_TIMESTAMP.exec(value);
  if (match === null) {
    return undefined;
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fracStr, zone] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);
  const millisecond = fracStr === undefined ? 0 : Number(fracStr.slice(0, 3).padEnd(3, '0'));

  const naiveMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const roundTrip = new Date(naiveMs);
  const isRealCalendarInstant =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day &&
    roundTrip.getUTCHours() === hour &&
    roundTrip.getUTCMinutes() === minute &&
    roundTrip.getUTCSeconds() === second;
  if (!isRealCalendarInstant) {
    return undefined;
  }

  if (zone === 'Z') {
    return naiveMs;
  }

  const offsetSign = zone[0] === '-' ? -1 : 1;
  const offsetHours = Number(zone.slice(1, 3));
  const offsetMinutes = Number(zone.slice(4, 6));
  return naiveMs - offsetSign * (offsetHours * 60 + offsetMinutes) * 60_000;
}

type CredentialWindowStatus = 'current' | 'not-yet-valid' | 'expired';

/**
 * A credential window is judged fail-closed, as 'expired', whenever it
 * cannot be conclusively proven current: an unparsable validFrom or
 * validUntil, or a window whose start is after its end, is assumed expired
 * rather than assumed clear.
 */
function credentialWindowStatus(credential: RequesterCredential, asOfMs: number): CredentialWindowStatus {
  const validFromMs = parseExplicitZoneInstant(credential.validFrom);
  const validUntilMs = parseExplicitZoneInstant(credential.validUntil);
  if (validFromMs === undefined || validUntilMs === undefined) {
    return 'expired';
  }
  if (validFromMs > validUntilMs) {
    return 'expired';
  }
  if (asOfMs < validFromMs) {
    return 'not-yet-valid';
  }
  if (asOfMs >= validUntilMs) {
    return 'expired';
  }
  return 'current';
}

/**
 * Decide whether a fabricated requester may place a fabricated test order,
 * and name the single rule that decided it.
 *
 * Fail-closed: see the module-level documentation for the full, ordered
 * list of refusal and needs-cosign rules. Structurally unusable input
 * throws OrderAuthorizationInputError instead of guessing at a decision.
 */
export function authorizeOrder(
  rawMatrix: unknown,
  rawCredential: unknown,
  rawOrder: unknown,
): OrderAuthorizationSummary {
  if (!isStructurallyValidMatrix(rawMatrix)) {
    fail('matrix-malformed');
  }
  if (!isStructurallyValidCredential(rawCredential)) {
    fail('credential-malformed');
  }
  if (!isStructurallyValidOrder(rawOrder)) {
    fail('order-malformed');
  }

  const matrix = rawMatrix;
  const credential = rawCredential;
  const order = rawOrder;

  const refuse = (rule: OrderAuthorizationRuleCode): OrderAuthorizationSummary => ({
    orderId: order.orderId,
    decision: 'REFUSED',
    rule,
  });

  const asOfMs = parseExplicitZoneInstant(order.timestamp);
  if (asOfMs === undefined) {
    return refuse('timestamp-invalid');
  }

  const entriesForTestClass = matrix.filter((entry) => entry.testClass === order.testClass);
  if (entriesForTestClass.length === 0) {
    return refuse('test-class-unknown');
  }

  const windowStatus = credentialWindowStatus(credential, asOfMs);
  if (windowStatus === 'not-yet-valid') {
    return refuse('credential-not-yet-valid');
  }
  if (windowStatus === 'expired') {
    return refuse('credential-expired');
  }

  const matchingEntry = entriesForTestClass.find((entry) => entry.role === credential.role);
  if (matchingEntry === undefined) {
    return refuse('role-not-authorized');
  }

  if (matchingEntry.requiresCosign) {
    const cosignerId = order.cosignerId?.trim();
    if (!cosignerId) {
      return { orderId: order.orderId, decision: 'NEEDS_COSIGN', rule: 'cosign-required' };
    }
    if (cosignerId === credential.requesterId) {
      return refuse('cosigner-same-as-requester');
    }
    return { orderId: order.orderId, decision: 'AUTHORIZED', rule: 'authorized-with-cosign' };
  }

  return { orderId: order.orderId, decision: 'AUTHORIZED', rule: 'authorized-no-cosign-required' };
}
