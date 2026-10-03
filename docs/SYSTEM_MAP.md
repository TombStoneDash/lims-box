# SYSTEM MAP

Read this before changing code. This maps repository behavior, not a verified deployment.
Evidence baseline: `4f5744f`. Paths are relative to the repository root.
UNKNOWN means the repository does not establish the answer. Never copy secret values here.

## 1. Product and main user flows

- Next.js App Router site with React, TypeScript, Prisma, and a separate Python voice client (`package.json`, `app/`, `voice/`).
- Public pages explain laboratory software and collect interest. They do not prove a deployed customer LIMS.
- Clinical/environmental intake uses `app/_intake/IntakeForm.tsx` → `app/api/prospects/route.ts` → PostgreSQL `Prospect`.
- Early-adopter applications use `app/early-adopter/page.tsx` → `app/api/early-access/route.ts` → `lib/earlyAccessHandler.ts`.
  The handler saves a prospect, notifies the operator, and attempts an applicant confirmation.
- Contact uses `app/contact/page.tsx` → `app/api/contact/route.ts` → Supabase plus an operator email.
- Waitlist uses `components/WaitlistFooter.tsx` or `app/webinar/page.tsx` → `app/api/waitlist/route.ts` → prospect plus operator email.
- Newsletter uses `components/blog/NewsletterSignup.tsx` → `app/api/newsletter/route.ts` → Resend Contacts.
- Personnel Pack uses `app/personnel-pack/EmailGateForm.tsx` → `app/api/personnel-pack-download/route.ts`.
  It validates email, verifies a bundled PDF hash, saves a Supabase lead, then attempts emails.
  Only the reviewed ISO 15189 pack is mapped for automatic fulfillment (`lib/personnelPackFulfillment.ts`).
  Unsupported selections return 409. Missing or changed PDF bytes return 503. GET serves the reviewed PDF without an email gate.
- `/bot` answers from a local corpus. `/demo/assistant` answers limited questions about fabricated JSON records.
  `/pilot/ohworks/bot` answers from synthetic OHWorks fixtures. None calls a cloud model.
- `/demo` is an interactive synthetic walkthrough. `/demo/operator` rehearses state changes in browser memory.
- `/senaite-demo` shows mock lab dashboards. `/pilot/ohworks` shows synthetic accessions, QC, reports, personnel, and audit evidence.
- `/admin` reads personnel, competencies, training, sign-offs, controlled documents, reviews, and authorizations.
  PDF/ZIP exports exist. Mutation handlers exist, but middleware blocks unsafe HTTP methods on protected paths.
- The separate `python -m voice` flow listens for a wake word, parses commands, calls SENAITE, and speaks responses.
  It can create samples, record results, and request workflow transitions (`voice/commands.py`, `senaite/client.py`).
  It is not the browser demo and can write to its configured server.

## 2. External services, configuration, failures, and plans

### Plan routing

`app/pricing/page.tsx` displays Starter, Growth, and Enterprise tiers.
No subscription table, entitlement check, or plan-based provider selection appears in the runtime paths below.
All listed integrations use shared configuration. Voice selection is by platform/environment, not user plan.
Actual purchased plans, vendor quotas, and account-to-plan assignments are UNKNOWN.

### Resend: email and newsletter contacts

- Direct email caller: `lib/notify.ts` → Resend `/emails`.
  Env: `RESEND_API_KEY`, `NOTIFY_EMAIL`, `NOTIFY_FROM_EMAIL`, `NOTIFY_FALLBACK_EMAIL`.
  Callers: `app/api/contact/route.ts`, `app/api/waitlist/route.ts`, `app/api/early-access/route.ts`, `app/api/personnel-pack-download/route.ts`.
- Missing key, transport failure, and non-OK responses reject delivery.
  Only operator notices retry on a 403 containing “domain is not verified”, using Resend's test sender and fallback recipient.
  Applicant confirmations do not use that fallback. Quota failures have no special retry or provider switch.
- Direct pack-delivery caller: `app/api/personnel-pack-download/route.ts` → Resend `/emails`.
  Env: `RESEND_API_KEY`; sender is fixed in source. Missing key or non-OK response throws.
  Email failure does not block a verified download after the lead is saved; response reports `emailed: false`.
- Newsletter caller: `app/api/newsletter/route.ts` → Resend `/contacts`.
  Env: `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`.
  Missing key or rejected response returns 503; thrown request failure returns 500. No fallback store or quota retry.
