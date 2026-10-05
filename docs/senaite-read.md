# SENAITE read adapter

`lib/senaite-read` exports `createSenaiteReadAdapter()` for server-side callers.
It is inert until `listSamples()` is called, and disabled unless all three
environment values are nonblank: `SENAITE_READ_URL`, `SENAITE_READ_USER`, and
`SENAITE_READ_PASSWORD`. No routes, UI, jobs, or existing integrations activate it.

The URL is the SENAITE **site root**, such as `https://lab.example.invalid/site`,
not the API endpoint. HTTPS is required; embedded credentials, query strings,
and fragments are rejected. Keep these variables server-side, never `NEXT_PUBLIC_`.
Use a separately provisioned read-only account; this adapter does not manage accounts.

The only operation is GET to `@@API/senaite/v1/AnalysisRequest`, following the
existing repository client contract in `senaite/client.py`. Optional `sampleId`
and `reviewState` filters are encoded as query parameters. `limit` defaults to 25
and accepts integers from 1 through 100. It reads one page; it never follows
pagination links, redirects, or upstream URLs. Requests disable caching, time out
after 10 seconds, and have no retries. There is no arbitrary endpoint or write API.

Results distinguish `disabled`, `ok` (including an empty collection), and `error`.
Successful records expose only `uid`, `id`, nullable `title`, and nullable
`reviewState`. Missing identities, malformed collections, and oversized pages fail
closed. Errors expose fixed codes only, without raw server bodies or credentials.
Callers must handle errors explicitly; there is no fallback to synthetic data.

Run `npm run test:senaite-read` and `npm run typecheck`. The existing CI command
`npm run test:all` recursively discovers `tests/senaite-read/adapter.test.ts`.
All adapter tests inject in-memory transports and use synthetic fixtures; no live
SENAITE access or credentials are needed. These tests validate the local contract,
not compatibility with a live deployment.
