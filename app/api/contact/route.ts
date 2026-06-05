import { NextRequest, NextResponse } from 'next/server';
import { sendSubmissionNotice } from '@/lib/notify';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, labName, email, labSize, currentSystem, message, phone, instruments } = body ?? {};

    if (!name || !email || !labName) {
      return NextResponse.json(
        { error: 'Name, email, and lab name are required' },
        { status: 400 },
      );
    }

    const record = {
      name: String(name).trim(),
      labName: String(labName).trim(),
      email: String(email).trim().toLowerCase(),
      labSize: labSize ? String(labSize).trim() : null,
      currentSystem: currentSystem ? String(currentSystem).trim() : null,
      message: message ? String(message).trim() : null,
      phone: phone ? String(phone).trim() : null,
      instruments: instruments ? String(instruments).trim() : null,
      timestamp: new Date().toISOString(),
    };

    // Audit log (kept for Vercel runtime trace)
    console.log('[contact] submission received:', record);

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
          console.error('[contact] DB save failed (non-fatal):', dbError.message);
        } else {
          dbSaved = true;
          console.log('[contact] DB save succeeded');
        }
      } else {
        console.warn('[contact] Supabase not configured — skipping DB save');
      }
    } catch (dbErr) {
      console.error('[contact] DB save threw (non-fatal):', dbErr);
    }

    // ── 2. Email notification — primary notification path ────────────────────
    let emailSent = false;
    try {
      await sendSubmissionNotice({
        subject: `New contact form submission — ${record.labName}`,
        lines: [
          ['Name', record.name],
          ['Lab name', record.labName],
          ['Email', record.email],
          ['Lab size', record.labSize],
          ['Current system', record.currentSystem],
          ['Message', record.message],
          ['Received', record.timestamp],
        ],
      });
      emailSent = true;
      console.log('[contact] email notification sent');
    } catch (emailErr) {
      console.error('[contact] email send failed (non-fatal):', emailErr);
    }

    // ── 3. Respond — 200 if EITHER path succeeded; 500 only if both failed ───
    if (!dbSaved && !emailSent) {
      console.error('[contact] both DB save and email send failed — returning 500');
      return NextResponse.json(
        { error: 'Failed to process submission' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[contact] handler threw', err);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 },
    );
  }
}
