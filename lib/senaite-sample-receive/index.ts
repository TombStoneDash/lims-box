export type SenaiteSampleReceiveEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_SAMPLE_RECEIVE_TOKEN?: string;
};

export type SenaiteSampleReceiveRequest = {
  /** SENAITE Client UID the sample must belong to. */
  clientUid: string;
  /** Exact SENAITE sample ID, for example `WB-0001`. */
  sampleId: string;
};

export type SenaiteSampleReceiveErrorCode =
  | 'invalid-request' | 'unauthenticated' | 'request-failed' | 'invalid-response'
  | 'sample-not-found' | 'ambiguous-sample' | 'scope-mismatch' | 'not-receivable'
  | 'write-failed' | 'write-unconfirmed';

export type ReceivedSample = { uid: string; id: string; reviewState: 'sample_received' };

export type SenaiteSampleReceiveResult =
  | { status: 'not_configured' }
  /** `transitioned: false` means SENAITE already had it received; nothing was written. */
  | { status: 'received'; sample: ReceivedSample; transitioned: boolean }
  /** `reviewState` is set only for `not-receivable`. */
  | { status: 'error'; code: SenaiteSampleReceiveErrorCode; reviewState?: string };

// Plone/SENAITE UIDs are 32 lowercase hex characters.
const UID = /^[0-9a-f]{32}$/;
const SAMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const STATE = /^[a-z][a-z_]{0,63}$/;
const RECEIVABLE = 'sample_due';
const RECEIVED = 'sample_received';

function configuration(env: SenaiteSampleReceiveEnvironment) {
  const { SENAITE_BASE_URL: rawUrl, SENAITE_SAMPLE_RECEIVE_TOKEN: token } = env;
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
    return {
      identityUrl: api('users/current'),
      samplesUrl: api('AnalysisRequest'),
      updateUrl: api('update'),
      authorization: `Bearer ${token}`,
    };
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** SENAITE 2.6 answers a rejected token with HTTP 200 as Anonymous; only `authenticated: true` counts. */
function authenticatedFromPayload(payload: unknown): boolean | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) || payload.items.length !== 1) {
    return null;
  }
  const [identity] = payload.items;
  return record(identity) && typeof identity.authenticated === 'boolean' ? identity.authenticated : null;
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

type JsonCall = { payload: unknown } | { code: 'request-failed' | 'invalid-response'; rejected: boolean };

/**
 * Receives one OHWorks sample in SENAITE (`sample_due` -> `sample_received`).
 * Server-side only; construction is inert. The write uses its own token, so the
 * read-only `SENAITE_API_TOKEN` can never enable it. A receipt is reported only
 * after SENAITE reads the sample back as received, under the expected client.
 */
export function createSenaiteSampleReceiver(
  env: SenaiteSampleReceiveEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_SAMPLE_RECEIVE_TOKEN: process.env.SENAITE_SAMPLE_RECEIVE_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);

  type Config = NonNullable<typeof config>;

  async function call(
    cfg: Config, url: URL, init: { method: 'GET' } | { method: 'POST'; body: string },
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

  /**
   * Finds the one sample with this ID under this client. senaite.jsonapi drops
   * query keys that are not catalog indexes and still answers 200, so every
   * returned record must echo both the ID and the client, or the call fails.
   */
  async function find(
    cfg: Config, filter: Record<string, string>, request: SenaiteSampleReceiveRequest, uid?: string,
  ) {
    const url = new URL(cfg.samplesUrl);
    for (const [key, value] of Object.entries(filter)) url.searchParams.set(key, value);
    url.searchParams.set('complete', 'yes');
    url.searchParams.set('limit', '10');
    const listing = await call(cfg, url, { method: 'GET' });
    if ('code' in listing) return { code: listing.code } as const;
    const samples = listedSamples(listing.payload);
    if (!samples) return { code: 'invalid-response' } as const;
    if (samples.some(sample => sample.id !== request.sampleId || sample.clientUid !== request.clientUid ||
        (uid !== undefined && sample.uid !== uid))) {
      return { code: 'scope-mismatch' } as const;
    }
    if (samples.length === 0) return { code: 'sample-not-found' } as const;
    if (samples.length > 1) return { code: 'ambiguous-sample' } as const;
    return { sample: samples[0] } as const;
  }

  return {
    enabled: config !== null,
    async receive(request: SenaiteSampleReceiveRequest): Promise<SenaiteSampleReceiveResult> {
      if (!config) return { status: 'not_configured' };
      if (!record(request) || typeof request.clientUid !== 'string' || !UID.test(request.clientUid) ||
          typeof request.sampleId !== 'string' || !SAMPLE_ID.test(request.sampleId)) {
        return { status: 'error', code: 'invalid-request' };
      }
      const scope = { clientUid: request.clientUid, sampleId: request.sampleId };

      const identity = await call(config, config.identityUrl, { method: 'GET' });
      if ('code' in identity) return { status: 'error', code: identity.code };
      const authenticated = authenticatedFromPayload(identity.payload);
      if (authenticated === null) return { status: 'error', code: 'invalid-response' };
      if (!authenticated) return { status: 'error', code: 'unauthenticated' };

      const before = await find(config, { getId: scope.sampleId, getClientUID: scope.clientUid }, scope);
      if ('code' in before) return { status: 'error', code: before.code };
      const { uid, id, reviewState } = before.sample;
      if (reviewState === RECEIVED) {
        return { status: 'received', sample: { uid, id, reviewState: RECEIVED }, transitioned: false };
      }
      if (reviewState !== RECEIVABLE) return { status: 'error', code: 'not-receivable', reviewState };

      // senaite.jsonapi `update` runs the named workflow transition; nothing else is sent.
      const write = await call(config, config.updateUrl, {
        method: 'POST', body: JSON.stringify({ uid, transition: 'receive' }),
      });
      const refused = 'code' in write ? write.rejected : !record(write.payload) || write.payload.success === false;

      // The read-back is the only proof. A lost or refused answer may still have
      // received the sample; a confirmed-looking answer may not have.
      const after = await find(config, { UID: uid }, scope, uid);
      if ('code' in after) return { status: 'error', code: 'write-unconfirmed' };
      if (after.sample.reviewState === RECEIVED) {
        return { status: 'received', sample: { uid, id, reviewState: RECEIVED }, transitioned: true };
      }
      return { status: 'error', code: refused ? 'write-failed' : 'write-unconfirmed' };
    },
  };
}
