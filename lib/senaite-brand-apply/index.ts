import { parseOHWorksBrand, OHWorksBrandError, type OHWorksBrand } from '../ohworks-brand';

/**
 * Applies the validated OHWorks `brand.yml` to SENAITE's own Laboratory record
 * through senaite.jsonapi, and reports a field as applied only after SENAITE
 * reads it back. Planning (the default) never writes.
 *
 * It needs its own write credential (`SENAITE_BRAND_TOKEN`); the read-only
 * `SENAITE_API_TOKEN` never enables it. Nothing calls it by default.
 */
export type SenaiteBrandEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_BRAND_TOKEN?: string;
};

export type SenaiteBrandErrorCode =
  | 'invalid-brand'
  | 'not-configured'
  | 'unauthenticated'
  | 'request-failed'
  | 'invalid-response'
  | 'scope-mismatch'
  | 'write-failed'
  | 'write-unconfirmed';

/** Fixed codes only; upstream bodies, URLs, credentials and brand values are never included. */
export class SenaiteBrandError extends Error {
  readonly code: SenaiteBrandErrorCode;
  /** Field names and issue codes for `invalid-brand`; never the rejected values. */
  readonly issues: readonly { field: string; code: string }[];

  constructor(code: SenaiteBrandErrorCode, issues: readonly { field: string; code: string }[] = []) {
    super(`SENAITE brand apply failed: ${code}`);
    this.name = 'SenaiteBrandError';
    this.code = code;
    this.issues = Object.freeze(issues.map(issue => Object.freeze({ field: issue.field, code: issue.code })));
  }
}

/**
 * The brand fields SENAITE's Laboratory record holds. Name is what SENAITE
 * prints as the laboratory on its own pages and reports.
 */
export const SENAITE_BRAND_FIELDS = Object.freeze({ labName: 'Name', supportEmail: 'EmailAddress' } as const);

/**
 * Brand fields with no Laboratory field in senaite.jsonapi. Colors and the logo
 * live in Plone's registry and the report footer in the report templates, so
 * they are reported as not applied instead of being claimed.
 */
export const BRAND_FIELDS_NOT_IN_SENAITE = Object.freeze(
  ['legalName', 'primaryColor', 'accentColor', 'logoPath', 'reportFooter'] as const,
);

type BrandKey = keyof typeof SENAITE_BRAND_FIELDS;
type SenaiteField = (typeof SENAITE_BRAND_FIELDS)[BrandKey];

export type SenaiteBrandFieldOutcome = Readonly<{
  brandField: BrandKey;
  senaiteField: SenaiteField;
  status: 'unchanged' | 'planned' | 'applied';
}>;

export type SenaiteBrandOutcome = Readonly<{
  /** `UNCHANGED`: SENAITE already matches. `PLANNED`: dry run with differences. `APPLIED`: written and read back. */
  state: 'UNCHANGED' | 'PLANNED' | 'APPLIED';
  laboratoryUid: string;
  fields: readonly SenaiteBrandFieldOutcome[];
  notInSenaite: readonly (typeof BRAND_FIELDS_NOT_IN_SENAITE)[number][];
}>;

// Plone/SENAITE UIDs are 32 lowercase hex characters.
const UID = /^[0-9a-f]{32}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function configuration(env: SenaiteBrandEnvironment) {
  const { SENAITE_BASE_URL: rawUrl, SENAITE_BRAND_TOKEN: token } = env;
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
      laboratoryUrl: api('Laboratory'),
      updateUrl: api('update'),
      authorization: `Bearer ${token}`,
    };
  } catch {
    return null;
  }
}

type Laboratory = { uid: string } & Record<SenaiteField, unknown>;

