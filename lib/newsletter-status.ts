type NewsletterOutcome = 'subscribed' | 'deferred' | 'error';

export function newsletterOutcome(status: number, body: unknown): NewsletterOutcome {
  if (status >= 200 && status < 300) return 'subscribed';
  if (
    status === 503 &&
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    'deferred' in body &&
    body.deferred === true
  ) {
    return 'deferred';
  }
  return 'error';
}

export function newsletterMessage(outcome: NewsletterOutcome): string {
  switch (outcome) {
    case 'subscribed':
      return "You're subscribed!";
    case 'deferred':
      return "We couldn't complete your subscription. Please try again later.";
    case 'error':
      return 'Something went wrong. Try again?';
  }
}
