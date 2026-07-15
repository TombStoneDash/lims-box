export const DEFAULT_EARLY_ADOPTER_SOURCE = 'lims.bot/early-adopter';

export const ALLOWED_UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
] as const;

type AllowedUtmKey = (typeof ALLOWED_UTM_KEYS)[number];
type AttributionValues = Partial<Record<AllowedUtmKey, string | string[] | null | undefined>>;
type AttributionInput = URLSearchParams | AttributionValues;

const MAX_TOKEN_LENGTH = 48;
export const MAX_EARLY_ADOPTER_SOURCE_LENGTH = 320;
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const ATTRIBUTION_PREFIX = `${DEFAULT_EARLY_ADOPTER_SOURCE};`;

function candidateValues(input: AttributionInput, key: AllowedUtmKey): string[] {
  if (input instanceof URLSearchParams) {
    return input.getAll(key);
  }

  const value = input[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

export function normalizeAttributionToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_TOKEN_LENGTH) return null;
  return TOKEN_PATTERN.test(normalized) ? normalized : null;
}

export function buildEarlyAdopterSource(input: AttributionInput): string {
  const segments: string[] = [];

  for (const key of ALLOWED_UTM_KEYS) {
    const normalized = candidateValues(input, key)
      .map(normalizeAttributionToken)
      .find((value): value is string => Boolean(value));
    if (normalized) segments.push(`${key}=${normalized}`);
  }

  if (segments.length === 0) return DEFAULT_EARLY_ADOPTER_SOURCE;

  const source = `${DEFAULT_EARLY_ADOPTER_SOURCE};${segments.join(';')}`;
  return source.length <= MAX_EARLY_ADOPTER_SOURCE_LENGTH
    ? source
    : DEFAULT_EARLY_ADOPTER_SOURCE;
}

export function normalizeSubmittedEarlyAdopterSource(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_EARLY_ADOPTER_SOURCE;
  const trimmed = value.trim();
  if (trimmed === DEFAULT_EARLY_ADOPTER_SOURCE) return trimmed;
  if (!trimmed.startsWith(ATTRIBUTION_PREFIX)) return DEFAULT_EARLY_ADOPTER_SOURCE;

  const params = new URLSearchParams();
  for (const segment of trimmed.slice(ATTRIBUTION_PREFIX.length).split(';')) {
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;
    const key = segment.slice(0, separator) as AllowedUtmKey;
    const rawValue = segment.slice(separator + 1);
    if (!ALLOWED_UTM_KEYS.includes(key)) continue;
    params.append(key, rawValue);
  }

  return buildEarlyAdopterSource(params);
}

export function resolveEarlyAdopterSource(
  submittedSource: unknown,
  referer: string | null | undefined,
): string {
  if (referer) {
    try {
      const fromReferer = buildEarlyAdopterSource(new URL(referer).searchParams);
      if (fromReferer !== DEFAULT_EARLY_ADOPTER_SOURCE) return fromReferer;
    } catch {
      // Invalid or relative Referer values are ignored. The submitted source is
      // still normalized below; arbitrary header text never reaches storage.
    }
  }

  return normalizeSubmittedEarlyAdopterSource(submittedSource);
}

export function withCampaignAttribution(
  baseUrl: string,
  values: AttributionValues,
): string {
  const absolute = /^https?:\/\//i.test(baseUrl);
  const url = new URL(baseUrl, 'https://local.invalid');

  for (const key of ALLOWED_UTM_KEYS) {
    const normalized = candidateValues(values, key)
      .map(normalizeAttributionToken)
      .find((value): value is string => Boolean(value));
    if (normalized) url.searchParams.set(key, normalized);
  }

  return absolute
    ? url.toString()
    : `${url.pathname}${url.search}${url.hash}`;
}
