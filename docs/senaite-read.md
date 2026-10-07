# SENAITE read adapter

`lib/senaite-read` exports `createSenaiteReadAdapter()` for server-side callers.
It is inert until `listSamples()` is called, and not configured unless both
environment values are nonblank: `SENAITE_BASE_URL` and
`SENAITE_API_TOKEN`. No routes, UI, jobs, or existing integrations activate it.

The URL is the SENAITE **site root**, such as `https://lab.example.invalid/site`,
not the API endpoint. HTTPS is required; embedded credentials, query strings,
and fragments are rejected. Keep these variables server-side, never `NEXT_PUBLIC_`.
The API/gateway must accept a separately provisioned read-only Bearer token;
this adapter does not manage accounts. Legacy `SENAITE_READ_*` and
`OHWORKS_SENAITE_*` settings do not enable it.

The only operation is GET to `@@API/senaite/v1/AnalysisRequest`, following the
existing repository client contract in `senaite/client.py`. Optional `sampleId`
and `reviewState` filters are encoded as query parameters. `limit` defaults to 25
and accepts integers from 1 through 100. It reads one page; it never follows
pagination links, redirects, or upstream URLs. Requests disable caching, time out
after 10 seconds, and have no retries. There is no arbitrary endpoint or write API.

Results distinguish `not_configured`, `ok` (including an empty collection), and `error`.
Successful records expose only `uid`, `id`, nullable `title`, and nullable
`reviewState`. Missing identities, malformed collections, and oversized pages fail
closed. Errors expose fixed codes only, without raw server bodies or credentials.
Missing or invalid configuration performs no request. HTTP, transport, timeout,
and JSON failures return safe results rather than throwing into pages. Callers
must render the explicit unavailable state; there is no fallback to synthetic data.

Run `npm run test:senaite-read` and `npm run typecheck`. The existing CI command
`npm run test:all` recursively discovers `tests/senaite-read/adapter.test.ts`.
The full suite also discovers all 12 migrated checks in
`tests/ohworks/senaite-synthetic-workflow.test.ts`. They now use this adapter
instead of the missing module from closed, unmerged PR #103. All adapter tests
inject in-memory transports and replay recorded synthetic fixtures (see
`tests/senaite-read/fixtures/README.md`); no live
SENAITE access or credentials are needed. These tests validate the local contract,
not compatibility with a live deployment.
