# Supabase + Resend setup for form persistence

Three routes persist lead submissions to Supabase and send an email notification
via Resend:

| Route | Table |
| ----- | ----- |
| `/api/waitlist` | `public.waitlist` |
| `/api/early-access` | `public.early_access_applications` |
| `/api/contact` | `public.limsbox_early_access` |

All three integrations are optional at the code level — if env vars are missing,
the route logs the submission and still returns `200` so the UI does not break
during local dev. In production, set both Supabase and Resend.

> **Note on the two early-access tables.** `early_access_applications` is
> populated by the `/early-adopter` landing page form and is the canonical
> early-access pipeline. `limsbox_early_access` is the older table backing
> the contact form on `/contact`; it has been live in prod for ~49 days and
> uses a slightly wider column set. The names look interchangeable but are
> distinct schemas — do not merge or rename them without a migration plan.

## Required Vercel env vars

| Name                        | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `SUPABASE_URL`              | Project URL, e.g. `https://xxxx.supabase.co`                            |
| `SUPABASE_SERVICE_ROLE_KEY` | Preferred — bypasses RLS for inserts. Use server-side only.             |
| `SUPABASE_ANON_KEY`         | Fallback if service role is not set. Requires RLS insert policies.      |
| `RESEND_API_KEY`            | Resend API key for submission notifications.                            |
| `NOTIFY_EMAIL`              | Optional override. Default: `hudtaylor@gmail.com`.                      |
| `NOTIFY_FROM_EMAIL`         | Optional override. Default: `LIMS BOX <notifications@lims.bot>`.        |

After setting, redeploy (or `vercel env pull` locally to test).

## SQL — run once in Supabase → SQL Editor

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

-- `limsbox_early_access` already exists in prod (created ~2026-05-06 to back
-- the contact form). Schema is reproduced here so fresh environments can
-- bootstrap the contact flow. If you are dropping/recreating in prod, snapshot
-- existing rows first — this table has been the canonical contact lead store
-- for ~49 days.
create table if not exists public.limsbox_early_access (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  lab_name text not null,
  email text not null,
  lab_size text,
  current_lims text,
  pain_point text,
  phone text,
  instruments text,
  source text default 'contact_form',
  created_at timestamptz default now()
);

-- Helpful indexes for the notification workflow
create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);
create index if not exists early_access_created_at_idx on public.early_access_applications (created_at desc);
create index if not exists limsbox_early_access_created_at_idx on public.limsbox_early_access (created_at desc);

-- Row-level security. Keep RLS on, rely on service-role key for inserts.
alter table public.waitlist enable row level security;
alter table public.early_access_applications enable row level security;
alter table public.limsbox_early_access enable row level security;
```

### Column → form-field mapping for `limsbox_early_access`

The contact form on `/contact` currently sends 6 of these 9 nullable-able
columns. The route (`app/api/contact/route.ts`) maps:

| API request key | Column name |
| --------------- | ----------- |
| `name` | `name` |
| `labName` | `lab_name` |
| `email` | `email` |
| `labSize` | `lab_size` |
| `currentSystem` | `current_lims` |
| `message` | `pain_point` |
| `phone` (not in contact form UI) | `phone` |
| `instruments` (not in contact form UI) | `instruments` |
| (constant) | `source = 'contact_form'` |

`phone` and `instruments` are reserved for future contact-form expansion or
direct API callers (e.g. CRM imports). They are intentionally nullable.
See `docs/lead-capture-audit-followups-2026-06-23.md` for the audit that
surfaced this drift.

If you prefer the anon key instead of the service-role key, add permissive
insert policies:

```sql
create policy "anon insert waitlist" on public.waitlist
  for insert to anon with check (true);
create policy "anon insert early_access" on public.early_access_applications
  for insert to anon with check (true);
create policy "anon insert limsbox_early_access" on public.limsbox_early_access
  for insert to anon with check (true);
```

## Local smoke test

```bash
npm run dev
curl -X POST http://localhost:3000/api/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","labName":"Test Lab"}'

curl -X POST http://localhost:3000/api/early-access \
  -H 'Content-Type: application/json' \
  -d '{"labName":"Test Lab","labType":"Environmental","contactName":"Test User","email":"test@example.com","monthlyVolume":"100-500","painPoint":"audit readiness"}'

curl -X POST http://localhost:3000/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test User","labName":"Test Lab","email":"test@example.com","labSize":"10-50","currentSystem":"spreadsheets","message":"audit readiness"}'
```

All three should return `{"success":true}`. Without Supabase env vars they warn
in the server log but still succeed; with them set, rows land in the tables.
