-- MANUAL MAIN APPROVAL ONLY. Not a Prisma migration; never run by a build.
CREATE TABLE first_contact_log (
  product text NOT NULL,
  email_hmac text NOT NULL CHECK (email_hmac ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL,
  source_id text, -- Resend Contacts ID: email resolved privately only during maintenance
  attempts integer NOT NULL DEFAULT 0,
  last_error_code text,
  provider_message_id text,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product,email_hmac)
);
