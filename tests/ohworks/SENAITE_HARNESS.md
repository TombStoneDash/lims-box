# Synthetic HTTP integration harness

Run `node --import tsx --test tests/ohworks/senaite-synthetic-workflow.test.ts`
or `npm run test:all`. All 12 workflow checks now use the generic adapter at
`lib/senaite-read`. PR #103 was closed unmerged; the missing
`lib/ohworks-senaite.ts` is no longer a prerequisite.

The harness injects only its HTTP transport and asserts complete GET options
and normalized responses outside the adapter error handler. It forbids global
fetch and uses public synthetic token/configuration literals at an `.invalid`
host. Recorded synthetic fixtures are documented in
`tests/senaite-read/fixtures/README.md`.

Coverage: successive reads, 60 ordered summaries, query encoding, optional
summary fields, empty results, malformed envelopes/records, HTTP and transport
failures, abort rejection, missing configuration, and the Westgard QC hold gate.
The generic contract returns `ok` with an empty array for no records,
`not_configured` for absent/invalid settings, and fixed error codes without
upstream exception details. It exposes only uid, id, title, and reviewState.
Client and analysis data are discarded. No aliases from the abandoned adapter
are required by the generic summary contract.

The read adapter does not implement analysis results, create, or transitions.
The QC scenario associates explicitly fabricated results with a read summary;
it does not establish operational release authority or a live lab connection.
No JSON fixture is substituted for customer-visible live data. Abort rejection
coverage verifies a safe error result, not that the ten-second timer fires.

## In-process synthetic lab-day harness

Run without a network adapter or additional dependencies:

```sh
node --import tsx --test tests/ohworks/synthetic-lab-day.test.ts
```

This second harness chains all eight merged rule modules with fabricated inputs:
version resolution, unit conversion, reference classification, delta checks,
run QC, cumulative specimen TEST_RUN consumption, autoverification, and TAT.
It proves deterministic rule integration, ordered decision traces, hold reasons,
and reconciled totals. QC is evaluated once per encountered run and reused;
its supplied sequence may include fabricated historical controls. Previous
results, delta thresholds, measurement ranges and critical limits must use the
resolved reporting unit. Same-unit conversion is held with the converter's
`unit-mismatched` code; no identity conversion is invented.

Definition or conversion rejection stops that result. Other early holds cannot
be overridden by autoverification. Invalid volume postings are not committed to
the in-process ledger. Reference classification is reported independently of
analytical measurement and critical limits; invalid reference inputs hold.
TAT is informational, including invalid timestamp diagnostics, and a breach
does not change release outcome. Breaches count distinct evaluated specimens;
results stopped before TAT do not contribute. Held-by-reason counts each code
once per held result, so multiple reasons can exceed the held-result total.

This is synthetic in-process proof only: it proves no live SENAITE connection,
persistence, instrument integration, or operational release authority. A human
technical review is still required, including for `AUTO_RELEASE` decisions.
The HTTP harness above is included in the full repository test command.
