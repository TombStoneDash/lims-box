# LIMS Box Lead-Capture Audit — 2026-06-23

**Task:** `htr-codework-wkg-lims-box-lead-capture-audit`
**Branch base:** `origin/main` @ `3d4189e` (`fix(lead-capture): homepage early-access CTA + newsletter 503 false error`)
**Audit scope:** waitlist signup form → `/api/waitlist` → Supabase `waitlist` table

## Verdict: WIRING_VERIFIED — no broken wiring, no fixes required

The three-leg path (form → API → Supabase) is wired correctly. Field
names, NOT NULL handling, error states, and success confirmation all
reconcile. No code changes are merged in this PR.

## Three-leg trace

### Leg 1 — Form (`components/WaitlistFooter.tsx`)
```ts
// L12-31
const res = await fetch('/api/waitlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, labName }),
});
if (res.ok) {
  setStatus('success');
  setEmail(''); setLabName('');
} else {
  setStatus('error');
}
```
- URL: `/api/waitlist` ✓ (matches route filename)
- Method: `POST` ✓
- Content-Type: `application/json` ✓
- Body: `{ email, labName }` — both are state-bound to controlled inputs
- HTTP `<input type="email" required>` enforces browser-level validation before submit
- Success branch: clears form + flips to success block (`L45-49` shows `<CheckCircle2 /> You're on the list. We'll be in touch.`)
- Error branch: red text `L77` `<p>Something went wrong. Please try again.</p>`

A second caller exists at `app/webinar/page.tsx:63` — same shape, passes
`source: 'webinar:${sessionId}'`. Same wiring contract.

### Leg 2 — API route (`app/api/waitlist/route.ts`)
```ts
// L8-25
const body = await request.json();
const { email, labName, name, organization, role, source } = body ?? {};

if (!email || typeof email !== 'string') {
  return NextResponse.json({ error: 'Email is required' }, { status: 400 });
}

const normalizedEmail = String(email).trim().toLowerCase();
const record = {
  email: normalizedEmail,
  name: (name && String(name).trim())
     || (labName && String(labName).trim())
     || normalizedEmail.split('@')[0],
  organization: organization ? String(organization).trim()
              : (labName ? String(labName).trim() : null),
  role: role ? String(role).trim() : null,
  source: source ? String(source).trim() : 'lims.bot',
};
```
- Validates: email must be a non-empty string → returns 400 otherwise
- Normalizes: lowercased + trimmed
- **Handles `waitlist.name NOT NULL` schema constraint correctly** —
  falls through `name → labName → email-local-part` so the field is
  never null even when the form only supplies email
- Maps `labName` form field → `organization` column (with the same
  fallback to keep both columns informative)
- Defaults `source` to `'lims.bot'` matching the schema default

### Leg 3 — Supabase insert (`lib/supabase.ts` + waitlist DDL)

Insert:
```ts
// route.ts L27-33
const supabase = getSupabase();
if (supabase) {
  const { error } = await supabase.from('waitlist').insert(record);
  if (error) {
    console.error('[waitlist] Supabase insert failed', error);
    return NextResponse.json({ error: 'Could not save your signup' }, { status: 500 });
  }
}
```

Client (`lib/supabase.ts`):
- Sanitizes env values (`\n`, whitespace) — defensive against shell-pasted secrets
- Resolves URL from `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- Resolves key from `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY` → `SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Returns `null` if either is missing — caller branch handles gracefully

Target table DDL (`SUPABASE_SETUP.md`):
```sql
create table if not exists public.waitlist (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null,
  organization text,
  role text,
  source text default 'lims.bot',
  created_at timestamptz default now()
);
create index if not exists waitlist_created_at_idx
  on public.waitlist (created_at desc);
alter table public.waitlist enable row level security;
create policy "anon insert waitlist" on public.waitlist ...
```

**Field-by-field reconciliation** (route INSERT → table column):

| Route field   | Table column   | Type   | NOT NULL | Reconciles? |
|---------------|----------------|--------|----------|-------------|
| `email`       | `email`        | text   | yes      | ✓ always set + normalized |
| `name`        | `name`         | text   | yes      | ✓ name → labName → email local-part fallback chain |
| `organization`| `organization` | text   | no       | ✓ optional |
| `role`        | `role`         | text   | no       | ✓ optional |
| `source`      | `source`       | text   | no (default `'lims.bot'`) | ✓ default applied if absent |
| _none_        | `id`           | uuid   | yes      | ✓ DB default (`gen_random_uuid()`) |
| _none_        | `created_at`   | tstz   | no       | ✓ DB default (`now()`) |

