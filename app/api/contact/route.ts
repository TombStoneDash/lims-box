import { leadLogMeta, safeErrorMeta } from '@/lib/safeLog';
import { NextRequest, NextResponse } from 'next/server';
import { sendSubmissionNotice } from '@/lib/notify';
import { getSupabase } from '@/lib/supabase';
import { normalizeContactSubmission } from '@/lib/contact-submission';
import { limsFirstContactDryRun } from '@/lib/first-contact-lims';
import { limsHistorySources } from '@/lib/first-contact-lims-sources';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Taken before this request writes anything (first-contact dry run).
  const requestStartedAt = new Date();
  try {
    const body = await request.json();

    const normalized = normalizeContactSubmission(body);
    if (normalized.ok === false) {
      return NextResponse.json(
        { error: normalized.error },
        { status: 400 },
      );
    }

    const submission = {
      ...normalized.record,
      timestamp: new Date().toISOString(),
    };

    // Audit log (kept for Vercel runtime trace)
    console.log('[contact] submission received:', leadLogMeta(submission));

    // ── 1. DB persistence — durability backstop (W165) ───────────────────────
    // Runs BEFORE email so the lead is saved even if Resend fails.
    // Wrapped in try/catch so a DB failure never blocks email send.
    let dbSaved = false;
    try {
      const supabase = getSupabase();
      if (supabase) {
        // Target: public.limsbox_early_access (live in prod Supabase since 49d).
        // Column mapping: currentSystem → current_lims, message → pain_point.
        // PR #37 initially targeted 'contact_leads' which does not exist — every
        // signup would have silently failed the DB save. Corrected W212-followup.
        const { error: dbError } = await supabase.from('limsbox_early_access').insert({
          name: submission.name,
          lab_name: submission.labName,
          email: submission.email,
          lab_size: submission.labSize ?? null,
          current_lims: submission.currentSystem ?? null,
          pain_point: submission.message ?? null,
          phone: submission.phone ?? null,
          instruments: submission.instruments ?? null,
          source: 'contact_form',
        });
        if (dbError) {
          console.error('[contact] DB save failed (non-fatal):', safeErrorMeta(dbError));
        } else {
          dbSaved = true;
          console.log('[contact] DB save succeeded');
        }
      } else {
        console.warn('[contact] Supabase not configured — skipping DB save');
      }
    } catch (dbErr) {
      console.error('[contact] DB save threw (non-fatal):', safeErrorMeta(dbErr));
    }

    // ── 2. Email notification — primary notification path ────────────────────
    let emailSent = false;
    try {
      await sendSubmissionNotice({
        subject: `New contact form submission — ${submission.labName}`,
        lines: [
          ['Name', submission.name],
          ['Lab name', submission.labName],
          ['Email', submission.email],
          ['Lab size', submission.labSize],
          ['Current system', submission.currentSystem],
          ['Message', submission.message],
          ['Received', submission.timestamp],
        ],
      });
      emailSent = true;
      console.log('[contact] email notification sent');
    } catch (emailErr) {
      console.error('[contact] email send failed (non-fatal):', safeErrorMeta(emailErr));
    }

    // ── 3. Respond — 200 if EITHER path succeeded; 500 only if both failed ───
    if (!dbSaved && !emailSent) {
      // Both durable sinks failed: retain only redacted lead metadata as the last recovery copy.
      const record = leadLogMeta(submission);
      console.error('[contact] LEAD-RECOVERY (both sinks failed):', record);
      console.error('[contact] both DB save and email send failed — returning 500');
      return NextResponse.json(
        { error: 'Failed to process submission' },
        { status: 500 },
      );
    }

    // The contact form sends no email to the person today, only Hudson's notice.
    await limsFirstContactDryRun({
      endpoint: 'contact',
      email: submission.email,
      sources: limsHistorySources,
      requestStartedAt,
      coveredByTransactional: false,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[contact] handler threw', safeErrorMeta(err));
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 },
    );
  }
}
