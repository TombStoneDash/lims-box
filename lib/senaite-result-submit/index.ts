export type SenaiteResultSubmitEnvironment = {
  SENAITE_BASE_URL?: string;
};

export type SenaiteResultSubmitRequest = {
  /** SENAITE Client UID the sample must belong to. */
  clientUid: string;
  /** Exact SENAITE sample ID, for example `WB-0001`. */
  sampleId: string;
  /** UID of the exact analysis the analyst looked at. A retest has a new UID. */
  analysisUid: string;
  /** Analysis service keyword, for example `TSH`. */
  keyword: string;
  /** The `Result` text the analyst saw. Anything else is refused. */
  expectedResult: string;
  /** The detection-limit operand the analyst saw (`<` or `>`); omit or '' when there was none. */
  expectedOperand?: string;
  /**
   * SENAITE user id of the person submitting, derived server-side from the
   * signed-in OHWorks session. Never taken from browser input.
   */
  analystUserId: string;
};

export type SenaiteAnalystCredentials = {
  /**
   * The analyst's own SENAITE API token, held server-side. Never a shared
   * service token: SENAITE records whoever the token signs in as as the
   * submitter, and four-eyes verification depends on that being the person.
   */
  analystToken: string;
};

export type SenaiteResultSubmitErrorCode =
  | 'invalid-request' | 'unauthenticated' | 'analyst-mismatch' | 'request-failed' | 'invalid-response'
  | 'sample-not-found' | 'ambiguous-sample' | 'scope-mismatch' | 'sample-not-received'
  | 'analysis-not-found' | 'not-submittable' | 'result-mismatch'
  | 'write-failed' | 'write-unconfirmed' | 'submitter-unattributed';

export type SubmittedResult = { uid: string; sampleId: string; keyword: string; result: string };

export type SenaiteResultSubmitResult =
  | { status: 'not_configured' }
  /**
   * This call ran `submit`, and SENAITE read the same result back as
   * `to_be_verified`, submitted by this analyst's own SENAITE user.
   */
  | { status: 'submitted'; analysis: SubmittedResult }
  /**
   * SENAITE already had it submitted (or verified); nothing was written. This
   * makes no claim about who submitted it.
   */
  | { status: 'already_submitted'; analysis: SubmittedResult; reviewState: string }
  /** `reviewState` is set only for `not-submittable` and `sample-not-received`. */
  | { status: 'error'; code: SenaiteResultSubmitErrorCode; reviewState?: string };

// Plone/SENAITE UIDs are 32 lowercase hex characters.
const UID = /^[0-9a-f]{32}$/;
const SAMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const KEYWORD = /^[A-Za-z0-9_-]{1,64}$/;
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/;
const STATE = /^[a-z][a-z_]{0,63}$/;
const OPERANDS = new Set(['', '<', '>']);
// SENAITE's `submit` transition leaves these states; later states belong to review.
const SUBMITTABLE = new Set(['unassigned', 'assigned']);
const SUBMITTED = 'to_be_verified';
const PAST_SUBMISSION = new Set([SUBMITTED, 'verified', 'published']);
const RECEIVED = 'sample_received';
const MAX_SAMPLE_ANALYSES = 100;

