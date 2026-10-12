# LIMS BOX: six verified implementation jobs

Read-only planning on `codex/plan-hud-lims-box-20261012-r8`, base `c40224e5b9946cee2b0610f03eaed560629e51f6`, MAIN-DAISY.local. No product or test files changed; no commit, push, deployment, email, or external write. Each job below owns exactly one existing source file and one existing lane test file. Extend those tests rather than introducing a different layout.

## Selection and exclusions

Read the OHWorks and voice READMEs, founder-loader SPEC, SYSTEM_MAP, OHWorks REQUIREMENTS, testing/full-suite-ci, OAuth audit, relevant source and lane tests. There is no root README, ROADMAP, or TODO file in this revision. Repository TODO/FIXME search found no candidates.

GitHub open issues were requested oldest first: [#72](https://github.com/TombStoneDash/lims-box/issues/72), [#94](https://github.com/TombStoneDash/lims-box/issues/94), [#95](https://github.com/TombStoneDash/lims-box/issues/95). #72 is cross-repository reconciliation, not a verified two-file defect. #94's PDF verification work was covered by merged [#559](https://github.com/TombStoneDash/lims-box/pull/559); its external-inbox acceptance is outside this read-only assignment. #95 needs provider inventory; the repository audit finds no Google OAuth runtime implementation. None supplies an eligible bounded code job without inventing scope.

Checked all 15 open PR file lists and 101 merged PRs from October 9–12 inclusive (UTC day partitions avoid the connector's 100-result cap). Full titles, links and open-PR file lists are in the adjacent github.json. Excluded all open-PR work, including custody fractions, calibrator lookup keys, QC rounding, worklist identifiers, uncertainty, panels, consumables, lot comparison, admin forms, and first-contact work. Three selected files have recent unrelated fixes: [#576](https://github.com/TombStoneDash/lims-box/pull/576) adds PT overflow guards, [#567](https://github.com/TombStoneDash/lims-box/pull/567) adds dilution product overflow guards, and [#623](https://github.com/TombStoneDash/lims-box/pull/623) limits decimal places. Their patches were read; none repairs the respective defect below. Local history confirms those changes are already present.

These are synthetic OHWorks evaluator defects. Their returned classifications, report text and actions feed the lab-day/report, quality-indicator, method-performance and instrument demonstration views. Reproductions call the real evaluators with synthetic adversarial inputs; the shipped fixed demo fixtures do not themselves trigger these cases. No production incident or clinical validation is claimed.

## J1 — Reject radix-prefixed reference results before displaying a normal flag

- Source: `lib/ohworks-reference-range.ts:121` (also the censored operands at lines 110 and 115).
- Test: `tests/ohworks/reference-range.test.ts`.
- Verified defect: `result: '0x10'`, unit `mg/L`, detection/quantitation limits 1/100 and reference interval 10–20 yields `within_range`, `WITHIN REFERENCE RANGE`, no reasons. `Number()` silently changes malformed decimal result text into 16.
- User-visible outcome: malformed imported result text must produce the existing invalid/review flag rather than a normal result flag in the synthetic lab-day result output.
- Work: require an explicit decimal numeric grammar for bare results and censored operands; preserve documented finite numeric/decimal behavior.
- Acceptance: hex/binary/octal forms, including censored variants, classify invalid; ordinary signed decimals and supported exponent notation retain expected flags. No unit conversion changes.

## J2 — Refuse radix-prefixed proficiency-test submissions

- Source: `lib/ohworks-pt-scoring.ts:193`.
- Test: `tests/ohworks/pt-scoring.test.ts`.
- Verified defect: participant result `'0x64'`, assigned value 100, acceptable range 70–130 gives reported value 100, z-score 0, `satisfactory`, event `pass`.
- User-visible outcome: quality-indicator/PT scoring must not award a passing score after silently reinterpreting invalid decimal submission text.
- Work: validate decimal text before conversion and use the existing `reported-value-invalid` error; preserve finite numeric inputs.
- Acceptance: reject hex/binary/octal text; decimal text and numbers score identically. Keep declared-consensus and robust-statistics paths covered. Recent PT overflow work is a separate issue and remains intact.

## J3 — Reject non-finite derived method-comparison statistics

- Source: `lib/ohworks-method-comparison.ts:334` (unguarded derived arithmetic, followed by default acceptance at line 390).
- Test: `tests/ohworks/method-comparison.test.ts`.
- Verified defect: two finite pairs (-1e308 → 1e308, 1e308 → -1e308), minPairs 2, same units, LoA multiplier 1.96 and maximum mean difference 2 yield `acceptable` / `within-allowable-bias` even though mean difference, SD, agreement bounds, slope and intercept are NaN. Individual differences are ±Infinity. NaN comparisons never exceed the threshold.
- User-visible outcome: method-performance output must show an unresolved/error result instead of an acceptable comparison with unusable statistics.
- Work: validate derived differences and aggregate/regression statistics before acceptance; throw a typed comparison error on non-finite evidence, compatible with the existing view's typed-error handling.
- Acceptance: reproduced inputs never return acceptable or publish non-finite statistics; normal finite comparisons and the existing unavailable-percent-bias behavior remain correct.

## J4 — Enforce the declared dilution maximum on the already-applied factor

- Source: `lib/ohworks-dilution-rerun.ts:300` (maximum shape check), with reporting at line 326 before maximum filtering at line 334.
- Test: `tests/ohworks/dilution-rerun.test.ts`.
- Verified defect: applied factor 100, declared maximum 20, ladder [2,5,10,20], reading 50 within range 0–100 returns `report_as_is` and corrected value 5000. The maximum constrains only a future ladder selection.
- User-visible outcome: the analytical-run decision must block a result already diluted beyond the declared maximum rather than offer it for reporting.
- Work: compare applied dilution against the maximum before any report branch, returning a deterministic blocking reason and no reportable value.
- Acceptance: over-maximum applied factors block below-range, within-range and above-range branches; factors equal to the maximum remain eligible. Preserve recent finite-product overflow guards.

## J5 — Reject inverted detection and quantitation limits when formatting reports

- Source: `lib/ohworks-reporting-format.ts:168` (independent finite checks omit limit ordering).
- Test: `tests/ohworks/reporting-format.test.ts`.
- Verified defect: detection limit 100, quantitation limit 1, value 50 generates `<100 mg/L` with `below-detection`, although that same value is also above the declared quantitation limit. Branch order arbitrarily chooses one contradictory report.
- User-visible outcome: report-delivery output must explain an invalid format rather than emit a misleading censoring string.
- Work: reject inverted limit pairs using `formats-malformed` before formatting; preserve the existing equality/boundary behavior and precision handling.
- Acceptance: inverted pairs throw the typed error regardless of raw value; properly ordered pairs preserve exact-boundary, below/above-limit and precision results. This differs from the recently merged decimal-place cap.

## J6 — Preserve action priority when two raw flags map to the same canonical flag

- Source: `lib/ohworks-instrument-flags.ts:231`.
- Test: `tests/ohworks/instrument-flags.test.ts`.
- Verified defect: raw A and B both map to the same canonical flag at high severity; A requests suppress, B report. [A,B] returns `suppress`; [B,A] returns `report`. Canonical deduplication only replaces a lower severity and loses the later action before the final tie-breaker can see it.
- User-visible outcome: instrument-readiness required action must not hide a reportable flag because of incoming flag order. The file's lines 15–17 explicitly promise report > review > suppress on ties.
- Work: apply that same severity/action comparison during canonical deduplication, retaining one canonical entry and stable ordering.
- Acceptance: all input permutations of equal-severity aliases select report over review over suppress; higher severity still takes precedence; repeated identical raw flags remain deduplicated.

## Verification and handoff

The adjacent `.probe.mjs` is a reproducible read-only evidence script, not a proposed production test: its assertions confirm the six current bugs. Run `node --import tsx docs/worker-results/plan-hud-lims-box-20261012-r8.probe.mjs` after dependencies are available. It must be converted to desired-behavior assertions in each designated lane test during implementation, not added to CI as a passing bug contract.

Executed on Node v22.22.2 using an existing temporary dependency bundle's tsx loader, without installation or lockfile edits. The six designated test files passed 236 tests. Expanded verification passed 285/285 tests (15 files, exit 0), including adjacent regressions and demo view tests; complete TAP output and reproduction output are adjacent artifacts. The first ESM probe attempt hit a CommonJS named-export mismatch; changing only the evidence script to use createRequire resolved it.

The assigned worktree was initially clean, owned by this user-assigned planner, and remained isolated from product writers. No queue claim, lease transition, or product dispatch was made. External Hermes/Linear ownership state is not asserted; GitHub ownership/exclusions and repository-local upstream receipts were inspected. This plan is ready for the runner to reconcile against its canonical intake before dispatching implementation.

Rollback: delete this plan and its adjacent planning evidence/receipt files. Product code, existing tests, branch HEAD and production remain unchanged.
