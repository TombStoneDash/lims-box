const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const email = value.trim().toLowerCase();
  return EMAIL_REGEX.test(email) ? email : null;
}
