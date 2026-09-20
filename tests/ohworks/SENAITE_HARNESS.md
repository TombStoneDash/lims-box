# Synthetic HTTP integration harness

Run with Node 22.15+ (verified with 22.22.2), using the existing package script:

```sh
npm run test:ohworks -- tests/ohworks/senaite-synthetic-workflow.test.mjs
```

Prerequisite: `lib/ohworks-senaite.ts` from [PR #103](https://github.com/TombStoneDash/lims-box/pull/103).
It is absent from this task's base `c1a2ab5`. The harness deliberately fails
when the adapter is missing; it does not skip or carry a duplicate implementation.
The package script's existing explicit test list is unchanged. Include the
argument above to run this harness after the upstream dependency is integrated.

The harness calls `readSenaiteSamples` directly and mocks only its injected
HTTP transport. It uses actual `Response` JSON serialization, asserts the
complete GET URL/options and normalized response, and rejects accidental use of
global fetch. Configuration is passed as public synthetic literals to an
`.invalid` host; no environment credentials are read or changed. A narrowly
scoped Node loader resolves only Next's `server-only` bundler marker.

Coverage: successive sample-summary reads with different upstream records,
60 synthetic records, query encoding, optional field aliases/defaults, empty
results, malformed envelopes/records, HTTP failure, transport rejection,
AbortError classification, and missing configuration. AbortError coverage
does not prove the ten-second timer fires. Each transport request is asserted
outside the adapter's catch block so assertion failures cannot masquerade as
expected network failures.

PR #103 implements only sample-summary search. It exposes neither analysis
results nor a create/transition API. Synthetic client IDs and analysis fields
in the upstream responses verify that only the supported summary fields emerge.
The independent Python client and TypeScript sample-create contract are not
connected to this read adapter; this harness does not invent that connection.

This is mocked-HTTP contract proof, not live SENAITE end-to-end proof. The
adapter's `real_senaite` tag identifies the selected code path, not evidence of
a real server. No JSON fixture is substituted for customer-visible live data.

Context reviewed: Hudson's handoff item 1 (available on this host at
`/Users/ops/Hermes/handoffs/PENDING_FROM_CODEX_THREADS_20260918.md`), PR #103,
[PR #88](https://github.com/TombStoneDash/lims-box/pull/88), and
[issue #72](https://github.com/TombStoneDash/lims-box/issues/72) including comments.
PR #88 concerns conversion reporting, not the SENAITE adapter; the current
checkout includes its replacement #216. No reporting or auth changes are needed.

Local verification: temporarily staged the unchanged adapter addition from
PR #103 head `3328c86c77de417008e11ff036c979b3be649544`, ran the command above
(83 passed, including 11 new tests), then removed the staged production file.
The final branch still requires upstream adapter integration before this
harness can pass. No production files, package scripts, or credentials changed.

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
The existing HTTP harness and its owner-gated adapter dependency are unchanged.