- Contact and waitlist succeed if either storage or operator delivery succeeds; both failing returns 500.
  Early access uses the same rule; applicant confirmation failure remains non-fatal.
  These double-failure paths log a recovery copy of the lead. Logs can therefore contain contact data.

### PostgreSQL through Prisma

- Client: `lib/prisma.ts`; connection: `prisma/schema.prisma`, `prisma.config.ts`.
  Env: `DATABASE_URL`; `NODE_ENV` controls development client caching.
- Direct call sites are indexed in section 3. The client does not select a database provider by plan.
- `prisma.config.ts` supplies a SQLite-style fallback URL when unset, but the schema declares PostgreSQL.
  Do not assume this is a working offline database. Actual database host/vendor is UNKNOWN.
- Prospect intake has no database-error catch. Admin reads also lack a general fallback.
  Failures propagate to request/page errors. Early-access and waitlist can fall back to operator delivery.
  Conversion reporting catches database failure as 503 (`app/api/admin/conversion-report/route.ts`).
  No database quota recovery, queue, or replica fallback is implemented.

### Supabase: separate lead and suppression stores

- Client: `lib/supabase.ts` using `@supabase/supabase-js`.
  URL env precedence: `SUPABASE_URL`, then `NEXT_PUBLIC_SUPABASE_URL`.
  Key precedence: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Missing configuration returns null. Session persistence and token refresh are disabled.
- Calls: `app/api/contact/route.ts` inserts `limsbox_early_access`.
  Missing config/write errors still allow operator email; both paths failing returns 500.
- Calls: `app/api/personnel-pack-download/route.ts` inserts `personnel_pack_leads`.
  Missing config/write errors return 503 before email/download fulfillment is returned.
