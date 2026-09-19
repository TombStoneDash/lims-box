import { prisma } from '@/lib/prisma';
import { getConversionReport } from '@/lib/admin/conversionReport';
import {
  DEMO_OPERATOR_PASS_ENV,
  DEMO_OPERATOR_USER_ENV,
  evaluateDemoAccess,
} from '@/lib/demo-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const headers: Record<string, string> = {
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  // Same fail-closed guard protecting existing admin routes via middleware.
  const decision = evaluateDemoAccess({
    pathname: '/api/admin/conversion-report',
    method: request.method,
    authorization: request.headers.get('authorization'),
    configuredUser: process.env[DEMO_OPERATOR_USER_ENV],
    configuredPass: process.env[DEMO_OPERATOR_PASS_ENV],
  });
  if (decision.kind !== 'allow') {
    if (decision.kind === 'authentication_required') {
      headers['WWW-Authenticate'] = 'Basic realm="LIMS BOX Synthetic Demo"';
    }
    if (decision.kind === 'read_only') headers.Allow = 'GET, HEAD, OPTIONS';
    return Response.json({ error: decision.kind }, { status: decision.status, headers });
  }
  try {
    return Response.json(await getConversionReport(prisma), { headers });
  } catch {
    // DB errors can contain connection details, query text, or contact values.
    return Response.json({ error: 'Conversion report unavailable' }, { status: 503, headers });
  }
}
