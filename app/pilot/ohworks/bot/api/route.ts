import { POST as demoLabAssistant } from '@/app/demo/labs/[labType]/bot/api/route';
import { LEGACY_PILOT_TARGET_SLUG } from '@/lib/demo-labs/redirects';

// Pilot closed 2026-09-23; the handler lives under /demo/labs/[labType] and is served here unchanged.
export function POST(request: Request): Promise<Response> {
  return demoLabAssistant(request, { params: Promise.resolve({ labType: LEGACY_PILOT_TARGET_SLUG }) });
}
