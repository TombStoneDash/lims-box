# LIMS Box Lead-Capture Audit Follow-Ups — 2026-06-23

**Task:** sibling-route follow-up to PR #49 (`docs/lead-capture-audit-2026-06-23.md`)
**Branch base:** `origin/main`
**Audit scope:** three lead-capture API routes that were out of scope for PR #49:
1. `/api/early-access` — early-adopter pilot application
2. `/api/newsletter`   — blog email newsletter signup
3. `/api/contact`      — generic contact form

This audit mirrors the three-leg trace pattern (form → API → write target)
used in PR #49. **No code changes are merged in this PR.**

## Verdicts at a glance

| Route               | Verdict            | Headline                                                                 |
|---------------------|--------------------|--------------------------------------------------------------------------|
| `/api/early-access` | `WIRING_VERIFIED`  | Form, route, and `early_access_applications` DDL all reconcile.          |
| `/api/newsletter`   | `WIRING_VERIFIED`  | 503 + `deferred:true` contract is honored by both server and client.     |
| `/api/contact`      | `WIRING_PARTIAL`   | Works in prod, but writes to an undocumented table (`limsbox_early_access`) with columns the form never collects. Non-blocking schema-of-record drift. |

No `WIRING_FIX_NEEDED` verdicts. No secret reads in route code (all env access
goes through `process.env`). No stop-condition tripped.

---

## Route 1 — `/api/early-access` → `WIRING_VERIFIED`

### Leg 1 — Form (`app/early-adopter/page.tsx`)

```ts
// L42-55
const res = await fetch('/api/early-access', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    labName: form.labName,
    labType: form.labType,
    contactName: form.contactName,
    email: form.email,
    monthlyVolume: form.testVolume,     // form field "testVolume" → POST "monthlyVolume"
    painPoint: form.painPoint,
    source: 'lims.bot/early-adopter',
  }),
});
```
- URL: `/api/early-access` ✓ matches route filename
- Method: `POST` ✓
- Content-Type: `application/json` ✓
- All six form fields are state-bound to controlled `<input>` / `<select>` /
  `<textarea>` elements (`L160-207`), each with `required` HTML5 validation.
- Form rename note: client state field `testVolume` is sent as `monthlyVolume`
  in the POST body — the API route accepts both (see Leg 2 fallback) so this
  is intentional and tolerant.
- Success branch (`L139-149`): renders `<CheckCircle2 /> Application received`
  card; clears form state on success would be ideal but is moot because the
  form is unmounted by the conditional render.
- Error branch (`L215-217`): renders red `Something went wrong…` line under
  the submit button.

### Leg 2 — API route (`app/api/early-access/route.ts`)

```ts
// L9-38
const body = await request.json();
const {
  labName, labType, contactName, email,
  testVolume, monthlyVolume, painPoint, source,
} = body ?? {};

if (!labName || !contactName || !email) {
  return NextResponse.json(
    { error: 'labName, contactName, and email are required' },
    { status: 400 },
  );
}

const record = {
  lab_name: String(labName).trim(),
  lab_type: labType ? String(labType).trim() : null,
  contact_name: String(contactName).trim(),
  email: String(email).trim().toLowerCase(),
  monthly_volume: monthlyVolume
    ? String(monthlyVolume).trim()
    : (testVolume ? String(testVolume).trim() : null),
  pain_point: painPoint ? String(painPoint).trim() : null,
  source: source ? String(source).trim() : 'lims.bot/early-adopter',
};
```

- Validates the three NOT NULL columns up front: `labName`, `contactName`,
  `email` → 400 if any missing.
- Normalizes `email` (trim + lowercase).
- Handles both POST-body shapes: `monthlyVolume` (preferred) and `testVolume`
  (legacy) — the form currently sends `monthlyVolume`, the fallback covers an
  older form shape.
- Default `source = 'lims.bot/early-adopter'` matches DDL default exactly.

### Leg 3 — Supabase insert (`early_access_applications`)

```ts
// route.ts L40-49
const supabase = getSupabase();
if (supabase) {
  const { error } = await supabase.from('early_access_applications').insert(record);
  if (error) {
    console.error('[early-access] Supabase insert failed', error);
    return NextResponse.json({ error: 'Could not save your application' }, { status: 500 });
  }
} else {
  console.warn('[early-access] Supabase not configured — application received but not persisted:', record);
}
```

DDL from `SUPABASE_SETUP.md:34-48`:
```sql
create table if not exists public.early_access_applications (
  id uuid default gen_random_uuid() primary key,
  lab_name text not null,
  lab_type text,
  contact_name text not null,
  email text not null,
  monthly_volume text,
  pain_point text,
  source text default 'lims.bot/early-adopter',
  created_at timestamptz default now()
);
```

