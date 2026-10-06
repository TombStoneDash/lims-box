import test from 'node:test';
import assert from 'node:assert/strict';
import { ContactUnsubscribedError, maintainFirstContacts } from '../lib/first-contact-maintenance';
import { emailHmac } from '../lib/first-contact';
const email='test@example.test', key='test-key', hash=emailHmac(email,key)!;
test('only definite failed rows retry; pending/unresolved/sent never invoke resolver',async()=>{
  const retries:string[]=[],resolved:string[]=[];
  await maintainFirstContacts(['pending','unresolved','sent','failed'].map(outcome=>({email_hmac:hash,source_id:outcome,outcome})),{drafts:false,retry:true},{key, async markTerminal(){throw Error('unexpected terminal');},
    async resolveEmail(id){resolved.push(id);return email;},async writeDraft(){return true;},async markDrafted(){throw Error('not expected');},async retry(row){retries.push(row.outcome);}});
  assert.deepEqual(retries,['failed']); assert.deepEqual(resolved,['failed']);
});
test('draft is marked only after private artifact creation succeeds, never for existing file',async()=>{
  for(const written of [false,true]){
    let marked=0;
    await maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'draft_required'}],{drafts:true,retry:false},{key, async markTerminal(){throw Error('unexpected terminal');},
      async resolveEmail(){return email;},async writeDraft(){return written;},async markDrafted(){marked++;},async retry(){throw Error('no retry');}});
    assert.equal(marked,written?1:0);
  }
});
test('source changed address fails HMAC binding before private export or retry',async()=>{
  await assert.rejects(maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'failed'}],{drafts:true,retry:true},{key, async markTerminal(){throw Error('unexpected terminal');},
    async resolveEmail(){return 'different@example.test';},async writeDraft(){throw Error('not expected');},async markDrafted(){},async retry(){throw Error('not expected');}}),/binding mismatch/);
});


test('all state mixes and orders isolate source failures and attempt each identity once per run', async () => {
  // Exhaust every sequence up to length six: 1,093 cases, including empty,
  // all-blocked, leading/trailing failures, and every interleaving.
  for (let length = 0; length <= 6; length++) {
    for (let encoded = 0; encoded < 3 ** length; encoded++) {
      let digits = encoded;
      const states = Array.from({length}, () => {
        const state = ['healthy', 'unsubscribed', 'unavailable'][digits % 3];
        digits = Math.floor(digits / 3);
        return state;
      });
      const rows = states.map((_, i) => ({
        email_hmac: emailHmac(`test${i}@example.test`, key)!,
        source_id: String(i), outcome: 'failed',
      }));
      const expected = rows.filter((_, i) => states[i] === 'healthy').map(row => row.source_id);
      for (let run = 0; run < 2; run++) {
        const resolved: string[] = [], retried: string[] = [], terminal: string[] = [];
        // Duplicates also occur after other identities, not just adjacently.
        await maintainFirstContacts([...rows, ...rows.map(row => ({...row})).reverse()],
          {drafts:false, retry:true}, {
            key,
            async resolveEmail(id) {
              resolved.push(id);
              if (states[Number(id)] === 'unsubscribed') throw new ContactUnsubscribedError();
              if (states[Number(id)] === 'unavailable') throw Error('synthetic private error');
              return `test${id}@example.test`;
            },
            async markTerminal(row, outcome) {
              assert.equal(outcome, states[Number(row.source_id)]);
              rows[Number(row.source_id)].outcome = outcome;
              terminal.push(row.source_id);
            },
            async retry(row) { retried.push(row.source_id); },
            async writeDraft() { throw Error('unexpected draft'); },
            async markDrafted() { throw Error('unexpected draft'); },
          });
        assert.deepEqual(retried, expected);
        assert.equal(new Set(resolved).size, resolved.length);
        assert.equal(new Set(terminal).size, terminal.length);
        assert.equal(terminal.length, run === 0 ? length - expected.length : 0);
        assert.deepEqual(resolved, run === 0 ? rows.map(row => row.source_id) : expected);
      }
    }
  }
});

test('terminal persistence failure is surfaced rather than reported as successful maintenance', async () => {
  await assert.rejects(maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'failed'}],
    {drafts:false,retry:true}, {
      key, async resolveEmail(){throw Error('unavailable');},
      async markTerminal(){throw Error('terminal write failed');},
      async retry(){throw Error('unexpected retry');},
      async writeDraft(){return false;}, async markDrafted(){},
    }), /terminal write failed/);
});
