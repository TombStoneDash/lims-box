/**
 * Fail-closed, privacy-safe report distribution rules for the synthetic
 * OHWorks pilot.
 *
 * This module is a pure, dependency-free calculator: given a caller-supplied
 * fabricated report (an opaque reference token, a "FINAL" or "PRELIMINARY"
 * kind, and its test classes) and a caller-supplied fabricated distribution
 * matrix (rows of recipient role, channel type, allowed test classes, and a
 * "requires final" flag), it computes which recipient roles and channel
 * types are permitted to receive the report and flags any test class with
 * no permitted recipient. It performs no I/O, touches no real report,
 * patient, or customer data, and never mutates anything outside its own
 * return value.
 *
 * The distribution matrix and every summary this module returns describe
 * only roles and channel *types* (e.g. "SECURE_FAX"), never a personal
 * contact detail such as an address, phone number, or email address — the
 * input and output shapes have no field for one.
 *
 * A distribution rule applies to a report's test class when the class is on
 * the rule's allowed-classes list, and either the report is final or the
 * rule does not require a final report. Computation fails closed, in this
 * order, for the whole report, in favor of returning nothing rather than an
 * incomplete or ambiguous distribution:
 *
 *   1. an unknown channel type — a matrix row declares a channel type
 *                                 outside the bounded, known channel type
 *                                 list, so the matrix cannot be trusted.
 *   2. a final-only class on a preliminary report — every matrix row that
 *                                 covers one of the report's test classes
 *                                 requires a final report, but this report
 *                                 is preliminary.
 *
 * Short of those two fail-closed conditions, any test class that matches no
 * applicable rule is not a whole-report failure — it is flagged in
 * `unroutedTestClasses` alongside the recipients computed for the classes
 * that do resolve.
 *
 * Structurally unusable input (not an object/array, a missing or
 * wrong-typed field) throws a typed error instead of guessing at a summary.
 */

/** Bounded channel types this module knows how to route to. */
export type ChannelType =
  | 'PORTAL_SECURE_MESSAGE'
  | 'ENCRYPTED_EMAIL'
  | 'SECURE_FAX'
  | 'PRINTED_MAIL'
  | 'LAB_INFORMATION_SYSTEM_API';

const KNOWN_CHANNEL_TYPES: ReadonlySet<string> = new Set<ChannelType>([
  'PORTAL_SECURE_MESSAGE',
  'ENCRYPTED_EMAIL',
  'SECURE_FAX',
  'PRINTED_MAIL',
  'LAB_INFORMATION_SYSTEM_API',
]);

export type ReportKind = 'FINAL' | 'PRELIMINARY';

/** One row of the caller-declared distribution matrix. */
export type DistributionRule = {
  recipientRole: string;
  /** Raw channel type string; may be unrecognized. */
  channelType: string;
  allowedTestClasses: string[];
  requiresFinal: boolean;
};

export type ReportForDistribution = {
  reportReferenceToken: string;
  kind: ReportKind;
  testClasses: string[];
};

export type DistributionStatus = 'DISTRIBUTED' | 'BLOCKED';

export type DistributionBlockReasonCode = 'channel-type-unknown' | 'final-only-class-on-preliminary-report';

const BLOCK_MESSAGES: Record<DistributionBlockReasonCode, string> = {
  'channel-type-unknown': 'A distribution matrix row declares a channel type outside the known, bounded channel type list.',
  'final-only-class-on-preliminary-report':
    'A test class on this report is only ever distributed on a final report, but this report is preliminary.',
};

/** Deterministic, privacy-safe human-readable text for a block reason code, suitable for UI display. */
export function explainDistributionBlockReason(code: DistributionBlockReasonCode): string {
  return BLOCK_MESSAGES[code];
}

const BLOCK_NEXT_ACTIONS: Record<DistributionBlockReasonCode, string> = {
  'channel-type-unknown': 'Correct the matrix row to use a known channel type before distributing this report.',
  'final-only-class-on-preliminary-report': 'Withhold distribution until the report is finalized, or remove the class from this report.',
};

/** Deterministic, privacy-safe next corrective action for a block reason code, suitable for UI display alongside the explanation. */
export function explainDistributionBlockNextAction(code: DistributionBlockReasonCode): string {
  return BLOCK_NEXT_ACTIONS[code];
}

export type DistributionBlock = {
  code: DistributionBlockReasonCode;
  /** The matrix row index for channel-type-unknown; the offending test class for final-only-class-on-preliminary-report. */
  detail: string;
};

/** One resolved (test class, recipient role, channel type) routing — never a contact detail. */
export type RoutedEntry = {
  testClass: string;
  recipientRole: string;
  channelType: ChannelType;
};

export type ReportDistributionSummary = {
  reportReferenceToken: string;
  kind: ReportKind;
  status: DistributionStatus;
  /** Sorted, deduplicated recipient roles permitted to receive this report. Empty when blocked. */
  recipientRoles: string[];
  /** Sorted, deduplicated channel types permitted to carry this report. Empty when blocked. */
  channelTypes: ChannelType[];
  /** Every resolved routing, in report test-class order. Empty when blocked. */
  routedEntries: RoutedEntry[];
  /** Test classes with no applicable rule. Empty when blocked. */
  unroutedTestClasses: string[];
  block?: DistributionBlock;
};

export type ReportDistributionInputErrorCode =
  | 'report-malformed'
  | 'report-reference-token-invalid'
  | 'report-kind-invalid'
  | 'test-classes-invalid'
  | 'matrix-not-array'
  | 'rule-malformed';

