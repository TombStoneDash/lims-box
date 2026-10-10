-- Proposed manual Main-owned DDL, derived from LIMS #523 SQL callers.
-- Not an existing #523 migration; not an automatic Prisma migration.
-- Apply only to the verified LIMS application database after schema review.
CREATE TABLE IF NOT EXISTS public.first_contact_log (
  product text NOT NULL,
  email_hmac text NOT NULL CHECK (email_hmac ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  source_id text,
  source_kind text,
  provider_message_id text,
  last_error_code text,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product, email_hmac)
);
