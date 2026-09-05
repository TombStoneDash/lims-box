import { createHash } from 'node:crypto';

export interface AppliedImportRecord {
  sourceRecordId: string;
  newValueFingerprint: string;
}

export function resultFingerprint(sampleId: string, analysisKeyword: string, rawResult: string, unit: string): string {
  return createHash('sha256').update(`${sampleId}\0${analysisKeyword}\0${rawResult}\0${unit}`).digest('hex');
}

// Mirrors the established importer's duplicate rule. This module does not
// write results; it makes the shared exactly-once contract explicit to the UI.
export function classifyReplay(existing: AppliedImportRecord | undefined, sourceRecordId: string, newValueFingerprint: string): 'new' | 'unchanged' | 'quarantined' {
  if (!existing) return 'new';
  if (existing.sourceRecordId !== sourceRecordId) return 'quarantined';
  return existing.newValueFingerprint === newValueFingerprint ? 'unchanged' : 'quarantined';
}
