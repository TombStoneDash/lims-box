/**
 * Creates the OHWorks setup in a running SENAITE through senaite.jsonapi.
 *
 * Point 2 of the ten-point OHWorks/SENAITE ask is "configure OHWorks in SENAITE
 * via the JSON API". `buildOHWorksSenaiteSetupPlan()` says what should exist and
 * `createSenaiteSetupAuditor()` says what is still missing. This module creates
 * only the missing records, in plan order, and reports success only when the
 * same audit, re-run afterwards, says the whole setup is present and agrees
 * with the plan.
 *
 * It fails closed:
 * - It needs its own write credential (`SENAITE_SETUP_TOKEN`). The read-only
 *   `SENAITE_API_TOKEN` never enables it.
 * - It is a dry run unless `apply: true` is passed.
 * - A record that disagrees with the plan, or is ambiguous, stops the whole run
 *   before any write. A human fixes that in SENAITE; nothing is overwritten.
 * - Every create is read back by UID before a later step may point at it.
 * - A lost create answer is `write-unconfirmed`. Re-running audits first, finds
 *   the record, and does not create it twice.
 */
import {
  createSenaiteSetupAuditor,
  type SenaiteRemainingStep,
  type SenaiteSetupAuditItem,
} from '../senaite-setup-audit';
import type { OHWorksSenaiteSetupConfig, OHWorksSenaiteSetupStep } from '../ohworks-senaite-setup-plan';

export type SenaiteSetupApplyEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_SETUP_TOKEN?: string;
};

type PortalType = OHWorksSenaiteSetupStep['portalType'];

/** The senaite.jsonapi `parent_path` each new record is created in. Contacts
 * are created inside their client and need no entry. Which folder a type lives
 * in differs between SENAITE versions, so the operator names it. */
export type SenaiteSetupContainers = Partial<Record<Exclude<PortalType, 'Contact'>, string>>;

/** Fixed extra fields SENAITE requires but the plan does not carry, such as a
 * Department UID for AnalysisCategory. They may not replace a planned field. */
export type SenaiteSetupDefaults = Partial<Record<PortalType, Record<string, string | string[]>>>;

export type SenaiteSetupApplyOptions = {
  containers: SenaiteSetupContainers;
  defaults?: SenaiteSetupDefaults;
  /** Send the creates. Without it nothing is written. */
  apply?: boolean;
};

export type SenaiteSetupApplyErrorCode =
  | 'invalid-plan' | 'invalid-options' | 'unauthenticated' | 'request-failed' | 'invalid-response'
  | 'incomplete-listing' | 'setup-conflict' | 'write-failed' | 'write-unconfirmed';

/** A create body still waiting on an earlier create in the same run. */
export type SenaitePendingReference = { $ref: number };
export type SenaiteCreateBody = Record<string, string | SenaitePendingReference | (string | SenaitePendingReference)[]>;

export type SenaitePlannedCreate = { order: number; portalType: PortalType; body: SenaiteCreateBody };
export type SenaiteCreatedRecord = { order: number; portalType: PortalType; uid: string };

export type SenaiteSetupApplyResult =
  | { status: 'not_configured' }
  | {
      status: 'error';
      code: SenaiteSetupApplyErrorCode;
      /** Records this run created and read back before it stopped. */
      created: SenaiteCreatedRecord[];
      /** The audit, when the stop was a conflict a human must resolve. */
      items?: SenaiteSetupAuditItem[];
    }
  /** Dry run. `creates` is exactly what `apply: true` would send, in order. */
  | { status: 'planned'; ready: boolean; items: SenaiteSetupAuditItem[]; creates: SenaitePlannedCreate[] }
  /** Every planned record is present and agrees with the plan, per a fresh audit. */
  | { status: 'applied'; items: SenaiteSetupAuditItem[]; created: SenaiteCreatedRecord[] };

const CONTAINER_PATH = /^(\/[A-Za-z0-9_.-]+)+$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const PORTAL_TYPES: readonly PortalType[] = [
  'Client', 'Contact', 'SampleType', 'Instrument', 'AnalysisCategory',
  'AnalysisService', 'AnalysisProfile', 'LabContact',
];
/** Fields this module sets itself, per type, so a default can never replace them. */
const OWN_FIELDS: Record<PortalType, readonly string[]> = {
  Client: ['Name', 'ClientID'],
  Contact: ['Firstname', 'Surname'],
  LabContact: ['Firstname', 'Surname'],
  SampleType: [],
  Instrument: ['Model'],
  AnalysisCategory: [],
  AnalysisService: ['Keyword', 'Unit', 'Category'],
  AnalysisProfile: ['ProfileKey', 'Service'],
};
const ALWAYS_OWN = ['portal_type', 'parent_path', 'parent_uid', 'title', 'uid', 'id'];

