import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { sendSubmissionNotice } from '@/lib/notify';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      labName,
      labType,
      contactName,
      email,
      testVolume,
      monthlyVolume,
      painPoint,
      source,
    } = body ?? {};

    if (!labName || !contactName || !email) {
      return NextResponse.json(
        { error: 'labName, contactName, and email are required' },
        { status: 400 },
      );
    }

    const record = {
      lab_name: String(labName).trim(),
      lab_type: labType ? String(labType).trim() : null,
      contact_name: String(contactName).trim(),
      email: String(email).trim().toLowerCase(),
      monthly_volume: monthlyVolume
        ? String(monthlyVolume).trim()
        : (testVolume ? String(testVolume).trim() : null),
      pain_point: painPoint ? String(painPoint).trim() : null,
      source: source ? String(source).trim() : 'lims.bot/early-adopter',
    };

    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('early_access_applications').insert(record);
      if (error) {
        console.error('[early-access] Supabase insert failed', error);
        return NextResponse.json({ error: 'Could not save your application' }, { status: 500 });
      }
    } else {
      console.warn('[early-access] Supabase not configured — application received but not persisted:', record);
    }

    await sendSubmissionNotice({
      subject: `New early-adopter application — ${record.lab_name}`,
      lines: [
        ['Lab name', record.lab_name],
        ['Lab type', record.lab_type],
        ['Contact name', record.contact_name],
        ['Email', record.email],
        ['Monthly volume', record.monthly_volume],
        ['Pain point', record.pain_point],
        ['Source', record.source],
        ['Received', new Date().toISOString()],
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[early-access] handler threw', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
