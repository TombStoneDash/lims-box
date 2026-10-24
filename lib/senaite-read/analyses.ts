import {
  authenticatedFromPayload,
  configuration,
  record,
  type SenaiteReadEnvironment,
  type SenaiteReadErrorCode,
} from './index';

export type SenaiteAnalysis = {
  uid: string;
  keyword: string;
  title: string | null;
  reviewState: string | null;
  unit: string | null;
  /** Null unless SENAITE reports the analysis as verified or published. */
  reportableResult: string | null;
};

export type SenaiteAnalysesErrorCode = SenaiteReadErrorCode | 'scope-mismatch';

export type SenaiteAnalysesResult =
  | { status: 'ok'; analyses: SenaiteAnalysis[] }
  | { status: 'not_configured' }
  | { status: 'error'; code: SenaiteAnalysesErrorCode };

// One sample carries far fewer analyses than this; a fuller page is treated as
// a query SENAITE did not scope, not as a long sample.
export const MAX_SAMPLE_ANALYSES = 100;

// Results that have passed SENAITE's second-person review. Anything earlier
// (unassigned, assigned, to_be_verified) or withdrawn (retracted, rejected) is
// listed without a value, so a draft or retracted number is never shown as reported.
const REPORTABLE_STATES = new Set(['verified', 'published']);
const PLONE_UID = /^[0-9a-f]{32}$/;

function optionalString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === 'string';
}

/**
 * senaite.jsonapi builds catalog queries only from keys that are catalog
 * indexes and silently drops the rest. If `getRequestUID` were dropped, the
 * listing would hold analyses from every sample. Each record must therefore be
 * stored in the requested sample (`parent_uid`, the container SENAITE reports
 * for the object itself), or the whole page fails.
 */
function analysesFromPayload(payload: unknown, sampleUid: string): SenaiteAnalysis[] | 'scope-mismatch' | null {
  if (!record(payload) || !Array.isArray(payload.items) || payload.items.length >= MAX_SAMPLE_ANALYSES) return null;
  const analyses: SenaiteAnalysis[] = [];
  for (const item of payload.items) {
    if (!record(item)) return null;
    if (item.parent_uid !== sampleUid) return 'scope-mismatch';
    if (typeof item.uid !== 'string' || !item.uid.trim() ||
        typeof item.Keyword !== 'string' || !item.Keyword.trim() ||
        !optionalString(item.title) || !optionalString(item.review_state) ||
        !optionalString(item.Unit) || !optionalString(item.Result)) return null;
    const reviewState = item.review_state ?? null;
    analyses.push({
      uid: item.uid,
      keyword: item.Keyword,
      title: item.title ?? null,
      reviewState,
      unit: item.Unit?.trim() ? item.Unit : null,
      reportableResult: reviewState !== null && REPORTABLE_STATES.has(reviewState) && item.Result?.trim()
        ? item.Result
        : null,
    });
  }
  return analyses;
}

/** Server-side only. Construction is inert; the only operations are bounded GETs. */
export function createSenaiteAnalysesReader(
  env: SenaiteReadEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_API_TOKEN: process.env.SENAITE_API_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);

  async function getJson(url: URL, authorization: string): Promise<{ payload: unknown } | { code: SenaiteReadErrorCode }> {
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

  return {
    enabled: config !== null,
    /** Analyses stored in one sample, identified by its Plone UID. */
    async listSampleAnalyses(sampleUid: string): Promise<SenaiteAnalysesResult> {
      if (!config) return { status: 'not_configured' };
      if (typeof sampleUid !== 'string' || !PLONE_UID.test(sampleUid)) return { status: 'error', code: 'invalid-query' };

      // A rejected token reads as Anonymous with no analyses; prove sign-in first.
      const identity = await getJson(config.identityUrl, config.authorization);
      if ('code' in identity) return { status: 'error', code: identity.code };
      const authenticated = authenticatedFromPayload(identity.payload);
      if (authenticated === null) return { status: 'error', code: 'invalid-response' };
      if (!authenticated) return { status: 'error', code: 'unauthenticated' };

      const url = new URL(config.analysesUrl);
      url.searchParams.set('getRequestUID', sampleUid);
      url.searchParams.set('complete', 'yes');
      url.searchParams.set('limit', String(MAX_SAMPLE_ANALYSES));
      url.searchParams.set('sort_on', 'sortable_title');
      const listing = await getJson(url, config.authorization);
      if ('code' in listing) return { status: 'error', code: listing.code };
      const analyses = analysesFromPayload(listing.payload, sampleUid);
      if (analyses === 'scope-mismatch') return { status: 'error', code: 'scope-mismatch' };
      return analyses === null ? { status: 'error', code: 'invalid-response' } : { status: 'ok', analyses };
    },
  };
}
