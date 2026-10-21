import { getLabProfile, type LabProfile } from './index';

/** `/demo/record?lab=<slug>` picks a demo-lab profile; unknown or missing slugs keep the generic walkthrough. */
export function recordLabFromSearch(search: string): LabProfile | undefined {
  return getLabProfile(new URLSearchParams(search).get('lab') ?? undefined);
}
