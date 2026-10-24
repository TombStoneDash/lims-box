import {
  buildSenaiteManifest,
  compareBackupManifests,
  type BackupComparison,
  type SenaiteManifest,
  type SenaiteManifestItem,
} from '../ohworks-backup-verify';

/**
 * Point 8 of the ten-point OHWorks/SENAITE ask ("prove backup/restore"): read
 * what a SENAITE site actually holds, as a metadata inventory that can be taken
 * before a backup and again after the restore, and compared.
 *
 * Read-only. It uses the same read-only `SENAITE_API_TOKEN` as `lib/senaite-read`
 * and sends only bounded GETs. Nothing calls it by default.
 */
export type SenaiteInventoryEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_API_TOKEN?: string;
};

/** What a restored OHWorks lab must bring back. Only these routes can be read. */
export const SENAITE_BACKUP_PORTAL_TYPES = Object.freeze([
  'Client',
  'Contact',
  'LabContact',
  'SampleType',
  'AnalysisCategory',
  'AnalysisService',
  'AnalysisProfile',
  'Instrument',
  'AnalysisRequest',
  'Analysis',
] as const);

export type SenaiteBackupPortalType = (typeof SENAITE_BACKUP_PORTAL_TYPES)[number];

/**
 * Counts and checksums only. No titles, IDs or field values leave the module,
 * so an inventory file can be kept as a receipt.
 */
export type SenaiteInventory = {
  portalTypes: SenaiteBackupPortalType[];
  /** Every portal type that was read, including the ones SENAITE has none of. */
  counts: Record<string, number>;
  /** `buildSenaiteManifest` of every record; types with no records are absent. */
  manifest: SenaiteManifest;
};

export type SenaiteInventoryErrorCode =
  | 'invalid-query' | 'unauthenticated' | 'request-failed' | 'invalid-response'
  | 'inventory-changed' | 'inventory-too-large';

export type SenaiteInventoryResult =
  | { status: 'ok'; inventory: SenaiteInventory }
  | { status: 'not_configured' }
  | { status: 'error'; code: SenaiteInventoryErrorCode; portalType?: SenaiteBackupPortalType };

export const SENAITE_INVENTORY_PAGE_SIZE = 200;
export const SENAITE_INVENTORY_MAX_PAGES = 50;

// Plone/SENAITE UIDs are 32 lowercase hex characters.
const UID = /^[0-9a-f]{32}$/;
// senaite.jsonapi serializes Zope DateTime as ISO 8601 with an offset, e.g. 2026-10-21T18:16:57+00:00.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function configuration(env: SenaiteInventoryEnvironment) {
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
    return { api, authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

/**
 * The same instant always gives the same string, whatever offset SENAITE used,
 * so a restore onto a server in another time zone still compares equal.
 * A calendar-impossible date (2026-02-30) is malformed, not rolled over.
 */
export function normalizeSenaiteModified(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day ||
      calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    return null;
  }
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}

type JsonRead = { payload: unknown } | { code: 'request-failed' | 'invalid-response' };

