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
  /** UID of the exact analysis the reviewer looked at. A retest has a new UID. */
  analysisUid: string;
  /** Analysis service keyword, for example `TSH`. */
  keyword: string;
  /** The `Result` text the reviewer saw. Anything else is refused. */
  expectedResult: string;
  /** The detection-limit operand the reviewer saw (`<` or `>`); omit or '' when there was none. */
  expectedOperand?: string;
  /**
   * SENAITE user id of the person approving, derived server-side from the
   * signed-in OHWorks session. Never taken from browser input.
   */
  reviewerUserId: string;
};

export type SenaiteResultVerifyErrorCode =
  | 'invalid-request' | 'unauthenticated' | 'request-failed' | 'invalid-response'
  | 'sample-not-found' | 'ambiguous-sample' | 'scope-mismatch'
  | 'analysis-not-found' | 'not-verifiable' | 'result-mismatch'
  | 'submitter-unknown' | 'self-verification' | 'write-failed' | 'write-unconfirmed';

export type VerifiedResult = { uid: string; sampleId: string; keyword: string; result: string };

export type SenaiteResultVerifyResult =
  | { status: 'not_configured' }
  /** This call ran `verify` after the four-eyes check, and SENAITE read it back verified. */
  | { status: 'verified'; analysis: VerifiedResult }
  /**
   * SENAITE already had it verified; nothing was written. This makes no claim
   * about who verified it or whether four-eyes held.
   */
  | { status: 'already_verified'; analysis: VerifiedResult }
  /** `reviewState` is set only for `not-verifiable`. */
  | { status: 'error'; code: SenaiteResultVerifyErrorCode; reviewState?: string };

// Plone/SENAITE UIDs are 32 lowercase hex characters.
const UID = /^[0-9a-f]{32}$/;
const SAMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const KEYWORD = /^[A-Za-z0-9_-]{1,64}$/;
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/;
const STATE = /^[a-z][a-z_]{0,63}$/;
const OPERANDS = new Set(['', '<', '>']);
const VERIFIABLE = 'to_be_verified';
const VERIFIED = 'verified';
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

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * SENAITE 2.6 answers a rejected token with HTTP 200 as Anonymous; only
 * `authenticated: true` with a username counts. The token account's login name
 * and, when `api_url` names it, its user id are kept only to compare with the
 * analysis submitter and are never returned.
 */
function tokenAccountFromPayload(payload: unknown): { authenticated: false } | { authenticated: true; names: string[] } | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) || payload.items.length !== 1) {
    return null;
  }
  const [identity] = payload.items;
  if (!record(identity) || typeof identity.authenticated !== 'boolean') return null;
  if (!identity.authenticated) return { authenticated: false };
  if (typeof identity.username !== 'string' || !identity.username.trim()) return null;
  const names = [identity.username.trim()];
  const idFromUrl = typeof identity.api_url === 'string' ? /\/users\/([^/?#]+)$/.exec(identity.api_url)?.[1] : undefined;
  if (idFromUrl && idFromUrl !== 'current') names.push(decodeURIComponent(idFromUrl));
  return { authenticated: true, names };
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

type ListedAnalysis = {
  uid: string; keyword: string; reviewState: string; result: string; operand: string; submittedBy: string;
};

const optionalString = (value: unknown) => value == null || typeof value === 'string';
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * Every analysis must sit directly under the sample it was asked for. A dropped
 * `getRequestUID` filter would otherwise list other samples' analyses.
 */
function listedAnalyses(payload: unknown, sampleUid: string): ListedAnalysis[] | 'scope-mismatch' | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) ||
      payload.items.length > MAX_SAMPLE_ANALYSES) return null;
  // One page must be the whole sample; a further page could hold the analysis.
  if (typeof payload.next === 'string' && payload.next) return null;
  const analyses: ListedAnalysis[] = [];
  for (const item of payload.items) {
    if (!record(item)) return null;
    if (item.parent_uid !== sampleUid) return 'scope-mismatch';
    if (typeof item.uid !== 'string' || !UID.test(item.uid) || typeof item.Keyword !== 'string' ||
        typeof item.review_state !== 'string' || !STATE.test(item.review_state) ||
        !optionalString(item.Result) || !optionalString(item.DetectionLimitOperand) ||
        !optionalString(item.getSubmittedBy)) return null;
    analyses.push({
      uid: item.uid,
      keyword: item.Keyword,
      reviewState: item.review_state,
      result: text(item.Result),
      operand: text(item.DetectionLimitOperand),
      submittedBy: text(item.getSubmittedBy),
    });
  }
  return analyses;
}