const INPUT_ERROR_MESSAGES: Record<ReportDistributionInputErrorCode, string> = {
  'report-malformed': 'The report is not an object.',
  'report-reference-token-invalid': 'The report reference token is invalid.',
  'report-kind-invalid': 'The report kind is not "FINAL" or "PRELIMINARY".',
  'test-classes-invalid': 'The report test classes are not a list of non-empty strings.',
  'matrix-not-array': 'The distribution matrix input is not a list of rules.',
  'rule-malformed': 'A distribution matrix row is missing a required field or has the wrong shape.',
};

/** Thrown for structurally unusable input that cannot be safely assigned a fail-closed summary. */
export class ReportDistributionInputError extends Error {
  readonly code: ReportDistributionInputErrorCode;

  constructor(code: ReportDistributionInputErrorCode) {
    super(INPUT_ERROR_MESSAGES[code]);
    this.name = 'ReportDistributionInputError';
    this.code = code;
  }
}

function fail(code: ReportDistributionInputErrorCode): never {
  throw new ReportDistributionInputError(code);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function validateReport(raw: unknown): ReportForDistribution {
  if (!isPlainObject(raw)) {
    fail('report-malformed');
  }
  if (!isNonEmptyString(raw.reportReferenceToken)) {
    fail('report-reference-token-invalid');
  }
  if (raw.kind !== 'FINAL' && raw.kind !== 'PRELIMINARY') {
    fail('report-kind-invalid');
  }
  if (!isNonEmptyStringArray(raw.testClasses)) {
    fail('test-classes-invalid');
  }

  const seen = new Set<string>();
  const testClasses: string[] = [];
  for (const testClass of raw.testClasses) {
    if (!seen.has(testClass)) {
      seen.add(testClass);
      testClasses.push(testClass);
    }
  }

  return { reportReferenceToken: raw.reportReferenceToken, kind: raw.kind, testClasses };
}

function validateMatrix(raw: unknown): DistributionRule[] {
  if (!Array.isArray(raw)) {
    fail('matrix-not-array');
  }
  return raw.map((entry) => {
    if (!isPlainObject(entry)) {
      fail('rule-malformed');
    }
    if (!isNonEmptyString(entry.recipientRole)) {
      fail('rule-malformed');
    }
    if (!isNonEmptyString(entry.channelType)) {
      fail('rule-malformed');
    }
    if (!isNonEmptyStringArray(entry.allowedTestClasses) || entry.allowedTestClasses.length === 0) {
      fail('rule-malformed');
    }
    if (typeof entry.requiresFinal !== 'boolean') {
      fail('rule-malformed');
    }
    return {
      recipientRole: entry.recipientRole,
      channelType: entry.channelType,
      allowedTestClasses: entry.allowedTestClasses,
      requiresFinal: entry.requiresFinal,
    };
  });
}

function blocked(report: ReportForDistribution, code: DistributionBlockReasonCode, detail: string): ReportDistributionSummary {
  return {
    reportReferenceToken: report.reportReferenceToken,
    kind: report.kind,
    status: 'BLOCKED',
    recipientRoles: [],
    channelTypes: [],
    routedEntries: [],
    unroutedTestClasses: [],
    block: { code, detail },
  };
}

/**
 * Compute the recipient roles, channel types, and per-class routing
 * permitted for a fabricated report against a fabricated distribution
 * matrix, or a fail-closed block reason for the whole report.
 *
 * Structurally unusable input (not an object/array, an invalid reference
 * token, an unrecognized report kind, or a matrix row missing a required
 * field) throws ReportDistributionInputError.
 */
export function computeReportDistribution(rawReport: unknown, rawMatrix: unknown): ReportDistributionSummary {
  const report = validateReport(rawReport);
  const matrix = validateMatrix(rawMatrix);

  for (let index = 0; index < matrix.length; index += 1) {
    if (!KNOWN_CHANNEL_TYPES.has(matrix[index].channelType)) {
      return blocked(report, 'channel-type-unknown', String(index));
    }
  }

  if (report.kind === 'PRELIMINARY') {
    for (const testClass of report.testClasses) {
      const matchingRules = matrix.filter((rule) => rule.allowedTestClasses.includes(testClass));
      const isFinalOnly = matchingRules.length > 0 && matchingRules.every((rule) => rule.requiresFinal);
      if (isFinalOnly) {
        return blocked(report, 'final-only-class-on-preliminary-report', testClass);
      }
    }
  }

  const routedEntries: RoutedEntry[] = [];
  const unroutedTestClasses: string[] = [];
  const recipientRoles = new Set<string>();
  const channelTypes = new Set<ChannelType>();

  for (const testClass of report.testClasses) {
    const applicableRules = matrix.filter(
      (rule) => rule.allowedTestClasses.includes(testClass) && (report.kind === 'FINAL' || !rule.requiresFinal),
    );

    if (applicableRules.length === 0) {
      unroutedTestClasses.push(testClass);
      continue;
    }

    for (const rule of applicableRules) {
      const channelType = rule.channelType as ChannelType;
      routedEntries.push({ testClass, recipientRole: rule.recipientRole, channelType });
      recipientRoles.add(rule.recipientRole);
      channelTypes.add(channelType);
    }
  }

  return {
    reportReferenceToken: report.reportReferenceToken,
    kind: report.kind,
    status: 'DISTRIBUTED',
    recipientRoles: [...recipientRoles].sort(),
    channelTypes: [...channelTypes].sort(),
    routedEntries,
    unroutedTestClasses,
  };
}
