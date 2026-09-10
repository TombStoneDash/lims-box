import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  admitSource,
  resolveEvidence,
  type EvidenceRecord,
  type SourceRecord,
} from '../../lib/bot/source-registry';

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'fixtures', 'bot', 'sources');

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), 'utf8')) as T;
}

const evidenceRegistry = loadFixture<EvidenceRecord[]>('evidence-registry.json');
const allowedFixtures = loadFixture<Array<Partial<SourceRecord> & { id: string }>>('allowed.json');
const disallowedFixtures = loadFixture<Array<Partial<SourceRecord> & { id: string }>>('disallowed.json');

test('unknown rights default to METADATA_ONLY', () => {
  const result = admitSource({ id: 'src-no-rights-class', status: 'pending' }, evidenceRegistry);
  assert.equal(result.ok, true);
  assert.equal(result.record.rightsClass, 'METADATA_ONLY');
  assert.equal(result.record.status, 'pending');
});

test('unknown rights cannot preserve approved status and malformed statuses are rejected', () => {
  const unknownApproved = admitSource(
    { id: 'src-unknown-rights', rightsClass: 'NOT_A_RIGHT' as never, status: 'approved' },
    evidenceRegistry,
  );
  assert.equal(unknownApproved.ok, true);
  assert.equal(unknownApproved.record.rightsClass, 'METADATA_ONLY');
  assert.equal(unknownApproved.record.status, 'pending');

  const malformedStatus = admitSource(
    { id: 'src-invalid-status', rightsClass: 'PUBLIC_DOMAIN', status: 'published' as never },
    evidenceRegistry,
  );
  assert.equal(malformedStatus.ok, false);
  assert.equal(malformedStatus.reason, 'invalid_status');
});

test('EMPLOYER_RESTRICTED_EXCLUDED is never approved regardless of evidence supplied', () => {
  const result = admitSource(
    {
      id: 'src-employer-restricted-inline',
      rightsClass: 'EMPLOYER_RESTRICTED_EXCLUDED',
      status: 'approved',
      rightsEvidence: { reference: 'x', reviewer: 'y', reviewedAt: '2026-01-01T00:00:00Z' },
    },
    evidenceRegistry,
  );
  assert.equal(result.ok, false);
  assert.equal(result.record.status, 'rejected');
});

test('approved records without rightsEvidence fail', () => {
  const result = admitSource(
    { id: 'src-approved-no-evidence-inline', rightsClass: 'PUBLIC_DOMAIN', status: 'approved' },
    evidenceRegistry,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'approved_without_rights_evidence');
});

test('ORIGINAL_INTERNAL requires attestation plus a resolvable approved registry ID', () => {
  const missingAttestation = admitSource(
    {
      id: 'src-oi-inline-1',
      rightsClass: 'ORIGINAL_INTERNAL',
      status: 'approved',
      rightsEvidence: { reference: 'x', reviewer: 'y', reviewedAt: '2026-01-01T00:00:00Z' },
      employerIpAttestation: false,
      evidenceRef: 'evidence-original-internal-001',
    },
    evidenceRegistry,
  );
  assert.equal(missingAttestation.ok, false);
  assert.equal(missingAttestation.reason, 'original_internal_missing_attestation');

  const validRecord = admitSource(
    {
      id: 'src-oi-inline-2',
      rightsClass: 'ORIGINAL_INTERNAL',
      status: 'approved',
      rightsEvidence: { reference: 'x', reviewer: 'y', reviewedAt: '2026-01-01T00:00:00Z' },
      employerIpAttestation: true,
      evidenceRef: 'evidence-original-internal-001',
    },
    evidenceRegistry,
  );
  assert.equal(validRecord.ok, true);
});

