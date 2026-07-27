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
  [
    'secret_assignment',
    /(?:^|[{\s,])["']?(?:API[_-]?KEY|PASSWORD|PASSWD|PWD|SECRET|CLIENT[_-]?SECRET|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|AUTH[_-]?TOKEN|TOKEN)["']?\s*[:=]\s*["']?[^\s"',}]{12,}/im,
  ],
  [
    'provider_token',
    /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[A-Za-z0-9_-]{30,}|sk-ant-[A-Za-z0-9_-]{20,})\b/,
  ],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
]);

export function findSyntheticPrivacyViolations(artifacts) {
  const violations = [];
  for (const { path, content } of artifacts) {
    for (const [category, pattern] of DISALLOWED_PATTERNS) {
      const match = content.match(pattern);
      if (match) violations.push({ path, category, match: '[REDACTED]' });
    }
  }
  return violations;
}
