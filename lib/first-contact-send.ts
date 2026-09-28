import { createHmac, timingSafeEqual } from 'node:crypto';
import { emailHmac, normalizeEmail, classifySendResult } from './first-contact';

export interface ContactStore {
  reserve(hmac: string): Promise<boolean>;
  finish(hmac: string, outcome: string, code: string | null, messageId: string | null): Promise<void>;
}
export function unsubscribeToken(hmac: string, key: string) {
  return createHmac('sha256', key).update(`unsubscribe/lims/${hmac}`).digest('hex');
}
export function validUnsubscribe(hmac: string, token: string, key: string) {
  return /^[a-f0-9]{64}$/.test(hmac) && /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(unsubscribeToken(hmac, key)));
}
export function sendBlockers(env: Record<string, string | undefined>): string[] {
  const required = ['FIRST_CONTACT_HMAC_KEY', 'FIRST_CONTACT_POSTAL_ADDRESS', 'RESEND_API_KEY'];
  return [
    ...(env.FIRST_CONTACT_EMAIL_ENABLED === 'true' ? [] : ['FLAG_OFF']),
    ...(!env.FIRST_CONTACT_SCOPE || env.FIRST_CONTACT_SCOPE === 'per-product' ? [] : ['CROSS_PRODUCT_UNSUPPORTED']),
    ...required.filter(k => !env[k]?.trim()),
    ...['FIRST_CONTACT_COPY_APPROVED', 'FIRST_CONTACT_DOMAIN_VERIFIED', 'FIRST_CONTACT_QUOTA_APPROVED', 'FIRST_CONTACT_SCHEMA_READY'].filter(k => env[k] !== 'true'),
  ];
}
/** No retries: pending, unresolved and even rejected reservations require operator reconciliation. */
export async function sendFirstContact(input: {
  email: string; known: boolean; covered?: boolean; env: Record<string, string | undefined>;
  store: ContactStore; fetcher?: typeof fetch;
}) {
  const { env, store } = input;
  if (sendBlockers(env).length) return 'disabled';
  const key = env.FIRST_CONTACT_HMAC_KEY!;
  const hmac = emailHmac(input.email, key)!;
  const known = new Set((env.FIRST_CONTACT_KNOWN_HMACS ?? '').split(',').map(x => x.trim()));
  const notable = new Set((env.FIRST_CONTACT_NOTABLE_HMACS ?? '').split(',').map(x => x.trim()));
  const domains = new Set((env.FIRST_CONTACT_NOTABLE_DOMAINS ?? '').toLowerCase().split(',').map(x => x.trim()));
  if (!(await store.reserve(hmac))) return 'already_logged';
  const suppressed = input.covered ? 'covered_by_transactional' :
    notable.has(hmac) || domains.has(normalizeEmail(input.email).split('@')[1]) ? 'draft_required' :
    input.known || known.has(hmac) ? 'skipped_known' : null;
  if (suppressed) {
    await store.finish(hmac, suppressed, null, null);
    return suppressed;
  }
  const url = `https://lims.bot/api/first-contact/unsubscribe?h=${hmac}&t=${unsubscribeToken(hmac, key)}`;
  const text = `You're on the LIMS BOX newsletter list. We'll email you product updates when they're ready.\n\nExplore LIMS BOX: https://lims.bot\n\nUnsubscribe: ${url}\n${env.FIRST_CONTACT_POSTAL_ADDRESS!.trim()}`;
  let outcome = 'unresolved', code: string | null = 'UNRESOLVED_SEND', id: string | null = null;
  try {
    const response = await (input.fetcher ?? fetch)('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `first-contact/lims/${hmac}` },
      body: JSON.stringify({ from: 'LIMS BOX <info@lims.bot>', to: [normalizeEmail(input.email)], subject: "You're on the LIMS BOX list", text,
        headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
    });
    const body = await response.json().catch(() => null);
    id = response.ok && typeof body?.id === 'string' ? body.id : null;
    // Never copy provider text, which can include recipient data, into the receipt.
    outcome = classifySendResult({ status: response.status, messageId: id });
    code = outcome === 'sent' ? null : outcome === 'unresolved' ? 'UNRESOLVED_SEND' : `HTTP_${response.status}`;
  } catch { /* A transport failure may already have delivered: never retry. */ }
  await store.finish(hmac, outcome, code, id);
  return outcome;
}
