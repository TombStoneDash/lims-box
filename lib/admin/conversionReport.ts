import {
  DEFAULT_EARLY_ADOPTER_SOURCE,
  normalizeAttributionToken,
} from '../leadAttribution';

export interface SourceCountRow {
  source: string | null;
  applications: number;
}

export interface ConversionCount {
  source: string;
  campaign: string | null;
  medium: string | null;
  content: string | null;
  applications: number;
}

const KNOWN_EXACT_SOURCES = new Set([
  DEFAULT_EARLY_ADOPTER_SOURCE,
  'blog_newsletter',
  'contact_form',
  'lims.bot',
  'personnel-pack-download',
]);

export const MIN_REPORTABLE_CELL_SIZE = 3;

// Reporting dimensions are deliberately narrower than the intake contract.
// Intake accepts bounded tokens for durable attribution, while this allowlist
// contains only campaign values owned by LIMS BOX and safe to expose in an
// aggregate report.
const REPORTABLE_DIMENSIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  utm_source: new Set(['cola2026']),
  utm_medium: new Set(['calendar', 'cta', 'qr']),
  utm_campaign: new Set(['cola_forum_2026']),
  utm_content: new Set(['booth-card.1']),
} as const;

function safeSourceName(source: string | null): string {
  if (!source) return 'unattributed';
  if (KNOWN_EXACT_SOURCES.has(source)) return source;
  if (source.startsWith('webinar:')) return 'webinar';
  return 'other';
}

function parseEarlyAdopterSource(source: string): Omit<ConversionCount, 'applications'> {
  const [base, ...segments] = source.split(';');
  if (base !== DEFAULT_EARLY_ADOPTER_SOURCE) {
    return {
      source: safeSourceName(source),
      campaign: null,
      medium: null,
      content: null,
    };
  }

  const values = new Map<string, string>();
  for (const segment of segments) {
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;

    const key = segment.slice(0, separator);
    const allowlist = REPORTABLE_DIMENSIONS[key];
    if (!allowlist) continue;

    const value = normalizeAttributionToken(segment.slice(separator + 1));
    if (value && allowlist.has(value) && !values.has(key)) {
      values.set(key, value);
    }
  }

  return {
    source: values.get('utm_source') ?? DEFAULT_EARLY_ADOPTER_SOURCE,
    campaign: values.get('utm_campaign') ?? null,
    medium: values.get('utm_medium') ?? null,
    content: values.get('utm_content') ?? null,
  };
}

export function buildConversionCounts(rows: SourceCountRow[]): ConversionCount[] {
  const aggregate = new Map<string, ConversionCount>();

  for (const row of rows) {
    if (!Number.isSafeInteger(row.applications) || row.applications < 0) continue;

    const dimensions = row.source?.startsWith(`${DEFAULT_EARLY_ADOPTER_SOURCE};`)
      ? parseEarlyAdopterSource(row.source)
      : {
          source: safeSourceName(row.source),
          campaign: null,
          medium: null,
          content: null,
        };
    const key = JSON.stringify(dimensions);
    const existing = aggregate.get(key);

    if (existing) {
      existing.applications += row.applications;
    } else {
      aggregate.set(key, { ...dimensions, applications: row.applications });
    }
  }

  return [...aggregate.values()]
    .filter(group => group.applications >= MIN_REPORTABLE_CELL_SIZE)
    .sort(
    (left, right) =>
      right.applications - left.applications ||
      left.source.localeCompare(right.source) ||
      (left.campaign ?? '').localeCompare(right.campaign ?? ''),
    );
}
