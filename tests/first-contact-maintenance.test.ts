import test from 'node:test';
import assert from 'node:assert/strict';
import { maintainFirstContacts, UnsubscribedContactError, type MaintenanceRow } from '../lib/first-contact-maintenance';
import { emailHmac } from '../lib/first-contact';
const email='test@example.test', key='test-key', hash=emailHmac(email,key)!;
test('only definite failed rows retry; pending/unresolved/sent never invoke resolver',async()=>{
  const retries:string[]=[],resolved:string[]=[];
  await maintainFirstContacts(['pending','unresolved','sent','failed'].map(outcome=>({email_hmac:hash,source_id:outcome,outcome})),{drafts:false,retry:true},{key,
    async markTerminal(){throw Error("not expected");},
    async resolveEmail(id){resolved.push(id);return email;},async writeDraft(){return true;},async markDrafted(){throw Error('not expected');},async retry(row){retries.push(row.outcome);}});
  assert.deepEqual(retries,['failed']); assert.deepEqual(resolved,['failed']);
});
test('draft is marked only after private artifact creation succeeds, never for existing file',async()=>{
  for(const written of [false,true]){
    let marked=0;
    await maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'draft_required'}],{drafts:true,retry:false},{key,
    async markTerminal(){throw Error("not expected");},
      async resolveEmail(){return email;},async writeDraft(){return written;},async markDrafted(){marked++;},async retry(){throw Error('no retry');}});
    assert.equal(marked,written?1:0);
  }
});
test('source changed address fails HMAC binding before private export or retry',async()=>{
  await assert.rejects(maintainFirstContacts([{email_hmac:hash,source_id:'id',outcome:'failed'}],{drafts:true,retry:true},{key,
    async markTerminal(){throw Error("not expected");},
    async resolveEmail(){return 'different@example.test';},async writeDraft(){throw Error('not expected');},async markDrafted(){},async retry(){throw Error('not expected');}}),/binding mismatch/);
});

// Exhaust all 1,093 sequences of length 0..6, then replay each snapshot with duplicates.
test('every ordering of healthy/unsubscribed/unavailable sources retries each healthy row exactly once', async () => {
  const kinds = ['healthy', 'unsubscribed', 'unavailable'] as const;
  for (let length = 0; length <= 6; length++) {
    for (let pattern = 0; pattern < 3 ** length; pattern++) {
      const states = Array.from({ length }, (_, i) => kinds[Math.floor(pattern / 3 ** i) % 3]);
      const rows: MaintenanceRow[] = states.map((_, i) => ({
        email_hmac: emailHmac(`contact${i}@example.test`, key)!, source_id: String(i), outcome: 'failed',
      }));
      const resolved: string[] = [], retried: string[] = [];
      const terminal = new Map<string, string>();
      const deps = {
        key,
        async resolveEmail(id: string) {
          resolved.push(id);
          if (states[Number(id)] === 'unsubscribed') throw new UnsubscribedContactError();
          if (states[Number(id)] === 'unavailable') throw Error('private provider error');
          return `contact${id}@example.test`;
        },
        async markTerminal(row: MaintenanceRow, outcome: string) {
          assert.ok(!terminal.has(row.source_id));
          terminal.set(row.source_id, outcome);
          row.outcome = outcome;
        },
        async retry(row: MaintenanceRow) { retried.push(row.source_id); },
        async writeDraft() { throw Error('unexpected draft'); },
        async markDrafted() { throw Error('unexpected draft'); },
      };
      // Include separate objects, not just repeated references, for stale snapshot duplicates.
      const snapshot = [...rows, ...rows.map(row => ({ ...row })).reverse()];
      await maintainFirstContacts(snapshot, { drafts: false, retry: true }, deps);
      const healthy = rows.filter((_, i) => states[i] === 'healthy').map(row => row.source_id);
      assert.deepEqual(retried, healthy, JSON.stringify(states));
      assert.deepEqual(resolved, rows.map(row => row.source_id));
      assert.deepEqual([...terminal], rows.filter((_, i) => states[i] !== 'healthy').map(row => [row.source_id, states[Number(row.source_id)]]));
      resolved.length = 0; retried.length = 0;
      await maintainFirstContacts(rows, { drafts: false, retry: true }, deps);
      assert.deepEqual(resolved, healthy, 'terminal rows must never be resolved again');
      assert.deepEqual(retried, healthy);
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
