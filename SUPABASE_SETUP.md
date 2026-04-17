# Supabase + Resend setup for form persistence

The `/api/waitlist` and `/api/early-access` routes persist submissions to Supabase
and send an email notification via Resend. Both integrations are optional at the
code level — if env vars are missing, the route logs the submission and still
returns `200` so the UI does not break during local dev. In production, set both.

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

-- Helpful indexes for the notification workflow
create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);
create index if not exists early_access_created_at_idx on public.early_access_applications (created_at desc);

-- Row-level security. Keep RLS on, rely on service-role key for inserts.
alter table public.waitlist enable row level security;
alter table public.early_access_applications enable row level security;
```

If you prefer the anon key instead of the service-role key, add permissive
insert policies:

```sql
create policy "anon insert waitlist" on public.waitlist
  for insert to anon with check (true);
create policy "anon insert early_access" on public.early_access_applications
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
  -d '{"labName":"Clear Creek","labType":"Environmental","contactName":"R. Moreno","email":"r@clearcreek.test","monthlyVolume":"100-500","painPoint":"audit readiness"}'
```

Both should return `{"success":true}`. Without Supabase env vars they warn in
the server log but still succeed; with them set, rows land in the tables.
