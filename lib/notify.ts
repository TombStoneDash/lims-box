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

export type DeliveryResult = { status: 'sent' } | { status: 'sent_via_fallback' };
export type DeliveryKind = 'applicant_confirmation' | 'submission_notice';
export type DeliveryFailureReason = 'not_configured' | 'domain_not_verified' | 'provider_error' | 'transport_error';

// Failures continue to reject so existing callers cannot mistake them for success.
// Only bounded metadata is retained: provider bodies and exceptions may contain PII.
export class NotificationDeliveryError extends Error {
  readonly status = 'failed' as const;

  constructor(
    readonly kind: DeliveryKind,
    readonly reason: DeliveryFailureReason,
    readonly stage: 'primary' | 'fallback',
    readonly httpStatus?: number,
  ) {
    const label = kind === 'applicant_confirmation' ? 'Applicant confirmation' : 'Submission notice';
    super(reason === 'not_configured'
      ? `${label} delivery is not configured`
      : `${label}${stage === 'fallback' ? ' fallback' : ''} delivery failed${httpStatus === undefined ? '' : ` (${httpStatus})`}`);
    this.name = 'NotificationDeliveryError';
  }
}

type Email = { from: string; to: string[]; subject: string; html: string };

async function deliver(kind: DeliveryKind, email: Email): Promise<DeliveryResult> {
  let stage: 'primary' | 'fallback' = 'primary';
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new NotificationDeliveryError(kind, 'not_configured', stage);
    const send = (message: Email) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    const response = await send(email);
    if (response.ok) return { status: 'sent' };

    const domainUnverified = shouldDomainFallback(response.status, await response.text());
    if (kind === 'submission_notice' && domainUnverified) {
      stage = 'fallback';
      const retry = await send({
        ...email,
        from: FALLBACK_FROM,
        to: [FALLBACK_TO],
        subject: `[FALLBACK DELIVERY] ${email.subject}`,
      });
      if (retry.ok) {
        console.warn('[notify] [FALLBACK DELIVERY] submission notice accepted by fallback sender', {
          kind, status: 'sent_via_fallback', reason: 'domain_not_verified',
        });
        return { status: 'sent_via_fallback' };
      }
      const reason = shouldDomainFallback(retry.status, await retry.text())
        ? 'domain_not_verified' : 'provider_error';
      throw new NotificationDeliveryError(kind, reason, stage, retry.status);
    }
    throw new NotificationDeliveryError(kind,
      domainUnverified ? 'domain_not_verified' : 'provider_error', stage, response.status);
  } catch (err) {
    const failure = err instanceof NotificationDeliveryError
      ? err : new NotificationDeliveryError(kind, 'transport_error', stage);
    console.error('[notify] [DELIVERY FAILED]', {
      kind: failure.kind, status: failure.status, reason: failure.reason,
      stage: failure.stage, httpStatus: failure.httpStatus,
      ...(kind === 'applicant_confirmation' ? { fallbackAvailable: false } : {}),
    });
    throw failure;
  }
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

export async function sendApplicantConfirmation(email: string, name: string): Promise<DeliveryResult> {

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;color:#0f172a;">
  <p style="font-size:15px;margin-bottom:16px;">Hi ${escape(name)},</p>
  <p style="font-size:15px;margin-bottom:16px;">
    Thanks for applying to the <strong>LIMS Box Early-Adopter Pilot Program</strong>.
    We received your application and will review it for the current pilot.
  </p>
  <h3 style="font-size:14px;color:#2E8B57;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">What happens next</h3>
  <ul style="font-size:14px;color:#334155;padding-left:20px;line-height:1.7;">
    <li>Hudson reviews your application against the current pilot criteria</li>
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

  return deliver('applicant_confirmation', {
    from: NOTIFY_FROM,
    to: [email],
    subject: 'We got your LIMS Box application',
    html,
  });
}

export async function sendSubmissionNotice(payload: NotifyPayload): Promise<DeliveryResult> {
  return deliver('submission_notice', {
    from: NOTIFY_FROM,
    to: [NOTIFY_TO],
    subject: payload.subject,
    html: renderBody(payload),
  });
}
