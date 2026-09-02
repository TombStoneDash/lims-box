# Architecture

## Current increment

The current implementation is a read-only Next.js presentation layer backed by version-controlled synthetic fixtures. It performs no network calls and writes no data. All routes live below `/pilot/ohworks`.

```text
Synthetic fixtures
      |
      v
OHWorks pilot routes ----> workflow / instrument / personnel / audit views
      |
      +----> contract tests enforce labels, gates, and prohibited claims
```

## Candidate production shape

The future shape is deliberately technology-neutral until discovery is complete.

```text
Analyzer or middleware
  -> transport boundary
  -> immutable redacted message evidence + hash
  -> parser version
  -> mapping version
  -> idempotency check
  -> quarantine or structured result
  -> technical review
  -> separately authorized release
  -> append-only audit evidence
```

## Trust boundaries

- Instrument messages are untrusted input and never authorize release.
- Mapping changes require review, versioning, effective dates, and rollback.
- Unknown identifiers stop in quarantine; the system never guesses.
- Clinical decisions remain with explicitly authorized people.
- Customer identity and authorization must be server-enforced, not inferred from UI state.
- Raw instrument evidence must be protected, minimized, and retained only under an approved policy.

## Reliability controls to design after discovery

- Durable inbound queue, bounded retry, dead-letter/quarantine handling, and replay protection.
- Idempotency keys and transactional promotion of parsed results.
- Health, lag, error-rate, mapping-version, and quarantine-age telemetry.
- Backup/restore testing with stated recovery objectives.
- Simulator fixtures and golden-message regression tests for every approved mapping revision.
