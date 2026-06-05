// app/api/unsubscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export const runtime = 'nodejs';

/**
 * GET handler: accepts ?email=<encoded>&list=<list_name> query params
 * Validates email, marks as unsubscribed in sensor_waitlist
 * Returns styled HTML confirmation page
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email')?.trim().toLowerCase();
  const list = searchParams.get('list') ?? 'newsletter';

  // Validate email
  if (!email || !email.includes('@')) {
    return new NextResponse(unsubscribePage(email || '', 'error'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' }
    });
  }

  try {
    // 1. Find the record in sensor_waitlist
    const { data: rows, error: fetchErr } = await supabase
      .from('sensor_waitlist')
      .select('id, email, unsubscribed')
      .eq('email', email)
      .limit(1);

    if (fetchErr) {
      console.error('[unsubscribe] Fetch error:', fetchErr);
      throw fetchErr;
    }

    if (!rows || rows.length === 0) {
      // Not found — still return 200 with confirmed message (don't leak existence per CAN-SPAM)
      logAudit(email, list, 'not_found');
      return new NextResponse(unsubscribePage(email, 'confirmed'), {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }

    const row = rows[0];

    // 2. Check if already unsubscribed
    if (row.unsubscribed) {
      logAudit(email, list, 'already_unsubscribed');
      return new NextResponse(unsubscribePage(email, 'already'), {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // 3. Persist unsubscribe to sensor_waitlist
    const { error: updateErr } = await supabase
      .from('sensor_waitlist')
      .update({
        unsubscribed: true,
        unsubscribed_at: new Date().toISOString()
      })
      .eq('id', row.id);

    if (updateErr) {
      console.error('[unsubscribe] Update error:', updateErr);
      throw updateErr;
    }

    logAudit(email, list, 'unsubscribed');
    console.info('[unsubscribe] Successfully unsubscribed:', email);

    // 4. Optionally write to audit log table (non-fatal if it fails)
    try {
      await supabase.from('email_audit_log').insert({
        event: 'unsubscribe',
        email: email,
        list: list,
        source: 'unsubscribe_link',
        created_at: new Date().toISOString()
      });
    } catch (auditErr) {
      // Non-blocking — audit table may not exist yet
      console.warn('[unsubscribe] Audit log insert failed (non-fatal):', auditErr);
    }

    return new NextResponse(unsubscribePage(email, 'confirmed'), {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (err: unknown) {
    console.error('[unsubscribe] DB error:', err);
    logAudit(email, list, 'error');
    return new NextResponse(unsubscribePage(email, 'error'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

/**
 * POST handler: RFC 8058 one-click unsubscribe (List-Unsubscribe-Post)
 * Same logic as GET
 */
export async function POST(req: NextRequest) {
  return GET(req);
}

/**
 * Generate styled HTML response for unsubscribe confirmation
 */
function unsubscribePage(email: string, state: 'confirmed' | 'already' | 'error') {
  const messages = {
    confirmed: {
      heading: "You're unsubscribed.",
      body: `<b>${escHtml(email)}</b> has been removed from the LIMS BOX newsletter. No further emails will be sent.`,
      color: '#2d7a3a'
    },
    already: {
      heading: 'Already unsubscribed.',
      body: `<b>${escHtml(email)}</b> was already removed from our list.`,
      color: '#555'
    },
    error: {
      heading: 'Something went wrong.',
      body:
        'We could not process your unsubscribe request. Please reply to any newsletter email and we will remove you manually.',
      color: '#c0392b'
    }
  };

  const m = messages[state];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Unsubscribe — LIMS BOX</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:80px auto;padding:0 20px;text-align:center;color:#1a1a1a;">
  <h1 style="font-size:24px;color:${m.color};margin-bottom:16px;">${m.heading}</h1>
  <p style="font-size:16px;line-height:1.7;">${m.body}</p>
  <p style="margin-top:40px;font-size:13px;color:#888;">
    <a href="https://lims.bot" style="color:#0055cc;text-decoration:none;">← Back to LIMS BOX</a>
  </p>
</body>
</html>`;
}

/**
 * Escape HTML entities for safe embedding in HTML
 */
function escHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Append audit log entry to a local jsonl file
 * Non-blocking: errors are logged but do not interrupt the unsubscribe flow
 */
function logAudit(email: string, list: string, action: string) {
  try {
    const logsDir = path.join(process.cwd(), '..', '..', 'clawd', 'logs');
    
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `unsubscribe-${today}.jsonl`);

    const entry = {
      timestamp: new Date().toISOString(),
      email,
      list,
      action
    };

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Silent fail — audit logging should never block the unsubscribe flow
    console.warn('[unsubscribe] Audit log write failed:', err);
  }
}
