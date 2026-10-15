import { CLINICAL_LAB_PROFILE } from './clinical';
import type { LabProfile } from './types';

export type { InstrumentStub, LabBrand, LabProfile, LabSector, Method, VolumeRange } from './types';
export { CLINICAL_LAB_PROFILE } from './clinical';

/** Slugs that resolve today. Environmental and diagnostics land in later PRs. */
export const LAB_SLUGS = ['clinical'] as const;
export type LabSlug = (typeof LAB_SLUGS)[number];

const PROFILES: Readonly<Record<LabSlug, LabProfile>> = Object.freeze({
  clinical: CLINICAL_LAB_PROFILE,
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
