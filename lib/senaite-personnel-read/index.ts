/**
 * SENAITE personnel roster (10-point ask, point 6: the London personnel module).
 * Server-side only. Reads the lab's LabContact records so the personnel page can
 * name its staff from SENAITE instead of `data/synthetic/personnel.json`.
 */
export type SenaitePersonnelEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_API_TOKEN?: string;
};

export type SenaiteLabContact = {
  uid: string;
  id: string;
  fullName: string;
  jobTitle: string | null;
  /** `true`/`false` from SENAITE's active/inactive state; `null` when SENAITE did not say. */
  active: boolean | null;
};

export type SenaitePersonnelErrorCode =
  | 'unauthenticated' | 'request-failed' | 'invalid-response' | 'incomplete-listing' | 'non-synthetic-record';

export type SenaitePersonnelResult =
  | { status: 'ok'; contacts: SenaiteLabContact[] }
  | { status: 'not_configured' }
  | { status: 'error'; code: SenaitePersonnelErrorCode };

export type SenaitePersonnelOptions = {
  /**
   * Default `true`. Every LabContact title must start with `SYNTHETIC-`, or the
   * whole roster fails with `non-synthetic-record`. The OHWorks server holds
   * synthetic data only, so a real person's name there is a setup mistake that
   * must never reach a page. Turn off only for a lab whose staff list is meant
   * to be shown.
   */
  syntheticOnly?: boolean;
};

// One page holds the whole roster. A lab with more staff than this gets
// `incomplete-listing`, never a silently truncated list.
const PAGE_LIMIT = 100;
const SYNTHETIC_PREFIX = 'SYNTHETIC-';

function configuration(env: SenaitePersonnelEnvironment) {
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
    return { identityUrl: api('users/current'), contactsUrl: api('LabContact'), authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Same rule as lib/senaite-read: only an explicit `authenticated: true` proves the token. */
function authenticatedFromPayload(payload: unknown): boolean | null {
  if (!record(payload) || !Array.isArray(payload.items) || payload.items.length !== 1) return null;
  const [identity] = payload.items;
  return record(identity) && typeof identity.authenticated === 'boolean' ? identity.authenticated : null;
}

function activeFrom(state: unknown): boolean | null | 'invalid' {
  if (state == null) return null;
  if (state === 'active') return true;
  if (state === 'inactive') return false;
  return 'invalid';
}

function contactsFromPayload(
  payload: unknown, syntheticOnly: boolean,
): SenaiteLabContact[] | Exclude<SenaitePersonnelErrorCode, 'unauthenticated' | 'request-failed'> {
  // senaite.jsonapi reports its own errors as HTTP 200 with `success: false`.
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) ||
      payload.items.length > PAGE_LIMIT) return 'invalid-response';
  // A roster is shown whole or not at all: a further page means people are missing.
  if (payload.next != null && payload.next !== '') return 'incomplete-listing';
  if (payload.count != null && (typeof payload.count !== 'number' || payload.count > payload.items.length)) {
    return typeof payload.count === 'number' ? 'incomplete-listing' : 'invalid-response';
  }

  const contacts: SenaiteLabContact[] = [];
  const seen = new Set<string>();
  for (const item of payload.items) {
    if (!record(item) || !nonBlank(item.uid) || !nonBlank(item.id) || !nonBlank(item.title) ||
        seen.has(item.uid) ||
        // An endpoint that ignored the portal type would hand back other objects.
        (item.portal_type != null && item.portal_type !== 'LabContact') ||
        (item.JobTitle != null && typeof item.JobTitle !== 'string')) return 'invalid-response';
    const active = activeFrom(item.review_state);
    if (active === 'invalid') return 'invalid-response';
    const fullName = item.title.trim();
    if (syntheticOnly && (!fullName.startsWith(SYNTHETIC_PREFIX) || fullName.length <= SYNTHETIC_PREFIX.length)) {
      // No name, UID or count goes into the error: the record must not leak.
      return 'non-synthetic-record';
    }
    seen.add(item.uid);
    // Only these fields leave the module. Email, phone, address, signature,
    // linked login and department records are dropped here.
    contacts.push({
      uid: item.uid,
      id: item.id,
      fullName,
      jobTitle: nonBlank(item.JobTitle) ? item.JobTitle.trim() : null,
      active,
    });
  }
  return contacts.sort((a, b) => a.fullName.localeCompare(b.fullName) || a.uid.localeCompare(b.uid));
}

type JsonRead = { payload: unknown } | { code: 'request-failed' | 'invalid-response' };

/** Server-side only. Construction is inert; the only operations are two bounded GETs per read. */
export function createSenaitePersonnelReader(
  env: SenaitePersonnelEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_API_TOKEN: process.env.SENAITE_API_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
  options: SenaitePersonnelOptions = {},
) {
  const config = configuration(env);
  const syntheticOnly = options.syntheticOnly !== false;

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

  return {
    enabled: config !== null,
    async listLabContacts(): Promise<SenaitePersonnelResult> {
      if (!config) return { status: 'not_configured' };

      // SENAITE 2.6 answers a rejected token as Anonymous with HTTP 200, and
      // Anonymous sees no lab contacts. Prove the sign-in so a rejected token
      // can never look like a lab with no staff.
      const identity = await getJson(config.identityUrl, config.authorization);
      if ('code' in identity) return { status: 'error', code: identity.code };
      const authenticated = authenticatedFromPayload(identity.payload);
      if (authenticated === null) return { status: 'error', code: 'invalid-response' };
      if (!authenticated) return { status: 'error', code: 'unauthenticated' };

      const url = new URL(config.contactsUrl);
      // `complete` returns the schema fields (JobTitle); catalog filters are
      // not used because senaite.jsonapi silently drops unindexed ones.
      url.searchParams.set('complete', 'yes');
      url.searchParams.set('limit', String(PAGE_LIMIT));
      const listing = await getJson(url, config.authorization);
      if ('code' in listing) return { status: 'error', code: listing.code };
      const contacts = contactsFromPayload(listing.payload, syntheticOnly);
      return typeof contacts === 'string' ? { status: 'error', code: contacts } : { status: 'ok', contacts };
    },
  };
}
