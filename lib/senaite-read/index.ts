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

export type SenaiteReadResult =
  | { status: 'ok'; samples: SenaiteSample[] }
  | { status: 'not_configured' }
  | { status: 'error'; code: 'invalid-query' | 'request-failed' | 'invalid-response' };

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
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/@@API/senaite/v1/AnalysisRequest`;
    return { url, authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

/** Server-side only. Construction is inert; the sole operation is a bounded GET. */
export function createSenaiteReadAdapter(
  env: SenaiteReadEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_API_TOKEN: process.env.SENAITE_API_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);
  return {
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
      const url = new URL(config.url);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('sort_on', 'created');
      url.searchParams.set('sort_order', 'descending');
      if (query.sampleId !== undefined) url.searchParams.set('getId', query.sampleId);
      if (query.reviewState !== undefined) url.searchParams.set('review_state', query.reviewState);
      try {
        const response = await transport(url, {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: config.authorization },
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return { status: 'error', code: 'request-failed' };
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return { status: 'error', code: 'invalid-response' };
        }
        const samples = samplesFromPayload(payload, limit);
        return samples === null ? { status: 'error', code: 'invalid-response' } : { status: 'ok', samples };
      } catch {
        // Never expose upstream bodies, URLs, credentials, or transport exceptions.
        return { status: 'error', code: 'request-failed' };
      }
    },
  };
}
