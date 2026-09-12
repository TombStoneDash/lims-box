import {
  buildOHWorksAuditCsv,
  OHWORKS_AUDIT_CSV_CONTENT_TYPE,
  OHWORKS_AUDIT_CSV_FILENAME_PREFIX,
  parseOHWorksAuditExportRole,
} from '@/lib/ohworks-audit-export';

const FAILURE_BODY = JSON.stringify({
  error: 'An explicit supported synthetic role is required for this export.',
});

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
} as const;

function failClosed(): Response {
  return new Response(FAILURE_BODY, {
    status: 400,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function GET(request: Request): Response {
  const requestedRoles = new URL(request.url).searchParams.getAll('role');
  if (requestedRoles.length !== 1) {
    return failClosed();
  }

  const roleId = parseOHWorksAuditExportRole(requestedRoles[0]);
  if (!roleId) {
    return failClosed();
  }

  return new Response(buildOHWorksAuditCsv(roleId), {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': OHWORKS_AUDIT_CSV_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${OHWORKS_AUDIT_CSV_FILENAME_PREFIX}-${roleId}.csv"`,
    },
  });
}
