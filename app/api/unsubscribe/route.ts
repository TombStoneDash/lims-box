// app/api/unsubscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  fingerprintEmail,
  persistUnsubscribe,
  readUnsubscribeInput,
  type UnsubscribeInput,
  type UnsubscribeStore,
} from '@/lib/unsubscribe';

export const runtime = 'nodejs';

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();

  if (!url || !key) {
    throw new Error('Unsubscribe persistence is not configured');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createUnsubscribeStore(client: SupabaseClient): UnsubscribeStore {
  return {
    async findByEmail(email) {
      const { data: rows, error } = await client
        .from('sensor_waitlist')
        .select('id, unsubscribed')
        .eq('email', email)
        .limit(1);

      if (error) throw error;
      if (!rows || rows.length === 0) return null;

      return {
        id: String(rows[0].id),
        unsubscribed: Boolean(rows[0].unsubscribed),
      };
    },

    async markUnsubscribed(id, unsubscribedAt) {
      const { data: updatedRows, error } = await client
        .from('sensor_waitlist')
        .update({
          unsubscribed: true,
          unsubscribed_at: unsubscribedAt,
        })
        .eq('id', id)
        .select('id');

      if (error) throw error;
      if (!updatedRows || updatedRows.length !== 1) {
        throw new Error('Unsubscribe write did not update exactly one row');
      }
    },
  };
}

function successResponse(format: 'html' | 'json') {
  if (format === 'json') {
    return NextResponse.json(
      { ok: true, message: 'Unsubscribe request processed.' },
      { status: 200 }
    );
  }

  return new NextResponse(unsubscribePage('confirmed'), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function invalidResponse(format: 'html' | 'json') {
  if (format === 'json') {
    return NextResponse.json(
      { ok: false, error: 'Unable to process unsubscribe request.' },
      { status: 400 }
    );
  }

  return new NextResponse(unsubscribePage('error'), {
    status: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function persistenceErrorResponse(format: 'html' | 'json') {
  if (format === 'json') {
    return NextResponse.json(
      { ok: false, error: 'Unable to process unsubscribe request.' },
      { status: 500 }
    );
  }

  return new NextResponse(unsubscribePage('error'), {
    status: 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function handleUnsubscribe(req: NextRequest, format: 'html' | 'json') {
  const input = await readUnsubscribeInput(req);

  if (!input) {
    logAudit(null, 'newsletter', 'invalid_input', req.method);
    return invalidResponse(format);
  }

  try {
    const store = createUnsubscribeStore(getSupabase());
    await persistUnsubscribe(input, store);

    // The outcome is intentionally generic: known, unknown, and already
    // suppressed recipients receive the same success response.
    logAudit(input, input.list, 'processed', req.method);
    return successResponse(format);
  } catch (error: unknown) {
    const fingerprint = fingerprintEmail(input.email);
    console.error('[unsubscribe] Persistence error', {
      recipient: fingerprint,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    logAudit(input, input.list, 'persistence_error', req.method);
    return persistenceErrorResponse(format);
  }
}

/** One-click links keep the established query-parameter GET contract. */
export async function GET(req: NextRequest) {
  return handleUnsubscribe(req, 'html');
}

/** Interactive UI JSON and RFC 8058 one-click POSTs share the same helper. */
export async function POST(req: NextRequest) {
  return handleUnsubscribe(req, 'json');
}

function unsubscribePage(state: 'confirmed' | 'error') {
  const message =
    state === 'confirmed'
      ? {
          heading: "You're unsubscribed.",
          body: 'Your unsubscribe request has been processed. No further emails will be sent from this list.',
          color: '#2d7a3a',
        }
      : {
          heading: 'Something went wrong.',
          body: 'We could not process your unsubscribe request. Please reply to any newsletter email and we will remove you manually.',
          color: '#c0392b',
        };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Unsubscribe — LIMS BOX</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:80px auto;padding:0 20px;text-align:center;color:#1a1a1a;">
  <h1 style="font-size:24px;color:${message.color};margin-bottom:16px;">${message.heading}</h1>
  <p style="font-size:16px;line-height:1.7;">${message.body}</p>
  <p style="margin-top:40px;font-size:13px;color:#888;">
    <a href="https://lims.bot" style="color:#0055cc;text-decoration:none;">← Back to LIMS BOX</a>
  </p>
</body>
</html>`;
}

type AuditRecipient = UnsubscribeInput | null;

/** Append a local audit entry without ever writing the raw recipient address. */
function logAudit(
  recipient: AuditRecipient,
  list: string,
  action: string,
  method: string
) {
  try {
    const logsDir = path.join(process.cwd(), '..', '..', 'clawd', 'logs');

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `unsubscribe-${today}.jsonl`);
    const entry = {
      timestamp: new Date().toISOString(),
      recipient: recipient ? fingerprintEmail(recipient.email) : null,
      list,
      action,
      method,
    };

    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
  } catch (error: unknown) {
    console.warn('[unsubscribe] Audit log write failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