- Separate client: `app/api/unsubscribe/route.ts` reads and updates `sensor_waitlist`.
  Env: `NEXT_PUBLIC_SUPABASE_URL`, then key `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
  Missing config/write failure returns 500. No quota-specific recovery exists.
  Known, absent, and already-suppressed recipients get the same success response after processing.
  This route does not call Resend Contacts; cross-store suppression synchronization is UNKNOWN.

### Auth

- No external auth-provider call was found. Supabase is used for storage, not interactive login.
- `middleware.ts` and `lib/demo-access.ts` use HTTP Basic Auth.
  Env: `ADMIN_BASIC_USER`, `ADMIN_BASIC_PASS`.
  `app/api/admin/conversion-report/route.ts` also checks these credentials itself.
- Protected prefixes: `/admin`, `/senaite-demo`, `/demo/operator`, `/api/admin`, `/api/authorizations`,
  `/api/competencies`, `/api/documents`, `/api/people`, `/api/procedures`, `/api/reviews`.
- Missing credentials: 503. Wrong/missing authorization: 401. Authenticated methods other than GET/HEAD/OPTIONS: 405.
  Public `/demo`, `/api/demo`, and `/pilot/ohworks` are outside this matcher.
  OHWorks role selection is synthetic view filtering, not a verified customer identity system.

### Voice, speech models, and SENAITE

- `voice/listener.py` constructs local `faster_whisper.WhisperModel` and uses local microphone capture.
  Env in `voice/config.py`: `LIMS_VOICE_WHISPER_MODEL`, `LIMS_VOICE_WHISPER_DEVICE`, `LIMS_VOICE_WHISPER_COMPUTE_TYPE`.
  Model weights may download on first use; exact remote account/endpoint is not specified in this repo: UNKNOWN.
  Missing dependencies stop startup. Model initialization has no alternative-model fallback.
- `voice/tts.py` runs Windows SAPI, macOS `say`, Piper, or console output.
  Env: `LIMS_VOICE_TTS_ENGINE`, `LIMS_VOICE_PIPER_MODEL`.
  Exceptions fall back to console. Some subprocesses use `check=False`, so a nonzero exit may not trigger fallback.
  No hosted TTS API or billable speech quota handling is implemented.
- Other voice config: `LIMS_VOICE_SAMPLE_RATE`, `LIMS_VOICE_SILENCE_THRESHOLD`, `LIMS_VOICE_SILENCE_DURATION`, `LIMS_VOICE_LISTEN_TIMEOUT`.
- `senaite/client.py` uses urllib and Basic Auth against `@@API/senaite/v1`.
  `voice/listener.py` supplies `LIMS_VOICE_SENAITE_BASE_URL`, `LIMS_VOICE_SENAITE_USERNAME`, `LIMS_VOICE_SENAITE_PASSWORD`.
  Calls include version, AnalysisRequest, Analysis, and workflow-transition endpoints.
  Request timeout is 10 seconds. HTTP/network errors raise; `ping()` instead returns false.
- Offline ping queues commands (`voice/listener.py`, `voice/queue.py`).
  Env: `LIMS_VOICE_QUEUE_DB`, `LIMS_VOICE_RETRY_INTERVAL`, `LIMS_VOICE_MAX_RETRY_ATTEMPTS`.
  Default drain interval is 30 seconds; exhausted commands are deleted after 50 recorded failures.
  Caveat: `voice/commands.py` catches execution exceptions and returns error text.
  The drain loop marks any returned response done, so those failures are not reliably retried.
- `lib/ohworks-senaite-create.ts` validates calls to an injected adapter. It is not a concrete HTTP integration.

### AI, SMS, payments, and analytics

- AI: `lib/bot/engine.ts`, `lib/bot/corpus.ts`, `lib/bot/demo-engine.ts`, `lib/ohworks-pilot.ts` use deterministic local logic.
  Routes: `app/api/bot/route.ts`, `app/api/demo/assistant/route.ts`, `app/pilot/ohworks/bot/api/route.ts`.
  No model API key or model-provider call is wired here. Unsupported questions receive refusals or missing-evidence answers.
  `/api/bot` has a per-instance in-memory rate limiter returning 429 and catches internal errors as 500.
- SMS: no SMS provider call or SMS environment variable found in runtime source.
- Payments: `app/api/checkout/personnel-pack/route.ts` GET redirects to early-adopter intake; POST returns a redirect instruction.
  Env: `NEXT_PUBLIC_SITE_URL`. No Stripe SDK, charge call, subscription processing, or payment webhook is wired here.
- Analytics: `lib/bot/telemetry.ts` writes bounded events to console; `lib/leadAttribution.ts` records campaign attribution.
  No external analytics SDK/call found. `lib/bot/model-receipt.ts` provides an in-memory receipt store, not hosted telemetry.
  Hosting-side analytics settings and log retention are UNKNOWN.

### Browser services and hosting

- YouTube: `components/VideoSection.tsx` loads `youtube-nocookie.com` embeds and `i.ytimg.com` posters.
  `app/page.tsx` supplies `NEXT_PUBLIC_COMMERCIAL_VIDEO_ID` with a source fallback.
  `app/commercial/page.tsx` can embed `youtube.com`; its `lib/commercial-video.ts` ID is currently empty, so no player is selected there.
  No provider-error/quota handler. Failed remote loads leave unavailable media.
- Calendly: `app/demo/page.tsx` loads `assets.calendly.com/assets/external/widget.js` and a scheduling widget.
  `app/contact/page.tsx` links to Calendly. `app/cola/page.tsx` links using `NEXT_PUBLIC_CALENDLY_URL` or a source default.
  No booking API/webhook or quota recovery is implemented. A blocked widget cannot load scheduling.
- QR service: `app/cola/page.tsx` loads an image from `api.qrserver.com` encoding an attributed application URL.
  No env or failure handler; a failed request loses the QR image, not the ordinary CTA link.
- Fonts: `app/layout.tsx` preconnects to Google Fonts hosts. This is a connection hint, not a font API integration.
- Vercel: `vercel.json`, `package.json`, `next.config.js`, `scripts/vercel-db-push-gate.mjs` define hosting/build behavior.
  Env: `VERCEL_ENV`; canonical host redirects target `lims.bot`.
  No application-level hosting failover exists. Actual project, deploy hooks, quotas, and outage behavior are UNKNOWN.

## 3. Data stores and tables touched

Prisma models are defined in `prisma/schema.prisma`; no table-name remapping is declared.

| Tables/models | Code that accesses them |
| --- | --- |
| `Prospect` | `app/api/prospects/route.ts`, `app/api/early-access/route.ts`, `app/api/waitlist/route.ts`; conversion reporting through `app/api/admin/conversion-report/route.ts` |
| `Person`, `Competency`, `Training`, `SignOff` | `app/admin/actions.ts`, `app/admin/page.tsx`, `app/admin/people/page.tsx`, `app/admin/people/[id]/page.tsx`, `app/admin/survey-ready/page.tsx`, `app/admin/survey-ready/pdf/route.ts`, `prisma/seed.ts` |
| `Document`, `DocumentVersion` | `app/admin/pp-actions.ts`, `app/admin/documents/page.tsx`, `app/admin/documents/[id]/page.tsx`, `app/api/documents/route.ts`, `app/api/documents/[id]/versions/route.ts`, `app/api/documents/[id]/versions/current/route.ts` |
| `ReviewEvent` and related `Competency`/`Person` | `app/admin/pp-actions.ts`, `app/admin/competencies/[id]/page.tsx`, `app/api/competencies/[id]/reviews/route.ts`, `app/api/competencies/[id]/reviews/export/route.ts`, `app/api/reviews/upcoming/route.ts` |
| `Procedure`, `Authorization` and related personnel | `app/admin/pp-actions.ts`, `app/admin/procedures/page.tsx`, `app/admin/procedures/[id]/page.tsx`, `app/api/procedures/route.ts`, `app/api/procedures/[id]/authorized-personnel/route.ts`, `app/api/people/[id]/authorizations/route.ts`, `app/api/authorizations/[id]/revoke/route.ts` |
| Personnel graph including reviews, authorizations, procedures | `app/api/admin/personnel-pack/survey-export/route.ts` |
| Supabase `limsbox_early_access`, `personnel_pack_leads`, `sensor_waitlist` | Exact callers and failure behavior in section 2. These are separate from Prisma models. |
| SQLite `pending_commands` | `voice/queue.py`: serialized command arguments, timestamps, attempts, last error |

- `app/admin/people/[id]/edit/page.tsx`, `app/admin/competencies/new/page.tsx`, `app/admin/trainings/new/page.tsx`, and `app/admin/signoffs/new/page.tsx` also read personnel.
- `prisma/seed.ts` deletes existing sign-offs, training, competencies, and people before inserting example records.
- SENAITE stores AnalysisRequest/Analysis resources behind its API. Physical database schema is UNKNOWN here.
- Bundled JSON, TypeScript fixtures, PDFs, and Markdown are local assets, not live customer records.
- `app/api/unsubscribe/route.ts` attempts a fingerprinted audit append under `../../clawd/logs/unsubscribe-<date>.jsonl` relative to cwd.
  Audit write failure is logged and does not undo suppression. Hosting persistence of that directory is UNKNOWN.
- Operator rehearsal state and bot rate limits are memory-only (`app/demo/operator/demo-operator-sandbox.tsx`, `app/api/bot/route.ts`).

## 4. Scheduled jobs and webhooks

- No deployed cron declaration or incoming vendor webhook route was found in `vercel.json`, `.github/workflows/`, or App Router handlers.
- Voice queue draining is a daemon thread while the Python listener runs, not a hosted scheduled job.
- `app/api/reviews/upcoming/route.ts` calculates upcoming reviews on request; it does not schedule reminder email.
- Unsubscribe supports GET and POST, including one-click unsubscribe input. It is not a verified Resend event webhook.
- `scripts/smoke-prod-2026-06.sh` and `scripts/smoke-survey-export.sh` are manual HTTP checks, not schedulers.
  Do not point them at production as part of a routine docs change.
- Any owner-account cron, campaign automation, external SENAITE worker, or webhook registration is UNKNOWN.

## 5. CI and deploy path

- `package.json` declares pnpm 9.15.9; GitHub workflows use Node 22 and `npm ci` with `package-lock.json`.
  `postinstall` runs `prisma generate`.
- `.github/workflows/ci.yml`: all PRs and pushes to main; OHWorks tests, ESLint, typecheck.
- `.github/workflows/lint-ci.yml`: all PRs and main pushes; ESLint and typecheck.
- `.github/workflows/full-tests-ci.yml`: all PRs and main pushes; `npm run test:all`.
  `scripts/run-all-tests.mjs` discovers `.test.ts` and `.test.tsx`; it does not discover `.test.mjs`.
- `.github/workflows/attribution-ci.yml`: path-filtered attribution tests, typecheck, build.
- `.github/workflows/personnel-pack-fulfillment-ci.yml`: path-filtered pack tests, typecheck, lint, build with a fixture database URL.
- `.github/workflows/survey-export-golden-ci.yml`: path-filtered export regression, typecheck, build with a fixture database URL.
- `npm run build` runs `next build`. `npm run vercel-build` runs selected tests, typecheck, client generation, the database gate, then Next build.
- `scripts/vercel-db-push-gate.mjs` runs `prisma db push --skip-generate` only when `VERCEL_ENV` is production.
  Preview/development/unset environments skip the push. This is not `prisma migrate deploy`.
- `vercel.json` declares Next.js and a host redirect. No GitHub workflow deploy step is present.
  Whether Vercel deploys main automatically, which build command it selects, and its rollback policy are UNKNOWN.
- `app/api/health/route.ts` returns a static OK response and timestamp. It does not probe databases or email.
- No Markdown/docs lint is configured in `package.json`, `eslint.config.mjs`, or the workflows.
  Keep map updates docs-only. Use `git diff --check`; do not add a new lint framework for this file.

## 6. Owner review boundaries

Get owner review before changing these areas. This is a change-safety rule, not proof of configured branch protection.

- Payments and pricing: `app/api/checkout/personnel-pack/route.ts`, `app/pricing/page.tsx`.
  Adding a real payment provider changes the current application-only flow.
- Auth: `middleware.ts`, `lib/demo-access.ts`, conversion-report credential checks, and protected path lists.
  Removing the method guard exposes existing database-writing actions/routes.
- Email and suppression: `lib/notify.ts`, newsletter/contact/waitlist/early-access/pack routes, `lib/personnelPackFulfillment.ts`, `lib/unsubscribe.ts`, unsubscribe route.
  Confirm recipients, sender domain, suppression behavior, and approved PDF before changing delivery.
- Migrations/data: `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`, `prisma.config.ts`, database build gate, Supabase table contracts.
  `npm run db:reset` forces a migration reset and seeds data. Do not run it against a shared database.
- Production build wiring can mutate the database. Obtain the actual target and recovery procedure before running a production build.
- Voice/SENAITE writes and demo-to-live adapters need owner confirmation of the target server and allowed data.

## 7. Fake, mock, and sample data shown to users

- `app/demo/page.tsx` contains sample timelines, results, staff, and dashboard values for the public walkthrough.
- `app/api/demo/route.ts` returns hard-coded samples, results, QC, custody, and method data with an explicit synthetic note.
- `lib/bot/demo-engine.ts` imports fabricated records from `data/synthetic/`; the assistant is read-only.
- `lib/demo-data.ts`, `lib/senaite-demo-qc.ts`, and `lib/senaite-demo-equipment.ts` support `/senaite-demo` mock displays.
  A SENAITE-looking page is not evidence of a live SENAITE connection.
- `fixtures/ohworks/supervised-demo.ts`, `lib/ohworks-pilot.ts`, and `lib/ohworks-demo-*.ts` supply synthetic OHWorks panels and assistant evidence.
  `app/pilot/ohworks/audit/export/route.ts` exports synthetic evidence, not a customer audit trail.
- `lib/demo-operator-state.ts` supplies the browser-only rehearsal dataset; changes do not persist to a lab database.
- `prisma/seed.ts` inserts example personnel. Whether those records exist in any deployed admin database is UNKNOWN.
- `app/case-study/page.tsx` labels its scenario illustrative. `app/roi-calculator/page.tsx` calculates estimates from assumptions.
  Neither establishes measured customer results.

## 8. UNKNOWN: questions for the owner's accounts

- Which account/project owns each Resend, Supabase, database, Vercel, Calendly, YouTube, and SENAITE configuration?
- Which env names are actually populated in production and previews? Are databases isolated?
- What are the vendor plans, balances, quotas, regions, retention settings, and incident contacts?
- Is the Resend sender domain verified? Which audience is active? Does suppression propagate across all sending systems?
- Are the Supabase tables, constraints, grants, and row-level policies deployed as expected?
- Which PostgreSQL migrations are applied? Are migration-only constraints preserved by production `db push`?
- What deploy trigger, build-command override, branch protection, backup, and restore process is configured?
- Does a live SENAITE instance use this Python client? Which credentials, model cache, and queue files does it use?
- Which external schedules, webhooks, email campaigns, analytics settings, or payment systems exist outside this repo?
- Which customer-facing workflows are approved for real data, and which remain supervised demos?
