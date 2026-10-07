# SENAITE read adapter

`lib/senaite-read` exports `readSenaiteSamples()` and an inert
`createSenaiteReadAdapter()` factory with `enabled` and `listSamples()`.
The module is server-only. No pages, routes, or jobs activate live reads.

Set both `SENAITE_BASE_URL` and `SENAITE_API_TOKEN` on the server. The URL is
an HTTPS SENAITE **site root**, for example `https://lab.example.invalid/site`.
Embedded credentials, query strings, fragments, and non-HTTPS URLs are rejected.
The token is sent as `Authorization: Bearer <token>`; the target deployment must
support bearer authentication and the token must be provisioned with read-only
permissions. This adapter does not provision users or tokens. Do not expose
these variables with `NEXT_PUBLIC_`.

Missing, blank, or invalid configuration resolves to:

```json
{"status":"unavailable","reason":"not_configured","detail":"SENAITE_BASE_URL and SENAITE_API_TOKEN must both be set to valid values"}
```

It makes no request in this state. Pages can handle this result explicitly;
connection failures also resolve to results rather than throwing or showing
synthetic samples as live data. This replaces the older `SENAITE_READ_*` Basic
auth configuration and PR #103's OHWorks-specific credentials/mode switch.

The sole operation is GET `@@API/senaite/v1/AnalysisRequest`. Optional `sampleId`
and `reviewState` filters are encoded; review state defaults to `sample_received`.
The integer limit defaults to 25 and accepts 1–100. Reads fetch one page and
never follow redirects, pagination links, or upstream URLs. Each request uses
`no-store`, omits browser credentials, and aborts after ten seconds, including
while reading its body. There are no retries or write operations.

Results distinguish `ok`, `empty`, `invalid`, and `unavailable`. Successful
records contain only `source`, `id`, `sampleType`, `reviewState`, `clientId`, and
`dateReceived`. The parser retains PR #103's documented wire aliases and optional
field defaults. Missing identities/states, malformed envelopes, and oversized
pages fail closed, with no partial records. Errors do not expose upstream bodies,
URLs, tokens, or transport exception text. `real_senaite` identifies the adapter
path, not independently verified live data.

Run `npm run test:senaite-read` for adapter contracts, or `npm run test:all` for
the entire repository, including the migrated twelve-test OHWorks HTTP/QC
harness. Tests replay checked-in synthetic HTTP fixtures and inject transports;
they require no server or credentials. Fixture provenance is documented beside
the payload. Timer tests advance a mock clock to prove request abortion.
These are local contract tests, not proof of compatibility with a live deployment.