function validRequest(request: unknown): request is SenaiteResultVerifyRequest {
  if (!record(request)) return false;
  const { clientUid, sampleId, analysisUid, keyword, expectedResult, expectedOperand, reviewerUserId } = request;
  return typeof clientUid === 'string' && UID.test(clientUid) &&
    typeof sampleId === 'string' && SAMPLE_ID.test(sampleId) &&
    typeof analysisUid === 'string' && UID.test(analysisUid) &&
    typeof keyword === 'string' && KEYWORD.test(keyword) &&
    typeof expectedResult === 'string' && expectedResult.trim() !== '' && expectedResult.length <= 64 &&
    (expectedOperand === undefined || (typeof expectedOperand === 'string' && OPERANDS.has(expectedOperand))) &&
    typeof reviewerUserId === 'string' && USER_ID.test(reviewerUserId);
}

type JsonCall = { payload: unknown } | { code: 'request-failed' | 'invalid-response'; rejected: boolean };

/**
 * Verifies one submitted OHWorks result in SENAITE (`to_be_verified` -> `verified`).
 * Server-side only; construction is inert. The write uses its own token, so the
 * read-only `SENAITE_API_TOKEN` and the import token can never enable it.
 *
 * The token is a service account, so four-eyes is checked against the person:
 * `reviewerUserId` (from the signed-in session) must differ from the analysis
 * submitter, and so must the token account. An analysis with no recorded
 * submitter is never verified. The caller names the exact analysis and result
 * the reviewer saw, and anything else is refused. Success is reported only
 * when this call's write was accepted and SENAITE reads that same analysis
 * and result back as verified.
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

  /** The requested analysis, found under the sample it must belong to. */
  async function analysis(cfg: Config, sampleUid: string, request: SenaiteResultVerifyRequest) {
    const url = cfg.api('Analysis');
    url.searchParams.set('getRequestUID', sampleUid);
    url.searchParams.set('complete', 'yes');
    url.searchParams.set('limit', String(MAX_SAMPLE_ANALYSES));
    const listing = await call(cfg, url);
    if ('code' in listing) return { code: listing.code } as const;
    const listed = listedAnalyses(listing.payload, sampleUid);
    if (listed === null) return { code: 'invalid-response' } as const;
    if (listed === 'scope-mismatch') return { code: 'scope-mismatch' } as const;
    const found = listed.find(a => a.uid === request.analysisUid);
    if (!found) return { code: 'analysis-not-found' } as const;
    if (found.keyword !== request.keyword) return { code: 'scope-mismatch' } as const;
    return { analysis: found } as const;
  }

  const reviewed = (a: ListedAnalysis, request: SenaiteResultVerifyRequest) =>
    a.result === request.expectedResult.trim() && a.operand === (request.expectedOperand ?? '');

  return {
    enabled: config !== null,
    async verify(request: SenaiteResultVerifyRequest): Promise<SenaiteResultVerifyResult> {
      if (!config) return { status: 'not_configured' };
      if (!validRequest(request)) return { status: 'error', code: 'invalid-request' };
      const { clientUid, sampleId, keyword } = request;

      const identity = await call(config, config.api('users/current'));
      if ('code' in identity) return { status: 'error', code: identity.code };
      const account = tokenAccountFromPayload(identity.payload);
      if (account === null) return { status: 'error', code: 'invalid-response' };
      if (!account.authenticated) return { status: 'error', code: 'unauthenticated' };

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

      const before = await analysis(config, sample.uid, request);
      if ('code' in before) return { status: 'error', code: before.code };
      const current = before.analysis;
      if (!reviewed(current, request)) return { status: 'error', code: 'result-mismatch' };
      const verified: VerifiedResult = { uid: current.uid, sampleId, keyword, result: current.result };

      if (current.reviewState === VERIFIED) return { status: 'already_verified', analysis: verified };
      if (current.reviewState !== VERIFIABLE) {
        return { status: 'error', code: 'not-verifiable', reviewState: current.reviewState };
      }
      if (!current.submittedBy) return { status: 'error', code: 'submitter-unknown' };
      if ([request.reviewerUserId, ...account.names].some(name => same(name, current.submittedBy))) {
        return { status: 'error', code: 'self-verification' };
      }

      // senaite.jsonapi `update` runs the named workflow transition; nothing else is sent.
      const write = await call(config, config.api('update'), {
        method: 'POST', body: JSON.stringify({ uid: current.uid, transition: 'verify' }),
      });
      const accepted = !('code' in write) && record(write.payload) && write.payload.success !== false;
      const refused = 'code' in write ? write.rejected : !accepted;

      // The read-back is the proof. Without an accepted answer a verified
      // read-back may be someone else's verify, so it is never claimed here.
      const after = await analysis(config, sample.uid, request);
      if ('code' in after) return { status: 'error', code: 'write-unconfirmed' };
      if (accepted && after.analysis.reviewState === VERIFIED && reviewed(after.analysis, request)) {
        return { status: 'verified', analysis: verified };
      }
      if (refused && after.analysis.reviewState === VERIFIABLE) return { status: 'error', code: 'write-failed' };
      return { status: 'error', code: 'write-unconfirmed' };
    },
  };
}
