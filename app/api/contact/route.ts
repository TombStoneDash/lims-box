import { safeErrorMeta } from '@/lib/safeLog';
import { sendSubmissionNotice } from '@/lib/notify';
import { getSupabase } from '@/lib/supabase';
import { createContactPostHandler, type ContactLeadRecord } from '@/lib/contactHandler';
import { limsFirstContactDryRun } from '@/lib/first-contact-lims';
import { limsHistorySources } from '@/lib/first-contact-lims-sources';

export const runtime = 'nodejs';

// ── DB persistence — durability backstop (W165) ─────────────────────────────
// Wrapped so a DB failure never blocks email send or throws into the handler.
async function saveLead(record: ContactLeadRecord): Promise<boolean> {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[contact] Supabase not configured — skipping DB save');
      return false;
    }
    // Target: public.limsbox_early_access (live in prod Supabase since 49d).
    // Column mapping: currentSystem → current_lims, message → pain_point.
    // PR #37 initially targeted 'contact_leads' which does not exist — every
    // signup would have silently failed the DB save. Corrected W212-followup.
    const { error: dbError } = await supabase.from('limsbox_early_access').insert({
      name: record.name,
      lab_name: record.labName,
      email: record.email,
      lab_size: record.labSize ?? null,
      current_lims: record.currentSystem ?? null,
      pain_point: record.message ?? null,
      phone: record.phone ?? null,
      instruments: record.instruments ?? null,
      source: 'contact_form',
    });
    if (dbError) {
      console.error('[contact] DB save failed (non-fatal):', safeErrorMeta(dbError));
      return false;
    }
    console.log('[contact] DB save succeeded');
    return true;
  } catch (dbErr) {
    console.error('[contact] DB save threw (non-fatal):', safeErrorMeta(dbErr));
    return false;
  }
}

export const POST = createContactPostHandler({
  saveLead,
  sendSubmissionNotice,
  firstContactDryRun: (input) => limsFirstContactDryRun({ endpoint: 'contact', sources: limsHistorySources, ...input }),
  logRecovery: (record) => console.error('[contact] LEAD-RECOVERY (both sinks failed):', record),
});
