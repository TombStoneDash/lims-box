/**
 * Deterministic OHWorks verbal/telephone order read-back checker.
 *
 * Joint Commission / CAP accreditation standards require that a verbal or
 * telephone order (commonly used for a stat or critical add-on) be read
 * back by the receiving staff member to the originator, with explicit
 * verbal confirmation from the originator, before the order can be acted
 * on. This module is a pure, dependency-free evaluator of a single
 * fabricated verbal-order record against that read-back requirement. It
 * performs no I/O and touches no real patient, clinician, or customer data.
 *
 * The read-back requirement applies only when the order was actually
 * received verbally; a non-verbal order is always 'not_applicable' and
 * compliant regardless of the other fields. For a verbal order, the
 * identity of who received it, who gave it, and what was ordered must all
 * be recorded before a read-back decision can be made at all; any missing
 * required field is reported individually rather than guessed at. Once
 * those fields are present, the order is compliant only when a read-back
 * was performed and the originator explicitly confirmed it verbally.
 * originatorRole never changes the compliance decision -- every verbal
 * order requires a read-back no matter who gave it -- but leaving it
 * 'unspecified' adds a non-blocking recommendation to record it for the
 * audit trail, even on an otherwise fully compliant order.
 */

export type VerbalOrderOriginatorRole =
  | 'physician'
  | 'nurse_practitioner'
  | 'physician_assistant'
  | 'nurse'
  | 'other'
  | 'unspecified';

export type VerbalOrderReadbackInput = {
  orderReceivedVerbally: boolean;
  readBackPerformed: boolean;
  readBackConfirmedByOriginator: boolean;
  /** Synthetic identifier of the staff member who received the order. Never a real identity. */
  receivingStaffId: string | null;
  /** Synthetic name of the physician/nurse who gave the order. Never a real identity. */
  originatorName: string | null;
  originatorRole: VerbalOrderOriginatorRole;
  orderText: string;
  /** Caller-supplied timestamp the order was received. */
  timestampReceived: string;
};

export type VerbalOrderReadbackStatus =
  | 'not_applicable'
  | 'compliant'
  | 'missing_readback'
  | 'readback_not_confirmed'
  | 'missing_required_fields';

export type VerbalOrderReadbackResult = {
  compliant: boolean;
  status: VerbalOrderReadbackStatus;
  issues: string[];
};

function isNonEmptyString(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Evaluate whether a single fabricated verbal-order record satisfies the
 * read-back requirement.
 *
 * Fail-closed for verbal orders: any of receivingStaffId, originatorName,
 * or orderText missing or blank reports status 'missing_required_fields'
 * with one issue per missing field, before read-back is even considered.
 * With those present, a read-back that was never performed reports
 * 'missing_readback'; a read-back that was performed but not confirmed by
 * the originator reports 'readback_not_confirmed'; only a performed and
 * confirmed read-back reports 'compliant'. originatorRole never changes
 * compliant/status, but 'unspecified' adds a non-blocking issue
 * recommending the role be recorded for the audit trail.
 */
export function evaluateVerbalOrderReadback(input: VerbalOrderReadbackInput): VerbalOrderReadbackResult {
  if (!input.orderReceivedVerbally) {
    return { compliant: true, status: 'not_applicable', issues: [] };
  }

  const missingFieldIssues: string[] = [];
  if (!isNonEmptyString(input.receivingStaffId)) {
    missingFieldIssues.push('receivingStaffId is required to record who received this verbal order.');
  }
  if (!isNonEmptyString(input.originatorName)) {
    missingFieldIssues.push('originatorName is required to record who gave this verbal order.');
  }
  if (!isNonEmptyString(input.orderText)) {
    missingFieldIssues.push('orderText is required to record what was ordered.');
  }
  if (missingFieldIssues.length > 0) {
    return { compliant: false, status: 'missing_required_fields', issues: missingFieldIssues };
  }

  const roleIssues: string[] = [];
  if (input.originatorRole === 'unspecified') {
    roleIssues.push('originatorRole is unspecified -- record the originator’s role for the audit trail.');
  }

  if (!input.readBackPerformed) {
    return {
      compliant: false,
      status: 'missing_readback',
      issues: ['No read-back was performed for this verbal order. Do not act on this order until it is read back to the originator.', ...roleIssues],
    };
  }

  if (!input.readBackConfirmedByOriginator) {
    return {
      compliant: false,
      status: 'readback_not_confirmed',
      issues: ['Read-back was performed but the originator did not confirm it verbally -- do not act on this order until confirmed.', ...roleIssues],
    };
  }

  return { compliant: true, status: 'compliant', issues: roleIssues };
}
