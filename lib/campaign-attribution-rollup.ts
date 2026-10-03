import {
  ALLOWED_UTM_KEYS,
  DEFAULT_EARLY_ADOPTER_SOURCE,
  normalizeAttributionToken,
} from './leadAttribution';

type UtmKey = (typeof ALLOWED_UTM_KEYS)[number];

/** Parse stored attribution, ignoring malformed segments and keeping the first valid value. */
export function parseAttributionSource(source: string): {
  base: string;
  utm: Partial<Record<UtmKey, string>>;
} {
  const utm: Partial<Record<UtmKey, string>> = {};
  if (source === DEFAULT_EARLY_ADOPTER_SOURCE || !source.includes(';')) {
    return { base: source, utm };
  }

  const [base, ...segments] = source.split(';');
  for (const segment of segments) {
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;
    const key = segment.slice(0, separator) as UtmKey;
    if (!ALLOWED_UTM_KEYS.includes(key) || utm[key] !== undefined) continue;
    const value = normalizeAttributionToken(segment.slice(separator + 1));
    if (value !== null) utm[key] = value;
  }

  return { base, utm };
}

/** Count source records by campaign; missing or invalid campaigns count as direct. */
export function rollupByCampaign(sources: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const campaign = parseAttributionSource(source).utm.utm_campaign ?? 'direct';
    counts.set(campaign, (counts.get(campaign) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}
