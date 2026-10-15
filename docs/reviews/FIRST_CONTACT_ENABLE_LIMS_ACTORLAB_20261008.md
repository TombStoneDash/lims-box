# First-contact enablement handoff: LIMS and ActorLab

Prepared 2026-10-08 for Hudson's Oct 4 pending-list row 24. Scope: instructions and local verification only. No migration, production environment change, deployment, email, commit, or push was performed.

Canonical delivery target: `/Users/ops/Hermes/outbox/reviews/FIRST_CONTACT_ENABLE_LIMS_ACTORLAB_20261008.md`. The adjacent `first-contact-lims-schema.sql` is the proposed LIMS DDL. This report was prepared in the assigned worktree. A direct copy to the canonical destination returned `Operation not permitted` under the workspace sandbox; runner/Main must deliver this file and the adjacent SQL.

## Evidence and ownership

- Assigned branch: `codex/pl24-first-contact-env-lims-actorlab-r2`; starting HEAD `74da3f97fc5c27ea523a87a8f1d2894e175ed880`, repository `tombstonedash/lims-box`. The worktree was clean at start.
- LIMS #523 merge: `f8fb7ac`; inspected sender, store, inbound routes, maintenance, unsubscribe, Prisma schema and every tracked SQL filename at the assigned revision.
- ActorLab #662 merge: `f34aa765595eade7e0b2490f29119f5348d10c31`, Oct 6. Read directly with `git show` in `/Users/ops/Projects/actorlab`. That checkout is detached at `272ecd8c98f92d108b802292fc369701191b65f1`, predates #662, and has an unrelated edit to `app/lab/submissions/page.tsx`. It was not changed. Main must use a reviewed revision containing #662, not deploy this old dirty checkout.
- Read canonical `OLD_PENDING_RECONCILE_20261004.md` row 24 and `AUTO_FIRST_CONTACT_SPEC_20260926.md`. Oct 4 row state is historical; the Oct 8 user-provided state supersedes it. TrashAlert live status is user-provided, not independently rechecked here.
- Source inspection establishes required configuration, not current database, Vercel, Resend domain, quota, or delivery state. No secret values were retrieved.

## LIMS schema and exact manual command

**#523 does not contain a first-contact migration.** There is no `first_contact_log` Prisma model or tracked SQL definition in this branch. `prisma migrate deploy` cannot create this table. The adjacent SQL is a proposed manual migration derived from `lib/first-contact-store.ts` and `scripts/first-contact-maintenance.ts`, not represented as already merged in #523.

Required columns: `product`, `email_hmac`, `outcome`, `attempts`, `source_id`, `source_kind`, `provider_message_id`, `last_error_code`, `unsubscribed_at`, `created_at`, `updated_at`. Unique `(product,email_hmac)` is required by reservation and unsubscribe `ON CONFLICT`; timestamps need defaults because inserts omit them. Source columns must be nullable because transactional receipts and unsubscribe inserts omit them. LIMS uses `product='lims'`. Never copy ActorLab's `endpoint NOT NULL` schema into LIMS: its inserts do not supply that column.

The proposed migration is additive: one `CREATE TABLE IF NOT EXISTS` with constraints on the new table; no existing rows/columns are changed, dropped, or backfilled. `IF NOT EXISTS` does not validate an existing table. If one exists, compare its columns, defaults and unique key first and reconcile differences separately.

Main, after reviewing the proposed SQL and identifying the production database used by LIMS `DATABASE_URL`, uses an approved libpq service entry `lims-first-contact-production` (credentials supplied through the secure store, never pasted into the receipt). Back up through the normal controlled path. With the SQL delivered beside this report, the exact narrow command is:

```sh
PGSERVICE=lims-first-contact-production psql -X --set=ON_ERROR_STOP=1 --single-transaction \
  --file=/Users/ops/Hermes/outbox/reviews/first-contact-lims-schema.sql
```

The service name is a proposed explicit target alias, not an observed installed configuration. Main must configure/verify it against the application's production database before executing. Do not use `prisma db push`, `migrate reset`, or an unrestricted migration sweep as a substitute. LIMS's production build currently invokes `prisma db push --skip-generate`; since the table is absent from Prisma, Main must review its proposed schema diff before redeploying and must never accept loss of this receipt table.

