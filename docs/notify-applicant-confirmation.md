# Waitlist applicant confirmation

A waitlist signup (`POST /api/waitlist`, used by the site footer and the
webinar page) sends the applicant one "We got your LIMS Box application"
email through `sendApplicantConfirmation` in `lib/notify.ts`.

Hudson approved this on 2026-09-24 for **new signups only**, with no backfill
to the existing list.

## When it sends

`lib/waitlistHandler.ts` sends only when all three are true:

1. The lookup for an earlier prospect with the same email (case-insensitive)
   succeeded and found none.
2. This request saved the new prospect record.
3. The email is valid.

A repeat signup, a failed lookup or a failed save sends nothing. There is no
code path that reads the prospect list in bulk, and no script that emails
existing prospects.

## What Hudson sees

The internal "New waitlist signup" notice gets an `Applicant confirmation`
line: `sent`, `blocked (domain not verified)`, `not configured`,
`failed (<http status>)`, `failed`, `skipped (already on the list)`,
`skipped (could not check the list)` or `skipped (signup not saved)`.

The browser response is unchanged (`{ success, saved }`). No delivery detail
is returned to the public caller.

A failed confirmation never fails the signup. Errors are logged through
`safeErrorMeta`, so provider bodies and addresses are not logged.

## Prerequisite outside this change

Applicant mail has no fallback sender. Until `lims.bot` is verified in Resend,
the status is `blocked (domain not verified)` and nothing reaches applicants.
