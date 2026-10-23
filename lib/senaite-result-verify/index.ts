export type SenaiteResultVerifyEnvironment = {
  SENAITE_BASE_URL?: string;
  /** A separately provisioned token whose account may run `verify`. Never the read-only token. */
  SENAITE_RESULT_VERIFY_TOKEN?: string;
};

export type SenaiteResultVerifyRequest = {
  /** SENAITE Client UID the sample must belong to. */
  clientUid: string;
  /** Exact SENAITE sample ID, for example `WB-0001`. */
  sampleId: string;
  /** Analysis service keyword, for example `TSH`. */
  keyword: string;
};

export type SenaiteResultVerifyErrorCode =
  | 'invalid-request' | 'unauthenticated' | 'request-failed' | 'invalid-response'
  | 'sample-not-found' | 'ambiguous-sample' | 'scope-mismatch'
  | 'analysis-not-found' | 'ambiguous-analysis' | 'not-verifiable' | 'no-result'
  | 'submitter-unknown' | 'verifier-unknown' | 'self-verification' | 'write-failed' | 'write-unconfirmed';

export type VerifiedResult = { uid: string; sampleId: string; keyword: string; result: string };

export type SenaiteResultVerifyResult =
  | { status: 'not_configured' }
  /** `transitioned: false` means SENAITE already had it verified; nothing was written. */
  | { status: 'verified'; analysis: VerifiedResult; transitioned: boolean }
  /** `reviewState` is set only for `not-verifiable`. */
  | { status: 'error'; code: SenaiteResultVerifyErrorCode; reviewState?: string };

// Plone/SENAITE UIDs are 32 lowercase hex characters.
const UID = /^[0-9a-f]{32}$/;
const SAMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const KEYWORD = /^[A-Za-z0-9_-]{1,64}$/;
const STATE = /^[a-z][a-z_]{0,63}$/;
const VERIFIABLE = 'to_be_verified';
const VERIFIED = 'verified';
// A retest leaves the original analysis behind in one of these states, with the same keyword.
const SUPERSEDED = new Set(['retracted', 'rejected', 'cancelled']);
const MAX_SAMPLE_ANALYSES = 100;

function configuration(env: SenaiteResultVerifyEnvironment) {
  const { SENAITE_BASE_URL: rawUrl, SENAITE_RESULT_VERIFY_TOKEN: token } = env;
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
    return { api, authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * SENAITE 2.6 answers a rejected token with HTTP 200 as Anonymous; only
 * `authenticated: true` with a username counts. The username is kept only to
 * compare with the analysis submitter and is never returned.
 */
function verifierFromPayload(payload: unknown): { authenticated: false } | { authenticated: true; username: string } | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) || payload.items.length !== 1) {
    return null;
  }
  const [identity] = payload.items;
  if (!record(identity) || typeof identity.authenticated !== 'boolean') return null;
  if (!identity.authenticated) return { authenticated: false };
  if (typeof identity.username !== 'string' || !identity.username.trim()) return null;
  return { authenticated: true, username: identity.username.trim() };
}

type ListedSample = { uid: string; id: string; clientUid: string };

function listedSamples(payload: unknown): ListedSample[] | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items)) return null;
  const samples: ListedSample[] = [];
  for (const item of payload.items) {
    if (!record(item) || typeof item.uid !== 'string' || !UID.test(item.uid) ||
        typeof item.id !== 'string' || typeof item.getClientUID !== 'string') return null;
    samples.push({ uid: item.uid, id: item.id, clientUid: item.getClientUID });
  }
  return samples;
}

type ListedAnalysis = { uid: string; keyword: string; reviewState: string; result: string; submittedBy: string };

/**
 * Every analysis must sit directly under the sample it was asked for. A dropped
 * `getRequestUID` filter would otherwise list other samples' analyses.
 */
function listedAnalyses(payload: unknown, sampleUid: string): ListedAnalysis[] | 'scope-mismatch' | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) ||
      payload.items.length > MAX_SAMPLE_ANALYSES) return null;
  // One page must be the whole sample; a further page could hold a second match.
  if (typeof payload.next === 'string' && payload.next) return null;
  const analyses: ListedAnalysis[] = [];
  for (const item of payload.items) {
    if (!record(item)) return null;
    if (item.parent_uid !== sampleUid) return 'scope-mismatch';
    if (typeof item.uid !== 'string' || !UID.test(item.uid) || typeof item.Keyword !== 'string' ||
        typeof item.review_state !== 'string' || !STATE.test(item.review_state) ||
        (item.Result != null && typeof item.Result !== 'string') ||
        (item.getSubmittedBy != null && typeof item.getSubmittedBy !== 'string')) return null;
    analyses.push({
      uid: item.uid,
      keyword: item.Keyword,
      reviewState: item.review_state,
      result: typeof item.Result === 'string' ? item.Result.trim() : '',
      submittedBy: typeof item.getSubmittedBy === 'string' ? item.getSubmittedBy.trim() : '',
    });
  }
  return analyses;
}

type JsonCall = { payload: unknown } | { code: 'request-failed' | 'invalid-response'; rejected: boolean };

/**
 * Verifies one submitted OHWorks result in SENAITE (`to_be_verified` -> `verified`).
 * Server-side only; construction is inert. The write uses its own token, so the
 * read-only `SENAITE_API_TOKEN` and the import token can never enable it.
 *
 * Four-eyes is checked here, not left to SENAITE's "allow self-verification"
 * setting: the signed-in verifier must differ from the analysis submitter, and
 * an analysis with no recorded submitter is never verified. Success is reported
 * only after SENAITE reads the analysis back as verified, under the same
 * sample, with the result that was reviewed.
 */