If the chosen schema is exposed through Supabase Data API, the candidate DDL alone is insufficient: Main must apply reviewed private-table grants/RLS for the actual server role before activation. Do not grant browser roles access to contact receipts. The raw Prisma connection, not merely the contact-form Supabase client, must be able to reserve and finish receipts.

## ActorLab schema and exact manual command

The authoritative additive script is `docs/runbooks/first-contact-schema.sql` at #662. It creates `first_contact_log` if missing with `product`, checked `email_hmac`, **`endpoint text NOT NULL`**, nullable `source_id`, `outcome`, defaulted `attempts`, provider/error columns, defaulted timestamps, and primary key `(product,email_hmac)`. It has no destructive DDL, updates, deletes, or backfill. It lives outside Prisma migrations, so a normal `prisma migrate deploy` does not install it.

Main should run from its owned, clean release checkout containing #662, with a verified production libpq service entry `actorlab-first-contact-production`. First inspect the script and any existing table; then:

```sh
PGSERVICE=actorlab-first-contact-production psql -X --set=ON_ERROR_STOP=1 --single-transaction \
  --file=docs/runbooks/first-contact-schema.sql
```

This service alias also needs Main's secure setup; it was not provisioned here. ActorLab uses `product='actorlab'`. Its existing `public.email_suppressions` table and `newsletter_subscribers` table must also exist and be readable/writable by the server role. If suppression storage is absent, review and apply the existing additive `prisma/migrations/20260716030000_email_suppression/migration.sql` through the same narrow controlled path before enabling enforcement:

```sh
PGSERVICE=actorlab-first-contact-production psql -X --set=ON_ERROR_STOP=1 --single-transaction \
  --file=prisma/migrations/20260716030000_email_suppression/migration.sql
```

That prerequisite adds its suppression table/indexes and restricts access to that table; it does not remove data. Reconcile its Prisma migration record using the repository's normal migration process if manually pre-applied. ActorLab's production build executes `prisma migrate deploy`, so review all pending migrations before a production rebuild. The #662 script has no RLS/grants; if the actual deployment uses an exposed Supabase schema, review those separately as above. The suppression migration comments identify Neon as ActorLab production; this was not live-verified.

## Vercel Production values

Use each product's verified Vercel project, Production scope only. Keep `FIRST_CONTACT_EMAIL_ENABLED=false` through schema/configuration checks. These are server variables, without `NEXT_PUBLIC_` prefixes.

| Environment name | LIMS value | ActorLab value |
|---|---|---|
| `FIRST_CONTACT_EMAIL_ENABLED` | `true` last | `true` last |
| `FIRST_CONTACT_SCOPE` | `per-product` | `per-product` |
| `FIRST_CONTACT_COPY_APPROVED` | `true` after copy review | `actorlab-newsletter-v1` after copy review |
| `FIRST_CONTACT_SCHEMA_READY` | `true` after table/role verification | Not consumed by #662 |
| `FIRST_CONTACT_DOMAIN_VERIFIED` | `true` after verifying `info@lims.bot` sender domain | No such gate; verify `noreply@actorlab.io` externally |
| `FIRST_CONTACT_QUOTA_APPROVED` | `true` after current quota verification | No such gate; verify workspace quota externally |
| `FIRST_CONTACT_HMAC_KEY` | Existing approved shared secret from secure store | Same approved secret; preserve exact value |
| `RESEND_API_KEY` | Secure provider key for the correct workspace | Secure provider key for ActorLab workspace |
| `FIRST_CONTACT_POSTAL_ADDRESS` | Real approved mailing address | Real approved mailing address |
| `FIRST_CONTACT_KNOWN_HMACS` | Comma-separated lowercase 64-hex HMACs, or reviewed `[]` | JSON array of lowercase 64-hex HMAC strings, or reviewed `[]` |
| `FIRST_CONTACT_NOTABLE_HMACS` | Same comma-separated format, or reviewed `[]` | Same JSON array format, or reviewed `[]` |
| `FIRST_CONTACT_NOTABLE_DOMAINS` | Comma-separated valid domains, or reviewed `[]` | Not consumed by #662 |
| `EMAIL_SUPPRESSION_ENFORCEMENT` | Not a first-contact gate in #523 | `1`, with working suppression store |

Do not invent secret/address/list values or use empty lists just to satisfy a gate. Main must prepare reviewed known/prior-correspondent and notable lists using the configured HMAC key. ActorLab permits a missing known list in code but reports it missing; populating it is necessary to cover the standing rule's mailbox-history exception. ActorLab #662 has no notable-domain matching, so any required domain-based exclusion needs implementation or an adequately reviewed person list before claiming coverage.

