import { CLINICAL_LAB_PROFILE } from './clinical';
import { ENVIRONMENTAL_LAB_PROFILE } from './environmental';
import type { LabProfile } from './types';

export type { InstrumentStub, LabBrand, LabProfile, LabSector, Method, VolumeRange } from './types';
export { CLINICAL_LAB_PROFILE } from './clinical';
export { ENVIRONMENTAL_LAB_PROFILE } from './environmental';

/** Slugs that resolve today. Diagnostics lands in a later PR. */
export const LAB_SLUGS = ['clinical', 'environmental'] as const;
export type LabSlug = (typeof LAB_SLUGS)[number];

const PROFILES: Readonly<Record<LabSlug, LabProfile>> = Object.freeze({
  clinical: CLINICAL_LAB_PROFILE,
  environmental: ENVIRONMENTAL_LAB_PROFILE,
});

export const DEMO_LABS_BASE = '/demo/labs';

export function isLabSlug(value: unknown): value is LabSlug {
  return typeof value === 'string' && (LAB_SLUGS as readonly string[]).includes(value);
}

/** Returns undefined for any unknown slug; callers decide between notFound() and a 404 body. */
export function getLabProfile(slug: unknown): LabProfile | undefined {
  return isLabSlug(slug) ? PROFILES[slug] : undefined;
}

/** `/demo/labs/<slug><subPath>`; subPath is '' or starts with '/'. */
export function labDemoPath(slug: string, subPath = ''): string {
  return `${DEMO_LABS_BASE}/${slug}${subPath}`;
}
