export type WebinarRegistrationOutcome = 'registered' | 'invalid' | 'failed';

export function registrationOutcome(
  result: { ok: boolean; status: number } | 'network-error'
): WebinarRegistrationOutcome {
  if (result === 'network-error') return 'failed';
  if (result.ok) return 'registered';
  if (result.status === 400 || result.status === 422) return 'invalid';
  return 'failed';
}

export function registrationMessage(outcome: WebinarRegistrationOutcome): string {
  switch (outcome) {
    case 'registered':
      return '';
    case 'invalid':
      return 'Please check your name and e-mail address.';
    case 'failed':
      return 'We could not save your registration. Please try again, or e-mail us from the contact page.';
  }
}
