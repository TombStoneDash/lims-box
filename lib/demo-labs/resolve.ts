import { notFound } from 'next/navigation';

import { getLabProfile, type LabProfile } from './index';

/** Resolves the `[labType]` route param to a profile or renders the app 404 page. */
export async function resolveLabProfileOrNotFound(
  params: Promise<{ labType: string }> | { labType: string },
): Promise<LabProfile> {
  const { labType } = await params;
  const profile = getLabProfile(labType);
  if (!profile) notFound();
  return profile;
}
