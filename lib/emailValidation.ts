const LOCAL_PART_REGEX = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LABEL_LENGTH = 63;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex === email.length - 1) return null;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (localPart.length > MAX_LOCAL_PART_LENGTH || !LOCAL_PART_REGEX.test(localPart)) {
    return null;
  }

  const labels = domain.split('.');
  if (labels.length < 2) return null;

  for (const label of labels) {
    if (
      label.length === 0 ||
      label.length > MAX_DOMAIN_LABEL_LENGTH ||
      !DOMAIN_LABEL_REGEX.test(label)
    ) {
      return null;
    }
  }

  return email;
}
