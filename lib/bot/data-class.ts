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

/**
 * Filters records to only those the principal is allowed to read.
 * The decision is driven entirely by `principal.allowedDataClasses` and the
 * record's own `tenantId`/`dataClass` fields. No other field on the record
 * (a spoofed override, a requested class, in-band instruction text, etc.)
 * can influence the outcome, per spec 7.8 rule 2.
 */
export function filterByDataClass<T extends DataClassRecord>(
  records: readonly T[],
  principal: PrincipalContext,
): T[] {
  return records.filter(
    (record) => record.tenantId === principal.tenantId && principal.allowedDataClasses.includes(record.dataClass),
  );
}
