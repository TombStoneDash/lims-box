import { emailHmac } from './first-contact';
export interface MaintenanceRow { email_hmac:string; source_id:string; outcome:string; source_kind?: 'newsletter'|'contact'; }
export type TerminalOutcome = 'unsubscribed' | 'unavailable';
export class UnsubscribedContactError extends Error {}
export interface MaintenanceDeps {
  key:string;
  resolveEmail(sourceId:string, row:MaintenanceRow):Promise<string>;
  writeDraft(hmac:string,email:string,row:MaintenanceRow):Promise<boolean>;
  markDrafted(hmac:string):Promise<void>;
  markTerminal(row:MaintenanceRow,outcome:TerminalOutcome):Promise<void>;
  retry(row:MaintenanceRow,email:string):Promise<void>;
}
/** Caller provides a bounded DB snapshot. Pending/unresolved are never retry candidates. */
export async function maintainFirstContacts(rows:MaintenanceRow[], actions:{drafts:boolean;retry:boolean}, deps:MaintenanceDeps) {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.source_id || !['failed','draft_required'].includes(row.outcome)) continue;
    if (!(actions.retry && row.outcome === 'failed') && !(actions.drafts && row.outcome === 'draft_required')) continue;
    if (seen.has(row.email_hmac)) continue;
    seen.add(row.email_hmac);
    let email: string;
    try {
      email = await deps.resolveEmail(row.source_id,row);
    } catch (error) {
      await deps.markTerminal(row, error instanceof UnsubscribedContactError ? 'unsubscribed' : 'unavailable');
      continue;
    }
    if (emailHmac(email,deps.key) !== row.email_hmac) throw Error('Private inbound binding mismatch');
    if (actions.drafts && row.outcome==='draft_required' && await deps.writeDraft(row.email_hmac,email,row)) await deps.markDrafted(row.email_hmac);
    if (actions.retry && row.outcome==='failed') await deps.retry(row,email);
  }
}