| Route field      | Table column      | NOT NULL | Reconciles? |
|------------------|-------------------|----------|-------------|
| `lab_name`       | `lab_name`        | yes      | ✓ required at L21 |
| `contact_name`   | `contact_name`    | yes      | ✓ required at L21 |
| `email`          | `email`           | yes      | ✓ required + normalized |
| `lab_type`       | `lab_type`        | no       | ✓ optional |
| `monthly_volume` | `monthly_volume`  | no       | ✓ optional (with `testVolume` fallback) |
| `pain_point`     | `pain_point`      | no       | ✓ optional |
| `source`         | `source`          | no (default) | ✓ default applied if absent |
| _none_           | `id`              | yes      | ✓ DB default (`gen_random_uuid()`) |
| _none_           | `created_at`      | no       | ✓ DB default (`now()`) |

### Side channels — HT notification + applicant confirmation

- `sendSubmissionNotice` (`route.ts:51-64`): awaits HT email before returning.
- `sendApplicantConfirmation` (`route.ts:67-71`): wrapped in try/catch so a
  Resend failure on the applicant confirmation does NOT affect the 200
  response — correct durability contract (lead is not lost if the applicant
  email send fails).

### Verdict: `WIRING_VERIFIED`

Form → API → Supabase reconciles end-to-end. No NOT NULL violations possible
from the current POST shape.

---

## Route 2 — `/api/newsletter` → `WIRING_VERIFIED`

### Leg 1 — Form (`components/blog/NewsletterSignup.tsx`)

```ts
// L13-39
const res = await fetch('/api/newsletter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, source: 'blog_newsletter' })
});

if (res.ok) {
  setStatus('success');
  setEmail('');
} else if (res.status === 503) {
  const data = await res.json().catch(() => ({}));
  if (data?.deferred) {
    setStatus('success');   // 503 + deferred:true is treated as success
    setEmail('');
  } else {
    setStatus('error');
  }
} else {
  setStatus('error');
}
```

- URL: `/api/newsletter` ✓
- Method: `POST` ✓ Content-Type: `application/json` ✓
- Sends `email` + `source='blog_newsletter'`.
- **The 503 + `deferred:true` short-circuit is the key wiring contract here.**
  Without it, the previous bug (PR #49's base commit `3d4189e` notes the
  false-error fix) would re-emerge: any blog viewer signing up before
  `RESEND_API_KEY` was set would see "Something went wrong" even though the
  signup was recorded in logs. The client now treats `503 { deferred: true }`
  as `'success'`.
- Success UI: `<p>You're in! Check your inbox.</p>` (`L52-53`).
- Error UI: `<p>Something went wrong. Try again?</p>` (`L75`).

### Leg 2 — API route (`app/api/newsletter/route.ts`)

```ts
// L5
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// L7-37
const body = (await req.json()) ?? {};
const { email, source } = body;

if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
  return NextResponse.json(
    { error: 'Valid email is required' },
    { status: 400 }
  );
}

const normalizedEmail = email.trim().toLowerCase();

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.warn('[newsletter-subscribe] RESEND_API_KEY not configured…');
  return NextResponse.json(
    {
      error: 'Email service temporarily unavailable. …',
      deferred: true,
    },
    { status: 503 }
  );
}
```

- This route is the only one of the three that applies an email regex on the
  server — soft-flag #2 in PR #49 specifically called this out as the pattern
  to lift. Already in place here.
- The 503 + `deferred:true` contract is paired exactly with the client at
  `NewsletterSignup.tsx:23-33`. Wire correctness verified by reading both
  sides.

### Leg 3 — External write target: Resend Contacts API

```ts
// route.ts L42-55
const resendResponse = await fetch('https://api.resend.com/contacts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: normalizedEmail,
    audienceId: process.env.RESEND_AUDIENCE_ID || undefined,
    firstName: '',
    lastName: '',
    unsubscribed: false,
  }),
});

if (!resendResponse.ok) {
  console.error('[newsletter-subscribe] Resend API failed:', { status, error });
  return NextResponse.json(
    { error: 'Failed to subscribe. Please try again later.' },
    { status: 503 }
  );
}
```

- Write target is **Resend** (no Supabase row written by this route).
- `audienceId` falls back to `undefined` if `RESEND_AUDIENCE_ID` env is unset,
  in which case Resend stores the contact at the project level without
  audience tagging — graceful degradation.
- A Resend-side failure returns 503 *without* `deferred:true`, so the client
  flips to `error` (correct — this is a real service failure, not a missing-
  config defer).

### Env-var dependencies

| Var                   | Used         | Behavior if missing                                   |
|-----------------------|--------------|-------------------------------------------------------|
| `RESEND_API_KEY`      | route.ts:23  | Returns `503 + deferred:true` → client shows success. |
| `RESEND_AUDIENCE_ID`  | route.ts:50  | Falls back to `undefined`, Resend accepts contact w/o audience. |

