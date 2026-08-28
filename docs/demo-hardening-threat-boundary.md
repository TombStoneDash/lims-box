# Supervised demo hardening threat boundary

## Protected assets

- Personnel, competency, training, document, review, procedure, and authorization views.
- Every route capable of reaching those records.
- The synthetic operator rehearsal and its deterministic baseline.
- Preview databases: preview builds must not run schema pushes.

## Trust boundary

- `/demo` remains public because it is a non-persistent synthetic walkthrough.
- `/demo/operator`, `/admin`, `/senaite-demo`, and all personnel/admin APIs require configured Basic Auth.
- Missing credentials return 503; invalid or absent credentials return 401.
- Any non-GET/HEAD/OPTIONS request to a protected route returns 405, including authenticated requests. Existing database-backed forms and APIs are therefore read-only at the middleware boundary.
- The authenticated operator sandbox changes only React state built from fixed `demo-*` identifiers. It has no database client, API request, browser storage, upload, email, or customer-data path.
- Reset and reload both restore the same committed baseline.
- Vercel preview/development/local builds skip `prisma db push`; only the existing explicit production build behavior may run it.

## In-scope threats

- Fail-open deployments caused by missing credentials.
- Anonymous access to admin/demo records or mutation routes.
- Authenticated misuse of legacy database-backed mutation controls.
- Direct POSTs to personnel-pack APIs that previously bypassed middleware.
- Synthetic changes surviving a reset or reaching customer/production data.
- Preview builds touching the connected database.
- Users mistaking fictional data for production data.

## Non-goals

- This is not customer identity, SSO, multi-tenancy, RBAC, or a production authorization model.
- It does not make the legacy admin UI production-ready.
- It does not create customer accounts, an installer, a compliance determination, or a production deployment.
- Production database push behavior is preserved but not invoked by this lane.

## Rollback

Close the draft PR and delete its branch. The change is isolated above PR #96, has no schema migration, and requires no data rollback. Local browser state disappears on reload.
