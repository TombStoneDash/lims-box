export type EarlyAdopterOutcome = 'received' | 'invalid' | 'failed';

export function earlyAdopterOutcome(
  result: { ok: boolean; status: number } | 'network-error'
): EarlyAdopterOutcome {
  if (result === 'network-error') return 'failed';
  if (result.ok) return 'received';
  if (result.status === 400 || result.status === 422) return 'invalid';
  return 'failed';
}

export function earlyAdopterMessage(outcome: EarlyAdopterOutcome): string {
  switch (outcome) {
    case 'received':
      return '';
    case 'invalid':
      return 'Please check the required answers, your e-mail address and the data-use box, then submit again.';
    case 'failed':
      return 'We could not save your application. Please try again, or e-mail info@lims.bot.';
  }
}
