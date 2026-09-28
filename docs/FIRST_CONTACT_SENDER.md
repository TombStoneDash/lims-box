# LIMS newsletter first-contact sender (not activated)

Only the newsletter has a new email sender. Contact, early-access and waitlist
retain their existing applicant confirmations and #440 dry-run hooks. They do
not invoke the new sender, so this change never adds a duplicate confirmation.
Their transactional delivery coverage/import is not implemented by this PR.

Main's September 28 instruction chooses per-product suppression (cross-product
is off). Unset scope follows that decision. Any explicitly different value is
blocked. Every other activation flag is off by default. No source/test operation
sends LIMS email. The approved-copy version here is the short plaintext welcome
in `lib/first-contact-send.ts`, subject "You're on the LIMS BOX list"; Main must
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
- Private export for `draft_required` rows and private draft retention. A row is
  a requirement to draft, never proof that a draft was written.

The existing Resend Contacts enrollment still runs when the optional sender is
disabled. When enabled, prior-contact lookup occurs before enrollment; any unknown
provider/history state or missing Supabase history suppresses the new email.
A unique PostgreSQL insert reserves the product/HMAC before invoking Resend.
Pending, sent, failed, suppressed, unresolved, and draft-required rows all block
repeat inbound sends. Network errors, 408, 409, 5xx or missing message IDs remain
unresolved. No retry scheduler is included: Main must reconcile provider evidence
before any pending/unresolved attempt can be changed. Even definite rejections
currently require manual reconciliation; daily bounded retries are a follow-up.

Receipts live in the durable first_contact_log row, including provider message
ID, bounded error code and timestamps. The HMAC unsubscribe link exposes no email;
it suppresses this first-contact channel. It does not claim to unsubscribe
unrelated newsletter campaigns. Missing persistence returns 503, never success.

Rollback: keep/return FIRST_CONTACT_EMAIL_ENABLED off, then revert the code.
Preserve the ledger, HMAC secret and provider evidence to prevent duplicates.
