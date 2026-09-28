import { validUnsubscribe } from '@/lib/first-contact-send';
import { suppressFirstContact } from '@/lib/first-contact-store';
export const runtime = 'nodejs';
async function unsubscribe(req: Request) {
  const url = new URL(req.url), key = process.env.FIRST_CONTACT_HMAC_KEY;
  const hmac = url.searchParams.get('h') ?? '', token = url.searchParams.get('t') ?? '';
  if (!key || !validUnsubscribe(hmac, token, key)) return new Response('Invalid link', { status: 400 });
  try { await suppressFirstContact(hmac); return new Response('Unsubscribed from LIMS BOX first-contact email.'); }
  catch { return new Response('Please try again later.', { status: 503 }); }
}
export const POST = unsubscribe;
export const GET = unsubscribe;