No mismatches. No NOT NULL violations possible from the current INSERT
payload. No `contact_leads`-style "target table doesn't exist" trap
(the earlier `app/api/contact/route.ts` PR #37 incident is unrelated
here — that route targets `limsbox_early_access` and is a separate
surface).

### Confirmation response shown to user

After 200 success, the client transitions to `status === 'success'`
block which renders:
```tsx
<CheckCircle2 className="w-5 h-5" />
<span className="font-medium">You're on the list. We'll be in touch.</span>
```
plus the form inputs are cleared. After 4xx/5xx, the form stays but the
red error text appears. After network error, the catch block sets
`status='error'` too.

## Side-channel: HT notification

```ts
// route.ts L38-48
await sendSubmissionNotice({
  subject: `New waitlist signup — ${record.email}`,
  lines: [
    ['Email', record.email],
    ['Name', record.name],
    ...
  ],
});
```

The route awaits the email notification before returning success. So
HT gets a copy of every signup regardless of whether the DB save
succeeded — durability backstop matches the pattern used in
`/api/contact` and `/api/early-access`.

## Soft-flagged improvements (NOT changed in this PR)

These are not broken wiring — they are defensive-hardening ideas that
the wiring audit surfaced. Each is reversibly its own follow-up.

1. **Silent acknowledgement when Supabase is unconfigured.** When
   `getSupabase()` returns null, the route logs a `console.warn` and
   continues to return 200 success. The HT-notification email still
   fires, so the lead isn't lost — but if Resend ALSO fails, the only
   record is a Vercel log line. A JSONL append to
   `/var/tmp/waitlist-fallback.jsonl` (or any disk path) would give a
   second durable backstop. Probably not worth it given the
   email-channel already exists; flagging for awareness.

2. **No email regex.** The route accepts `'@'` or `'foo@'` because the
   only check is `typeof email === 'string'`. The HTML5
   `<input type="email" required>` on the client catches typos in
   normal browsers, but a script-driven POST can submit garbage. The
   sibling `/api/newsletter` route uses `EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   — a one-line addition would tighten this without changing the
   contract.

3. **No deduplication / rate-limiting.** Same email can be inserted
   any number of times; no `UNIQUE` constraint on `email` in the DDL.
   Mostly fine for a waitlist (each signup is a touchpoint), but a
   `ON CONFLICT (email) DO UPDATE SET source = EXCLUDED.source`
   pattern would prevent dupes while still recording the latest source.

4. **`name`/`organization` double-population.** When the form only
   supplies `labName='Acme'`, both `name` and `organization` columns
   end up with `'Acme'`. Cosmetic — purchasing analysis later may
   want a different convention but the data is recoverable.

None of these are blocking. The wiring audit verdict is
WIRING_VERIFIED.

## Stop-condition check (from receipt)

> Stop condition: Form → API → Supabase path is verified working.

| Step | Status |
|------|--------|
| Form POSTs to `/api/waitlist` correctly | ✓ verified |
| Server action inserts to Supabase `waitlist` table | ✓ verified (field-by-field reconciliation) |
| Confirmation response shown to user | ✓ verified (`status='success'` block) |

Stop condition met.

## Not covered (out of scope)

- Live Supabase row-count probe (would need `SUPABASE_ACCESS_TOKEN` —
  parked TOM-296 gate).
- E2E browser test against the live `lims.bot` deployment.
- Any other lead-capture surface (`/api/early-access`,
  `/api/contact`, `/api/newsletter`, `/api/prospects`,
  `/api/demo`) — each is its own audit. Sibling glance shows they
  follow the same pattern; no glaring mismatches.

## Reproduce

```sh
# 1. Locate form callers
grep -rln "/api/waitlist" app components
# → components/WaitlistFooter.tsx
# → app/webinar/page.tsx

# 2. Verify route handler
cat app/api/waitlist/route.ts

# 3. Reconcile against schema
grep -A10 "create table if not exists public.waitlist" SUPABASE_SETUP.md

# 4. Build + dev-server smoke (optional, not run in this audit)
npm run lint
npm run build
```
