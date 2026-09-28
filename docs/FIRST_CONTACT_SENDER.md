# LIMS newsletter first-contact sender (not activated)

Newsletter and contact have new, separately worded first-contact messages.
Contact's actual route sends only Hudson's internal notice, so it is an uncovered
inbound. When all sending gates pass, its existing Supabase insert returns the
saved row ID; unknown history or missing saved ID suppresses the applicant email.
No additional query is added to the contact insert while the sender is disabled.
Early-access and waitlist retain existing applicant confirmations; only explicit
provider status `sent` records HMAC-only covered_by_transactional. A void return,
fallback or rejected call never claims acceptance. No extra confirmation is sent.

Main's September 28 instruction chooses per-product suppression (cross-product
is off). Unset scope follows that decision. Any explicitly different value is
blocked. Every other activation flag is off by default. No source/test operation
sends LIMS email. The proposed copy versions here are the short plaintext contact acknowledgement and welcome
in `lib/first-contact-send.ts`, subjects "We received your LIMS BOX request" and "You're on the LIMS BOX list"; Main must
approve this exact copy and postal footer before enabling it.

## Activation remains blocked

Main must review and separately authorize:
- Manual `docs/sql/first-contact-log.sql` application in the Prisma PostgreSQL DB.
  It is outside automatic migrations and contains no recipient plaintext.
- FIRST_CONTACT_SCHEMA_READY=true, FIRST_CONTACT_EMAIL_ENABLED=true,
  FIRST_CONTACT_COPY_APPROVED=true, FIRST_CONTACT_DOMAIN_VERIFIED=true,
  FIRST_CONTACT_QUOTA_APPROVED=true. Do not infer quota approval from domain health.
- FIRST_CONTACT_HMAC_KEY shared with the private known/notable exports;
  RESEND_API_KEY; FIRST_CONTACT_POSTAL_ADDRESS (approved real mailing address).
- FIRST_CONTACT_KNOWN_HMACS, FIRST_CONTACT_NOTABLE_HMACS (comma-separated), and
  FIRST_CONTACT_NOTABLE_DOMAINS. No correspondent export exists by assumption;
  until provided, own-product Prospect, Supabase and Resend Contacts are checked.
- Main's independently authorized own-address send and signed unsubscribe test.
  This worker must not perform that send. HTTP /mcp is unrelated and unchanged.
- Main schedules private draft export and retention after reviewing the source below. A draft_required row never claims a written artifact.

The existing Resend Contacts enrollment still runs when the optional sender is
disabled. When enabled, prior-contact lookup occurs before enrollment; any unknown
provider/history state or missing Supabase history suppresses the new email.
A unique PostgreSQL insert reserves the product/HMAC before invoking Resend.
Pending, sent, failed, suppressed, unresolved, and draft-required rows all block
repeat inbound sends. Network errors, 408, 409, 5xx or missing message IDs remain
unresolved. Main must reconcile provider evidence before pending/unresolved
attempts can be changed. The offline maintenance script supports --retry-failed:
atomic compare-and-set permits only definite failed rows older than 24 hours,
under three attempts and not unsubscribed. Rejected third attempts become
private-draft requirements on the next run. No schedule is installed.

Receipts live in the durable first_contact_log row, including provider message
ID, bounded error code and timestamps. The HMAC unsubscribe link exposes no email;
it suppresses this first-contact channel. It does not claim to unsubscribe
unrelated newsletter campaigns. Missing persistence returns 503, never success.

Rollback: keep/return FIRST_CONTACT_EMAIL_ENABLED off, then revert the code.
Preserve the ledger, HMAC secret and provider evidence to prevent duplicates.

## Offline maintenance (Main only; not executed by the implementation worker)

`node --import tsx scripts/first-contact-maintenance.ts` reports eligible counts
without writes. `--export-drafts` resolves the stored Resend Contacts ID or saved Supabase contact ID privately,
checks its normalized email HMAC binding, writes exclusively in the private Hermes
outbox with mode 0600, and only then marks drafted_for_hudson. Existing draft files
are preserved; failed writes never claim success. Missing/private source access
fails closed. `--retry-failed` additionally requires all send gates and rechecks
unsubscribe and known/notable information. Main may schedule no more than daily,
after independent own-address verification. Sender quota approval is mandatory;
there is no assumption of shared-workspace spare quota. Main's private retention
job must clear personal draft fields 30 days after Hudson marks a draft handled.
