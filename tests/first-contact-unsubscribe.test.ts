import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/api/first-contact/unsubscribe/route';
import { unsubscribeToken } from '../lib/first-contact-send';
test('GET is scanner-safe confirmation, without a database write or connection',async()=>{
  const previous=process.env.FIRST_CONTACT_HMAC_KEY;
  process.env.FIRST_CONTACT_HMAC_KEY='test-only';
  try {
    const h='a'.repeat(64), t=unsubscribeToken(h,'test-only');
    const response=await GET(new Request(`https://lims.bot/api/first-contact/unsubscribe?h=${h}&t=${t}`));
    assert.equal(response.status,200); const html=await response.text();
    assert.match(html,/method="post"/);assert.match(html,/Unsubscribe from/);assert.doesNotMatch(html,/Unsubscribed from/);
  } finally {if(previous===undefined)delete process.env.FIRST_CONTACT_HMAC_KEY;else process.env.FIRST_CONTACT_HMAC_KEY=previous;}
});
