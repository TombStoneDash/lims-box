export type SenaiteReadEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_API_TOKEN?: string;
};

export type SenaiteSample = {
  uid: string;
  id: string;
  title: string | null;
  reviewState: string | null;
};

export type SenaiteReadErrorCode =
  | 'invalid-query' | 'unauthenticated' | 'request-failed' | 'invalid-response' | 'filter-mismatch';

export type SenaiteReadResult =
  | { status: 'ok'; samples: SenaiteSample[] }
  | { status: 'not_configured' }
  | { status: 'error'; code: SenaiteReadErrorCode };

export type SenaiteSampleLookupResult =
  | { status: 'ok'; sample: SenaiteSample }
  | { status: 'not_found' }
  | { status: 'not_configured' }
  | { status: 'error'; code: SenaiteReadErrorCode };

export type SenaiteSampleQuery = {
  sampleId?: string;
  reviewState?: string;
  limit?: number;
};

function configuration(env: SenaiteReadEnvironment) {
  const { SENAITE_BASE_URL: rawUrl, SENAITE_API_TOKEN: token } = env;
  if (!rawUrl?.trim() || !token?.trim() || /[\s\x00-\x1f\x7f]/.test(token)) return null;
  try {
    const url = new URL(rawUrl);
    // Credentials travel only over TLS, to this configured origin, without redirects.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    const api = (route: string) => {
      const endpoint = new URL(url);
      endpoint.pathname = `${url.pathname.replace(/\/+$/, '')}/@@API/senaite/v1/${route}`;
      return endpoint;
    };
    return { identityUrl: api('users/current'), samplesUrl: api('AnalysisRequest'), authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * SENAITE 2.6 answers a missing, invalid or expired token with HTTP 200 and
 * treats the caller as Anonymous, who sees an empty sample list. Only an
 * explicit `authenticated: true` from users/current proves the token worked.
 * Nothing else from the identity record (names, emails, roles) is kept.
 */
function authenticatedFromPayload(payload: unknown): boolean | null {
  if (!record(payload) || !Array.isArray(payload.items) || payload.items.length !== 1) return null;
  const [identity] = payload.items;
  return record(identity) && typeof identity.authenticated === 'boolean' ? identity.authenticated : null;
}

/**
 * senaite.jsonapi builds catalog queries only from keys that are catalog
 * indexes and silently drops the rest, still answering HTTP 200. A dropped
 * `getId` or `review_state` filter would return the newest samples in the lab
 * as if they matched, so every record must echo each filter that was sent.
 */
function matchesQuery(sample: SenaiteSample, query: SenaiteSampleQuery): boolean {
  return (query.sampleId === undefined || sample.id === query.sampleId) &&
    (query.reviewState === undefined || sample.reviewState === query.reviewState);
}

function samplesFromPayload(payload: unknown, limit: number): SenaiteSample[] | null {
  if (!record(payload) || !Array.isArray(payload.items) || payload.items.length > limit) return null;
  const samples: SenaiteSample[] = [];
  for (const item of payload.items) {
    if (!record(item) || typeof item.uid !== 'string' || !item.uid.trim() ||
        typeof item.id !== 'string' || !item.id.trim() ||
        (item.title != null && typeof item.title !== 'string') ||
        (item.review_state != null && typeof item.review_state !== 'string')) return null;
    samples.push({
      uid: item.uid,
      id: item.id,
      title: typeof item.title === 'string' ? item.title : null,
      reviewState: typeof item.review_state === 'string' ? item.review_state : null,
    });
  }
  return samples;
}

type JsonRead = { payload: unknown } | { code: 'request-failed' | 'invalid-response' };

/** Server-side only. Construction is inert; the only operations are bounded GETs. */
export function createSenaiteReadAdapter(
  env: SenaiteReadEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_API_TOKEN: process.env.SENAITE_API_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);

  async function getJson(url: URL, authorization: string): Promise<JsonRead> {
    try {
      const response = await transport(url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: authorization },
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return { code: 'request-failed' };
      try {
        return { payload: await response.json() };
      } catch {
        return { code: 'invalid-response' };
      }
    } catch {
      // Never expose upstream bodies, URLs, credentials, or transport exceptions.
      return { code: 'request-failed' };
    }
  }

  const adapter = {
    enabled: config !== null,
    async listSamples(query: SenaiteSampleQuery = {}): Promise<SenaiteReadResult> {
      if (!config) return { status: 'not_configured' };
      if (!record(query)) return { status: 'error', code: 'invalid-query' };
      const limit = query.limit ?? 25;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
          [query.sampleId, query.reviewState].some(value => value !== undefined &&
            (typeof value !== 'string' || !value.trim() || value.length > 200))) {
        return { status: 'error', code: 'invalid-query' };
      }

      // Prove the token is accepted before asking for samples, so a rejected
      // token can never look like a lab with no samples.
      const identity = await getJson(config.identityUrl, config.authorization);
      if ('code' in identity) return { status: 'error', code: identity.code };
      const authenticated = authenticatedFromPayload(identity.payload);
      if (authenticated === null) return { status: 'error', code: 'invalid-response' };
      if (!authenticated) return { status: 'error', code: 'unauthenticated' };

      const url = new URL(config.samplesUrl);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('sort_on', 'created');
      url.searchParams.set('sort_order', 'descending');
      if (query.sampleId !== undefined) url.searchParams.set('getId', query.sampleId);
      if (query.reviewState !== undefined) url.searchParams.set('review_state', query.reviewState);
      const listing = await getJson(url, config.authorization);
      if ('code' in listing) return { status: 'error', code: listing.code };
      const samples = samplesFromPayload(listing.payload, limit);
      if (samples === null) return { status: 'error', code: 'invalid-response' };
      // A partial list would hide the ignored filter, so the whole page fails.
      if (!samples.every(sample => matchesQuery(sample, query))) return { status: 'error', code: 'filter-mismatch' };
      return { status: 'ok', samples };
    },
    /**
     * Exactly one sample whose SENAITE ID equals `sampleId`. `not_found` is
     * only reported after a proven sign-in, and two records with the same ID
     * are a malformed answer, never a choice.
     */
    async getSample(sampleId: string): Promise<SenaiteSampleLookupResult> {
      if (!config) return { status: 'not_configured' };
      // A missing ID would otherwise become an unfiltered read of the newest sample.
      if (typeof sampleId !== 'string') return { status: 'error', code: 'invalid-query' };
      const result = await adapter.listSamples({ sampleId, limit: 2 });
      if (result.status !== 'ok') return result;
      if (result.samples.length === 0) return { status: 'not_found' };
      if (result.samples.length !== 1) return { status: 'error', code: 'invalid-response' };
      return { status: 'ok', sample: result.samples[0] };
    },
  };
  return adapter;
}
