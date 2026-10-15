// LIMS BOT data-class axis and principal propagation.
// Pure policy only: no live retrieval, no auth wiring, no ingestion.
// Spec: LIMS_BOT_EXPERT_V2_SPEC_20260902.md section 7.8, Slice S1 deliverable 1.

export type DataClass = 'outcome_only' | 'clinical_detail' | 'admin';

export interface PrincipalContext {
  tenantId: string;
  subjectId: string;
  role: 'worker' | 'clinician' | 'employer' | 'quality' | 'admin';
  allowedDataClasses: DataClass[];
}

export interface DataClassRecord {
  id: string;
  tenantId: string;
  dataClass: DataClass;
}

function isNonBlankTenantId(tenantId: unknown): tenantId is string {
  return typeof tenantId === 'string' && tenantId.trim().length > 0;
}

/**
 * Filters records to only those the principal is allowed to read.
 * The decision is driven entirely by `principal.allowedDataClasses` and the
 * record's own `tenantId`/`dataClass` fields. No other field on the record
 * (a spoofed override, a requested class, in-band instruction text, etc.)
 * can influence the outcome, per spec 7.8 rule 2.
 *
 * A missing/blank tenantId never matches another missing/blank tenantId:
 * untenanted principals and untenanted records both yield zero results.
 */
export function filterByDataClass<T extends DataClassRecord>(
  records: readonly T[],
  principal: PrincipalContext,
): T[] {
  if (!isNonBlankTenantId(principal.tenantId) || !Array.isArray(principal.allowedDataClasses)) {
    return [];
  }

  return records.filter(
    (record) =>
      isNonBlankTenantId(record.tenantId) &&
      record.tenantId === principal.tenantId &&
      principal.allowedDataClasses.includes(record.dataClass),
  );
}
