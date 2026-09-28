import test from 'node:test';
import assert from 'node:assert/strict';
import { sendFirstContact, sendBlockers, validUnsubscribe, unsubscribeToken, type ContactStore } from '../lib/first-contact-send';
const env = { FIRST_CONTACT_EMAIL_ENABLED:'true', FIRST_CONTACT_HMAC_KEY:'test-only-key', FIRST_CONTACT_POSTAL_ADDRESS:'Test address', RESEND_API_KEY:'test-only', FIRST_CONTACT_COPY_APPROVED:'true', FIRST_CONTACT_DOMAIN_VERIFIED:'true', FIRST_CONTACT_QUOTA_APPROVED:'true', FIRST_CONTACT_SCHEMA_READY:'true' };
function fixture() {
  const rows = new Map<string, {outcome:string;code:string|null;id:string|null}>();
  const store: ContactStore = {
    async reserve(h) { if(rows.has(h)) return false; rows.set(h,{outcome:'pending',code:null,id:null}); return true; },
    async finish(h,outcome,code,id) {rows.set(h,{outcome,code,id});},
  };
  let calls=0; const bodies: any[]=[];
  const fetcher = (async (_url,init) => {calls++; bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({id:'mock-message'}),{status:200});}) as typeof fetch;
  return {store,rows,fetcher,bodies,calls:()=>calls};
}
test('default off, each activation gate missing prevents both reservation and send',async()=>{
  assert.ok(sendBlockers({}).includes('FLAG_OFF'));
  for(const key of Object.keys(env)) {
    const f=fixture(); const missing:any={...env}; delete missing[key];
    assert.equal(await sendFirstContact({email:'person@example.test',known:false,env:missing,...f}),'disabled');
    assert.equal(f.rows.size,0); assert.equal(f.calls(),0);
  }
  assert.ok(sendBlockers({...env,FIRST_CONTACT_SCOPE:'cross-product'}).includes('CROSS_PRODUCT_UNSUPPORTED'));
});
test('concurrent inbound requests reserve once, receipt is HMAC-only, footer/unsubscribe present',async()=>{
  const f=fixture(); const input={email:' Person+tag@Example.test ',known:false,env,...f};
  const outcomes=await Promise.all([sendFirstContact(input),sendFirstContact(input)]);
  assert.deepEqual(outcomes.sort(),['already_logged','sent']); assert.equal(f.calls(),1);
  assert.match([...f.rows.keys()][0],/^[a-f0-9]{64}$/); assert.ok(!JSON.stringify([...f.rows]).includes('person'));
  assert.match(f.bodies[0].text,/Test address/); assert.equal(f.bodies[0].headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
});
test('known, notable and transactional contacts never get additional email',async()=>{
  for(const opts of [{known:true},{known:false,covered:true},{known:false,env:{...env,FIRST_CONTACT_NOTABLE_DOMAINS:'example.test'}}]){
    const f=fixture(); const outcome=await sendFirstContact({email:'person@example.test',env,...f,...opts});
    assert.ok(['skipped_known','covered_by_transactional','draft_required'].includes(outcome)); assert.equal(f.calls(),0);
  }
});
test('ambiguous provider outcomes and persisted pending never retry',async()=>{
  for(const fetcher of [(async()=>{throw Error('mock timeout')}) as typeof fetch,(async()=>new Response('{}',{status:500})) as typeof fetch]){
    const f=fixture(); const input={email:'person@example.test',known:false,env,...f,fetcher};
    assert.equal(await sendFirstContact(input),'unresolved'); assert.equal(await sendFirstContact(input),'already_logged');
  }
  const f=fixture(); f.store.finish=async()=>{throw Error('mock storage failure')};
  const input={email:'person@example.test',known:false,env,...f};
  await assert.rejects(sendFirstContact(input)); assert.equal(await sendFirstContact(input),'already_logged'); assert.equal(f.calls(),1);
});
test('signed unsubscribe rejects tampering',()=>{
  const h='a'.repeat(64), token=unsubscribeToken(h,'key');
  assert.equal(validUnsubscribe(h,token,'key'),true); assert.equal(validUnsubscribe('b'.repeat(64),token,'key'),false);
});

test('source identifier accompanies atomic reservation without recipient plaintext',async()=>{
  const f=fixture(); let source:string|undefined;
  const original=f.store.reserve;
  f.store.reserve=async(h,id)=>{source=id;return original(h,id);};
  await sendFirstContact({email:'person@example.test',sourceId:'contact-id',known:false,env,...f});
  assert.equal(source,'contact-id');
});
test('permanent recipient rejection requires a draft, definite quota rejection records failed',async()=>{
  for(const [name,status,expected] of [['invalid_recipient',422,'draft_required'],['rate_limit_exceeded',429,'failed']] as const){
    const f=fixture();const fetcher=(async()=>new Response(JSON.stringify({name}),{status})) as typeof fetch;
    assert.equal(await sendFirstContact({email:'person@example.test',known:false,env,...f,fetcher}),expected);
  }
});
test('contact acknowledgement uses contact copy and source binding, not newsletter copy',async()=>{
  const f=fixture();let kind:string|undefined;
  const original=f.store.reserve;
  f.store.reserve=async(h,id,k)=>{kind=k;return original(h,id,k);};
  assert.equal(await sendFirstContact({email:'person@example.test',sourceKind:'contact',sourceId:'contact-row-id',known:false,env,...f}),'sent');
  assert.equal(kind,'contact');assert.equal(f.bodies[0].subject,'We received your LIMS BOX request');
  assert.match(f.bodies[0].text,/received your lab's request/);assert.doesNotMatch(f.bodies[0].text,/newsletter|product updates/);
});
