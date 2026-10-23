import type {
  OHWorksSampleCreateRequest,
  SenaiteSampleAdapter,
  SenaiteSampleCreateOutcome,
} from '../ohworks-senaite-create';

/**
 * The SENAITE side of `createOHWorksSenaiteSample`: creates one sample through
 * senaite.jsonapi and reports it only after SENAITE reads it back as asked.
 *
 * It needs its own write credential (`SENAITE_SAMPLE_CREATE_TOKEN`); the
 * read-only `SENAITE_API_TOKEN` never enables it. Nothing calls it by default.
 */
export type SenaiteSampleCreateEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_SAMPLE_CREATE_TOKEN?: string;
};

/** OHWorks codes mapped to the SENAITE objects the setup created. Every value is a UID. */
export type SenaiteSampleCreateMapping = {
  tenants: Record<string, { clientUid: string; contactUid: string }>;
  sampleTypes: Record<string, string>;
  services: Record<string, string>;
};

export type SenaiteSampleCreateErrorCode =
  | 'not-configured'
  | 'unmapped'
  | 'unauthenticated'
  | 'request-failed'
  | 'invalid-response'
  | 'scope-mismatch'
  | 'duplicate-existing'
  | 'existing-conflict'
  | 'write-failed'
  | 'write-unconfirmed';

/** Fixed codes only; upstream bodies, URLs and credentials are never included. */
export class SenaiteSampleCreateError extends Error {
  readonly code: SenaiteSampleCreateErrorCode;

  constructor(code: SenaiteSampleCreateErrorCode) {
    super(`SENAITE sample create failed: ${code}`);
    this.name = 'SenaiteSampleCreateError';
    this.code = code;
  }
}

// Plone/SENAITE UIDs are 32 lowercase hex characters.
const UID = /^[0-9a-f]{32}$/;
const MAX_ANALYSES = 50;
// States a sample can be in right after creation, before anyone acts on it.
const FRESH_STATES = new Set(['sample_due', 'sample_received', 'to_be_sampled', 'scheduled_sampling', 'to_be_preserved']);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

function validMapping(mapping: unknown): mapping is SenaiteSampleCreateMapping {
  if (!record(mapping) || !record(mapping.tenants) || !record(mapping.sampleTypes) || !record(mapping.services)) return false;
  return Object.values(mapping.tenants).every(tenant =>
    record(tenant) && typeof tenant.clientUid === 'string' && UID.test(tenant.clientUid) &&
    typeof tenant.contactUid === 'string' && UID.test(tenant.contactUid)) &&
    [...Object.values(mapping.sampleTypes), ...Object.values(mapping.services)]
      .every(uid => typeof uid === 'string' && UID.test(uid));
}

function configuration(env: SenaiteSampleCreateEnvironment, mapping: unknown) {
  const { SENAITE_BASE_URL: rawUrl, SENAITE_SAMPLE_CREATE_TOKEN: token } = env;
  if (!rawUrl?.trim() || !token?.trim() || /[\s\x00-\x1f\x7f]/.test(token) || !validMapping(mapping)) return null;
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
      analysesUrl: api('Analysis'),
      createUrl: api('create'),
      authorization: `Bearer ${token}`,
      mapping,
    };
  } catch {
    return null;
  }
}

type Sample = { uid: string; id: string; clientUid: unknown; clientSampleId: unknown; sampleTypeUid: unknown; reviewState: unknown };

function samplesFrom(payload: unknown, limit: number): Sample[] | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) || payload.items.length > limit) return null;
  const samples: Sample[] = [];
  for (const item of payload.items) {
    if (!record(item) || typeof item.uid !== 'string' || !UID.test(item.uid) ||
        typeof item.id !== 'string' || !item.id.trim()) return null;
    samples.push({
      uid: item.uid,
      id: item.id,
      clientUid: item.getClientUID,
      clientSampleId: item.getClientSampleID,
      sampleTypeUid: item.getSampleTypeUID,
      reviewState: item.review_state,
    });
  }
  return samples;
}

