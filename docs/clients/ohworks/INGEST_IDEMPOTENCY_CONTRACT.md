# OHWorks synthetic ingest-idempotency contract

## What this is

`lib/ohworks-ingest-idempotency.ts` is a pure, offline, synthetic function
that decides how a repeated or conflicting OHWorks ingest attempt should be
classified. It exists to answer a discovery question raised in the OHWorks
supervised demo (`lib/ohworks-pilot.ts`): "replay and duplicate handling
remain discovery questions." This contract is a worked hypothesis for that
question, built entirely on fabricated identifiers.

## Inputs it will accept

Exactly seven opaque, bounded fields, and nothing else:

- `tenantId`, `messageSourceId`, `correlationId` - opaque synthetic tokens
  that together form the identity being tracked.
- `parserVersionId`, `mappingVersionId` - opaque synthetic version tokens,
  checked against an allow-list.
- `observedAtUtc` - a strict UTC timestamp (`Z` suffix, no offsets).
- `fingerprint` - a 64-character canonical hash of the bounded fields the
  caller chooses to fingerprint. This module never computes or interprets
  the fingerprint's meaning; it only compares it byte-for-byte.

The current UTC "now" is always injected by the caller, never read from the
system clock, so every decision is reproducible in a test.

## What it rejects, unconditionally

Any field outside the seven above - including but not limited to patient,
employee, specimen, or other person-identifying data, credentials, tokens,
endpoints or hostnames, raw instrument payloads, free text, notes, or
instrument-network details - causes immediate quarantine before any
identity or replay logic runs. There is no code path in this module that
reads, stores, or logs such data.

## The five decisions

- **new** - first sighting of an identity; the binding is recorded.
- **idempotent_replay** - same identity, same fingerprint, at or after the
  bound time. Given identical inputs, the returned decision is
  byte-identical (deeply equal and JSON-stable) every time.
- **conflict** - same identity, different fingerprint, at or after the
  bound time. The prior binding is left untouched.
- **stale** - an attempt whose `observedAtUtc` is earlier than the identity's
  bound time. Treated as out-of-order, not as a decision-making input.
- **quarantined** - fail-closed catch-all for: malformed or oversize
  fields, non-opaque IDs, a malformed or non-strict-UTC timestamp, a clock
  more than the configured skew ahead of the injected "now," an unknown
  parser or mapping version, a version change against an already-bound
  identity, or a prior binding that is itself internally contradictory.

Quarantine and conflict decisions never mutate prior state
(`applyIngestDecision` only writes a binding for `new`), so a malformed or
conflicting attempt can never silently overwrite a previously accepted
binding.

## What this does not prove

This module is a synthetic, offline decision function only. It does not
prove, demonstrate, or imply:

- Any vendor or OHWorks acknowledgement of this design.
- Exactly-once delivery, or any delivery guarantee, on a real transport.
- Validation against a real LIAISON XL, Orchidlive, or any other supplier
  message format.
- Compliance, certification, or accreditation of any kind (CLIA, HIPAA,
  ISO 15189, or otherwise).
- Readiness for a real customer, real data, or a production deployment.

No route, UI, database, queue, network adapter, authentication, customer
data, persistence layer, external send, merge, deploy, or activation is
included in or implied by this contract. Tests run fully offline against
`node --test`.
