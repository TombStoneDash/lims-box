import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

const VALID_LISTS = ['newsletter', 'all'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, list } = body ?? {};

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const normalizedList =
      list && VALID_LISTS.includes(String(list).trim())
        ? String(list).trim()
        : 'newsletter';

    const record = {
      email: normalizedEmail,
      list: normalizedList,
      unsubscribed_at: new Date().toISOString(),
      source: 'manual',
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        // Idempotent: check for existing suppression first
        const { data: existing } = await supabase
          .from('email_suppression')
          .select('id')
          .eq('email', normalizedEmail)
          .eq('list', normalizedList)
          .maybeSingle();

        if (!existing) {
          const { error } = await supabase.from('email_suppression').insert(record);
          if (error) {
            // Table may not exist yet — log and degrade gracefully.
            // Run SUPABASE_MIGRATION_email_suppression to create the table.
            console.warn('[unsubscribe] Supabase insert failed (schema migration needed):', error.message);
          } else {
            console.info('[unsubscribe] Suppressed:', normalizedEmail, 'list:', normalizedList);
          }
        } else {
          console.info('[unsubscribe] Already suppressed (idempotent):', normalizedEmail);
        }
      } catch (dbErr) {
        // Graceful degradation — unsubscribe page still confirms to user
        console.warn('[unsubscribe] Supabase error — proceeding anyway:', dbErr);
      }
    } else {
      // No Supabase configured — log for manual processing
      console.warn('[unsubscribe] Supabase not configured. Unsubscribe request:', record);
    }

    // Always return 200 to the user — CAN-SPAM requires the page to work
    // even if backend persistence isn't available yet.
    return NextResponse.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (err) {
    console.error('[unsubscribe] handler threw', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// GET: redirect to the unsubscribe page (supports mailto: and raw link clicks)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const email = searchParams.get('email') ?? '';
  const list = searchParams.get('list') ?? 'newsletter';

  const dest = new URL('/unsubscribe', origin);
  if (email) dest.searchParams.set('email', email);
  dest.searchParams.set('list', list);

  return NextResponse.redirect(dest);
}