/** Server-side only. Construction is inert; `applyBrand` is the only operation. */
export function createSenaiteBrandApplier(
  env: SenaiteBrandEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_BRAND_TOKEN: process.env.SENAITE_BRAND_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);

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
      // A lost POST may still have been applied. Re-running reads it back and
      // reports the field unchanged instead of writing it twice.
      throw new SenaiteBrandError(body === undefined ? 'request-failed' : 'write-unconfirmed');
    }
    if (!response.ok) throw new SenaiteBrandError(body === undefined ? 'request-failed' : 'write-failed');
    try {
      return await response.json();
    } catch {
      throw new SenaiteBrandError(body === undefined ? 'invalid-response' : 'write-unconfirmed');
    }
  }

  /** Exactly one Laboratory, or a fixed error. `UID` narrows the read-back to the record just written. */
  async function readLaboratory(uid?: string): Promise<Laboratory> {
    const url = new URL(config!.laboratoryUrl);
    url.searchParams.set('limit', '2');
    url.searchParams.set('complete', 'yes');
    if (uid) url.searchParams.set('UID', uid);
    const payload = await call(url);
    if (!record(payload) || payload.success === false || !Array.isArray(payload.items) ||
        !payload.items.every(record)) {
      throw new SenaiteBrandError('invalid-response');
    }
    // senaite.jsonapi drops query keys that are not catalog indexes, so every
    // record must prove it is the Laboratory (and the one asked for).
    if (payload.items.some(item => item.portal_type !== 'Laboratory' || (uid && item.uid !== uid))) {
      throw new SenaiteBrandError('scope-mismatch');
    }
    // A SENAITE site has exactly one laboratory.
    if (payload.items.length !== 1) throw new SenaiteBrandError(uid ? 'write-unconfirmed' : 'invalid-response');
    const [item] = payload.items;
    if (typeof item.uid !== 'string' || !UID.test(item.uid)) throw new SenaiteBrandError('invalid-response');
    for (const field of Object.values(SENAITE_BRAND_FIELDS)) {
      if (item[field] !== undefined && item[field] !== null && typeof item[field] !== 'string') {
        throw new SenaiteBrandError('invalid-response');
      }
    }
    return item as Laboratory;
  }

  return {
    enabled: config !== null,
    async applyBrand(input: unknown, options: { apply?: boolean } = {}): Promise<SenaiteBrandOutcome> {
      // The brand is checked before any request, so a bad brand.yml sends nothing.
      const brand = parseOHWorksBrand(input);
      if (brand instanceof OHWorksBrandError) throw new SenaiteBrandError('invalid-brand', brand.issues);
      if (!config) throw new SenaiteBrandError('not-configured');

      // SENAITE 2.6 answers a rejected token with HTTP 200 as Anonymous. Only
      // an explicit `authenticated: true` proves the write would be ours.
      const identity = await call(config.identityUrl);
      if (!record(identity) || !Array.isArray(identity.items) || identity.items.length !== 1 ||
          !record(identity.items[0]) || typeof identity.items[0].authenticated !== 'boolean') {
        throw new SenaiteBrandError('invalid-response');
      }
      if (!identity.items[0].authenticated) throw new SenaiteBrandError('unauthenticated');

      const laboratory = await readLaboratory();
      const keys = Object.keys(SENAITE_BRAND_FIELDS) as BrandKey[];
      const wanted = (key: BrandKey) => (brand as OHWorksBrand)[key];
      const changed = keys.filter(key => laboratory[SENAITE_BRAND_FIELDS[key]] !== wanted(key));
      const outcome = (state: SenaiteBrandOutcome['state'], done: SenaiteBrandFieldOutcome['status']): SenaiteBrandOutcome =>
        Object.freeze({
          state,
          laboratoryUid: laboratory.uid,
          fields: Object.freeze(keys.map(key => Object.freeze({
            brandField: key,
            senaiteField: SENAITE_BRAND_FIELDS[key],
            status: changed.includes(key) ? done : 'unchanged' as const,
          }))),
          notInSenaite: BRAND_FIELDS_NOT_IN_SENAITE,
        });

      if (changed.length === 0) return outcome('UNCHANGED', 'unchanged');
      if (!options.apply) return outcome('PLANNED', 'planned');

      // Only the fields that differ are sent; nothing else on the record is touched.
      const body: Record<string, string> = { uid: laboratory.uid };
      for (const key of changed) body[SENAITE_BRAND_FIELDS[key]] = wanted(key);
      const updated = await call(config.updateUrl, body);
      if (record(updated) && updated.success === false) throw new SenaiteBrandError('write-failed');

      // The update answer is not the proof. SENAITE can ignore a field it does
      // not accept and still succeed, so the stored record is read back.
      const stored = await readLaboratory(laboratory.uid);
      if (keys.some(key => stored[SENAITE_BRAND_FIELDS[key]] !== wanted(key))) {
        throw new SenaiteBrandError('write-unconfirmed');
      }
      return outcome('APPLIED', 'applied');
    },
  };
}