### Verdict: `WIRING_VERIFIED`

Both legs of the 503 + `deferred:true` handshake reconcile. Email regex
validation is present. No DB layer to misalign.

---

## Route 3 — `/api/contact` → `WIRING_PARTIAL`

### Leg 1 — Form (`app/contact/page.tsx`)

```ts
// L21-35
const res = await fetch('/api/contact', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(form),   // see form state below
});
```

Form state (`L9-16`):
```ts
const [form, setForm] = useState({
  name: '',
  labName: '',
  email: '',
  labSize: '',
  currentSystem: '',
  message: '',
});
```

- URL: `/api/contact` ✓
- Method/Content-Type: `POST` / `application/json` ✓
- Sends six fields: `name, labName, email, labSize, currentSystem, message`.
- HTML5 validation: `name`, `email`, `labName` are `required`; `labSize` and
  `currentSystem` are `<select>` with empty default; `message` is optional
  `<textarea>`.
- **Important:** the form does NOT send `phone` or `instruments` even though
  the route accepts them (see Leg 2 destructure). Those columns are
  permanently `null` for traffic coming through this UI.
- Success UI: `<CheckCircle2 /> Message sent` card (`L133-138`); also clears
  form state.
- Error UI: red text + email fallback hint (`L246`).

### Leg 2 — API route (`app/api/contact/route.ts`)

```ts
// L9-29
const body = await request.json();
const { name, labName, email, labSize, currentSystem, message, phone, instruments } = body ?? {};

if (!name || !email || !labName) {
  return NextResponse.json(
    { error: 'Name, email, and lab name are required' },
    { status: 400 },
  );
}

const record = {
  name: String(name).trim(),
  labName: String(labName).trim(),
  email: String(email).trim().toLowerCase(),
  labSize: labSize ? String(labSize).trim() : null,
  currentSystem: currentSystem ? String(currentSystem).trim() : null,
  message: message ? String(message).trim() : null,
  phone: phone ? String(phone).trim() : null,
  instruments: instruments ? String(instruments).trim() : null,
  timestamp: new Date().toISOString(),
};
```

- Validates `name`, `email`, `labName` — matches client `required` markings.
- Normalizes `email`.
- Defensively accepts `phone` and `instruments` for forward-compat (no UI
  surface sends them today — see soft-flag below).

### Leg 3 — Supabase insert (`limsbox_early_access`)

```ts
// route.ts L45-55
const { error: dbError } = await supabase.from('limsbox_early_access').insert({
  name: record.name,
  lab_name: record.labName,
  email: record.email,
  lab_size: record.labSize ?? null,
  current_lims: record.currentSystem ?? null,
  pain_point: record.message ?? null,
  phone: record.phone ?? null,
  instruments: record.instruments ?? null,
  source: 'contact_form',
});
```

- Comment at `route.ts:41` states: `Target: public.limsbox_early_access (live
  in prod Supabase since 49d).`
- **PR #37 incident referenced at `route.ts:43-44`:** the prior version of
  this route inserted into `contact_leads` which does not exist; that bug
  was corrected in a follow-up. Current code targets the real table.

### Durability contract (`route.ts:36-99`)

This route uses an **OR-success** pattern:

| DB save | Email send | HTTP response |
|---------|------------|---------------|
| ✓       | ✓          | 200 success   |
| ✓       | ✗          | 200 success   |
| ✗       | ✓          | 200 success   |
| ✗       | ✗          | 500 error     |

Both paths run inside individual `try/catch` so neither blocks the other.
Confirmed via reading `route.ts:91-97`. This is the strongest durability
contract of the three routes.

### Schema-of-record gap (soft flag, see below)

The table `limsbox_early_access` has no DDL block in `SUPABASE_SETUP.md`.
`SUPABASE_SETUP.md:34-48` documents `early_access_applications` (a different
table) and the route comment claims `limsbox_early_access` is "live in prod
Supabase since 49d." Without the schema in the repo we cannot do a
field-by-field NOT NULL reconciliation here — only an "all-fields-nullable"
trust based on the inferred shape of the INSERT.

### Verdict: `WIRING_PARTIAL`

The route works in prod (per the comment + OR-success pattern), but two
non-blocking gaps exist (see soft flags). The form/API/DB-row contract is
internally consistent — calling this "verified" without a DDL of record would
overstate it.

---

## Soft-flagged observations (non-blocking, future work)

These are not broken wiring — they are defensive-hardening or
clean-up items the audit surfaced. Each is reversibly its own follow-up.

### `/api/early-access`
1. **No email regex on server.** Same gap PR #49 flagged on `/api/waitlist`.
   The HTML5 `type="email"` catches typos in real browsers; lift
   `EMAIL_REGEX` from `/api/newsletter` (`route.ts:5`) for parity.
