import { sendSubmissionNotice } from '@/lib/notify';
import { getSupabase } from '@/lib/supabase';
import { createContactPostHandler } from '@/lib/contactHandler';
import { limsFirstContactDryRun } from '@/lib/first-contact-lims';
import { limsHistorySources } from '@/lib/first-contact-lims-sources';

export const runtime = 'nodejs';

export const POST = createContactPostHandler({
  saveLead: async (record) => {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    // Target: public.limsbox_early_access (live in prod Supabase since 49d).
    // Column mapping: currentSystem → current_lims, message → pain_point.
    // PR #37 initially targeted 'contact_leads' which does not exist — every
    // signup would have silently failed the DB save. Corrected W212-followup.
    const { error } = await supabase.from('limsbox_early_access').insert({
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
    if (error) throw error;
  },
  sendSubmissionNotice,
  firstContactDryRun: (input) =>
    limsFirstContactDryRun({ endpoint: 'contact', sources: limsHistorySources, ...input }),
});
