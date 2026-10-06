import test from 'node:test';
import assert from 'node:assert/strict';
import { maintainFirstContacts } from '../lib/first-contact-maintenance';
import { emailHmac } from '../lib/first-contact';
const email='test@example.test', key='test-key', hash=emailHmac(email,key)!;
test('only definite failed rows retry; pending/unresolved/sent never invoke resolver',async()=>{
  const retries:string[]=[],resolved:string[]=[];
  await maintainFirstContacts(['pending','unresolved','sent','failed'].map(outcome=>({email_hmac:hash,source_id:outcome,outcome})),{drafts:false,retry:true},{key,
    async resolveEmail(id){resolved.push(id);return email;},async writeDraft(){return true;},async markDrafted(){throw Error('not expected');},async retry(row){retries.push(row.outcome);}});
  assert.deepEqual(retries,['failed']); assert.deepEqual(resolved,['failed']);
});
test('draft is marked only after private artifact creation succeeds, never for existing file',async()=>{
  for(const written of [false,true]){
    let marked=0;
    await maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'draft_required'}],{drafts:true,retry:false},{key,
      async resolveEmail(){return email;},async writeDraft(){return written;},async markDrafted(){marked++;},async retry(){throw Error('no retry');}});
    assert.equal(marked,written?1:0);
  }
});
test('source changed address fails HMAC binding before private export or retry',async()=>{
  await assert.rejects(maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'failed'}],{drafts:true,retry:true},{key,
    async resolveEmail(){return 'different@example.test';},async writeDraft(){throw Error('not expected');},async markDrafted(){},async retry(){throw Error('not expected');}}),/binding mismatch/);
});