2. **Silent acknowledgement when Supabase is unconfigured.** When
   `getSupabase()` returns null at `route.ts:47-49`, the route logs a
   `console.warn` and returns 200 — same backstop pattern as `/api/waitlist`.
   HT email still fires; lead isn't lost. Flag for awareness only.
3. **No dedupe.** Same applicant can apply N times. No `UNIQUE (email)` in
   `early_access_applications` DDL.

### `/api/newsletter`
1. **No DB durability backstop.** Unlike `/api/contact` (DB + email) and
   `/api/early-access` (DB + HT email + applicant email), this route has only
   one write target (Resend). If Resend is down AND `RESEND_API_KEY` is set,
   the lead is lost (only a server log captures it). Adding a parallel
   Supabase insert into a `newsletter_subscribers` table would mirror the
   PR #49 backstop philosophy. Not blocking — Resend uptime is high.
2. **`firstName: ''`, `lastName: ''` are explicit empty strings.** Could be
   omitted entirely. Cosmetic.
3. **`RESEND_AUDIENCE_ID` not documented in `SUPABASE_SETUP.md`.** The doc
   table at `SUPABASE_SETUP.md:10-17` lists `RESEND_API_KEY` but not the
   audience ID. Trivial doc-only follow-up.

### `/api/contact`
1. **Target table is undocumented.** `limsbox_early_access` does not appear in
   `SUPABASE_SETUP.md`. PR #49 audit already covered `waitlist` and
   `early_access_applications` DDL but not this third table. Either (a) add
   DDL to `SUPABASE_SETUP.md`, or (b) consolidate `/api/contact` writes onto
   the documented `early_access_applications` table (which has near-identical
   columns: `lab_name`, `contact_name`, `email`, `pain_point`, `source`).
   Option (b) would eliminate the schema drift but is a CODE change — out of
   scope for this docs-only PR.
2. **Form sends 6 fields, route accepts 8, DB INSERT writes 9.** Specifically
   `phone` and `instruments` are accepted by `route.ts:10` and written to
   `limsbox_early_access` columns at `route.ts:52-53`, but the only UI
   surface that calls `/api/contact` (`app/contact/page.tsx:9-16`) does not
   collect them. They'll always be null. Either add the fields to the form,
   or remove from the route. Not blocking — null is a valid value.
3. **No email regex on server.** Same as `/api/early-access` soft flag #1.
4. **Audit-log on every submission.** `route.ts:32` does
   `console.log('[contact] submission received:', record)`. This dumps the
   entire record (including `email`) into Vercel runtime logs. Low PII risk
   for a B2B contact form, but worth knowing.

---

## Stop-condition checks

| Check | Result |
|-------|--------|
| Any route reads secrets from code (not via `process.env`)? | No. All env access via `process.env` only. |
| Any audit finding is a true bug? | No `WIRING_FIX_NEEDED`. `/api/contact` has docs/schema drift (PARTIAL) but works in prod. |
| `git fetch origin` succeeded and matches default branch? | ✓ fetch OK, default branch confirmed `main` via `gh repo view`. |

No stop conditions tripped. Proceeding with docs-only PR.

---

## Files NOT touched

This is a docs-only PR. The following were read for the audit but NOT
modified:

- `app/api/early-access/route.ts`
- `app/api/newsletter/route.ts`
- `app/api/contact/route.ts`
- `app/early-adopter/page.tsx`
- `app/contact/page.tsx`
- `components/blog/NewsletterSignup.tsx`
- `lib/notify.ts`
- `lib/supabase.ts`
- `SUPABASE_SETUP.md`
- `docs/lead-capture-audit-2026-06-23.md` (PR #49 — template only, not edited)

No `.env*`, no `prisma/`, no `lib/db*`, no schema files were opened for write.
No untracked files on the sibling branch (`.env.fresh`, `prisma/seed-demo.ts`)
were touched.

## Reproduce

```sh
# 1. Locate form callers
grep -rln "/api/early-access" app components  # → app/early-adopter/page.tsx
grep -rln "/api/newsletter"   app components  # → components/blog/NewsletterSignup.tsx
grep -rln "/api/contact"      app components  # → app/contact/page.tsx

# 2. Read each route handler
cat app/api/early-access/route.ts
cat app/api/newsletter/route.ts
cat app/api/contact/route.ts

# 3. Reconcile against schema (where present)
grep -A12 "create table if not exists public.early_access_applications" SUPABASE_SETUP.md
# Note: limsbox_early_access has no DDL in SUPABASE_SETUP.md — schema drift
# acknowledged in the route comment at app/api/contact/route.ts:41.

# 4. Lint/build smoke (not run in this audit — docs-only PR)
npm run lint
npm run build
```