test('missing, rejected, and malformed evidence records fail to resolve', () => {
  assert.equal(resolveEvidence('evidence-nonexistent-999', evidenceRegistry), null);
  assert.equal(resolveEvidence('evidence-rejected-001', evidenceRegistry), null);
  assert.equal(resolveEvidence('evidence-malformed-hash-001', evidenceRegistry), null);
  assert.equal(resolveEvidence('https://example.com/some-doc.pdf', evidenceRegistry), null);
  assert.equal(resolveEvidence(undefined, evidenceRegistry), null);

  const resolved = resolveEvidence('evidence-original-internal-001', evidenceRegistry);
  assert.ok(resolved);
  assert.equal(resolved?.id, 'evidence-original-internal-001');
});

test('existing URL, path, free-text, and malformed-review evidence IDs never resolve', () => {
  const hash = 'a'.repeat(64);
  const adversarialRegistry: EvidenceRecord[] = [
    { id: 'https://example.com/evidence', status: 'approved', contentHash: hash, reviewer: 'reviewer-main-daisy', reviewedAt: '2026-01-01T00:00:00Z' },
    { id: '/tmp/private-evidence', status: 'approved', contentHash: hash, reviewer: 'reviewer-main-daisy', reviewedAt: '2026-01-01T00:00:00Z' },
    { id: 'free text evidence', status: 'approved', contentHash: hash, reviewer: 'reviewer-main-daisy', reviewedAt: '2026-01-01T00:00:00Z' },
    { id: 'evidence-bad-review', status: 'approved', contentHash: hash, reviewer: 'Human Name', reviewedAt: 'yesterday' },
  ];
  for (const record of adversarialRegistry) {
    assert.equal(resolveEvidence(record.id, adversarialRegistry), null, record.id);
  }
});

test('runtime schema rejects malformed source IDs and review evidence', () => {
  assert.equal(admitSource({ id: '../source', status: 'pending' }, evidenceRegistry).ok, false);
  const malformedReview = admitSource(
    {
      id: 'src-public-domain',
      rightsClass: 'PUBLIC_DOMAIN',
      status: 'approved',
      rightsEvidence: { reference: 'license-ref', reviewer: 'Human Name', reviewedAt: 'yesterday' },
    },
    evidenceRegistry,
  );
  assert.equal(malformedReview.ok, false);
  assert.equal(malformedReview.reason, 'approved_without_rights_evidence');
});

test('PUBLIC_WEB_SUMMARY requires summaryWordCap: 25', () => {
  const missingCap = admitSource(
    {
      id: 'src-pws-inline-1',
      rightsClass: 'PUBLIC_WEB_SUMMARY',
      status: 'approved',
      rightsEvidence: { reference: 'x', reviewer: 'y', reviewedAt: '2026-01-01T00:00:00Z' },
    },
    evidenceRegistry,
  );
  assert.equal(missingCap.ok, false);
  assert.equal(missingCap.reason, 'public_web_summary_requires_word_cap_25');

  const wrongCap = admitSource(
    {
      id: 'src-pws-inline-2',
      rightsClass: 'PUBLIC_WEB_SUMMARY',
      status: 'approved',
      rightsEvidence: { reference: 'x', reviewer: 'y', reviewedAt: '2026-01-01T00:00:00Z' },
      summaryWordCap: 50 as unknown as 25,
    },
    evidenceRegistry,
  );
  assert.equal(wrongCap.ok, false);

  const correctCap = admitSource(
    {
      id: 'src-pws-inline-3',
      rightsClass: 'PUBLIC_WEB_SUMMARY',
      status: 'approved',
      rightsEvidence: { reference: 'x', reviewer: 'y', reviewedAt: '2026-01-01T00:00:00Z' },
      summaryWordCap: 25,
    },
    evidenceRegistry,
  );
  assert.equal(correctCap.ok, true);
});

test('allowed fixtures all pass admission', () => {
  for (const fixture of allowedFixtures) {
    const result = admitSource(fixture, evidenceRegistry);
    assert.equal(result.ok, true, `expected ${fixture.id} to be admitted, got reason: ${result.reason}`);
  }
});

test('disallowed fixtures all fail admission', () => {
  for (const fixture of disallowedFixtures) {
    const result = admitSource(fixture, evidenceRegistry);
    assert.equal(result.ok, false, `expected ${fixture.id} to be rejected`);
  }
});
