import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { buildSenaiteManifest, compareBackupManifests, type SenaiteManifestItem } from '../../lib/ohworks-backup-verify';

const items: SenaiteManifestItem[] = [
  { portalType: 'SYNTHETIC-Sample', uid: 'SYNTHETIC-002', modified: '2026-09-20T01:00:00Z' },
  { portalType: 'SYNTHETIC-Sample', uid: 'SYNTHETIC-001', modified: '2026-09-19T01:00:00.000Z' },
  { portalType: 'SYNTHETIC-Analysis', uid: 'SYNTHETIC-003', modified: '2026-09-20T02:00:00Z' },
];

test('identical serialized manifests pass with a receipt sentence', () => {
  const before = buildSenaiteManifest(items);
  assert.equal(before['SYNTHETIC-Sample'].count, 2);
  assert.equal(before['SYNTHETIC-Analysis'].count, 1);
  const result = compareBackupManifests(before, JSON.parse(JSON.stringify(before)));
  assert.equal(result.ok, true);
  assert.deepEqual(result.differences, []);
  assert.equal(result.summary, 'Backup metadata verification passed because all supplied portal type counts and checksums match.');
});

test('count drift reports exact counts and changed checksum', () => {
  const result = compareBackupManifests(buildSenaiteManifest(items), buildSenaiteManifest(items.slice(1)));
  assert.equal(result.ok, false);
  assert.deepEqual(result.differences[0], { portalType: 'SYNTHETIC-Sample', kind: 'count', before: 2, after: 1 });
  assert.equal(result.differences[1].kind, 'checksum');
  assert.match(result.summary, /^Backup metadata verification failed with 2 differences.*\.$/);
});

test('timestamp and UID drift each fail despite equal counts', () => {
  for (const patch of [{ modified: '2026-09-20T03:00:00Z' }, { uid: 'SYNTHETIC-004' }]) {
    const before = buildSenaiteManifest(items);
    const after = buildSenaiteManifest(items.map((item, i) => i === 0 ? { ...item, ...patch } : item));
    const result = compareBackupManifests(before, after);
    assert.equal(result.ok, false);
    assert.deepEqual(result.differences, [{ portalType: 'SYNTHETIC-Sample', kind: 'checksum', before: before['SYNTHETIC-Sample'].checksum, after: after['SYNTHETIC-Sample'].checksum }]);
  }
});

test('a type missing on either side fails closed', () => {
  const full = buildSenaiteManifest(items);
  const partial = buildSenaiteManifest(items.slice(0, 2));
  for (const [before, after, left, right] of [[full, partial, 1, null], [partial, full, null, 1]] as const) {
    const result = compareBackupManifests(before, after);
    assert.equal(result.ok, false);
    assert.deepEqual(result.differences, [{ portalType: 'SYNTHETIC-Analysis', kind: 'missing', before: left, after: right }]);
  }
});

test('malformed and empty manifests never pass on either side, even when identical', () => {
  const valid = buildSenaiteManifest(items);
  const checksum = valid['SYNTHETIC-Sample'].checksum;
  const malformed: unknown[] = [null, undefined, [], {}, 'SYNTHETIC-invalid', 1,
    { 'SYNTHETIC-Sample': null }, { 'SYNTHETIC-Sample': {} },
    { '': { count: 1, checksum } },
    ...[-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'].map(count => ({ 'SYNTHETIC-Sample': { count, checksum } })),
    ...[null, '', 'SYNTHETIC-invalid', 'a'.repeat(63), 'z'.repeat(64)].map(value => ({ 'SYNTHETIC-Sample': { count: 1, checksum: value } })),
    { 'SYNTHETIC-Sample': { count: 1, checksum, extra: true } },
    Object.create(valid),
  ];
  for (const invalid of malformed) {
    for (const [before, after] of [[invalid, valid], [valid, invalid], [invalid, invalid]]) {
      const result = compareBackupManifests(before, after);
      assert.equal(result.ok, false);
      assert.equal(result.differences[0].portalType, null);
      assert.match(result.summary, /malformed or empty/);
    }
  }
});

test('checksum is SHA-256 of sorted tuples, independent of order without input mutation', () => {
  const frozen = Object.freeze(items.map(item => Object.freeze({ ...item })));
  const manifest = buildSenaiteManifest(frozen);
  assert.deepEqual(manifest, buildSenaiteManifest([...frozen].reverse()));
  assert.equal(manifest['SYNTHETIC-Sample'].checksum, createHash('sha256').update(JSON.stringify([
    ['SYNTHETIC-001', '2026-09-19T01:00:00.000Z'],
    ['SYNTHETIC-002', '2026-09-20T01:00:00Z'],
  ])).digest('hex'));
});

test('builder rejects malformed items, impossible dates, sparse arrays and duplicate UIDs', () => {
  for (const invalid of [null, {}, [null], new Array(1), [{ ...items[0], uid: '' }],
    [{ ...items[0], portalType: ' ' }], [{ ...items[0], modified: '2026-02-30T01:00:00Z' }],
    [{ ...items[0], modified: 'SYNTHETIC-invalid' }], [items[0], items[0]],
    [items[0], { ...items[0], portalType: 'SYNTHETIC-Other' }]]) {
    assert.throws(() => buildSenaiteManifest(invalid as SenaiteManifestItem[]), TypeError);
  }
  assert.deepEqual(buildSenaiteManifest([]), {});
  assert.equal(compareBackupManifests(buildSenaiteManifest([]), buildSenaiteManifest([])).ok, false);
});
