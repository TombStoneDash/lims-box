// LIMS BOT source registry: admission and evidence-resolution policy.
// Admission policy only. File reads live in founder-corpus.ts.
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

export const FOUNDER_REDACTED_PATH = /^15_HT_FOUNDER_INTAKE\/redacted\/([a-f0-9]{64})\.txt$/;
export const FOUNDER_SOURCES_PATH = '15_HT_FOUNDER_INTAKE/SOURCES.tsv';

export interface FounderManifestRow {
  path: string;
  sha256: string;
  size: string;
  origin: string;
  source_location: string;
  added: string;
}

export interface FounderSourceRow {
  alias: string;
  status: string;
  sha256: string;
  redacted: string;
  bot_status: string;
}

// Ownership attestation: lims-knowledge#1 records Hudson's Sep 24 decision.
// Bot use of eligible redacted candidates is authorized by
// LIMS-FOUNDER-KNOWLEDGE-INTO-BOT-CORPUS-BUILDOUT-20261003-R1.
// A merge alone never admits held or human-review-pending documents.
const FOUNDER_RIGHTS_EVIDENCE: RightsEvidence = {
  reference: 'https://github.com/TombStoneDash/lims-knowledge/pull/1',
  reviewer: 'TombStoneDash',
  reviewedAt: '2026-09-25T17:24:12Z',
};
const HELD_FOUNDER_ALIASES = new Set(['FLI-001', 'FLI-089', 'FLI-114']);

export function admitFounderSource(
  manifest: FounderManifestRow,
  source: FounderSourceRow,
): SourceRecord | null {
  const pathMatch = FOUNDER_REDACTED_PATH.exec(manifest.path);
  if (!pathMatch || source.redacted !== manifest.path
    || source.sha256 !== pathMatch[1]
    || !/^FLI-\d{3}$/.test(source.alias) || HELD_FOUNDER_ALIASES.has(source.alias)
    || source.status !== 'INTEGRATED' || source.bot_status !== 'REDACTED_CANDIDATE'
    || manifest.origin !== 'HT_ORIGINAL'
    || manifest.source_location !== `derived:contact-redaction of sha256:${source.sha256}`
    || !SHA256_HEX_PATTERN.test(manifest.sha256)
    || !/^[1-9]\d*$/.test(manifest.size) || !isIsoTimestamp(manifest.added)) return null;

  const evidenceId = `founder-evidence-${source.alias.toLowerCase()}`;
  const result = admitSource({
    id: `founder-source-${source.alias.toLowerCase()}`,
    rightsClass: 'ORIGINAL_INTERNAL',
    status: 'approved',
    rightsEvidence: FOUNDER_RIGHTS_EVIDENCE,
    employerIpAttestation: true,
    evidenceRef: evidenceId,
  }, [{
    id: evidenceId,
    status: 'approved',
    contentHash: manifest.sha256,
    reviewer: FOUNDER_RIGHTS_EVIDENCE.reviewer,
    reviewedAt: FOUNDER_RIGHTS_EVIDENCE.reviewedAt,
  }]);
  return result.ok && result.record.status === 'approved' ? result.record : null;
}

// Public excerpts, reviewed against the merged redacted founder files at
// e2eeb98c8c0bb2f1fd374e543184662760c00f99. Never publish an entire resume:
// upstream contact redaction deliberately leaves personal names in place.
// Exact passage matching (whitespace only) excludes all surrounding personal
// material, even if a future candidate contains identifiers our detector misses.
// Adding a topic requires reviewing another identifier-free verbatim passage.
export const FOUNDER_EXCERPTS = [
  {
    id: 'configuration',
    title: 'Founder experience: LIMS configuration',
    keywords: ['experience', 'background', 'career', 'configuration', 'configured', 'administrator'],
    text: 'LIMS (Laboratory Information Management System) Administrator - Configured and integrated the software to support the evolving business needs of the company pertaining to laboratory data.',
  },
  {
    id: 'training',
    title: 'Founder experience: Omega 11 training',
    keywords: ['omega', 'training', 'trained', 'technicians', 'chemists'],
    text: 'I finalized the Omega 11 LIMS configuration and trained all the technicians and chemists to use the software for their daily tasks, as well as providing advanced training to the LIMS Administrator back up.',
  },
  {
    id: 'instrument-imports',
    title: 'Founder experience: instrument data imports',
    keywords: ['instrument', 'instruments', 'imports', 'import', 'excel', 'csv', 'txt'],
    text: 'Including the configuration of the instruments to import raw data and the creation of user defined import specifications for multiple file types such as Excel, CSV, TXT.',
  },
  {
    id: 'data-recovery',
    title: 'Founder experience: laboratory data entry and recovery',
    keywords: ['entry', 'recovery', 'recover'],
    text: 'Perform data entry and recovery using the Laboratory Information Management System (LIMS).',
  },
] as const;
