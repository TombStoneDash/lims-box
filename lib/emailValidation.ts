const LOCAL_PART_CHARS = /^[a-z0-9!#$%&'*+/=?^_`{|}~\p{L}\p{M}\p{N}-]+$/u;
const DOMAIN_LABEL = /^[\p{L}\p{M}\p{N}]([\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?$/u;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;

  const atIndex = email.indexOf('@');
  if (atIndex === -1 || atIndex !== email.lastIndexOf('@')) return null;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length === 0 || local.length > 64) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!local.split('.').every((part) => LOCAL_PART_CHARS.test(part))) return null;

  const labels = domain.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((label) => label.length > 0 && label.length <= 63 && DOMAIN_LABEL.test(label))) return null;

  return email;
}
