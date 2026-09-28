// Main-owned, explicit offline maintenance only. Never schedule before own-address verification.
import { mkdir, writeFile } from 'node:fs/promises';
import { limsPriorContact } from '../lib/first-contact-lims';
import { limsHistorySources } from '../lib/first-contact-lims-sources';
import { prisma } from '../lib/prisma';
import { maintainFirstContacts, type MaintenanceRow } from '../lib/first-contact-maintenance';
import { makeFirstContactStore } from '../lib/first-contact-store';
import { sendBlockers, sendFirstContact } from '../lib/first-contact-send';
export async function runMaintenance(options:string[]) {
  if(options.some(a=>!['--export-drafts','--retry-failed'].includes(a))) throw Error('Unknown argument');
  const drafts=options.includes('--export-drafts'), retry=options.includes('--retry-failed');
  const key=process.env.FIRST_CONTACT_HMAC_KEY, apiKey=process.env.RESEND_API_KEY;
  if(!key || !apiKey) throw Error('Missing private source configuration');
  if(retry && sendBlockers(process.env).length) throw Error('Sending gates not satisfied');
  if(drafts || retry) {
    await prisma.$executeRaw`UPDATE first_contact_log SET outcome='unresolved',last_error_code='UNRESOLVED_PENDING',updated_at=now()
      WHERE product='lims' AND outcome='pending' AND updated_at <= now() - interval '24 hours'`;
    await prisma.$executeRaw`UPDATE first_contact_log SET outcome='draft_required',updated_at=now()
      WHERE product='lims' AND outcome='failed' AND attempts >= 3`;
  }
  const rows=await prisma.$queryRaw<MaintenanceRow[]>`SELECT email_hmac,source_id,outcome FROM first_contact_log
    WHERE product='lims' AND outcome IN ('failed','draft_required') AND source_id IS NOT NULL AND unsubscribed_at IS NULL ORDER BY updated_at LIMIT 100`;
  if(drafts || retry) await maintainFirstContacts(rows,{drafts,retry},{key,
    async resolveEmail(id) {
      const r=await fetch(`https://api.resend.com/contacts/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(5000)});
      if(!r.ok) throw Error('Private source unavailable');
      const body=await r.json();
      if(typeof body.email!=='string' || body.unsubscribed===true) throw Error('Source unavailable or unsubscribed');
      return body.email;
    },
    async writeDraft(hmac,email) {
      const dir='/Users/ops/Hermes/outbox/drafts/first-contact';
      await mkdir(dir,{recursive:true,mode:0o700});
      try { await writeFile(`${dir}/lims-${hmac}.md`,`---\nproduct: lims\nemail_hmac: ${hmac}\nhandled: false\n---\n\nRecipient: ${email.replace(/[\r\n]/g,'')}\nSource: newsletter\n\nSuggested reply: You're on the LIMS BOX newsletter list. Explore LIMS BOX: https://lims.bot\n`,{flag:'wx',mode:0o600}); return true; }
      catch(e) {if((e as NodeJS.ErrnoException).code==='EEXIST') return false; throw e;}
    },
    async markDrafted(hmac) {await prisma.$executeRaw`UPDATE first_contact_log SET outcome='drafted_for_hudson',updated_at=now() WHERE product='lims' AND email_hmac=${hmac} AND outcome='draft_required'`;},
    async retry(row,email) {
      // Do not suppress because enrollment itself is now historical. Recheck
      // correspondence/notable lists in the sender and Resend unsubscribe above.
      const sources=limsHistorySources();
      if(!sources.countEarlyAccessBefore) throw Error('History unavailable');
      const known=await limsPriorContact(sources,email,new Date());
      await sendFirstContact({email,sourceId:row.source_id,known,env:process.env,store:makeFirstContactStore(true)});
    },
  });
  console.log(JSON.stringify({event:'first_contact_maintenance',eligible:rows.length,write:drafts||retry}));
}
if(process.argv[1]?.endsWith('first-contact-maintenance.ts')) runMaintenance(process.argv.slice(2)).catch(()=>{console.error('First-contact maintenance failed; inspect private state');process.exitCode=1}).finally(()=>prisma.$disconnect());
