export type ContactResult = { ok: boolean; status: number } | 'network-error';

export type ContactOutcome = 'sent' | 'invalid' | 'failed';

export function contactOutcome(result: ContactResult): ContactOutcome {
  if (result === 'network-error') return 'failed';
  if (result.ok) return 'sent';
  if (result.status === 400 || result.status === 422) return 'invalid';
  return 'failed';
}

export function contactMessage(outcome: ContactOutcome): string {
  switch (outcome) {
    case 'sent':
      return '';
    case 'invalid':
      return 'Please check the required fields and your e-mail address, then send again.';
    case 'failed':
      return 'We could not send your message. Please try again, or e-mail info@lims.bot.';
  }
}
