import { permanentRedirect } from 'next/navigation';

import { legacyPilotRedirectTarget } from '@/lib/demo-labs/redirects';

// Pilot closed 2026-09-23; this path 308s into the clinical demo profile.
export default async function LegacyPilotRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  permanentRedirect(legacyPilotRedirectTarget('/qc', params?.role));
}