/** Server-side only. Construction is inert; `createSample` is the only operation. */
export function createSenaiteSampleCreateAdapter(
  mapping: SenaiteSampleCreateMapping,
  env: SenaiteSampleCreateEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_SAMPLE_CREATE_TOKEN: process.env.SENAITE_SAMPLE_CREATE_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
): SenaiteSampleAdapter & { enabled: boolean } {
  const config = configuration(env, mapping);

  async function call(url: URL, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await transport(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: config!.authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // A lost POST may still have created the sample. The retry finds it by
      // ClientSampleID instead of creating a second one.
      throw new SenaiteSampleCreateError(body === undefined ? 'request-failed' : 'write-unconfirmed');
    }
    if (!response.ok) throw new SenaiteSampleCreateError(body === undefined ? 'request-failed' : 'write-failed');
    try {
      return await response.json();
    } catch {
      throw new SenaiteSampleCreateError(body === undefined ? 'invalid-response' : 'write-unconfirmed');
    }
  }

  async function listSamples(params: Record<string, string>, limit: number): Promise<Sample[]> {
    const url = new URL(config!.samplesUrl);
    url.searchParams.set('limit', String(limit));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const samples = samplesFrom(await call(url), limit);
    if (!samples) throw new SenaiteSampleCreateError('invalid-response');
    return samples;
  }

  return {
    enabled: config !== null,
    async createSample(request: OHWorksSampleCreateRequest): Promise<SenaiteSampleCreateOutcome[]> {
      if (!config) throw new SenaiteSampleCreateError('not-configured');
      const tenant = own(config.mapping.tenants, request.tenantId);
      const sampleTypeUid = own(config.mapping.sampleTypes, request.matrixCode);
      const serviceUids = [...new Set(request.analyses.map(code => own(config.mapping.services, code)))];
      if (!tenant || !sampleTypeUid || serviceUids.length === 0 || serviceUids.length > MAX_ANALYSES ||
          serviceUids.some(uid => uid === undefined) || !request.sampleId.trim() || request.sampleId.length > 200) {
        throw new SenaiteSampleCreateError('unmapped');
      }
      const { clientUid, contactUid } = tenant;

      // SENAITE 2.6 answers a rejected token with HTTP 200 as Anonymous. Only
      // an explicit `authenticated: true` proves the write would be ours.
      const identity = await call(config.identityUrl);
      if (!record(identity) || !Array.isArray(identity.items) || identity.items.length !== 1 ||
          !record(identity.items[0]) || typeof identity.items[0].authenticated !== 'boolean') {
        throw new SenaiteSampleCreateError('invalid-response');
      }
      if (!identity.items[0].authenticated) throw new SenaiteSampleCreateError('unauthenticated');

      // Idempotency: an earlier attempt whose answer was lost is found by its
      // OHWorks ID. senaite.jsonapi drops query keys that are not catalog
      // indexes, so every record must echo both filters before it is trusted.
      const existing = await listSamples({ getClientUID: clientUid, getClientSampleID: request.sampleId }, 2);
      if (existing.some(sample => sample.clientUid !== clientUid || sample.clientSampleId !== request.sampleId)) {
        throw new SenaiteSampleCreateError('scope-mismatch');
      }
      if (existing.length > 1) throw new SenaiteSampleCreateError('duplicate-existing');

      let uid: string;
      if (existing.length === 1) {
        uid = existing[0].uid;
      } else {
        const created = await call(config.createUrl, {
          portal_type: 'AnalysisRequest',
          parent_uid: clientUid,
          Client: clientUid,
          Contact: contactUid,
          SampleType: sampleTypeUid,
          DateSampled: request.dateSampled,
          ClientSampleID: request.sampleId,
          Analyses: serviceUids,
        });
        if (record(created) && created.success === false) throw new SenaiteSampleCreateError('write-failed');
        const items = record(created) && Array.isArray(created.items) ? created.items : [];
        if (items.length !== 1 || !record(items[0]) || typeof items[0].uid !== 'string' || !UID.test(items[0].uid)) {
          throw new SenaiteSampleCreateError('write-unconfirmed');
        }
        uid = items[0].uid;
      }

      // The create answer is not the proof. SENAITE can ignore a field it does
      // not accept and still succeed, so the stored sample is read back.
      const mismatch = existing.length === 1 ? 'existing-conflict' : 'write-unconfirmed';
      const [stored, ...others] = await listSamples({ UID: uid }, 2);
      if (!stored || others.length > 0 || stored.uid !== uid) throw new SenaiteSampleCreateError(mismatch);
      if (stored.clientUid !== clientUid) throw new SenaiteSampleCreateError('scope-mismatch');
      if (stored.clientSampleId !== request.sampleId || stored.sampleTypeUid !== sampleTypeUid ||
          typeof stored.reviewState !== 'string' || !FRESH_STATES.has(stored.reviewState)) {
        throw new SenaiteSampleCreateError(mismatch);
      }

      const analysesUrl = new URL(config.analysesUrl);
      analysesUrl.searchParams.set('limit', String(MAX_ANALYSES + 1));
      analysesUrl.searchParams.set('getRequestUID', uid);
      const analyses = await call(analysesUrl);
      if (!record(analyses) || analyses.success === false || !Array.isArray(analyses.items) ||
          analyses.items.length > MAX_ANALYSES) throw new SenaiteSampleCreateError('invalid-response');
      const storedServices = new Set<string>();
      for (const item of analyses.items) {
        if (!record(item)) throw new SenaiteSampleCreateError('invalid-response');
        if (item.parent_uid !== uid) throw new SenaiteSampleCreateError('scope-mismatch');
        if (typeof item.getServiceUID !== 'string') throw new SenaiteSampleCreateError('invalid-response');
        storedServices.add(item.getServiceUID);
      }
      if (analyses.items.length !== serviceUids.length || storedServices.size !== serviceUids.length ||
          serviceUids.some(service => !storedServices.has(service!))) {
        throw new SenaiteSampleCreateError(mismatch);
      }

      return [{ senaiteSampleId: stored.id, tenantId: request.tenantId, matrixCode: request.matrixCode }];
    },
  };
}
