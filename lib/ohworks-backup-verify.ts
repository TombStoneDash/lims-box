import { createHash } from 'node:crypto';

export type SenaiteManifestItem = {
  portalType: string;
  uid: string;
  /** UTC ISO timestamp, with seconds and optional three-digit milliseconds. */
  modified: string;
};

export type SenaiteManifest = Record<string, { count: number; checksum: string }>;

export type BackupDifference = {
  /** Null denotes an invalid manifest envelope rather than a specific type. */
  portalType: string | null;
  kind: 'count' | 'checksum' | 'missing';
  before: number | string | null;
  after: number | string | null;
};

export type BackupComparison = {
  ok: boolean;
  differences: BackupDifference[];
  summary: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) &&
    timestamp.toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}

/**
 * Pure metadata inventory; throws TypeError for malformed or duplicate items.
 * Hashes JSON-encoded [uid, modified] tuples sorted by UID then timestamp using
 * code-unit ordering, without changing inputs or normalizing timestamp strings.
 * An empty inventory produces {}, which comparison deliberately cannot certify.
 * This verifies supplied metadata only, not backup contents or restore success.
 */
export function buildSenaiteManifest(items: readonly SenaiteManifestItem[]): SenaiteManifest {
  if (!Array.isArray(items)) throw new TypeError('Manifest items must be an array.');
  const groups = new Map<string, [string, string][]>();
  const uids = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || !isText(item.portalType) || !isText(item.uid) || !isTimestamp(item.modified)) {
      throw new TypeError('Manifest items require a portal type, UID, and valid UTC ISO timestamp.');
    }
    if (uids.has(item.uid)) throw new TypeError('Manifest items must have unique UIDs.');
    uids.add(item.uid);
    const pairs = groups.get(item.portalType) ?? [];
    pairs.push([item.uid, item.modified]);
    groups.set(item.portalType, pairs);
  }
  return Object.fromEntries([...groups.keys()].sort().map((portalType) => {
    const pairs = groups.get(portalType)!;
    pairs.sort(([uidA, modifiedA], [uidB, modifiedB]) => {
      if (uidA !== uidB) return uidA < uidB ? -1 : 1;
      return modifiedA < modifiedB ? -1 : modifiedA > modifiedB ? 1 : 0;
    });
    return [portalType, {
      count: pairs.length,
      checksum: createHash('sha256').update(JSON.stringify(pairs), 'utf8').digest('hex'),
    }];
  }));
}

function isManifest(value: unknown): value is SenaiteManifest {
  if (!isRecord(value) || Reflect.ownKeys(value).length !== Object.keys(value).length) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([portalType, entry]) =>
    isText(portalType) && isRecord(entry) &&
    Reflect.ownKeys(entry).length === 2 && Object.hasOwn(entry, 'count') && Object.hasOwn(entry, 'checksum') &&
    Number.isSafeInteger(entry.count) && (entry.count as number) > 0 &&
    typeof entry.checksum === 'string' && /^[a-f0-9]{64}$/.test(entry.checksum));
}

/**
 * Accepts untrusted parsed manifests and fails closed on either invalid side.
 * A malformed envelope is represented by a `missing` difference with null type;
 * valid missing types use their counts, with null for the absent side.
 * Types absent from BOTH inventories cannot be detected without an external
 * expected-type inventory, which callers must check separately.
 */
export function compareBackupManifests(before: unknown, after: unknown): BackupComparison {
  const validBefore = isManifest(before);
  const validAfter = isManifest(after);
  if (!validBefore || !validAfter) {
    return {
      ok: false,
      differences: [{ portalType: null, kind: 'missing', before: validBefore ? 'valid' : 'invalid', after: validAfter ? 'valid' : 'invalid' }],
      summary: 'Backup metadata verification failed because at least one manifest is malformed or empty.',
    };
  }
  const differences: BackupDifference[] = [];
  for (const portalType of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const left = Object.hasOwn(before, portalType) ? before[portalType] : undefined;
    const right = Object.hasOwn(after, portalType) ? after[portalType] : undefined;
    if (!left || !right) {
      differences.push({ portalType, kind: 'missing', before: left?.count ?? null, after: right?.count ?? null });
      continue;
    }
    if (left.count !== right.count) {
      differences.push({ portalType, kind: 'count', before: left.count, after: right.count });
    }
    if (left.checksum !== right.checksum) {
      differences.push({ portalType, kind: 'checksum', before: left.checksum, after: right.checksum });
    }
  }
  return {
    ok: differences.length === 0,
    differences,
    summary: differences.length === 0
      ? 'Backup metadata verification passed because all supplied portal type counts and checksums match.'
      : `Backup metadata verification failed with ${differences.length} ${differences.length === 1 ? 'difference' : 'differences'} in portal type presence, counts, or checksums.`,
  };
}
