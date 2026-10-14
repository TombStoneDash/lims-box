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

## Not proven here

This architecture note does not prove supplier support, protocol choice,
throughput, latency, retention, privacy posture, production hosting,
accreditation alignment, or regulatory conformity. Those remain gated by
discovery, review, and customer approval.
