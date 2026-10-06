// Main-owned, explicit offline maintenance only. Never schedule before own-address verification.
import { mkdir, writeFile } from 'node:fs/promises';
import { limsPriorContact } from '../lib/first-contact-lims';
import { limsHistorySources } from '../lib/first-contact-lims-sources';
import { getSupabase } from '../lib/supabase';
import { prisma } from '../lib/prisma';
import { ContactSourceError, maintainFirstContacts, type MaintenanceRow } from '../lib/first-contact-maintenance';
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
  // Bound each enabled outcome separately so an untouched draft backlog cannot
  // consume the retry batch (or vice versa).
  const rows:MaintenanceRow[]=[];
  if(drafts) rows.push(...await prisma.$queryRaw<MaintenanceRow[]>`SELECT email_hmac,source_id,source_kind,outcome FROM first_contact_log
    WHERE product='lims' AND outcome='draft_required' AND source_id IS NOT NULL AND unsubscribed_at IS NULL ORDER BY updated_at LIMIT 100`);
  if(retry) rows.push(...await prisma.$queryRaw<MaintenanceRow[]>`SELECT email_hmac,source_id,source_kind,outcome FROM first_contact_log
    WHERE product='lims' AND outcome='failed' AND attempts < 3 AND updated_at <= now() - interval '24 hours'
      AND source_id IS NOT NULL AND unsubscribed_at IS NULL ORDER BY updated_at LIMIT 100`);
  if(drafts || retry) await maintainFirstContacts(rows,{drafts,retry},{key,
    async resolveEmail(id,row) {
      if(row.source_kind==='contact') {
        const client=getSupabase(); if(!client) throw Error('Private source unavailable');
        const {data,error}=await client.from('limsbox_early_access').select('email').eq('id',id).single();
        if(error || typeof data?.email!=='string') throw Error('Private source unavailable');
        return data.email;
      }
      const r=await fetch(`https://api.resend.com/contacts/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(5000)});
      if(!r.ok) throw Error('Private source unavailable');
      const body=await r.json();
      if(body?.unsubscribed===true) throw new ContactSourceError('unsubscribed');
      if(typeof body?.email!=='string' || !body.email.trim()) throw new ContactSourceError('unavailable');
      return body.email;
    },
    async writeDraft(hmac,email,row) {
      let details='';
      if(row.source_kind==='contact') {
        const client=getSupabase(); if(!client) throw Error('Private source unavailable');
        const {data,error}=await client.from('limsbox_early_access').select('name,pain_point').eq('id',row.source_id).single();
        if(error || !data) throw Error('Private source unavailable');
        details=`\nName: ${String(data.name ?? '')}\nMessage: ${String(data.pain_point ?? '')}\n`;
      }
      const dir='/Users/ops/Hermes/outbox/drafts/first-contact';
      await mkdir(dir,{recursive:true,mode:0o700});
      try { await writeFile(`${dir}/lims-${hmac}.md`,`---\nproduct: lims\nemail_hmac: ${hmac}\nhandled: false\n---\n\n${details}Recipient: ${email.replace(/[\r\n]/g,'')}\nSource: ${row.source_kind ?? 'newsletter'}\n\nSuggested reply: ${row.source_kind==='contact'?"Thanks for contacting LIMS BOX. We've received your lab's request.":"You're on the LIMS BOX newsletter list."} Explore LIMS BOX: https://lims.bot\n`,{flag:'wx',mode:0o600}); return true; }
      catch(e) {if((e as NodeJS.ErrnoException).code==='EEXIST') return false; throw e;}
    },
    async markTerminal(row,outcome) {
      await prisma.$executeRaw`UPDATE first_contact_log SET outcome=${outcome},
        unsubscribed_at=CASE WHEN ${outcome}='unsubscribed' THEN now() ELSE unsubscribed_at END,updated_at=now()
        WHERE product='lims' AND email_hmac=${row.email_hmac} AND source_id=${row.source_id}
          AND source_kind=${row.source_kind ?? 'newsletter'} AND outcome=${row.outcome}`;
    },
    async markDrafted(hmac) {await prisma.$executeRaw`UPDATE first_contact_log SET outcome='drafted_for_hudson',updated_at=now() WHERE product='lims' AND email_hmac=${hmac} AND outcome='draft_required'`;},
    async retry(row,email) {
      // Do not suppress because enrollment itself is now historical. Recheck
      // correspondence/notable lists in the sender and Resend unsubscribe above.
      const sources=limsHistorySources();
      if(!sources.countEarlyAccessBefore) throw Error('History unavailable');
      let before=new Date();
      if(row.source_kind==='contact') {
        const client=getSupabase(); if(!client) throw Error('Private source unavailable');
        const {data,error}=await client.from('limsbox_early_access').select('created_at').eq('id',row.source_id).single();
        if(error || !data?.created_at || !Number.isFinite(Date.parse(data.created_at))) throw Error('Source timestamp unavailable');
        before=new Date(data.created_at);
      }
      const known=await limsPriorContact(sources,email,before);
      await sendFirstContact({email,sourceId:row.source_id,sourceKind:row.source_kind,known,env:process.env,store:makeFirstContactStore(true)});
    },
  });
  console.log(JSON.stringify({event:'first_contact_maintenance',eligible:rows.length,write:drafts||retry}));
}
if(process.argv[1]?.endsWith('first-contact-maintenance.ts')) runMaintenance(process.argv.slice(2)).catch(()=>{console.error('First-contact maintenance failed; inspect private state');process.exitCode=1}).finally(()=>prisma.$disconnect());