function siteRoot(env: SenaiteResultSubmitEnvironment) {
  const rawUrl = env.SENAITE_BASE_URL;
  if (!rawUrl?.trim()) return null;
  try {
    const url = new URL(rawUrl);
    // Credentials travel only over TLS, to this configured origin, without redirects.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return (route: string) => {
      const endpoint = new URL(url);
      endpoint.pathname = `${url.pathname.replace(/\/+$/, '')}/@@API/senaite/v1/${route}`;
      return endpoint;
    };
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * SENAITE 2.6 answers a rejected token with HTTP 200 as Anonymous; only
 * `authenticated: true` with a username counts. The user id named by `api_url`
 * is kept only to match the analyst and the recorded submitter, and is never
 * returned. Plone user ids are case-sensitive, and one user's login name can
 * be another user's id, so only the exact user id is used.
 */
function tokenAccountFromPayload(payload: unknown): { authenticated: false } | { authenticated: true; userId: string | null } | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) || payload.items.length !== 1) {
    return null;
  }
  const [identity] = payload.items;
  if (!record(identity) || typeof identity.authenticated !== 'boolean') return null;
  if (!identity.authenticated) return { authenticated: false };
  if (typeof identity.username !== 'string' || !identity.username.trim()) return null;
  const idFromUrl = typeof identity.api_url === 'string' ? /\/users\/([^/?#]+)$/.exec(identity.api_url)?.[1] : undefined;
  if (!idFromUrl || idFromUrl === 'current') return { authenticated: true, userId: null };
  try {
    return { authenticated: true, userId: decodeURIComponent(idFromUrl) };
  } catch {
    return null;
  }
}

type ListedSample = { uid: string; id: string; clientUid: string; reviewState: string };

function listedSamples(payload: unknown): ListedSample[] | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items)) return null;
  const samples: ListedSample[] = [];
  for (const item of payload.items) {
    if (!record(item) || typeof item.uid !== 'string' || !UID.test(item.uid) ||
        typeof item.id !== 'string' || typeof item.getClientUID !== 'string' ||
        typeof item.review_state !== 'string' || !STATE.test(item.review_state)) return null;
    samples.push({ uid: item.uid, id: item.id, clientUid: item.getClientUID, reviewState: item.review_state });
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

function validRequest(request: unknown): request is SenaiteResultSubmitRequest {
  if (!record(request)) return false;
  const { clientUid, sampleId, analysisUid, keyword, expectedResult, expectedOperand, analystUserId } = request;
  return typeof clientUid === 'string' && UID.test(clientUid) &&
    typeof sampleId === 'string' && SAMPLE_ID.test(sampleId) &&
    typeof analysisUid === 'string' && UID.test(analysisUid) &&
    typeof keyword === 'string' && KEYWORD.test(keyword) &&
    typeof expectedResult === 'string' && expectedResult.trim() !== '' && expectedResult.length <= 64 &&
    (expectedOperand === undefined || (typeof expectedOperand === 'string' && OPERANDS.has(expectedOperand))) &&
    typeof analystUserId === 'string' && USER_ID.test(analystUserId);
}

function validToken(credentials: unknown): credentials is SenaiteAnalystCredentials {
  return record(credentials) && typeof credentials.analystToken === 'string' &&
    credentials.analystToken.trim() !== '' && !/[\s\x00-\x1f\x7f]/.test(credentials.analystToken);
}

type JsonCall = { payload: unknown } | { code: 'request-failed' | 'invalid-response'; rejected: boolean };

/**
 * Submits one OHWorks result in SENAITE (`unassigned`/`assigned` ->
 * `to_be_verified`): the analyst's step between the LIAISON XL import, which
 * leaves values unsubmitted, and four-eyes verification.
 *
 * Server-side only; construction is inert. There is no environment token. Each
 * call carries the analyst's own SENAITE token, and the token must sign in as
 * `analystUserId`, so SENAITE records the person, not a shared service
 * account, as the submitter. Verification compares against that record. The
 * caller names the exact analysis and result the analyst saw, and anything else
 * is refused. Success is reported only when this call's write was accepted and
 * SENAITE reads that same analysis and result back as `to_be_verified`,
 * submitted by that analyst.
 */
export function createSenaiteResultSubmitter(
  env: SenaiteResultSubmitEnvironment = { SENAITE_BASE_URL: process.env.SENAITE_BASE_URL },
  transport: typeof fetch = globalThis.fetch,
) {
  const api = siteRoot(env);

  async function call(
    authorization: string, url: URL, init: { method: 'GET' } | { method: 'POST'; body: string } = { method: 'GET' },
  ): Promise<JsonCall> {
    let response: Response;
    try {
      response = await transport(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
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
    // A 4xx is SENAITE refusing. A 5xx may come from a gateway while SENAITE
    // is still committing, so it is not proof that nothing was written.
    if (!response.ok) return { code: 'request-failed', rejected: response.status < 500 };
    try {
      return { payload: await response.json() };
    } catch {
      return { code: 'invalid-response', rejected: false };
    }
  }

  return {
    enabled: api !== null,
    async submit(request: SenaiteResultSubmitRequest, credentials: SenaiteAnalystCredentials): Promise<SenaiteResultSubmitResult> {
      if (!api) return { status: 'not_configured' };
      if (!validRequest(request) || !validToken(credentials)) return { status: 'error', code: 'invalid-request' };
      const { clientUid, sampleId, keyword } = request;
      const authorization = `Bearer ${credentials.analystToken}`;

      /** The requested analysis, found under the sample it must belong to. */
      const analysis = async (sampleUid: string) => {
        const url = api('Analysis');
        url.searchParams.set('getRequestUID', sampleUid);
        url.searchParams.set('complete', 'yes');
        url.searchParams.set('limit', String(MAX_SAMPLE_ANALYSES));
        const listing = await call(authorization, url);
        if ('code' in listing) return { code: listing.code } as const;
        const listed = listedAnalyses(listing.payload, sampleUid);
        if (listed === null) return { code: 'invalid-response' } as const;
        if (listed === 'scope-mismatch') return { code: 'scope-mismatch' } as const;
        const found = listed.find(a => a.uid === request.analysisUid);
        if (!found) return { code: 'analysis-not-found' } as const;
        if (found.keyword !== keyword) return { code: 'scope-mismatch' } as const;
        return { analysis: found } as const;
      };
      const seen = (a: ListedAnalysis) =>
        a.result === request.expectedResult.trim() && a.operand === (request.expectedOperand ?? '');

      const identity = await call(authorization, api('users/current'));
      if ('code' in identity) return { status: 'error', code: identity.code };
      const account = tokenAccountFromPayload(identity.payload);
      if (account === null) return { status: 'error', code: 'invalid-response' };
      if (!account.authenticated) return { status: 'error', code: 'unauthenticated' };
      // A token that signs in as anyone else, including a service account, would
      // record the wrong submitter and hollow out four-eyes verification. An
      // identity that does not name its user id cannot be matched at all.
      if (account.userId !== request.analystUserId) {
        return { status: 'error', code: 'analyst-mismatch' };
      }

      // senaite.jsonapi drops query keys that are not catalog indexes and still
      // answers 200, so every sample returned must echo both the ID and the client.
      const samplesUrl = api('AnalysisRequest');
      samplesUrl.searchParams.set('getId', sampleId);
      samplesUrl.searchParams.set('getClientUID', clientUid);
      samplesUrl.searchParams.set('complete', 'yes');
      samplesUrl.searchParams.set('limit', '10');
      const sampleListing = await call(authorization, samplesUrl);
      if ('code' in sampleListing) return { status: 'error', code: sampleListing.code };
      const samples = listedSamples(sampleListing.payload);
      if (!samples) return { status: 'error', code: 'invalid-response' };
      if (samples.some(sample => sample.id !== sampleId || sample.clientUid !== clientUid)) {
        return { status: 'error', code: 'scope-mismatch' };
      }
      if (samples.length === 0) return { status: 'error', code: 'sample-not-found' };
      if (samples.length > 1) return { status: 'error', code: 'ambiguous-sample' };
      const sample = samples[0];

      const before = await analysis(sample.uid);
      if ('code' in before) return { status: 'error', code: before.code };
      const current = before.analysis;
      if (!seen(current)) return { status: 'error', code: 'result-mismatch' };
      const submitted: SubmittedResult = { uid: current.uid, sampleId, keyword, result: current.result };

      if (PAST_SUBMISSION.has(current.reviewState)) {
        return { status: 'already_submitted', analysis: submitted, reviewState: current.reviewState };
      }
      if (!SUBMITTABLE.has(current.reviewState)) {
        return { status: 'error', code: 'not-submittable', reviewState: current.reviewState };
      }
      if (sample.reviewState !== RECEIVED) {
        return { status: 'error', code: 'sample-not-received', reviewState: sample.reviewState };
      }

      // senaite.jsonapi `update` runs the named workflow transition; nothing else is sent.
      const write = await call(authorization, api('update'), {
        method: 'POST', body: JSON.stringify({ uid: current.uid, transition: 'submit' }),
      });
      const accepted = !('code' in write) && record(write.payload) && write.payload.success !== false;
      const refused = 'code' in write ? write.rejected : !accepted;

      // The read-back is the proof. Without an accepted answer a submitted
      // read-back may be someone else's submit, so it is never claimed here.
      const after = await analysis(sample.uid);
      if ('code' in after) return { status: 'error', code: 'write-unconfirmed' };
      const landed = after.analysis;
      if (accepted && landed.reviewState === SUBMITTED && seen(landed)) {
        if (landed.submittedBy === request.analystUserId) {
          return { status: 'submitted', analysis: submitted };
        }
        // Submitted, but SENAITE does not name this analyst, so verification
        // could not hold four-eyes against them.
        return { status: 'error', code: 'submitter-unattributed' };
      }
      if (refused && SUBMITTABLE.has(landed.reviewState)) return { status: 'error', code: 'write-failed' };
      return { status: 'error', code: 'write-unconfirmed' };
    },
  };
}
