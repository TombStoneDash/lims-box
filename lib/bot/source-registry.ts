// LIMS BOT source registry: admission and evidence-resolution policy.
// Schema/policy only. No live retrieval, no auth wiring, no ingestion.
// Spec: LIMS_BOT_EXPERT_V2_SPEC_20260902.md section 7.3, Slice S1 deliverable 1.

export type RightsClass =
  | 'PUBLIC_DOMAIN'
  | 'OPEN_LICENSE'
  | 'PUBLIC_WEB_SUMMARY'
  | 'VENDOR_COPYRIGHT_INTERNAL_INDEX'
  | 'METADATA_ONLY'
  | 'PAID_STANDARD_CONCEPT_ONLY'
  | 'CUSTOMER_LICENSED_PRIVATE'
  | 'ORIGINAL_INTERNAL'
  | 'EMPLOYER_RESTRICTED_EXCLUDED';

const KNOWN_RIGHTS_CLASSES: readonly RightsClass[] = [
  'PUBLIC_DOMAIN',
  'OPEN_LICENSE',
  'PUBLIC_WEB_SUMMARY',
  'VENDOR_COPYRIGHT_INTERNAL_INDEX',
  'METADATA_ONLY',
  'PAID_STANDARD_CONCEPT_ONLY',
  'CUSTOMER_LICENSED_PRIVATE',
  'ORIGINAL_INTERNAL',
  'EMPLOYER_RESTRICTED_EXCLUDED',
];

export interface RightsEvidence {
  reference: string;
  reviewer: string;
  reviewedAt: string;
}

export interface SourceRecord {
  id: string;
  rightsClass: RightsClass;
  status: 'pending' | 'approved' | 'rejected';
  rightsEvidence?: RightsEvidence;
  employerIpAttestation?: boolean;
  evidenceRef?: string;
  summaryWordCap?: 25;
}

export interface EvidenceRecord {
  id: string;
  status: 'approved' | 'rejected';
  contentHash: string;
  reviewer: string;
  reviewedAt: string;
}

export type EvidenceRegistry = readonly EvidenceRecord[];

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const SANITIZED_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}$/;
const REVIEWER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,79}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected']);

function isSanitizedId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 80
    && SANITIZED_ID_PATTERN.test(value)
    && !value.includes('..');
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && ISO_TIMESTAMP_PATTERN.test(value)
    && Number.isFinite(Date.parse(value));
}

/**
 * Resolves an evidenceRef by exact ID match against the supplied registry.
 * Only an `approved` record with a valid SHA-256 content hash and both
 * review fields present resolves. Paths, URLs, and free text never resolve
 * because they are never valid registry IDs.
 */
export function resolveEvidence(
  evidenceRef: string | undefined,
  registry: EvidenceRegistry,
): EvidenceRecord | null {
  if (!isSanitizedId(evidenceRef)) return null;
  const found = registry.find((record) => record.id === evidenceRef);
  if (!found) return null;
  if (!isSanitizedId(found.id)) return null;
  if (found.status !== 'approved') return null;
  if (!SHA256_HEX_PATTERN.test(found.contentHash)) return null;
  if (typeof found.reviewer !== 'string' || !REVIEWER_ID_PATTERN.test(found.reviewer)) return null;
  if (!isIsoTimestamp(found.reviewedAt)) return null;
  return found;
}

export interface AdmissionResult {
  ok: boolean;
  record: SourceRecord;
  reason?: string;
}

/**
 * Pure admission validator for a source record. Unknown/unrecognized
 * rightsClass values default to METADATA_ONLY pending human review, per
 * spec 7.3. EMPLOYER_RESTRICTED_EXCLUDED can never reach `approved`.
 */
export function admitSource(
  input: (Partial<SourceRecord> & { id: string }) | Record<string, unknown>,
  registry: EvidenceRegistry,
): AdmissionResult {
  const knownRights = KNOWN_RIGHTS_CLASSES.includes(input.rightsClass as RightsClass);
  const rightsClass: RightsClass = knownRights
    ? (input.rightsClass as RightsClass)
    : 'METADATA_ONLY';

  const rawStatus = input.status;
  const status = knownRights ? (rawStatus ?? 'pending') : 'pending';

  const record: SourceRecord = {
    id: typeof input.id === 'string' ? input.id : '',
    rightsClass,
    status: VALID_STATUSES.has(status as string) ? status as SourceRecord['status'] : 'rejected',
    rightsEvidence: input.rightsEvidence as RightsEvidence | undefined,
    employerIpAttestation: input.employerIpAttestation as boolean | undefined,
    evidenceRef: input.evidenceRef as string | undefined,
    summaryWordCap: input.summaryWordCap as 25 | undefined,
  };

  if (!isSanitizedId(record.id)) {
    return { ok: false, record: { ...record, status: 'rejected' }, reason: 'invalid_source_id' };
  }
  if (knownRights && !VALID_STATUSES.has(rawStatus as string) && rawStatus !== undefined) {
    return { ok: false, record: { ...record, status: 'rejected' }, reason: 'invalid_status' };
  }

  if (rightsClass === 'EMPLOYER_RESTRICTED_EXCLUDED') {
    return { ok: false, record: { ...record, status: 'rejected' }, reason: 'employer_restricted_excluded_never_approved' };
  }

  if (!knownRights || record.status !== 'approved') {
    return { ok: true, record };
  }

  const evidence = record.rightsEvidence;
  if (!evidence
    || typeof evidence.reference !== 'string' || evidence.reference.length === 0
    || typeof evidence.reviewer !== 'string' || !REVIEWER_ID_PATTERN.test(evidence.reviewer)
    || !isIsoTimestamp(evidence.reviewedAt)) {
    return { ok: false, record: { ...record, status: 'rejected' }, reason: 'approved_without_rights_evidence' };
  }

  if (rightsClass === 'ORIGINAL_INTERNAL') {
    if (!record.employerIpAttestation) {
      return { ok: false, record: { ...record, status: 'rejected' }, reason: 'original_internal_missing_attestation' };
    }
    if (!resolveEvidence(record.evidenceRef, registry)) {
      return { ok: false, record: { ...record, status: 'rejected' }, reason: 'original_internal_unresolvable_evidence' };
    }
  }

  if (rightsClass === 'PUBLIC_WEB_SUMMARY' && record.summaryWordCap !== 25) {
    return { ok: false, record: { ...record, status: 'rejected' }, reason: 'public_web_summary_requires_word_cap_25' };
  }

  return { ok: true, record };
}
