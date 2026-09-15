# Applicant confirmation outcome

`sendApplicantConfirmationOutcome(email, name)` in `lib/notify.ts` sends the
"we got your application" email to a waitlist applicant and always resolves —
it never throws. It returns:

```ts
{
  status: 'sent' | 'blocked_domain_unverified' | 'not_configured' | 'failed';
  httpStatus?: number;
  reason?: string;
}
```

- `sent` — the provider accepted the send.
- `blocked_domain_unverified` — the `lims.bot` sending domain is not yet
  verified in Resend (HTTP 403, `shouldDomainFallback` matches). Applicant
  mail has no fallback sender (Resend's shared test sender only delivers to
  the account owner), so this remains blocked until the domain is verified.
- `not_configured` — `RESEND_API_KEY` is not set.
- `failed` — any other provider error or a network/fetch exception.
  `httpStatus` is present when the provider returned a response.

`reason` is a short, human-readable message. It is derived from the HTTP
status or a caught error's message — never from the raw provider response
body, and never from the applicant's email address. Log lines in
`sendApplicantConfirmationOutcome` mask the applicant address (e.g.
`s***@example.com`) instead of printing it in full.

`sendApplicantConfirmation(email, name)` remains the throwing wrapper used by
existing callers/tests: it awaits `sendApplicantConfirmationOutcome` and
throws when the status is not `sent`, preserving the original error message
shape (`Applicant confirmation delivery failed (<status>)`, or the
`not_configured`/network-failure reason when there is no HTTP status).

## Waitlist route integration

`app/api/waitlist/route.ts` calls `sendApplicantConfirmationOutcome`
non-fatally after the prospect record is saved (or attempted). The outcome:

- is rendered as an `Applicant confirmation` line in the internal
  "New waitlist signup" submission notice (e.g. `sent`, `blocked (domain not
  verified)`, `not configured`, `failed (422)`);
- is returned to the caller as `confirmation` in the JSON response body,
  as the same `{ status, httpStatus?, reason? }` shape — no provider
  response bodies are included.

The route's existing `dbSaved` / `noticeSent` / 500-on-total-failure
semantics, `shouldDomainFallback`, and the submission-notice fallback path
are unchanged by this feature.

## What remains outside this change

Resend domain verification for `lims.bot` (which would allow
`blocked_domain_unverified` to become `sent` for applicant mail) and running
the production end-to-end send test remain with Hudson.
