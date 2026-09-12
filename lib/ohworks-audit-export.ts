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

function compareAuditEvents(left: AuditFixture, right: AuditFixture): number {
  if (left.at !== right.at) {
    return left.at < right.at ? -1 : 1;
  }
  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1;
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