export function createSenaiteResultVerifier(
  env: SenaiteResultVerifyEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_RESULT_VERIFY_TOKEN: process.env.SENAITE_RESULT_VERIFY_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);

  type Config = NonNullable<typeof config>;

  async function call(
    cfg: Config, url: URL, init: { method: 'GET' } | { method: 'POST'; body: string } = { method: 'GET' },
  ): Promise<JsonCall> {
    let response: Response;
    try {
      response = await transport(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: cfg.authorization,
          ...(init.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Lost answers: the request may or may not have reached SENAITE.
      return { code: 'request-failed', rejected: false };
    }
    if (!response.ok) return { code: 'request-failed', rejected: true };
    try {
      return { payload: await response.json() };
    } catch {
      return { code: 'invalid-response', rejected: false };
    }
  }

  async function analyses(cfg: Config, sampleUid: string) {
    const url = cfg.api('Analysis');
    url.searchParams.set('getRequestUID', sampleUid);
    url.searchParams.set('complete', 'yes');
    url.searchParams.set('limit', String(MAX_SAMPLE_ANALYSES));
    const listing = await call(cfg, url);
    if ('code' in listing) return { code: listing.code } as const;
    const listed = listedAnalyses(listing.payload, sampleUid);
    if (listed === null) return { code: 'invalid-response' } as const;
    if (listed === 'scope-mismatch') return { code: 'scope-mismatch' } as const;
    return { analyses: listed } as const;
  }

  return {
    enabled: config !== null,
    async verify(request: SenaiteResultVerifyRequest): Promise<SenaiteResultVerifyResult> {
      if (!config) return { status: 'not_configured' };
      if (!record(request) || typeof request.clientUid !== 'string' || !UID.test(request.clientUid) ||
          typeof request.sampleId !== 'string' || !SAMPLE_ID.test(request.sampleId) ||
          typeof request.keyword !== 'string' || !KEYWORD.test(request.keyword)) {
        return { status: 'error', code: 'invalid-request' };
      }
      const { clientUid, sampleId, keyword } = request;

      const identity = await call(config, config.api('users/current'));
      if ('code' in identity) return { status: 'error', code: identity.code };
      const verifier = verifierFromPayload(identity.payload);
      if (verifier === null) return { status: 'error', code: 'invalid-response' };
      if (!verifier.authenticated) return { status: 'error', code: 'unauthenticated' };

      // senaite.jsonapi drops query keys that are not catalog indexes and still
      // answers 200, so every sample returned must echo both the ID and the client.
      const samplesUrl = config.api('AnalysisRequest');
      samplesUrl.searchParams.set('getId', sampleId);
      samplesUrl.searchParams.set('getClientUID', clientUid);
      samplesUrl.searchParams.set('complete', 'yes');
      samplesUrl.searchParams.set('limit', '10');
      const sampleListing = await call(config, samplesUrl);
      if ('code' in sampleListing) return { status: 'error', code: sampleListing.code };
      const samples = listedSamples(sampleListing.payload);
      if (!samples) return { status: 'error', code: 'invalid-response' };
      if (samples.some(sample => sample.id !== sampleId || sample.clientUid !== clientUid)) {
        return { status: 'error', code: 'scope-mismatch' };
      }
      if (samples.length === 0) return { status: 'error', code: 'sample-not-found' };
      if (samples.length > 1) return { status: 'error', code: 'ambiguous-sample' };
      const sample = samples[0];

      const before = await analyses(config, sample.uid);
      if ('code' in before) return { status: 'error', code: before.code };
      const matches = before.analyses.filter(a => a.keyword === keyword && !SUPERSEDED.has(a.reviewState));
      if (matches.length === 0) return { status: 'error', code: 'analysis-not-found' };
      if (matches.length > 1) return { status: 'error', code: 'ambiguous-analysis' };
      const analysis = matches[0];
      const verified: VerifiedResult = { uid: analysis.uid, sampleId, keyword, result: analysis.result };

      if (analysis.reviewState === VERIFIED) return { status: 'verified', analysis: verified, transitioned: false };
      if (analysis.reviewState !== VERIFIABLE) {
        return { status: 'error', code: 'not-verifiable', reviewState: analysis.reviewState };
      }
      if (!analysis.result) return { status: 'error', code: 'no-result' };
      if (!analysis.submittedBy) return { status: 'error', code: 'submitter-unknown' };
      // `getSubmittedBy` is a user id; `users/current` gives the login name. They
      // match unless the site logs in by email, where the comparison would prove
      // nothing, so an email-shaped login is never trusted as a distinct verifier.
      if (verifier.username.includes('@')) return { status: 'error', code: 'verifier-unknown' };
      if (analysis.submittedBy.toLowerCase() === verifier.username.toLowerCase()) {
        return { status: 'error', code: 'self-verification' };
      }

      // senaite.jsonapi `update` runs the named workflow transition; nothing else is sent.
      const write = await call(config, config.api('update'), {
        method: 'POST', body: JSON.stringify({ uid: analysis.uid, transition: 'verify' }),
      });
      const refused = 'code' in write ? write.rejected : !record(write.payload) || write.payload.success === false;

      // The read-back is the only proof. A lost or refused answer may still have
      // verified the result; a confirmed-looking answer may not have.
      const after = await analyses(config, sample.uid);
      if ('code' in after) return { status: 'error', code: 'write-unconfirmed' };
      const readBack = after.analyses.find(a => a.uid === analysis.uid);
      if (readBack?.reviewState === VERIFIED && readBack.keyword === keyword && readBack.result === analysis.result) {
        return { status: 'verified', analysis: verified, transitioned: true };
      }
      if (readBack?.reviewState === VERIFIABLE && refused) return { status: 'error', code: 'write-failed' };
      return { status: 'error', code: 'write-unconfirmed' };
    },
  };
}
