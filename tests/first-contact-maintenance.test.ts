import test from 'node:test';
import assert from 'node:assert/strict';
import { ContactSourceError, maintainFirstContacts } from '../lib/first-contact-maintenance';
import { emailHmac } from '../lib/first-contact';
const email='test@example.test', key='test-key', hash=emailHmac(email,key)!;
test('only definite failed rows retry; pending/unresolved/sent never invoke resolver',async()=>{
  const retries:string[]=[],resolved:string[]=[];
  await maintainFirstContacts(['pending','unresolved','sent','failed'].map(outcome=>({email_hmac:hash,source_id:outcome,outcome})),{drafts:false,retry:true},{key, async markTerminal(){throw Error('not expected');},
    async resolveEmail(id){resolved.push(id);return email;},async writeDraft(){return true;},async markDrafted(){throw Error('not expected');},async retry(row){retries.push(row.outcome);}});
  assert.deepEqual(retries,['failed']); assert.deepEqual(resolved,['failed']);
});
test('draft is marked only after private artifact creation succeeds, never for existing file',async()=>{
  for(const written of [false,true]){
    let marked=0;
    await maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'draft_required'}],{drafts:true,retry:false},{key, async markTerminal(){throw Error('not expected');},
      async resolveEmail(){return email;},async writeDraft(){return written;},async markDrafted(){marked++;},async retry(){throw Error('no retry');}});
    assert.equal(marked,written?1:0);
  }
});
test('source changed address fails HMAC binding before private export or retry',async()=>{
  await assert.rejects(maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'failed'}],{drafts:true,retry:true},{key, async markTerminal(){throw Error('not expected');},
    async resolveEmail(){return 'different@example.test';},async writeDraft(){throw Error('not expected');},async markDrafted(){},async retry(){throw Error('not expected');}}),/binding mismatch/);
});


test('all ordered source-state mixtures retry every healthy row once and terminalize failures', async () => {
  // Exhaust all 3^n ordered mixtures up to length five, with duplicate snapshot rows.
  for (let length = 0; length <= 5; length++) {
    for (let pattern = 0; pattern < 3 ** length; pattern++) {
      const states = Array.from({ length }, (_, i) => ['healthy', 'unsubscribed', 'unavailable'][Math.floor(pattern / 3 ** i) % 3]);
      const rows = states.map((_, i) => ({ email_hmac: emailHmac(`row${i}@example.test`, key)!, source_id: String(i), outcome: 'failed' }));
      const attempted: string[] = [], resolved: string[] = [], terminal: string[] = [];
      const deps = { key,
        async resolveEmail(id: string) {
          resolved.push(id);
          const state = states[Number(id)];
          if (state === 'unsubscribed') throw new ContactSourceError('unsubscribed');
          if (state === 'unavailable') throw Error('Synthetic transport failure');
          return `row${id}@example.test`;
        },
        async markTerminal(row: typeof rows[number], outcome: string) {
          assert.equal(outcome, states[Number(row.source_id)]);
          terminal.push(row.source_id); row.outcome = outcome;
        },
        async retry(row: typeof rows[number]) { attempted.push(row.source_id); },
        async writeDraft() { throw Error('unexpected draft'); }, async markDrafted() {},
      };
      const snapshot = rows.flatMap(row => [row, { ...row }]);
      await maintainFirstContacts(snapshot, { drafts: false, retry: true }, deps);
      assert.deepEqual(attempted, rows.filter((_, i) => states[i] === 'healthy').map(row => row.source_id));
      assert.equal(new Set(attempted).size, attempted.length);
      assert.equal(resolved.length, length);
      assert.equal(terminal.length, states.filter(state => state !== 'healthy').length);
      // Terminal rows stay excluded on the next snapshot; still-failed healthy rows get one new attempt.
      attempted.length = 0; resolved.length = 0;
      await maintainFirstContacts(rows, { drafts: false, retry: true }, deps);
      assert.deepEqual(attempted, rows.filter((_, i) => states[i] === 'healthy').map(row => row.source_id));
      assert.deepEqual(resolved, attempted);
    }
  }
});

test('terminal persistence failures remain visible and do not silently report success', async () => {
  await assert.rejects(maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'failed'}], {drafts:false,retry:true}, {
    key, async resolveEmail(){throw new ContactSourceError('unsubscribed');},
    async markTerminal(){throw Error('storage unavailable');},
    async writeDraft(){return false;}, async markDrafted(){}, async retry(){throw Error('unexpected retry');},
  }), /storage unavailable/);
});
