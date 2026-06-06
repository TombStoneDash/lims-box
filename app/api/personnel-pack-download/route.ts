import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { sendSubmissionNotice } from '@/lib/notify';

export const runtime = 'nodejs';

// TODO(HT): Upload the finished PDF to /public/ or a CDN, then set
// PERSONNEL_PACK_PDF_URL in Vercel env vars (e.g. https://lims.bot/personnel-pack-v1.pdf).
// Until that env var is set, the delivery email tells the user they'll receive a
// follow-up — manual fulfillment or automated once the URL is wired.
const PDF_URL = process.env.PERSONNEL_PACK_PDF_URL ?? null;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) ?? {};
    const { email, accredType } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const record = {
      email: normalizedEmail,
      accred_type: accredType ? String(accredType).trim() : null,
      source: 'personnel-pack-download',
    };

    // ── 1. Persist lead to Supabase ──────────────────────────────────────────
    // Requires table: personnel_pack_leads (id, email, accred_type, source, created_at)
    // See PR description for CREATE TABLE SQL.
    // Graceful no-op if Supabase is not configured or insert fails — email still fires.
    const supabase = getSupabase();
    if (supabase) {
      const { error: dbError } = await supabase
        .from('personnel_pack_leads')
        .insert(record);
      if (dbError) {
        console.error('[personnel-pack-download] Supabase insert failed:', dbError.message);
        // Do not return 500 — still send emails below
      }
    } else {
      console.warn(
        '[personnel-pack-download] Supabase not configured — lead not persisted:',
        record,
      );
    }

    // ── 2. Notify HT ─────────────────────────────────────────────────────────
    await sendSubmissionNotice({
      subject: `New Personnel Pack lead — ${normalizedEmail}`,
      lines: [
        ['Email', normalizedEmail],
        ['Accreditation type', accredType || 'not provided'],
        ['PDF URL configured', PDF_URL ? 'yes' : 'no — manual fulfillment needed'],
        ['Source', 'lims.bot/personnel-pack'],
        ['Received', new Date().toISOString()],
      ],
    });

    // ── 3. Send PDF delivery email to the submitter ───────────────────────────
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const deliveryHtml = PDF_URL
        ? `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
  <p style="font-size:15px;">Thanks for downloading the LIMS BOX Personnel Pack.</p>
  <p style="margin:20px 0;">
    <a href="${PDF_URL}"
       style="display:inline-block;background:#2E8B57;color:#fff;font-weight:600;
              padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;">
      Download Personnel Pack PDF →
    </a>
  </p>
  <p style="font-size:13px;color:#64748b;line-height:1.6;">
    This PDF includes survey-ready templates for ISO&nbsp;15189&nbsp;§6.2 and
    CLIA&nbsp;§493.1407 — Personnel File Cover Sheet, Authorization Record, Competency
    Assessment Log, Training Record, Annual Evaluation Calendar, and a Regulation
    Reference Map.
  </p>
  <p style="font-size:13px;color:#64748b;">
    Questions? Reply to this email or reach us at
    <a href="mailto:info@lims.bot" style="color:#2E8B57;">info@lims.bot</a>.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;">
  <p style="font-size:11px;color:#94a3b8;">
    You're receiving this because you requested the Personnel Pack at
    <a href="https://lims.bot/personnel-pack" style="color:#94a3b8;">lims.bot</a>.
    <a href="https://lims.bot/unsubscribe" style="color:#94a3b8;">Unsubscribe</a>.
  </p>
</div>`
        : `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
  <p style="font-size:15px;">Thanks for requesting the LIMS BOX Personnel Pack.</p>
  <p style="font-size:14px;color:#334155;line-height:1.6;">
    We're finalising the PDF. You'll receive your download link within 24 hours.
  </p>
  <p style="font-size:13px;color:#64748b;line-height:1.6;">
    In the meantime, you can explore Personnel Pack features at
    <a href="https://lims.bot/personnel-pack" style="color:#2E8B57;">lims.bot/personnel-pack</a>.
  </p>
  <p style="font-size:13px;color:#64748b;">
    Questions? Reply to this email or reach us at
    <a href="mailto:info@lims.bot" style="color:#2E8B57;">info@lims.bot</a>.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;">
  <p style="font-size:11px;color:#94a3b8;">
    You're receiving this because you requested the Personnel Pack at
    <a href="https://lims.bot/personnel-pack" style="color:#94a3b8;">lims.bot</a>.
    <a href="https://lims.bot/unsubscribe" style="color:#94a3b8;">Unsubscribe</a>.
  </p>
</div>`;

      const deliveryRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'LIMS BOX <info@lims.bot>',
          to: [normalizedEmail],
          subject: PDF_URL
            ? 'Your LIMS BOX Personnel Pack PDF'
            : 'Your LIMS BOX Personnel Pack — arriving shortly',
          html: deliveryHtml,
        }),
      });

      if (!deliveryRes.ok) {
        console.error(
          '[personnel-pack-download] Resend delivery email failed:',
          await deliveryRes.text(),
        );
        // Still return 200 to the browser — HT was notified and lead was captured
      }
    } else {
      console.warn(
        '[personnel-pack-download] RESEND_API_KEY not set — no delivery email sent to:',
        normalizedEmail,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[personnel-pack-download] handler threw:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
