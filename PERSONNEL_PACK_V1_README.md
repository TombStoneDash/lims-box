# Personnel Pack — v1

Workflow documentation support for CLIA-certified clinical labs. Internal-only, single-instance, local-first.

**Scope:** track personnel records, competency matrix, training log, director sign-offs. Generate a survey-ready PDF bundle grouped by role.

**Not in scope (v1):** auth, multi-tenant, billing, marketing routes, mobile polish, email notifications, public-facing routes, automated CMS submission, automated accreditation guarantees.

## Setup

```bash
git checkout feature/personnel-pack-v1
npm install
npx prisma migrate dev
npm run seed       # populates 3 sample people
npm run dev
```

Visit:

- `http://localhost:3000/admin` — dashboard
- `http://localhost:3000/admin/people` — people list
- `http://localhost:3000/admin/survey-ready` — survey-ready bundle (HTML view)
- `http://localhost:3000/admin/survey-ready/pdf` — PDF download

## Build

```bash
npm run build
npm start
```

## Reset DB

```bash
npm run db:reset   # drops, re-migrates, re-seeds
```

## File upload (training certificates)

v1 is filesystem-only. Drop certificate PDFs into `./uploads/` and reference the filename when logging a training. No upload UI — by design (keeps the path auditable and offline-first).

## Data model

- `Person` — name, role, CLIA cert #, hire date, active flag
- `Competency` — type (Direct Observation / Sample Re-test / QC Review / Problem Solving / Maintenance / Blind Sample), status (completed / due / overdue / exempt), completed + expires dates, notes
- `Training` — course, provider, completed date, hours, certificate filename
- `SignOff` — director name, scope (Initial / Annual re-competency / Method validation), signed date, notes

## Routing

All admin routes live under `/admin/*`. The marketing site at `/` is unchanged.

## Forbidden language (used nowhere)

"AI compliance," "Replaces your LIMS," "CMS-ready guaranteed," "Audit-proof," "Ransomware-proof," "Game-changing," "Revolutionary."

Used instead: "workflow documentation support," "survey-readiness organization," "human-reviewed drafting," "local-first lab records."

## Stack

- Next.js 15 (app router) + TypeScript
- Tailwind CSS
- Prisma 6.x + SQLite (single file at `prisma/dev.db`)
- pdfkit (server-side PDF generation, no Chromium)
- No authentication

## Deviations from packet

- Routes namespaced under `/admin/*` instead of bare `/`, `/people`, etc. — necessary to coexist with the existing marketing site in the same repo without route collision. Fully reversible.
- PDF generated with `pdfkit` rather than `@react-pdf/renderer` or `puppeteer` (packet allowed choice).
- Prisma pinned to v6.x — Prisma 7 moved `datasource.url` out of `schema.prisma` and into `prisma.config.ts`; v6 is the last simple-config major.
