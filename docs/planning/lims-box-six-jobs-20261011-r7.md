# Six verified LIMS BOX jobs — 2026-10-11

Planner only. Product code and existing tests are unchanged. Base: `ee19f22b5fb7d0683ff828883da370614647ecaf`; branch: `codex/plan-hud-lims-box-20261011-r7`. All findings concern the repository's synthetic OHWorks workflows, not a verified production clinical deployment. Each job permits edits to exactly the one existing source file and one existing test file listed below.

Repository review covered the voice and OHWorks READMEs, SYSTEM_MAP, OHWorks REQUIREMENTS, founder knowledge loader SPEC, full-suite testing documentation, source and tests. There is no tracked root README, ROADMAP or TODO file. Case-insensitive TODO/FIXME search in app, components, lib, voice and senaite found no markers. No missing feature was inferred from marketing copy.

GitHub was checked through the authenticated connector (CLI networking failed). All three open issues were considered oldest first: [#72](https://github.com/TombStoneDash/lims-box/issues/72) is portfolio reconciliation, [#94](https://github.com/TombStoneDash/lims-box/issues/94) requires production fulfillment/inbox proof and has recent implementation/test work in merged [#559](https://github.com/TombStoneDash/lims-box/pull/559), and [#95](https://github.com/TombStoneDash/lims-box/issues/95) is provider-side OAuth inventory. None yields an uncovered, single-source-file implementation job under this assignment. No outreach is proposed.

Reviewed all 12 open PR file lists and 97 merged PR titles/bodies since 2026-10-09, plus nearby patches. The accompanying GitHub snapshot records their numbers, titles, links and open-PR files. None of the six source files occurs in an open PR's changed-file list. Recently merged changes to the same files are explicitly distinguished below. Recheck GitHub before a future worker claims a job.

1. **Reject radix-prefixed reference-range results.**

   Source: `lib/ohworks-reference-range.ts:121` (also numeric conversion of censored operands at lines 109 and 114).
   Test: `tests/ohworks/reference-range.test.ts`.

   Reproduction 1: result `"0x10"`, unit `mg/L`, LOD 1, ULOQ 100, reference interval 5–20 returns `within_range` and `WITHIN REFERENCE RANGE`. The parser silently turns hexadecimal text into 16. The synthetic lab-day report can therefore present a normal result from non-decimal laboratory result text.

   Implement a decimal-text grammar before conversion, including the operand after `<` or `>`. Invalid text must return `invalid` with the existing invalid-value reason. Cover hex/binary/octal text, censored variants, ordinary signed decimals, whitespace and supported scientific notation. Preserve numeric inputs and existing censoring rules. Merged [#622](https://github.com/TombStoneDash/lims-box/pull/622) and [#644](https://github.com/TombStoneDash/lims-box/pull/644) fixed other evaluators; neither changes this parser.

2. **Refuse inverted detection and quantitation limits before rendering a report.**

   Source: `lib/ohworks-reporting-format.ts:168` (finite checks through line 175 omit the relationship between the limits).
   Test: `tests/ohworks/reporting-format.test.ts`.

   Reproduction 2: value 50, LOD 100 and ULOQ 1 produces `<100 mg/L` rather than rejecting the impossible reporting configuration. The report-delivery surface can show plausible censored text even though its declared measurable interval is inverted.

   Validate LOD <= ULOQ before producing report text; refuse inversion with `ReportingFormatError('formats-malformed')`. Cover inverted, equal and correctly ordered limits, including censoring boundaries. Preserve all existing decimal-place behavior. Merged [#623](https://github.com/TombStoneDash/lims-box/pull/623) only adds the upper decimal-place bound and leaves this defect present.

3. **Reject cancellation requests with a whitespace-only order reference.**

   Source: `lib/ohworks-test-cancellation.ts:173` (used by the reference check at line 188).
   Test: `tests/ohworks/test-cancellation.test.ts`.

   Reproduction 3: order reference `"   "`, stage `reported`, reason `lab_processing_error`, requester `lab_director` returns `allowed`, `creditNoteDue: true` and `amendedReportRequired: true`. Empty-string references already fail, but spaces pass the length-only check. This yields a cancellation row with no usable order identity and positive downstream instructions.

   Require non-whitespace identity and throw the existing `order-reference-token-invalid` error. Cover spaces, tabs and newlines; preserve nonblank opaque tokens and role/stage outcomes. Do not introduce trimming or normalization of valid identifiers unnecessarily. No open or recently merged PR covers this cancellation validation.

4. **Reject future-dated recorded calibration trigger events.**

   Source: `lib/ohworks-calibration-verification.ts:351` (only checks the lower time bound; lines 357–372 then accept the event).
   Test: `tests/ohworks/calibration-verification.test.ts`.

   Reproduction 4: last verification January 1, evaluation January 10, 30-day interval, and a recorded reagent-lot change on February 1 yields `REQUIRED_BY_EVENT` with February 1 as its due instant. With no event the same schedule is `CURRENT`. The instrument-readiness view presents an event that has not occurred as a valid current blocking finding.

   A recorded event must be between last verification and the evaluation instant. Route an event after `asOf` to the existing fail-closed result shape: `OVERDUE`, no due instant and no governing trigger, with a specific future-event reason. Cover after-asOf, equality, before-last-verification, ordinary valid events and mixtures of valid/future events. Do not silently ignore malformed recorded evidence. Merged [#557](https://github.com/TombStoneDash/lims-box/pull/557) validates calendar syntax only; its patch does not validate this temporal relationship.

5. **Reject radix-prefixed critical-repeat values before confirming a result.**

   Source: `lib/ohworks-critical-repeat.ts:196` (the string conversion at line 197 uses unrestricted `Number`).
   Test: `tests/ohworks/critical-repeat.test.ts`.

   Reproduction 5: first result `"0x10"` and later repeat 16, same synthetic subject/analyte/unit, absolute tolerance 0.5 and percent tolerance 10 yields `confirmed`, `reportValue: 16` and `notifyAllowed: true`. A malformed laboratory result is silently interpreted as hexadecimal and becomes reportable in the critical-results workflow.

   Accept only supported decimal numeric strings. Invalid first/repeat values must use the existing position-specific invalid-value reason, `discordant`, and no report value; preserve the existing notification policy for discordant results. Test both input positions, radix forms and valid decimal/exponent controls. Merged [#569](https://github.com/TombStoneDash/lims-box/pull/569) only hardens timestamp parsing; the numeric conversion remains unchanged. The separate autoverification/delta fixes do not cover this path.

6. **Require own mapping entries for instrument models and raw flags.**

   Source: `lib/ohworks-instrument-flags.ts:196` (same inherited-property lookup for raw flags at line 212).
   Test: `tests/ohworks/instrument-flags.test.ts`.

   Reproduction 6: empty mapping table, instrument model `"__proto__"`, and no raw flags returns `mapped`, `no-raw-flags` and `requiredAction: 'none'`. An ordinary unknown model correctly returns `blocked`. The readiness view can treat an undeclared model as a successful nonblocking check. Prototype-named raw flags can also raise an unexpected malformed-definition exception instead of returning an unmapped flag.

   Require own-property membership at both lookup levels before reading entries. Missing models/flags must return the existing blocked reason. Test inherited/prototype-named models and flags, normal declared entries, and explicitly declared own keys (own keys should follow their validated definitions). Preserve severity/action resolution. The similarly named fix in [#651](https://github.com/TombStoneDash/lims-box/pull/651), superseded by merged #671, changes order-panel lookup only.

Verification: Node v22.22.2 with an existing local tsx loader; no dependency install or lockfile changes. Four initial suites passed 165 tests. The final run passed **357 tests in 14 existing files**, including the six selected test files, recent calendar/decimal regressions, and their synthetic report/readiness/lab-day consumers. Zero failed, skipped, cancelled or todo. The six reproduction assertions plus valid/invalid control inputs passed. These assertions prove current buggy behavior; they are not claims that the proposed fixes have been implemented.

Reproduce from the repository root:

```sh
node --import tsx docs/planning/lims-box-six-jobs-20261011-r7-repro.mjs
node --import tsx --test tests/ohworks/reference-range.test.ts tests/ohworks/reporting-format.test.ts tests/ohworks/reporting-format-decimal-places-limit.test.ts tests/ohworks/test-cancellation.test.ts tests/ohworks/calibration-verification.test.ts tests/ohworks/verification-schedule-calendar-dates.test.ts tests/ohworks/critical-repeat.test.ts tests/ohworks/critical-repeat-calendar.test.ts tests/ohworks/instrument-flags.test.ts tests/ohworks/demo-instrument-readiness-view.test.ts tests/ohworks/demo-critical-results-view.test.ts tests/ohworks/demo-report-delivery-view.test.ts tests/ohworks/demo-sendout-cancellation-comments-view.test.ts tests/ohworks/synthetic-lab-day.test.ts
```

The actual local loader path was `/private/tmp/actorlab-plan-r2-probes/node_modules/tsx/dist/loader.mjs`, substituted for `tsx` in both commands. Full output is retained alongside this plan. No live service, customer data, email, production write, commit or push was used.