/** Server-side only. Construction is inert; the only operations are bounded GETs. */
export function createSenaiteInventoryReader(
  env: SenaiteInventoryEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_API_TOKEN: process.env.SENAITE_API_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);

  async function getJson(url: URL): Promise<JsonRead> {
    try {
      const response = await transport(url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: config!.authorization },
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

  /**
   * Every record of one portal type, or a reason there is no complete list.
   * Pages are requested by our own `b_start`; upstream `next` links are never
   * followed. Every page must report the same `count`, and the pages together
   * must hold exactly that many distinct records.
   */
  async function readType(portalType: SenaiteBackupPortalType):
    Promise<SenaiteManifestItem[] | SenaiteInventoryErrorCode> {
    const items: SenaiteManifestItem[] = [];
    const seen = new Set<string>();
    let total: number | null = null;
    for (let page = 0; total === null || items.length < total; page++) {
      if (page >= SENAITE_INVENTORY_MAX_PAGES) return 'inventory-too-large';
      const url = config!.api(portalType);
      url.searchParams.set('limit', String(SENAITE_INVENTORY_PAGE_SIZE));
      url.searchParams.set('b_start', String(page * SENAITE_INVENTORY_PAGE_SIZE));
      url.searchParams.set('sort_on', 'created');
      url.searchParams.set('sort_order', 'ascending');
      const listing = await getJson(url);
      if ('code' in listing) return listing.code;
      const { payload } = listing;
      // SENAITE sends some errors as HTTP 200 with `success: false` and no items.
      if (!record(payload) || !Array.isArray(payload.items) ||
          !Number.isSafeInteger(payload.count) || (payload.count as number) < 0) return 'invalid-response';
      const count = payload.count as number;
      if (total === null) {
        if (count > SENAITE_INVENTORY_PAGE_SIZE * SENAITE_INVENTORY_MAX_PAGES) return 'inventory-too-large';
        total = count;
      } else if (count !== total) {
        return 'inventory-changed';
      }
      const expected = Math.min(SENAITE_INVENTORY_PAGE_SIZE, total - items.length);
      // A short page means a record vanished mid-read; a long one means the
      // server ignored our page size. Either way the list is not provably whole.
      if (payload.items.length !== expected) {
        return payload.items.length > SENAITE_INVENTORY_PAGE_SIZE ? 'invalid-response' : 'inventory-changed';
      }
      for (const item of payload.items) {
        if (!record(item) || item.portal_type !== portalType ||
            typeof item.uid !== 'string' || !UID.test(item.uid)) return 'invalid-response';
        const modified = normalizeSenaiteModified(item.modified);
        if (modified === null) return 'invalid-response';
        // The same record on two pages means the order shifted while reading.
        if (seen.has(item.uid)) return 'inventory-changed';
        seen.add(item.uid);
        items.push({ portalType, uid: item.uid, modified });
      }
    }
    return items;
  }

  return {
    enabled: config !== null,
    async read(portalTypes: readonly string[] = SENAITE_BACKUP_PORTAL_TYPES): Promise<SenaiteInventoryResult> {
      if (!config) return { status: 'not_configured' };
      if (!Array.isArray(portalTypes) || portalTypes.length === 0 ||
          new Set(portalTypes).size !== portalTypes.length ||
          !portalTypes.every(type => (SENAITE_BACKUP_PORTAL_TYPES as readonly string[]).includes(type))) {
        return { status: 'error', code: 'invalid-query' };
      }
      const types = [...portalTypes].sort() as SenaiteBackupPortalType[];

      // SENAITE 2.6 answers a rejected token with HTTP 200 as Anonymous, who
      // sees empty folders. Without this check a bad token would read as a
      // wiped lab, and a restore check against it would be meaningless.
      const identity = await getJson(config.api('users/current'));
      if ('code' in identity) return { status: 'error', code: identity.code };
      const { payload } = identity;
      if (!record(payload) || !Array.isArray(payload.items) || payload.items.length !== 1 ||
          !record(payload.items[0]) || typeof payload.items[0].authenticated !== 'boolean') {
        return { status: 'error', code: 'invalid-response' };
      }
      if (!payload.items[0].authenticated) return { status: 'error', code: 'unauthenticated' };

      const counts: Record<string, number> = {};
      const everything: SenaiteManifestItem[] = [];
      for (const portalType of types) {
        const items = await readType(portalType);
        if (typeof items === 'string') return { status: 'error', code: items, portalType };
        counts[portalType] = items.length;
        everything.push(...items);
      }
      let manifest: SenaiteManifest;
      try {
        manifest = buildSenaiteManifest(everything);
      } catch {
        // One UID listed under two portal types.
        return { status: 'error', code: 'invalid-response' };
      }
      return { status: 'ok', inventory: { portalTypes: types, counts, manifest } };
    },
  };
}

function isInventory(value: unknown): value is SenaiteInventory {
  if (!record(value) || !Array.isArray(value.portalTypes) || !record(value.counts) || !record(value.manifest)) {
    return false;
  }
  const { portalTypes, counts, manifest } = value as SenaiteInventory;
  if (portalTypes.length === 0 || new Set(portalTypes).size !== portalTypes.length ||
      !portalTypes.every(type => (SENAITE_BACKUP_PORTAL_TYPES as readonly string[]).includes(type)) ||
      Object.keys(counts).sort().join() !== [...portalTypes].sort().join()) return false;
  for (const type of portalTypes) {
    const count = counts[type];
    if (!Number.isSafeInteger(count) || count < 0) return false;
    const entry = Object.hasOwn(manifest, type) ? manifest[type] : undefined;
    if (count === 0 ? entry !== undefined : !record(entry) || entry.count !== count) return false;
  }
  return Object.keys(manifest).every(type => (portalTypes as string[]).includes(type));
}

/**
 * Before-backup versus after-restore. Fails closed on a malformed or empty
 * inventory. A type read on only one side is `missing`; a type read on both
 * sides with no records is a proven match, which the bare manifest cannot show.
 */
export function compareSenaiteInventories(before: unknown, after: unknown): BackupComparison {
  const validBefore = isInventory(before);
  const validAfter = isInventory(after);
  const total = (inventory: SenaiteInventory) => Object.values(inventory.counts).reduce((sum, n) => sum + n, 0);
  if (!validBefore || !validAfter || total(before) === 0 || total(after) === 0) {
    return {
      ok: false,
      differences: [{
        portalType: null,
        kind: 'missing',
        before: validBefore && total(before) > 0 ? 'valid' : 'invalid',
        after: validAfter && total(after) > 0 ? 'valid' : 'invalid',
      }],
      summary: 'SENAITE restore verification failed because at least one inventory is malformed or empty.',
    };
  }
  const scope = [...new Set([...before.portalTypes, ...after.portalTypes])].sort()
    .filter(type => !before.portalTypes.includes(type) || !after.portalTypes.includes(type))
    .map(type => ({
      portalType: type,
      kind: 'missing' as const,
      before: before.portalTypes.includes(type) ? before.counts[type] : null,
      after: after.portalTypes.includes(type) ? after.counts[type] : null,
    }));
  const shared = before.portalTypes.filter(type => after.portalTypes.includes(type));
  const pick = (manifest: SenaiteManifest) =>
    Object.fromEntries(Object.entries(manifest).filter(([type]) => (shared as string[]).includes(type)));
  const left = pick(before.manifest);
  const right = pick(after.manifest);
  // An empty side here means every shared type is empty there, which the
  // manifest comparison rightly refuses; report those types as missing instead.
  const records = Object.keys(left).length === 0 && Object.keys(right).length === 0
    ? { ok: true, differences: [] }
    : Object.keys(left).length === 0 || Object.keys(right).length === 0
      ? {
        ok: false,
        differences: [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().map(type => ({
          portalType: type,
          kind: 'missing' as const,
          before: left[type]?.count ?? null,
          after: right[type]?.count ?? null,
        })),
      }
      : compareBackupManifests(left, right);
  const differences = [...scope, ...records.differences]
    .sort((a, b) => String(a.portalType).localeCompare(String(b.portalType)));
  return {
    ok: differences.length === 0,
    differences,
    summary: differences.length === 0
      ? `SENAITE restore verification passed: ${shared.length} portal types, ${total(before)} records, identical UIDs and modification times.`
      : `SENAITE restore verification failed with ${differences.length} ${differences.length === 1 ? 'difference' : 'differences'} in portal type presence, counts, or checksums.`,
  };
}
