import {
  getRoleViews,
  getVisibleAudit,
  type AuditFixture,
  type OHWorksRoleViewId,
} from '@/lib/ohworks-pilot';

/**
 * Stable v1 column order for the synthetic audit CSV. The tenant and data-class
 * policy fields are deliberately omitted from the downloadable evidence.
 */
export const OHWORKS_AUDIT_CSV_COLUMNS = [
  'event_id',
  'occurred_at',
  'actor_id',
  'action',
  'object',
  'note',
] as const;

export const OHWORKS_AUDIT_CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';
export const OHWORKS_AUDIT_CSV_FILENAME_PREFIX = 'ohworks-synthetic-audit';

const supportedRoleIds = new Set<OHWorksRoleViewId>(
  getRoleViews().map((role) => role.id),
);

const spreadsheetFormulaPrefix = /^[\u0000-\u0020\u00a0\ufeff]*[=+\-@]/u;

export function parseOHWorksAuditExportRole(
  rawRole: string | null | undefined,
): OHWorksRoleViewId | undefined {
  if (typeof rawRole !== 'string' || !supportedRoleIds.has(rawRole as OHWorksRoleViewId)) {
    return undefined;
  }

  return rawRole as OHWorksRoleViewId;
}

function escapeCsvCell(value: string): string {
  const hardened = spreadsheetFormulaPrefix.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(hardened)
    ? `"${hardened.replaceAll('"', '""')}"`
    : hardened;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function auditInstant(value: string): number {
  // The existing minute format has no zone; interpret it as UTC consistently.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u.test(value)
    ? `${value.replace(' ', 'T')}:00Z`
    : value;
  return Date.parse(normalized);
}

function compareAuditEvents(left: AuditFixture, right: AuditFixture): number {
  const leftInstant = auditInstant(left.at);
  const rightInstant = auditInstant(right.at);
  const leftValid = Number.isFinite(leftInstant);
  const rightValid = Number.isFinite(rightInstant);

  // Valid instants come first. Invalid values follow in raw timestamp order.
  if (leftValid !== rightValid) return leftValid ? -1 : 1;
  if (leftValid && leftInstant !== rightInstant) return leftInstant < rightInstant ? -1 : 1;
  if (!leftValid) {
    const timestampOrder = compareText(left.at, right.at);
    if (timestampOrder) return timestampOrder;
  }

  const idOrder = compareText(left.id, right.id);
  if (idOrder) return idOrder;

  // Complete the order for duplicate IDs without changing the exported text.
  for (const field of ['at', 'actorId', 'action', 'object', 'note'] as const) {
    const fieldOrder = compareText(left[field], right[field]);
    if (fieldOrder) return fieldOrder;
  }
  return 0;
}

export function serializeOHWorksAuditCsv(events: readonly AuditFixture[]): string {
  const rows = [...events]
    .sort(compareAuditEvents)
    .map((event) => [
      event.id,
      event.at,
      event.actorId,
      event.action,
      event.object,
      event.note,
    ].map(escapeCsvCell).join(','));

  return [OHWORKS_AUDIT_CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

export function buildOHWorksAuditCsv(roleId: OHWorksRoleViewId): string {
  return serializeOHWorksAuditCsv(getVisibleAudit(roleId));
}
