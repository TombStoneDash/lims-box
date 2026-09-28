import { prisma } from './prisma';
import type { ContactStore } from './first-contact-send';
export const firstContactStore: ContactStore = {
  async reserve(hmac) {
    const rows = await prisma.$queryRaw<{ email_hmac: string }[]>`
      INSERT INTO first_contact_log (product,email_hmac,outcome,attempts)
      VALUES ('lims',${hmac},'pending',1) ON CONFLICT (product,email_hmac) DO NOTHING RETURNING email_hmac`;
    return rows.length === 1;
  },
  async finish(hmac, outcome, code, messageId) {
    await prisma.$executeRaw`UPDATE first_contact_log SET outcome=${outcome},last_error_code=${code},provider_message_id=${messageId},updated_at=now()
      WHERE product='lims' AND email_hmac=${hmac} AND outcome='pending'`;
  },
};
export async function suppressFirstContact(hmac: string) {
  await prisma.$executeRaw`INSERT INTO first_contact_log(product,email_hmac,outcome,attempts)
    VALUES('lims',${hmac},'unsubscribed',0) ON CONFLICT(product,email_hmac)
    DO UPDATE SET unsubscribed_at=now(),updated_at=now()`;
}
