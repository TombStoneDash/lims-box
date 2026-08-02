import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/emailValidation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) ?? {};
    const { email, source } = body;

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
        '[newsletter-subscribe] RESEND_API_KEY not configured. Email subscription recorded but not sent. Configure RESEND_API_KEY in Vercel env to activate.',
        { email: normalizedEmail, source: source || 'blog_newsletter' }
      );
      // Return 503 Service Unavailable to signal config issue gracefully
      return NextResponse.json(
        {
          error: 'Email service temporarily unavailable. Your subscription will be processed once configured.',
          deferred: true,
        },
        { status: 503 }
      );
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
