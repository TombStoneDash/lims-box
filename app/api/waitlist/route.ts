import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { sendSubmissionNotice } from '@/lib/notify';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, labName, name, organization, role, source } = body ?? {};

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const record = {
      email: normalizedEmail,
      name: (name && String(name).trim())
        || (labName && String(labName).trim())
        || normalizedEmail.split('@')[0],
      organization: organization ? String(organization).trim() : (labName ? String(labName).trim() : null),
      role: role ? String(role).trim() : null,
      source: source ? String(source).trim() : 'lims.bot',
    };

    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('waitlist').insert(record);
      if (error) {
        console.error('[waitlist] Supabase insert failed', error);
        return NextResponse.json({ error: 'Could not save your signup' }, { status: 500 });
      }
    } else {
      console.warn('[waitlist] Supabase not configured — signup received but not persisted:', record);
    }

    await sendSubmissionNotice({
      subject: `New waitlist signup — ${record.email}`,
      lines: [
        ['Email', record.email],
        ['Name', record.name],
        ['Organization', record.organization],
        ['Role', record.role],
        ['Source', record.source],
        ['Received', new Date().toISOString()],
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[waitlist] handler threw', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
