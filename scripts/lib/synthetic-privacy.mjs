export const SYNTHETIC_IDENTITY_ALLOWLIST = Object.freeze({
  sampleId: /^SYN-26\d{3}-\d{4}$/,
  customerId: /^SYN-CUST-\d{3}$/,
  resultId: /^SYN-RES-\d{5}$/,
  personnelId: /^SYN-STAFF-\d{3}$/,
  personnelName: /^Synthetic Staff \d{2}$/,
  authorizationId: /^SYN-AUTH-\d{3}$/,
  hl7SubjectId: /^SYNTHETIC-SUBJECT-\d{3}$/,
  hl7MessageId: /^SYN-MSG-\d{3}$/,
});

const DISALLOWED_PATTERNS = Object.freeze([
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/],
  ['phone', /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/],
  [
    'street_address',
    /\b\d{1,6}\s+[A-Z0-9.' -]+\s(?:STREET|ST|AVENUE|AVE|ROAD|RD|BOULEVARD|BLVD|LANE|LN|DRIVE|DR|COURT|CT|WAY)\b/i,
  ],
  ['medical_identity_label', /\b(?:MRN|MEDICAL RECORD(?: NUMBER)?|DOB|DATE OF BIRTH)\s*[:=|^-]+\s*\S+/i],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ['bearer_token', /\bBEARER\s+[A-Z0-9._~+/-]{12,}/i],
  ['secret_assignment', /\b(?:API[_-]?KEY|PASSWORD|SECRET|ACCESS[_-]?TOKEN)\s*[:=]\s*["']?[^\s"',}]{8,}/i],
]);

export function findSyntheticPrivacyViolations(artifacts) {
  const violations = [];
  for (const { path, content } of artifacts) {
    for (const [category, pattern] of DISALLOWED_PATTERNS) {
      const match = content.match(pattern);
      if (match) violations.push({ path, category, match: match[0] });
    }
  }
  return violations;
}
