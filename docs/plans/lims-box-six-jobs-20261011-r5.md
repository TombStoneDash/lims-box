# LIMS BOX: six verified repair jobs (r5)

Planning task: `plan-hud-lims-box-20261011-r5`. Host: `DESKTOP-1TV907A` (Lenovo). Assigned branch: `codex-lenovo/plan-hud-lims-box-20261011-r5`. Base and live main at final check: `f284cddd8d17c6395035c617440a8b3bcec0eab2`.

The user authorized this isolated planning lane. No implementation claim or canonical lease was issued. No product code or existing tests were changed; no commit, push, external message, deployment, or production write was performed. Only repository-local planning evidence and a receipt are deliverables. External Hermes/Linear state was not accessed because this assignment is repository-only; implementation ownership remains unassigned.

## Review and exclusions

Read the OHWorks and voice READMEs, SYSTEM_MAP, OHWorks REQUIREMENTS, FOUNDER_KNOWLEDGE_LOADER_SPEC, and testing/full-suite-ci docs, plus relevant source and tests. There is no root README or named ROADMAP/TODO file in this checkout. TODO/FIXME search of app, components, lib, voice and senaite returned no matches. The docs' future/discovery assumptions are not missing-feature commitments.

Reviewed all three open issues oldest first:

1. [#72](https://github.com/TombStoneDash/lims-box/issues/72), July 23: portfolio reconciliation, not a verified one-source/one-test implementation defect.
2. [#94](https://github.com/TombStoneDash/lims-box/issues/94), August 26: automatic Personnel Pack fulfillment; merged #559 already covers its end-to-end test work. Remaining production/configuration/inbox proof does not establish a new bounded source repair. Issue closure is not claimed.
3. [#95](https://github.com/TombStoneDash/lims-box/issues/95), August 28: provider OAuth-client audit, requiring provider evidence rather than a speculative code change.

Final GitHub check: `2026-10-11T13:25:20Z`, 13 open PRs and 68 merged since `2026-10-09` inclusive. Queries used limit 1000 and returned fewer than the limit. All 12 selected source/test paths have **zero overlap** with these PR file lists. Titles/bodies were reviewed, and the actual plans in open #604 and #621 were read: unreadable amendment timestamps and impossible effective-catalog dates were discarded because those plans already cover them. Saved issue/PR JSON and both earlier plan bodies accompany this document. These are snapshot checks; recheck before dispatch.

## Exactly six jobs

Each write set is exactly one existing source file and one existing test file. Acceptance cases below are proposed additions to that test file, not existing passing regression tests. Each defect was reproduced against unchanged source by `r5-reproduce.ts`.

### 1. Reject impossible accession-event dates

- Source: `lib/ohworks-accession-workflow.ts:244`, `:293`, `:306`.
- Test: `tests/ohworks/accession-workflow.test.ts`.
- Evidence: a valid-shaped receive event dated `2026-02-30T12:00:00Z` returns `blocked: false`, `finalState: RECEIVED`. Parsing normalizes February 30; the UTC suffix check does not validate the written calendar date.
- User impact: accession history can show a successful intake with a nonexistent date. The accession route consumes this reducer; the reproduction invokes the reducer directly, not a browser form or live record.
- Repair: validate written calendar components before accepting or ordering an event. Use the existing timestamp-invalid outcome and preserve valid supported UTC timestamp forms.
- Acceptance: February 30, non-leap February 29, and April 31 block without appending history; valid leap day and ordinary ordered transitions pass. Verify an impossible second event cannot advance state.

### 2. Stop rejecting exact decimal-volume consumption as overdrawn

- Source: `lib/ohworks-volume-ledger.ts:292`, `:296`.
- Test: `tests/ohworks/volume-ledger.test.ts`.
- Evidence: initial volume `0.3`, dead volume `0`, and successive consumptions `0.1`, `0.2` return INVALID/over-consumption at event index 1. Binary subtraction leaves `0.19999999999999998` and the exact comparison rejects the second draw.
- User impact: the synthetic lab-day volume ledger rejects a fully funded sequence and withholds its valid running balance.
- Repair: use magnitude-scaled floating-point roundoff handling for the consumption boundary and near-boundary balance. Preserve the module's explicitly documented dead-volume allowance; do not redefine it.
- Acceptance: the reproduced sequence is VALID with zero balance; a genuine excess remains INVALID; reversals and balance-at-timestamp behavior stay consistent; test tiny volumes so tolerance cannot hide meaningful shortages.

### 3. Refuse invalid peer-group statistics before reporting acceptable QC

- Source: `lib/ohworks-peer-group-qc-comparison.ts:60`, `:69`.
- Test: `tests/ohworks-peer-group-qc-comparison.test.ts`.
- Evidence: result and peer mean `100`, peer SD `Infinity`, N `30`, minimum N `10` yield zScore/SDI `0`, classification `acceptable`, flaggedForReview `false`. Only zero SD and insufficient N are guarded.
- User impact: the exported evaluator supplies a reassuring QC classification from unusable peer evidence. No current app/lib consumer was found; this is a verified synthetic evaluator defect, not a demonstrated production screen incident.
- Repair: fail closed for nonfinite result/mean/SD, nonpositive SD, invalid whole-number counts, and nonfinite derived z-scores, using an explicit insufficient-data result or consistent typed rejection. Never report acceptable on invalid evidence.
- Acceptance: Infinity/NaN, negative SD, fractional/negative counts, and derived overflow cannot yield a normal QC classification; valid z=2/z=3 boundaries and trend behavior retain their existing meaning.

### 4. Sort audit CSV rows by instant rather than timestamp spelling

- Source: `lib/ohworks-audit-export.ts:47`, `:49`, `:59`.
- Test: `tests/ohworks/audit-export.test.ts`.
- Evidence: events at `2026-01-01T00:00:00Z` and `2026-01-01T00:00:00.100Z` export the later event first. The lexical comparator places the decimal point before `Z`.
- User impact: a downloaded audit CSV can reverse chronology when valid timestamp precision differs. The export route uses this serializer; shipped fixtures currently use uniform minute strings, so the reproduction exercises its broader input directly.
- Repair: compare supported timestamp representations chronologically, with deterministic ID ties and an explicit deterministic policy for unparseable values. Preserve existing minute-format fixtures, original timestamp text, CSV escaping, role filtering and formula hardening.
- Acceptance: mixed whole/fractional seconds sort correctly, equivalent instants use ID ordering, reversed input gives identical output, and all existing export-route tests pass.

### 5. Keep uncertainty crossing tolerance proportional to numeric precision

- Source: `lib/ohworks-measurement-uncertainty.ts:149`, `:332`, `:333`.
- Test: `tests/ohworks/measurement-uncertainty.test.ts`.
- Evidence: two QC points at `1e-10`, coverage factor 2, and patient value `1e-10` produce the zero-width interval `[1e-10, 1e-10]`. A decision limit of `5e-10` nevertheless returns `crossesInterval: true`. The fixed `1e-9` expansion is larger than the values themselves.
- User impact: the evaluator reports a decision-limit crossing that does not exist. This is a unit-independent synthetic counterexample, not a clinical threshold recommendation; no current app/lib consumer was found.
- Repair: replace the absolute tolerance with a magnitude-aware rounding allowance, handling zero explicitly. The comment promises floating-point roundoff handling, not a scientific tolerance or widened interval.
- Acceptance: the reproduced disjoint limit does not cross; exact endpoints do; changing all values by a common unit scale preserves crossing classification; ordinary decimal-boundary tests still pass.

### 6. Do not pass linearity fits outside small declared intercept limits

- Source: `lib/ohworks-linearity.ts:135`, `:138`, `:142`.
- Test: `tests/ohworks/linearity.test.ts`.
- Evidence: five expected values `n * 1e-8` for n=1..5, each observed with `5e-10` added, yield intercept `5.000000000000045e-10` and decision `pass` against intercept bounds `[0, 1e-10]`. Other limits are slope [0.9,1.1], correlation >=0.99, recovery [90,110] percent. The intercept is five times the upper limit, not numerical roundoff.
- User impact: method-performance evaluation presents a passing fit that violates its declared acceptance range. The method-performance demo uses this evaluator; this counterexample changes its synthetic inputs, not deployed fixture values.
- Repair: make comparison tolerances proportional to the compared magnitudes and floating-point precision instead of adding the same absolute 1e-9 to every criterion. Keep public result types and criterion ordering unchanged.
- Acceptance: the counterexample fails with intercept-out-of-range; exact-boundary fits still pass; existing decimal recovery-boundary tests stay green; scaled equivalent inputs preserve the decision.

## Reproducible verification

Node `v24.14.1`. Fresh dependencies installed with `npm ci --ignore-scripts --no-audit --no-fund --cache .npm-cache` (exit 0); repository-local install cache then removed. No Prisma generation, database access, or external send was required.

```powershell
node --import tsx docs/plans/r5-reproduce.ts
node --import tsx --test tests/ohworks/accession-workflow.test.ts tests/ohworks/volume-ledger.test.ts tests/ohworks-peer-group-qc-comparison.test.ts tests/ohworks/audit-export.test.ts tests/ohworks/measurement-uncertainty.test.ts tests/ohworks/linearity.test.ts
```

Reproduction: all six observed-defect assertions pass, exit 0 (`r5-reproduction.txt`). Existing tests: **187 pass, 0 fail, 0 skipped**, exit 0 (`r5-tests.txt`). Green baseline tests do not validate the proposed fixes; they show the current coverage misses the counterexamples. No full-suite, build, browser, deployment or clinical-validation claim is made. `git diff --exit-code` confirmed tracked source remained unchanged.

## Execution handoff

All six implementation owners are unassigned. Each job is bounded to its named pair; use a fresh authorized lane, a refreshed coverage check, a suggested 30-minute time box and retry cap 1. Model/effort/route/budget are not exposed and are not inferred. Definition of done: corrected counterexample covered in the named test, its complete existing test file passes, diff review confirms only the named pair changed, and a terminal receipt records proof. No shared-parser refactor is needed. Implementation rollback is a controlled revert; planner rollback is removal of this task's planning artifacts. Runner owns commit/push.