class Stop extends Error {
  constructor(readonly code: SenaiteSetupApplyErrorCode) {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function configuration(env: SenaiteSetupApplyEnvironment) {
  const { SENAITE_BASE_URL: rawUrl, SENAITE_SETUP_TOKEN: token } = env;
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
    return { baseUrl: rawUrl, token, api, authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

function validOptions(options: unknown): options is SenaiteSetupApplyOptions {
  if (!isRecord(options) || !isRecord(options.containers)) return false;
  if (options.apply !== undefined && typeof options.apply !== 'boolean') return false;
  for (const [type, path] of Object.entries(options.containers)) {
    if (type === 'Contact' || !PORTAL_TYPES.includes(type as PortalType)) return false;
    if (typeof path !== 'string' || !CONTAINER_PATH.test(path) ||
        path.split('/').some(segment => segment === '.' || segment === '..')) return false;
  }
  if (options.defaults === undefined) return true;
  if (!isRecord(options.defaults)) return false;
  for (const [type, fields] of Object.entries(options.defaults)) {
    if (!PORTAL_TYPES.includes(type as PortalType) || !isRecord(fields)) return false;
    const own = new Set([...ALWAYS_OWN, ...OWN_FIELDS[type as PortalType]].map(name => name.toLowerCase()));
    for (const [name, value] of Object.entries(fields)) {
      if (!FIELD_NAME.test(name) || own.has(name.toLowerCase()) || /password|secret|token/i.test(name)) return false;
      const values = Array.isArray(value) ? value : [value];
      if (!values.length || values.some(item => typeof item !== 'string' || !item.trim())) return false;
    }
  }
  return true;
}

/** SENAITE derives a person's title from Firstname + Surname, so the planned
 * title is split at its last space. A title without one cannot round-trip. */
function personName(title: string): { Firstname: string; Surname: string } {
  const split = title.lastIndexOf(' ');
  if (split <= 0 || split === title.length - 1) throw new Stop('invalid-plan');
  return { Firstname: title.slice(0, split), Surname: title.slice(split + 1) };
}

type Resolve = (value: unknown) => string | SenaitePendingReference;

function createBody(step: SenaiteRemainingStep, options: SenaiteSetupApplyOptions, resolve: Resolve): SenaiteCreateBody {
  const { portalType, payload } = step;
  const title = String(payload.title);
  const body: SenaiteCreateBody = { portal_type: portalType };
  if (portalType === 'Contact') {
    body.parent_uid = resolve(payload.parent);
  } else {
    const path = options.containers[portalType];
    if (!path) throw new Stop('invalid-options');
    body.parent_path = path;
  }
  switch (portalType) {
    case 'Client':
      Object.assign(body, { title, Name: title, ClientID: String(payload.id) });
      break;
    case 'Contact':
    case 'LabContact':
      Object.assign(body, personName(title));
      break;
    case 'Instrument':
      Object.assign(body, { title, Model: String(payload.Model) });
      break;
    case 'AnalysisService':
      Object.assign(body, {
        title, Keyword: String(payload.Keyword), Unit: String(payload.Unit), Category: resolve(payload.Category),
      });
      break;
    case 'AnalysisProfile':
      Object.assign(body, {
        title, ProfileKey: String(payload.ProfileKey), Service: (payload.Services as unknown[]).map(resolve),
      });
      break;
    default:
      body.title = title;
  }
  return { ...body, ...(options.defaults?.[portalType] ?? {}) };
}

/** Server-side only. Construction is inert; nothing is written without `apply: true`. */
export function createSenaiteSetupApplier(
  env: SenaiteSetupApplyEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_SETUP_TOKEN: process.env.SENAITE_SETUP_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);

  async function call(url: URL, body?: unknown): Promise<unknown> {
    const write = body !== undefined;
    let response: Response;
    try {
      response = await transport(url, {
        method: write ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: config!.authorization,
          ...(write ? { 'Content-Type': 'application/json' } : {}),
        },
        body: write ? JSON.stringify(body) : undefined,
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // A lost POST may still have created the record; the next run's audit finds it.
      throw new Stop(write ? 'write-unconfirmed' : 'request-failed');
    }
    if (!response.ok) throw new Stop(write ? 'write-failed' : 'request-failed');
    try {
      return await response.json();
    } catch {
      throw new Stop(write ? 'write-unconfirmed' : 'invalid-response');
    }
  }

  /** The create answer is not the proof: the stored record is read back by UID. */
  async function readBack(step: SenaiteRemainingStep, uid: string) {
    const url = config!.api(step.portalType);
    url.searchParams.set('UID', uid);
    url.searchParams.set('complete', 'yes');
    url.searchParams.set('limit', '2');
    const payload = await call(url);
    if (!isRecord(payload) || payload.success === false || !Array.isArray(payload.items)) {
      throw new Stop('invalid-response');
    }
    // senaite.jsonapi drops query keys it does not index, so the UID must be echoed.
    const [stored, ...others] = payload.items;
    if (!isRecord(stored) || others.length || stored.uid !== uid || stored.portal_type !== step.portalType ||
        stored.title !== step.payload.title) throw new Stop('write-unconfirmed');
    if (step.portalType === 'AnalysisService' && (stored.Keyword ?? stored.getKeyword) !== step.payload.Keyword) {
      throw new Stop('write-unconfirmed');
    }
  }

  return {
    enabled: config !== null,
    async applySetup(setup: OHWorksSenaiteSetupConfig, options: SenaiteSetupApplyOptions): Promise<SenaiteSetupApplyResult> {
      if (!config) return { status: 'not_configured' };
      const created: SenaiteCreatedRecord[] = [];
      if (!validOptions(options)) return { status: 'error', code: 'invalid-options', created };

      // The audit runs with the setup credential, so it sees exactly what the writes will.
      const auditor = createSenaiteSetupAuditor(
        { SENAITE_BASE_URL: config.baseUrl, SENAITE_API_TOKEN: config.token }, transport);
      const before = await auditor.audit(setup);
      if (before.status === 'not_configured') return { status: 'error', code: 'invalid-response', created };
      if (before.status === 'error') return { status: 'error', code: before.code, created };
      if (before.items.some(item => item.status !== 'present' && item.status !== 'missing')) {
        return { status: 'error', code: 'setup-conflict', created, items: before.items };
      }

      const uids = new Map<number, string>();
      const resolve: Resolve = value => {
        if (isRecord(value) && typeof value.$uid === 'string') return value.$uid;
        if (isRecord(value) && typeof value.$ref === 'number') {
          return uids.get(value.$ref) ?? { $ref: value.$ref };
        }
        throw new Stop('invalid-plan');
      };

      try {
        if (!options.apply) {
          const creates = before.remaining.map(step => ({
            order: step.order, portalType: step.portalType, body: createBody(step, options, resolve),
          }));
          return { status: 'planned', ready: before.ready, items: before.items, creates };
        }
        // Every body is built before the first write, so a bad option never leaves a half-made lab.
        for (const step of before.remaining) createBody(step, options, resolve);

        for (const step of before.remaining) {
          const body = createBody(step, options, resolve);
          if (JSON.stringify(body).includes('"$ref"')) throw new Stop('invalid-plan');
          const answer = await call(config.api('create'), body);
          if (isRecord(answer) && answer.success === false) throw new Stop('write-failed');
          const items = isRecord(answer) && Array.isArray(answer.items) ? answer.items : [];
          if (items.length !== 1 || !isRecord(items[0]) || typeof items[0].uid !== 'string' || !items[0].uid.trim()) {
            throw new Stop('write-unconfirmed');
          }
          const uid = items[0].uid;
          await readBack(step, uid);
          uids.set(step.order, uid);
          created.push({ order: step.order, portalType: step.portalType, uid });
        }
      } catch (error) {
        if (error instanceof Stop) return { status: 'error', code: error.code, created };
        throw error;
      }

      // The receipt for point 2: a fresh audit finds every record, agreeing with
      // the plan, and the ones created here are the ones it found.
      const after = await auditor.audit(setup);
      if (after.status !== 'ok') return { status: 'error', code: 'write-unconfirmed', created };
      const confirmed = after.ready && created.every(record =>
        after.items.find(item => item.order === record.order)?.uid === record.uid);
      if (!confirmed) return { status: 'error', code: 'write-unconfirmed', created, items: after.items };
      return { status: 'applied', items: after.items, created };
    },
  };
}
