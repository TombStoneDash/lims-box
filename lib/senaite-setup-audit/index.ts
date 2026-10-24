/**
 * Read-only audit of the OHWorks setup plan against a running SENAITE.
 *
 * Point 2 of the ten-point OHWorks/SENAITE ask is "configure OHWorks in SENAITE
 * via the JSON API". `buildOHWorksSenaiteSetupPlan()` already describes what
 * should exist. This module asks SENAITE what actually exists, matches every
 * planned record, and returns only the steps still to create. Running it after
 * a partial setup never plans a duplicate, and running it after a full setup
 * reports `ready: true`, which is the receipt the ask wants for this point.
 *
 * Only GETs are sent. Nothing is created, edited or deactivated here.
 */
import {
  buildOHWorksSenaiteSetupPlan,
  OHWorksSenaiteSetupPlanError,
  type OHWorksSenaiteSetupConfig,
  type OHWorksSenaiteSetupStep,
} from '../ohworks-senaite-setup-plan';

export type SenaiteSetupAuditEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_API_TOKEN?: string;
};

type PortalType = OHWorksSenaiteSetupStep['portalType'];

/** `present`: exactly one active match that agrees with the plan.
 * `missing`: no match, so the step is still to create.
 * `mismatch`: one match that disagrees with the plan; a human must fix it.
 * `ambiguous`: several matches; nothing is guessed.
 * `blocked`: missing, but a prerequisite is a mismatch or ambiguous. */
export type SenaiteSetupItemStatus = 'present' | 'missing' | 'mismatch' | 'ambiguous' | 'blocked';

export type SenaiteSetupMismatch =
  | 'inactive' | 'title' | 'unit' | 'category' | 'model' | 'services' | 'unreadable-field';

export type SenaiteSetupAuditItem = {
  order: number;
  portalType: PortalType;
  /** The planned title, or the keyword for an analysis service. */
  key: string;
  status: SenaiteSetupItemStatus;
  /** UID of the matching SENAITE record when there is exactly one. */
  uid: string | null;
  mismatches: SenaiteSetupMismatch[];
};

/** A planned reference to a record that already exists in SENAITE. */
export type SenaiteExistingReference = { $uid: string };
export type SenaiteRemainingStep = Omit<OHWorksSenaiteSetupStep, 'payload'> & {
  payload: Record<string, string | { $ref: number } | SenaiteExistingReference
    | ({ $ref: number } | SenaiteExistingReference)[]>;
};

export type SenaiteSetupAuditErrorCode =
  | 'invalid-plan' | 'unauthenticated' | 'request-failed' | 'invalid-response' | 'incomplete-listing';

export type SenaiteSetupAuditResult =
  | { status: 'not_configured' }
  | { status: 'error'; code: SenaiteSetupAuditErrorCode }
  | {
      status: 'ok';
      /** True only when every planned record is present and agrees with the plan. */
      ready: boolean;
      items: SenaiteSetupAuditItem[];
      /** Missing steps in plan order. A `$ref` points at another remaining step;
       * a `$uid` points at a record SENAITE already has. */
      remaining: SenaiteRemainingStep[];
    };

/** Setup folders are small. A larger listing is treated as unreadable, not truncated. */
export const SETUP_LISTING_LIMIT = 500;

const PORTAL_TYPES: readonly PortalType[] = [
  'Client', 'Contact', 'SampleType', 'Instrument', 'AnalysisCategory',
  'AnalysisService', 'AnalysisProfile', 'LabContact',
];

type SenaiteRecord = { uid: string; title: string; raw: Record<string, unknown> };

