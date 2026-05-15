# Dual-track site — v1

Public marketing/landing site with two parallel tracks (clinical + environmental) into the same LIMS BOX product. Same product, two doorways.

**Scope:** marketing pages + intake forms. No app, no auth, no payments. Visitors land → read → fill intake form → goes into `prospects` table for HT follow-up.

**Branch:** `feature/dual-track-site`

## Routes

| Route | Purpose |
|---|---|
| `/start` | Splash chooser (two large cards: Clinical / Environmental) |
| `/clinical` | Clinical-track landing |
| `/clinical/intake` | Clinical intake form |
| `/environmental` | Environmental-track landing |
| `/environmental/intake` | Environmental intake form |
| `/about` | Founder note |
| `/api/prospects` | POST endpoint, writes to SQLite `Prospect` table |

The existing `/` marketing homepage is **untouched**. HT can later swap `/` to redirect to `/start`, or replace the homepage entirely — preserved as a reversible default.

## Setup

```bash
git checkout feature/dual-track-site
npm install
npx prisma migrate dev
npm run dev
```

Visit `http://localhost:3000/start`.

## Build

```bash
npm run build
```

All routes compile. Splash + landings are static, intake forms are static + client-side fetch, `/api/prospects` is dynamic.

## Database

Single model:

```prisma
model Prospect {
  id              String   @id @default(cuid())
  track           String   // "clinical" or "environmental"
  name            String
  email           String
  labName         String
  labSize         String
  accreditations  String   // JSON array stringified
  painPoint       String?
  source          String?
  fieldBenchSplit Int?     // env only
  createdAt       DateTime @default(now())
}
```

SQLite file at `prisma/dev.db` (gitignored).

## Inspect prospects

```bash
npx prisma studio
# OR
sqlite3 prisma/dev.db "SELECT * FROM Prospect ORDER BY createdAt DESC;"
```

## Style

- Inter font (default browser sans), slate-900 + slate-50 base
- Clinical accent: teal-600 (#0D9488)
- Environmental accent: emerald-700 (#047857)
- No animations, no shadows, no gradients
- Mobile-responsive

## Deployment notes

**SQLite + Vercel limitation:** the packet specified SQLite, which works locally but has caveats on Vercel (filesystem is read-only at runtime, function instances are ephemeral). Two paths to production:

1. **Quick:** swap `Prospect` model to write to existing Supabase project (already in `package.json`). Migration is small (rename `prisma.prospect.create` → `supabase.from('prospects').insert`).
2. **Clean:** point `DATABASE_URL` to a real Postgres (Neon, Railway, etc.) and `npx prisma migrate deploy`.

HT decides which path before flipping `/start` to public.

## Forbidden phrases check

`grep -i` across `/app/start/`, `/app/clinical/`, `/app/environmental/`, `/app/about/`, `/app/_intake/`, `/app/api/prospects/` for:

- "AI compliance"
- "Cybersecurity product"
- "Ransomware-proof"
- "Replaces your LIMS"
- "CAP/CLIA automation"
- "Game-changing"
- "Revolutionary"
- "Thrilled to announce"
- "Audit-proof"
- "Guaranteed accreditation"

**0 hits.**

Used instead: "workflow documentation support," "survey-readiness organization," "offline workflow continuity," "human-reviewed drafting," "local-first lab documentation."
