const LOCAL_PART_REGEX = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function isValidLocalPart(local: string): boolean {
  if (local.length === 0 || local.length > 64) return false;
  if (!LOCAL_PART_REGEX.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (local.includes('..')) return false;
  return true;
}

function isValidDomain(domain: string): boolean {
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  return labels.every(
    (label) => label.length > 0 && label.length <= 63 && DOMAIN_LABEL_REGEX.test(label),
  );
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;

  const parts = email.split('@');
  if (parts.length !== 2) return null;

  const [local, domain] = parts;
  if (!isValidLocalPart(local) || !isValidDomain(domain)) return null;

  return email;
}
