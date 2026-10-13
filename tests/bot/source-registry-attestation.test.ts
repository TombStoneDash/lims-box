import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  admitSource,
  resolveEvidence,
  type EvidenceRecord,
} from '../../lib/bot/source-registry';

const rightsEvidence = {
  reference: 'ref-1',
  reviewer: 'rev',
  reviewedAt: '2026-10-01T00:00:00Z',
};

const approvedEvidenceRecord: EvidenceRecord = {
  id: 'ev-a-b',
  status: 'approved',
  contentHash: 'a'.repeat(64),
  reviewer: 'rev',
  reviewedAt: '2026-10-01T00:00:00Z',
};

test('ORIGINAL_INTERNAL rejects a non-boolean employerIpAttestation', () => {
  for (const attestation of ['false', 1, {}] as const) {
    const result = admitSource(
      {
        id: 'src-a-b',
        rightsClass: 'ORIGINAL_INTERNAL',
        status: 'approved',
        rightsEvidence,
        employerIpAttestation: attestation as unknown as boolean,
        evidenceRef: 'ev-a-b',
      },
      [approvedEvidenceRecord],
    );
    assert.equal(result.ok, false, `expected rejection for attestation ${JSON.stringify(attestation)}`);
    assert.equal(result.record.status, 'rejected');
    assert.equal(result.reason, 'original_internal_missing_attestation');
  }
});

test('ORIGINAL_INTERNAL admits a valid record with a strict boolean attestation and resolvable evidence', () => {
  const result = admitSource(
    {
      id: 'src-a-b',
      rightsClass: 'ORIGINAL_INTERNAL',
      status: 'approved',
      rightsEvidence,
      employerIpAttestation: true,
      evidenceRef: 'ev-a-b',
    },
    [approvedEvidenceRecord],
  );
  assert.equal(result.ok, true);
  assert.equal(result.record.status, 'approved');
});

test('a whitespace-only rightsEvidence.reference fails admission after trimming', () => {
  const result = admitSource(
    {
      id: 'src-c-d',
      rightsClass: 'OPEN_LICENSE',
      status: 'approved',
      rightsEvidence: { ...rightsEvidence, reference: '   ' },
    },
    [],
  );
  assert.equal(result.ok, false);
  assert.equal(result.record.status, 'rejected');
  assert.equal(result.reason, 'approved_without_rights_evidence');
});

test('resolveEvidence refuses to pick a side when a registry ID is duplicated', () => {
  const approvedThenRejected: EvidenceRecord[] = [
    approvedEvidenceRecord,
    { ...approvedEvidenceRecord, status: 'rejected' },
  ];
  const rejectedThenApproved: EvidenceRecord[] = [
    { ...approvedEvidenceRecord, status: 'rejected' },
    approvedEvidenceRecord,
  ];
  assert.equal(resolveEvidence('ev-a-b', approvedThenRejected), null);
  assert.equal(resolveEvidence('ev-a-b', rejectedThenApproved), null);
  assert.equal(resolveEvidence('ev-a-b', [approvedEvidenceRecord]), approvedEvidenceRecord);
});

test('admitSource rejects null and non-object input without throwing', () => {
  for (const invalidInput of [null, undefined, 'src-a-b', 42, []] as const) {
    const result = admitSource(invalidInput as never, []);
    assert.equal(result.ok, false);
    assert.equal(result.record.status, 'rejected');
    assert.equal(result.reason, 'invalid_source_id');
  }
});
