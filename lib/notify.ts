// Env values copied through some shells arrive with a trailing literal "\n"
// (backslash-n) or stray whitespace baked in. Resend rejects a `from`/`to`
// containing those with HTTP 422 "Invalid `from` field" — which silently kills
// every early-adopter notification + applicant confirmation. Strip defensively
// and fall back to a known-good literal if the sanitized value is empty or
// clearly not an address (must contain "@"). Mirrors lib/supabase.ts sanitize.
function sanitizeAddr(v: string | undefined, fallback: string): string {
  const cleaned = v?.replace(/\\[rnt]/g, '').replace(/[\r\n\t]+/g, '').trim();
  if (!cleaned || !cleaned.includes('@')) return fallback;
  return cleaned;
}

const NOTIFY_TO = sanitizeAddr(process.env.NOTIFY_EMAIL, 'hudtaylor@gmail.com');
const NOTIFY_FROM = sanitizeAddr(process.env.NOTIFY_FROM_EMAIL, 'LIMS BOX <notifications@lims.bot>');

// Resend free tier: until the lims.bot domain is verified in Resend, sends
// from notifications@lims.bot are rejected (403 "domain is not verified").
// Fallback: deliver HT's submission notice from Resend's shared test sender
// to the Resend account owner's address so lead alerts are not silently lost.
// Applicant-facing mail cannot use this path (the test sender only delivers
// to the account owner) — those remain blocked until the domain is verified.
const FALLBACK_FROM = 'LIMS BOX (fallback) <onboarding@resend.dev>';
const FALLBACK_TO = sanitizeAddr(process.env.NOTIFY_FALLBACK_EMAIL, 'tombstonedash@gmail.com');

export function shouldDomainFallback(status: number, body: string): boolean {
  return status === 403 && /domain is not verified/i.test(body);
}

type NotifyPayload = {
  subject: string;
  lines: Array<[string, string | null | undefined]>;
};

function renderBody({ lines }: NotifyPayload) {
  const rows = lines
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-family:system-ui,sans-serif;font-size:13px;vertical-align:top;">${escape(label)}</td><td style="padding:6px 0;font-family:system-ui,sans-serif;font-size:14px;color:#0f172a;">${escape(String(value))}</td></tr>`)
    .join('');
  return `<table style="border-collapse:collapse;">${rows}</table>`;
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function sendApplicantConfirmation(email: string, name: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notify] RESEND_API_KEY not set — skipping applicant confirmation for:', email);
    return;
  }

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;color:#0f172a;">
  <p style="font-size:15px;margin-bottom:16px;">Hi ${escape(name)},</p>
  <p style="font-size:15px;margin-bottom:16px;">
    Thanks for applying to the <strong>LIMS Box Early-Adopter Pilot Program</strong>.
    We received your application and will review it personally &mdash; expect a response within 2 business days.
  </p>
  <h3 style="font-size:14px;color:#2E8B57;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">What happens next</h3>
  <ul style="font-size:14px;color:#334155;padding-left:20px;line-height:1.7;">
    <li>Hudson reviews your application (usually same business day)</li>
    <li>If it&rsquo;s a good fit, we&rsquo;ll schedule a 30-minute discovery call</li>
    <li>Pilot slots are limited &mdash; we&rsquo;ll let you know either way</li>
  </ul>
  <p style="font-size:14px;margin-top:16px;">
    In the meantime, you can
    <a href="https://lims.bot/commercial" style="color:#2E8B57;">see what LIMS Box covers</a>
    or reply to this email with any questions.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="font-size:13px;color:#64748b;">
    &mdash; Hudson Taylor<br/>
    Founder, LIMS Box &middot; <a href="mailto:info@lims.bot" style="color:#2E8B57;">info@lims.bot</a>
  </p>
</div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [email],
        subject: 'We got your LIMS Box application',
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[notify] Resend applicant confirmation error', res.status, body);
      if (shouldDomainFallback(res.status, body)) {
        console.error('[notify] applicant confirmation blocked: lims.bot domain not verified in Resend — no fallback possible for external recipients');
      }
    } else {
      console.log('[notify] Applicant confirmation sent to', email);
    }
  } catch (err) {
    console.error('[notify] Resend applicant confirmation threw', err);
  }
}

export async function sendSubmissionNotice(payload: NotifyPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notify] RESEND_API_KEY not set — skipping email. Submission:', payload);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [NOTIFY_TO],
        subject: payload.subject,
        html: renderBody(payload),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[notify] Resend error', res.status, body);
      if (shouldDomainFallback(res.status, body)) {
        const retry = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FALLBACK_FROM,
            to: [FALLBACK_TO],
            subject: `[FALLBACK DELIVERY] ${payload.subject}`,
            html: renderBody(payload),
          }),
        });
        if (retry.ok) {
          console.log('[notify] domain-unverified fallback delivered submission notice to', FALLBACK_TO);
        } else {
          console.error('[notify] fallback send failed', retry.status, await retry.text());
        }
      }
    }
  } catch (err) {
    console.error('[notify] Resend threw', err);
  }
}
