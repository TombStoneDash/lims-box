# SENAITE read adapter

`lib/senaite-read` exports `createSenaiteReadAdapter()` for server-side callers.
It is inert until `listSamples()` is called, and not configured unless both
environment values are nonblank: `SENAITE_BASE_URL` and
`SENAITE_API_TOKEN`. Its only caller is the `/senaite-live` page below; no jobs
or other integrations activate it.

The URL is the SENAITE **site root**, such as `https://lab.example.invalid/site`,
not the API endpoint. HTTPS is required; embedded credentials, query strings,
and fragments are rejected. Keep these variables server-side, never `NEXT_PUBLIC_`.
The API/gateway must accept a separately provisioned read-only Bearer token;
this adapter does not manage accounts. Legacy `SENAITE_READ_*` and
`OHWORKS_SENAITE_*` settings do not enable it.

Each `listSamples()` call first GETs `@@API/senaite/v1/users/current` and
continues only when SENAITE answers `authenticated: true`. Real SENAITE 2.6.0
answers a missing, invalid or expired token with HTTP 200, treats the caller as
Anonymous, and returns an empty sample list; without this check a rejected token
would look like a lab with no samples. A `false` answer returns the fixed code
`unauthenticated` and the sample query is never sent. Only that boolean is read
from the identity record; names, emails and roles are discarded.

The sample read is then a GET to `@@API/senaite/v1/AnalysisRequest`, following the
existing repository client contract in `senaite/client.py`. Optional `sampleId`
and `reviewState` filters are encoded as query parameters. `limit` defaults to 25
and accepts integers from 1 through 100. It reads one page; it never follows
pagination links, redirects, or upstream URLs. Requests disable caching, time out
after 10 seconds each, and have no retries. There is no arbitrary endpoint or write API.

## Customer-tenant reads

A customer page must read through `adapter.forClient(clientUid)`, which binds
one SENAITE Client UID (32 lowercase hex characters) to every `listSamples()`
call. The caller cannot widen, replace or drop it. An invalid UID returns
`invalid-query` without a request. The scoped query adds `getClientUID`.

That filter alone is not trusted. senaite.jsonapi builds catalog queries only
from keys that are catalog indexes and silently drops the rest. If the index is
missing or renamed, SENAITE would answer HTTP 200 with every client's samples.
So every returned record must carry `getClientUID` equal to the bound client. A
foreign, missing or malformed client UID on any record fails the whole page with
`tenant-mismatch`; no partial list is returned. The client UID is checked, not
exposed: the public sample shape is unchanged. Unscoped `listSamples()` stays
for lab-staff callers and does not require client fields.

Results distinguish `not_configured`, `ok` (including an empty collection, only
after a proven sign-in), and `error` (`invalid-query`, `unauthenticated`,
`request-failed`, `invalid-response`, `tenant-mismatch`).
Successful records expose only `uid`, `id`, nullable `title`, and nullable
`reviewState`. Missing identities, malformed collections, malformed identity answers, SENAITE's
HTTP-200 `success: false` errors, and oversized pages fail closed. Errors expose fixed codes only, without raw server bodies or credentials.
Missing or invalid configuration performs no request. HTTP, transport, timeout,
and JSON failures return safe results rather than throwing into pages. Callers
must render the explicit unavailable state; there is no fallback to synthetic data.

Run `npm run test:senaite-read` and `npm run typecheck`.
`tests/senaite-read/recorded-senaite-contract.test.ts` replays responses recorded
from a real SENAITE 2.6.0 server (see `tests/senaite-read/fixtures/README.md`).
`npm run test:senaite-live` is an opt-in acceptance test against a running
SENAITE; it is skipped unless `SENAITE_LIVE_ORIGIN` is set and runs the signed-in
read only when `SENAITE_LIVE_READ_TOKEN` is also set (see the test header). With
`SENAITE_LIVE_CLIENT_UID` as well, it runs the tenant read and cross-checks each
returned sample's `parent_uid` (its Client folder) against the bound client. The existing CI command
`npm run test:all` recursively discovers `tests/senaite-read/adapter.test.ts`.
The full suite also discovers all 12 migrated checks in
`tests/ohworks/senaite-synthetic-workflow.test.ts`. They now use this adapter
instead of the missing module from closed, unmerged PR #103. The CI tests inject
in-memory transports; no live SENAITE access or credentials are needed. The
recorded SENAITE 2.6.0 responses cover the anonymous and rejected-token paths
only. A signed-in read against a real server, whether its gateway accepts a
Bearer token, and whether its listing carries `getClientUID`, are still unproven
until a read-only token exists. If the listing lacks that field, tenant reads
fail closed with `tenant-mismatch` rather than showing unscoped data.

## `/senaite-live` page

`app/senaite-live/page.tsx` is the first page backed by the adapter. It is
server-rendered on every request (`force-dynamic`, nothing prerendered at build
time), behind the same operator Basic-auth middleware as `/senaite-demo`
(`lib/demo-access.ts` and the `middleware.ts` matcher), and lists the 25 newest
samples: ID, title and a readable review state (unknown states are shown as sent).
The token never reaches the browser.

`lib/senaite-read/view.ts` maps every adapter result to one explicit state with
fixed wording: **not connected** (no configuration, no request), **sign-in
rejected** (SENAITE answered as Anonymous; the page says this is not an empty
lab), **unreachable**, **untrusted answer**, **no samples** (only after a proven
sign-in), or the sample table. No upstream text other than sample fields is
rendered, and there is no synthetic fallback.

`tests/senaite-read/live-page.test.tsx` renders the real page with the recorded
SENAITE 2.6.0 rejected-token answers and with in-memory signed-in answers.
Swapping in the adapter from before the sign-in check (#766) makes two of its
cases fail. With no `SENAITE_*` variables set, a deploy shows only the
not-connected state.
