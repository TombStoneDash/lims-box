const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'hudtaylor@gmail.com';
const NOTIFY_FROM = process.env.NOTIFY_FROM_EMAIL || 'LIMS BOX <notifications@lims.bot>';

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
    }
  } catch (err) {
    console.error('[notify] Resend threw', err);
  }
}
