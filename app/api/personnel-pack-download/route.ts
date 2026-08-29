import { createPersonnelPackPostHandler, type PersonnelPackDelivery } from '@/lib/personnelPackFulfillment';
import { sendSubmissionNotice } from '@/lib/notify';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

async function createLead(record: { email: string; accred_type: string | null; source: 'personnel-pack-download' }) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await supabase.from('personnel_pack_leads').insert(record);
  if (error) {
    throw new Error(error.message);
  }
}

async function sendPersonnelPackDelivery(
  email: string,
  delivery: PersonnelPackDelivery,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Applicant delivery is not configured');
  }

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
  <p style="font-size:15px;">Thanks for requesting the LIMS BOX Personnel Pack.</p>
  <p style="font-size:14px;color:#334155;line-height:1.6;">
    Your reviewed download is ready now:
  </p>
  <p style="margin:20px 0;">
    <a href="${delivery.assetUrl}"
       style="display:inline-block;background:#2E8B57;color:#fff;font-weight:600;
              padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;">
      Download ${delivery.label} ->
    </a>
  </p>
  <p style="font-size:13px;color:#64748b;line-height:1.6;">
    This is a documentation aid. Your laboratory remains responsible for qualifications,
    competence decisions, and licensed-standard review.
  </p>
  <p style="font-size:13px;color:#64748b;">
    Questions? Reach us at <a href="mailto:info@lims.bot" style="color:#2E8B57;">info@lims.bot</a>.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;">
  <p style="font-size:11px;color:#94a3b8;">
    You're receiving this because you requested the Personnel Pack at
    <a href="https://lims.bot/personnel-pack" style="color:#94a3b8;">lims.bot</a>.
    <a href="https://lims.bot/unsubscribe" style="color:#94a3b8;">Unsubscribe</a>.
  </p>
</div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'LIMS BOX <info@lims.bot>',
      to: [email],
      subject: `Your ${delivery.label}`,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Applicant delivery failed (${response.status})`);
  }
}

export const POST = createPersonnelPackPostHandler({
  createLead,
  sendSubmissionNotice,
  sendApplicantDelivery: sendPersonnelPackDelivery,
});