function configuration(env: SenaiteSetupAuditEnvironment) {
  const { SENAITE_BASE_URL: rawUrl, SENAITE_API_TOKEN: token } = env;
  if (!rawUrl?.trim() || !token?.trim() || /[\s\x00-\x1f\x7f]/.test(token)) return null;
  try {
    const url = new URL(rawUrl);
    // Same rules as lib/senaite-read: TLS only, this origin only, no embedded secrets.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A reference field may come back as a UID string or as `{ uid, ... }`. */
function referenceUid(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (isRecord(value) && typeof value.uid === 'string' && value.uid.trim()) return value.uid;
  return null;
}

function referenceUids(value: unknown): string[] | null {
  const values = Array.isArray(value) ? value : value == null ? null : [value];
  if (!values) return null;
  const uids = values.map(referenceUid);
  return uids.every((uid): uid is string => uid !== null) ? uids : null;
}

/** First field present on the record, so either the AT or the DX spelling is read. */
function field(raw: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) if (raw[name] !== undefined && raw[name] !== null) return raw[name];
  return undefined;
}

function isInactive(raw: Record<string, unknown>): boolean {
  return raw.review_state === 'inactive' || raw.is_active === false || raw.isActive === false;
}

/** A listing is trusted only when it is the whole folder, of the requested type. */
function recordsFromListing(payload: unknown, portalType: PortalType): SenaiteRecord[] | 'invalid' | 'incomplete' {
  if (!isRecord(payload) || payload.success === false || !Array.isArray(payload.items)) return 'invalid';
  if (payload.items.length > SETUP_LISTING_LIMIT) return 'invalid';
  if (payload.next != null || (typeof payload.count === 'number' && payload.count > payload.items.length)) {
    return 'incomplete';
  }
  const records: SenaiteRecord[] = [];
  for (const item of payload.items) {
    if (!isRecord(item) || typeof item.uid !== 'string' || !item.uid.trim() ||
        typeof item.title !== 'string' || item.portal_type !== portalType) return 'invalid';
    records.push({ uid: item.uid, title: item.title, raw: item });
  }
  return records;
}

type JsonRead = { payload: unknown } | { code: 'request-failed' | 'invalid-response' };

/** Server-side only. Construction is inert; the only operations are bounded GETs. */
export function createSenaiteSetupAuditor(
  env: SenaiteSetupAuditEnvironment = {
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

  return {
    enabled: config !== null,
    async audit(setup: OHWorksSenaiteSetupConfig): Promise<SenaiteSetupAuditResult> {
      if (!config) return { status: 'not_configured' };
      let plan: OHWorksSenaiteSetupStep[];
      try {
        plan = buildOHWorksSenaiteSetupPlan(setup);
      } catch (error) {
        if (error instanceof OHWorksSenaiteSetupPlanError) return { status: 'error', code: 'invalid-plan' };
        throw error;
      }

      // SENAITE 2.6 answers a rejected token with HTTP 200 as Anonymous, who
      // sees empty setup folders. Without this check every record would read
      // as missing and the plan would recreate the whole lab.
      const identity = await getJson(config.api('users/current'), config.authorization);
      if ('code' in identity) return { status: 'error', code: identity.code };
      const payload = identity.payload;
      if (!isRecord(payload) || !Array.isArray(payload.items) || payload.items.length !== 1 ||
          !isRecord(payload.items[0]) || typeof payload.items[0].authenticated !== 'boolean') {
        return { status: 'error', code: 'invalid-response' };
      }
      if (!payload.items[0].authenticated) return { status: 'error', code: 'unauthenticated' };

      const listings = new Map<PortalType, SenaiteRecord[]>();
      for (const portalType of PORTAL_TYPES) {
        if (!plan.some(step => step.portalType === portalType)) continue;
        const url = config.api(portalType);
        url.searchParams.set('limit', String(SETUP_LISTING_LIMIT));
        url.searchParams.set('complete', 'yes');
        const listing = await getJson(url, config.authorization);
        if ('code' in listing) return { status: 'error', code: listing.code };
        const records = recordsFromListing(listing.payload, portalType);
        if (records === 'invalid') return { status: 'error', code: 'invalid-response' };
        if (records === 'incomplete') return { status: 'error', code: 'incomplete-listing' };
        listings.set(portalType, records);
      }

      return { status: 'ok', ...reconcile(plan, listings) };
    },
  };
}

function reconcile(plan: OHWorksSenaiteSetupStep[], listings: Map<PortalType, SenaiteRecord[]>) {
  const items = new Map<number, SenaiteSetupAuditItem>();
  const uidOf = (order: number) => items.get(order)?.uid ?? null;
  const refOrder = (value: unknown) => (isRecord(value) && typeof value.$ref === 'number' ? value.$ref : null);

  for (const step of plan) {
    const { payload, portalType } = step;
    const isService = portalType === 'AnalysisService';
    const key = String(isService ? payload.Keyword : payload.title);
    const parentOrder = refOrder(payload.parent);
    const candidates = (listings.get(portalType) ?? []).filter(record => {
      if (isService) return field(record.raw, 'Keyword', 'getKeyword', 'keyword') === key;
      if (record.title !== key) return false;
      // A contact counts only under the planned client; a namesake elsewhere is not ours.
      return parentOrder === null || (uidOf(parentOrder) !== null && record.raw.parent_uid === uidOf(parentOrder));
    });
    const item: SenaiteSetupAuditItem = {
      order: step.order, portalType, key, status: 'missing', uid: null, mismatches: [],
    };
    items.set(step.order, item);
    if (candidates.length > 1) {
      item.status = 'ambiguous';
      continue;
    }
    if (candidates.length === 0) {
      const prerequisites = step.dependsOn.map(order => items.get(order)?.status);
      if (prerequisites.some(status => status === 'mismatch' || status === 'ambiguous' || status === 'blocked')) {
        item.status = 'blocked';
      }
      continue;
    }

    const [match] = candidates;
    item.uid = match.uid;
    const mismatches: SenaiteSetupMismatch[] = [];
    if (isInactive(match.raw)) mismatches.push('inactive');
    if (isService) {
      if (match.title !== payload.title) mismatches.push('title');
      const unit = field(match.raw, 'Unit', 'unit');
      if (typeof unit !== 'string') mismatches.push('unreadable-field');
      else if (unit !== payload.Unit) mismatches.push('unit');
      const category = referenceUid(field(match.raw, 'Category', 'category', 'getCategoryUID', 'category_uid'));
      const plannedCategory = uidOf(refOrder(payload.Category) ?? -1);
      if (category === null) mismatches.push('unreadable-field');
      else if (category !== plannedCategory) mismatches.push('category');
    } else if (portalType === 'Instrument') {
      const model = field(match.raw, 'Model', 'model');
      if (typeof model !== 'string') mismatches.push('unreadable-field');
      else if (model !== payload.Model) mismatches.push('model');
    } else if (portalType === 'AnalysisProfile') {
      const services = referenceUids(field(match.raw, 'Service', 'Services', 'services'));
      const planned = (payload.Services as { $ref: number }[]).map(ref => uidOf(ref.$ref));
      if (services === null) mismatches.push('unreadable-field');
      else if (planned.some(uid => uid === null) || services.length !== planned.length ||
          planned.some(uid => !services.includes(uid!))) mismatches.push('services');
    }
    item.mismatches = [...new Set(mismatches)];
    item.status = item.mismatches.length ? 'mismatch' : 'present';
  }

  const resolve = (value: unknown) => {
    const order = refOrder(value);
    if (order === null) return value;
    const uid = uidOf(order);
    return items.get(order)?.status === 'present' && uid ? { $uid: uid } : value;
  };
  const remaining: SenaiteRemainingStep[] = plan
    .filter(step => items.get(step.order)!.status === 'missing')
    .map(step => ({
      ...step,
      payload: Object.fromEntries(Object.entries(step.payload).map(([name, value]) =>
        [name, Array.isArray(value) ? value.map(resolve) : resolve(value)])) as SenaiteRemainingStep['payload'],
      dependsOn: step.dependsOn.filter(order => items.get(order)!.status !== 'present'),
    }));

  const audited = plan.map(step => items.get(step.order)!);
  return { ready: audited.every(item => item.status === 'present'), items: audited, remaining };
}