LIMS additionally needs its existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and readable `limsbox_early_access` history. Missing Supabase history prevents its newsletter/contact send, even with flags true. `DATABASE_URL` must select the same database where the receipt schema was verified.

In the verified linked project, check variable names with `vercel env ls production`. For an absent non-secret switch, use:

```sh
printf %s true | vercel env add FIRST_CONTACT_EMAIL_ENABLED production
```

For an existing switch use `vercel env update FIRST_CONTACT_EMAIL_ENABLED production` with the same piped value. Use the matrix's exact names and values for the other non-secret switches; enter secrets through the secure provider UI/store. Apply the enable switch last, then use Main's reviewed normal redeploy path so the new configuration reaches serving instances. Changing the stored variable alone does not prove serving configuration changed. CLI syntax reference: [Vercel env](https://vercel.com/docs/cli/env); deployment behavior: [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Verification and rollout sequence for Main

1. Record selected release SHA, Vercel project/environment, database target identity and previous flag state without secret values. Preserve the unrelated ActorLab checkout edit.
2. Keep sending disabled. Inspect the actual table using `psql ... -c '\d+ public.first_contact_log'`, including defaults, primary key and server-role access. Apply only the reviewed missing schema using the commands above. Do not equate `CREATE ... IF NOT EXISTS` success with schema compatibility.
3. Verify known/notable lists, copy, domain, quota, history and suppression storage, and stable HMAC key. Check no cross-product setting was introduced; both senders implement per-product mode.
4. Run isolated tests with mocked providers. Main may perform separately authorized own-address acceptance verification outside this worker: new inbound once, duplicate once, known/notable suppressed, unsubscribe POST persists suppression, scanner GET does not mutate, ambiguous outcomes never retry. LIMS email remains prohibited in this job. Capture provider acceptance versus actual delivery separately.
5. Enable only after those checks and the production-build database review. Monitor sanitized outcome counts, provider receipts, pending/unresolved rows, and draft-required rows. Keep retries/export scheduling and private draft retention in Main's separate controlled task; no maintenance job was run here.

Coverage: LIMS #523 sends contact acknowledgements and newsletter welcomes; early-access/waitlist accepted transactional confirmations are recorded. ActorLab #662 adds newsletter mail and records covered transactional paths. This handoff does not claim that every possible inbound endpoint or draft-retention dependency is implemented.

## Rollback

In each affected verified Vercel project, set Production `FIRST_CONTACT_EMAIL_ENABLED=false` (use `add` instead of `update` only if absent):

```sh
printf %s false | vercel env update FIRST_CONTACT_EMAIL_ENABLED production
```

Redeploy through the controlled route and verify serving requests no longer invoke the first-contact provider. Stop any separately enabled retry job. Existing in-flight accepted sends cannot be recalled. Keep the table, all pending/unresolved/sent/suppression records, HMAC key, unsubscribe route and ActorLab suppression enforcement intact. Do not drop/truncate the table, delete reservations, rotate the key, or disable unsubscribe as rollback. Rollback of this documentation-only change is removal/reversion of these handoff files by the runner.

## Worker verification

- Source review: LIMS #523 SQL callers, flag gates, and absence of a tracked first-contact migration; ActorLab #662 sender, schema script, and rollout runbook inspected. Both proposed schema scripts are additive by static review. Neither was run against a database.
- LIMS sender test command was attempted twice. It could not load `tsx` because this worktree had no installed packages; `npm ci --ignore-scripts --no-audit --no-fund` then failed with `npm error Exit handler never called!` in the restricted environment. A second test attempt still failed at module resolution. An earlier retained receipt at commit `564221b` records 40 passing LIMS tests and 19 passing ActorLab fixture tests, but those are prior-run evidence, not this job’s verification. No provider call, production database operation, deployment, env mutation, email, commit, or push was performed.

TERMINAL_STATE: BLOCKED — The sandbox denied writing `/Users/ops/Hermes/outbox/reviews/FIRST_CONTACT_ENABLE_LIMS_ACTORLAB_20261008.md` (`Operation not permitted`); tests also could not run because `npm ci` failed with `Exit handler never called!` and `tsx` remained unavailable.
