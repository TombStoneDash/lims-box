import { normalizeEmail } from '@/lib/emailValidation';

export type ContactSubmission = {
  name: string;
  labName: string;
  email: string;
  labSize: string | null;
  currentSystem: string | null;
  message: string | null;
  phone: string | null;
  instruments: string | null;
};

export type NormalizeContactSubmissionResult =
  | { ok: true; record: ContactSubmission }
  | { ok: false; error: string };

export function normalizeContactSubmission(body: unknown): NormalizeContactSubmissionResult {
  const { name, labName, email, labSize, currentSystem, message, phone, instruments } =
    (body as Record<string, unknown>) ?? {};

  const trimmedName = name ? String(name).trim() : '';
  const trimmedLabName = labName ? String(labName).trim() : '';
  const normalizedEmail = normalizeEmail(email);

  if (!trimmedName || !trimmedLabName || !normalizedEmail) {
    return { ok: false, error: 'Name, valid email, and lab name are required' };
  }

  return {
    ok: true,
    record: {
      name: trimmedName,
      labName: trimmedLabName,
      email: normalizedEmail,
      labSize: labSize ? String(labSize).trim() : null,
      currentSystem: currentSystem ? String(currentSystem).trim() : null,
      message: message ? String(message).trim() : null,
      phone: phone ? String(phone).trim() : null,
      instruments: instruments ? String(instruments).trim() : null,
    },
  };
}
