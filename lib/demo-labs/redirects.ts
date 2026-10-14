import { labDemoPath } from './index';

/** Former pilot route (closed 2026-09-23) that now 308s into the clinical demo profile. */
export const LEGACY_PILOT_BASE = '/pilot/ohworks';
export const LEGACY_PILOT_TARGET_SLUG = 'clinical';

/** Sub-paths that existed under the legacy pilot. '' is the overview. */
export const LEGACY_PILOT_SUBPATHS = [
  '',
  '/accessions',
  '/audit',
  '/audit/export',
  '/bot',
  '/bot/api',
  '/critical-results',
  '/instrument',
  '/personnel',
  '/qc',
  '/reports',
  '/result-review',
  '/samples',
] as const;

export type LegacyPilotRedirect = Readonly<{ from: string; to: string }>;

export const LEGACY_PILOT_REDIRECTS: readonly LegacyPilotRedirect[] = Object.freeze(
  LEGACY_PILOT_SUBPATHS.map((subPath) => Object.freeze({
    from: `${LEGACY_PILOT_BASE}${subPath}`,
    to: labDemoPath(LEGACY_PILOT_TARGET_SLUG, subPath),
  })),
);

/** Exact-match lookup; returns undefined for anything that was not a pilot route. */
export function resolveLegacyPilotRedirect(pathname: string): string | undefined {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return LEGACY_PILOT_REDIRECTS.find((entry) => entry.from === normalized)?.to;
}

/** Keeps the demo role simulator's `?role=` across the redirect. Nothing else is forwarded. */
export function legacyPilotRedirectTarget(subPath: string, role: string | undefined): string {
  const target = labDemoPath(LEGACY_PILOT_TARGET_SLUG, subPath);
  return role ? `${target}?role=${encodeURIComponent(role)}` : target;
}
