# LIAISON XL → SENAITE result import

Point 5 of the ten-point OHWorks/SENAITE ask: wire the LIAISON XL result-import
path. `lib/ohworks-liaison-import` parses an instrument export.
`lib/senaite-result-import` takes those parsed results to SENAITE. No route,
page, job or script calls it yet.

```ts
const importer = createSenaiteResultImporter();
const plan = await importer.importResults(parsed.results, { instrumentSerial: 'LXL-…' });
const done = await importer.importResults(parsed.results, { instrumentSerial: 'LXL-…', apply: true });
```

## Configuration

It needs `SENAITE_BASE_URL`, the site root as in [senaite-read.md](./senaite-read.md),
and `SENAITE_RESULT_IMPORT_TOKEN`. That token belongs to an account that may
edit analysis results. Keep it separate from the read-only `SENAITE_API_TOKEN`,
which never enables writes. The same rules apply as for the read adapter:
HTTPS only, no embedded credentials, no redirects, 10 s timeout, no retries.
Configuration that is missing or invalid sends no request.

## What it does

1. It proves sign-in through `users/current`. SENAITE 2.6 answers a rejected
   token with HTTP 200 as Anonymous, so an explicit `authenticated: true` is
   required.
2. It builds the whole plan from GETs before writing anything. For each sample ID
   it reads `AnalysisRequest?getId=…`, using an exact ID match only. It then reads
   `Analysis?getRequestUID=…&complete=yes`, and every returned analysis must have
   `parent_uid` equal to that sample. senaite.jsonapi drops unknown filters
   silently, so if any record belongs to another sample the import fails as
   `scope-mismatch`. If any read fails, the result is an error and nothing is written.
3. A result is `ready` only when all of these hold: the instrument serial matches
   `instrumentSerial`, the sample is `sample_received`, exactly one analysis with
   that keyword is still `unassigned` or `assigned`, that analysis has no result,
   and its unit equals the exported unit. Otherwise the result is `skipped` with a
   fixed reason. A retracted original beside its open retest is not ambiguous.
4. With `apply: true`, each ready result is POSTed to `update` as `{uid, Result}`
   and nothing else. The analysis is then read back. The import never submits,
   verifies, retracts, overwrites or converts units. An analyst still reviews
   and submits every imported value in SENAITE. A refused write is `write-failed`.
   A read-back that does not show the value is `write-unconfirmed`.

The default is a plan only, with no writes. One call takes at most 200 results.
Errors are fixed codes only and never include upstream bodies or credentials.

## Tests

`npm run test:senaite-import` runs `tests/senaite-result-import/`. It parses a
LIAISON export and imports it into an in-memory senaite.jsonapi stand-in, then
checks the stored values and states. It also covers ignored filters,
partial-read failure and refused writes, and replays the recorded real SENAITE
2.6.0 rejected-token answer.

**Not proven yet:** a write against a real SENAITE. That needs an import
account on a synthetic-data server. It is also unproven whether that server's
`update` accepts `Result` for an `unassigned` analysis through a Bearer gateway.
