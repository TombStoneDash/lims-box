# OHWorks supervised demo architecture

## Current local architecture

The current implementation is a local Next.js presentation and client-side
interaction layer backed by version-controlled synthetic fixtures.

```text
Synthetic OHWorks fixtures
  -> workflow reducer
  -> role-filtered view selectors
  -> assistant source admission
  -> commercial-claims render filter
  -> OHWorks routes under /pilot/ohworks
```

## Current trust boundaries

- The role switch changes only the client-visible synthetic view; it is not
  identity proof or authorization.
- Assistant knowledge records are fictional, admitted through S1 source policy,
  and filtered by exact tenant plus data class before answer assembly.
- Instrument messages are represented only as stable synthetic IDs and
  dispositions; there is no live transport or parser connection.
- Unknown mappings and malformed payloads stop in quarantine.
- Release is a separate event after technical review, never a side effect of
  ingestion.

## Candidate future shape after discovery

```text
LIAISON XL or another approved source
  -> supplier-confirmed transport
  -> immutable redacted message evidence
  -> parser version
  -> mapping version
  -> idempotency and replay checks
  -> structured result or quarantine
  -> technical review
  -> separately authorized release
  -> append-only audit evidence
```

## Real SENAITE read adapter (source-only)

`lib/ohworks-senaite.ts` adds a server-only, fail-closed read adapter that
mirrors the read surface of `senaite/client.py` (search by review state,
Basic auth against `@@API/senaite/v1`). It is wired into
`app/pilot/ohworks/samples/page.tsx` behind an explicit mode boundary:

- `OHWORKS_SENAITE_MODE` defaults to `synthetic`, which keeps the existing
  synthetic sample workflow unchanged.
- Setting `OHWORKS_SENAITE_MODE=real` additionally renders a clearly
  labelled "Real SENAITE read adapter" panel driven by `readSenaiteSamples()`.

`readSenaiteSamples()` never guesses and never substitutes synthetic data
for a real one. It returns exactly one explicit state:

- `unavailable` — `OHWORKS_SENAITE_BASE_URL` / `OHWORKS_SENAITE_USERNAME` /
  `OHWORKS_SENAITE_PASSWORD` are not all set, the request errored, timed
  out, or SENAITE returned a non-2xx status.
- `invalid` — SENAITE responded but the shape did not validate (missing
  `items` array, or a sample record missing `getId`/`review_state`).
- `empty` — the response validated and contained zero samples.
- `ok` — the response validated and normalized samples are returned, each
  tagged `source: 'real_senaite'`.

This module makes no network call in this repository: no worktree, test, or
build run sets `OHWORKS_SENAITE_MODE=real` or the SENAITE credential
variables, and `readSenaiteSamples()` short-circuits to `unavailable` before
touching `fetch` whenever configuration is missing. Proving a working
customer tenant (real credentials, a reachable SENAITE host, and a live
verification) remains a separate, gated step outside this slice.

## Not proven here

This architecture note does not prove supplier support, protocol choice,
throughput, latency, retention, privacy posture, production hosting,
accreditation alignment, or regulatory conformity. Those remain gated by
discovery, review, and customer approval.
