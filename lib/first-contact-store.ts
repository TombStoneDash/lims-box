import { prisma } from './prisma';
import type { ContactStore } from './first-contact-send';
export function makeFirstContactStore(retry = false): ContactStore { return {
  async reserve(hmac, sourceId, sourceKind = 'newsletter') {
    if (retry) {
      const rows = await prisma.$queryRaw<{ email_hmac: string }[]>`
        UPDATE first_contact_log SET outcome='pending',attempts=attempts+1,updated_at=now()
        WHERE product='lims' AND email_hmac=${hmac} AND source_id=${sourceId ?? null} AND source_kind=${sourceKind}
          AND outcome='failed' AND attempts < 3 AND unsubscribed_at IS NULL
          AND updated_at <= now() - interval '24 hours' RETURNING email_hmac`;
      return rows.length === 1;
    }
    const rows = await prisma.$queryRaw<{ email_hmac: string }[]>`
      INSERT INTO first_contact_log (product,email_hmac,outcome,attempts,source_id,source_kind)
      VALUES ('lims',${hmac},'pending',1,${sourceId ?? null},${sourceKind}) ON CONFLICT (product,email_hmac) DO NOTHING RETURNING email_hmac`;
    return rows.length === 1;
  },
  async finish(hmac, outcome, code, messageId) {
    await prisma.$executeRaw`UPDATE first_contact_log SET outcome=${outcome},last_error_code=${code},provider_message_id=${messageId},updated_at=now()
      WHERE product='lims' AND email_hmac=${hmac} AND outcome='pending'`;
  },
}; }
export const firstContactStore = makeFirstContactStore();
export async function suppressFirstContact(hmac: string) {
  await prisma.$executeRaw`INSERT INTO first_contact_log(product,email_hmac,outcome,attempts)
    VALUES('lims',${hmac},'unsubscribed',0) ON CONFLICT(product,email_hmac)
    DO UPDATE SET unsubscribed_at=now(),updated_at=now()`;
}

// Record only an observable accepted applicant confirmation; never invoke a sender.
export async function recordAcceptedTransactional(email: string) {
  const key = process.env.FIRST_CONTACT_HMAC_KEY;
  if (process.env.FIRST_CONTACT_EMAIL_ENABLED !== 'true' || process.env.FIRST_CONTACT_SCHEMA_READY !== 'true' || !key) return;
  const { emailHmac } = await import('./first-contact');
  const hmac = emailHmac(email, key)!;
  await prisma.$executeRaw`INSERT INTO first_contact_log(product,email_hmac,outcome,attempts)
    VALUES('lims',${hmac},'covered_by_transactional',0) ON CONFLICT(product,email_hmac) DO NOTHING`;
}
