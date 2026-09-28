import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/emailValidation';

import { sendBlockers, sendFirstContact } from '@/lib/first-contact-send';
import { firstContactStore } from '@/lib/first-contact-store';
import { limsPriorContact } from '@/lib/first-contact-lims';
import { limsHistorySources } from '@/lib/first-contact-lims-sources';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const requestStartedAt = new Date();
    const body = (await req.json()) ?? {};
    const { email } = body;

    // ── 1. Validate email format ──────────────────────────────────────────
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      );
    }

    // ── 2. Check if Resend API key is configured ─────────────────────────
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        '[newsletter-subscribe] RESEND_API_KEY not configured. Newsletter service unavailable.'
      );
      // Return 503 Service Unavailable to signal config issue gracefully
      return NextResponse.json(
        {
          error: 'Email service temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    // Snapshot prior history before this enrollment; lookup failures suppress the
    // optional first contact, never the existing newsletter enrollment.
    let firstContactKnown: boolean | null = null;
    if (sendBlockers(process.env).length === 0) {
      try {
        const existing = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(normalizedEmail)}`, {
          headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000),
        });
        if (existing.ok) firstContactKnown = true;
        else if (existing.status === 404) {
          const sources = limsHistorySources();
          if (sources.countEarlyAccessBefore) firstContactKnown = await limsPriorContact(sources, normalizedEmail, requestStartedAt);
        }
      } catch { /* Unknown contact history means no send. */ }
    }

    // ── 3. Subscribe via Resend Contacts API ──────────────────────────────
    // Resend Contacts API: POST to https://api.resend.com/contacts
    // Docs: https://resend.com/docs/api-reference/contacts/create-contact
    const resendResponse = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        audienceId: process.env.RESEND_AUDIENCE_ID || undefined,
        firstName: '',
        lastName: '',
        unsubscribed: false,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text();
      console.error('[newsletter-subscribe] Resend API failed:', {
        status: resendResponse.status,
        error: resendError,
      });

      // If Resend fails but key exists, return 503 (service issue, not user error)
      return NextResponse.json(
        { error: 'Failed to subscribe. Please try again later.' },
        { status: 503 }
      );
    }

    const resendData = await resendResponse.json();
    if (firstContactKnown !== null) {
      try {
        await sendFirstContact({ email: normalizedEmail, known: firstContactKnown, env: process.env, store: firstContactStore });
      } catch {
        // Durable pending receipt remains fail-closed after any persistence error.
        console.warn('[first-contact] receipt_or_history_unavailable');
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Successfully subscribed to newsletter',
        id: resendData.id,
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[newsletter-subscribe] Unexpected error:', errorMessage);

    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }
}
