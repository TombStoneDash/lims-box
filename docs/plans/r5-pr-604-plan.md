# LIMS BOX: six verified repair jobs

Planner task: `plan-hud-lims-box-20261011-r1`. Source baseline and live GitHub main: `74d2e44e96ab804d5ccd968a0f3ef0888c8cf22d`. Host: `DESKTOP-1TV907A` (Lenovo). Assigned branch: `codex-lenovo/plan-hud-lims-box-20261011-r1`.

Planning only: no product or test edits, commit, push, email, deployment, or data writes. The user's assignment authorizes this isolated planning lane; no implementation claims or new canonical leases were issued. Only this repository was written. External factory/Linear state was not accessed; future execution must obtain its own task ownership.

## Selection and exclusions

Read the available READMEs for the OHWorks package and voice client, `docs/SYSTEM_MAP.md`, `docs/FOUNDER_KNOWLEDGE_LOADER_SPEC.md`, OHWorks requirements, and `docs/testing/full-suite-ci.md`, plus implementation and existing tests. There is no root README, ROADMAP, or TODO document in this checkout. A case-insensitive TODO/FIXME search of app, components, lib, voice, and senaite found no markers. Do not invent missing features from the docs' explicitly future/discovery-only assumptions.

Open issues were reviewed oldest first:

1. [#72](https://github.com/TombStoneDash/lims-box/issues/72), 2026-07-23: cross-repository commander reconciliation, not a bounded one-source/one-test implementation. It does not establish a specific missing feature for these jobs.
2. [#94](https://github.com/TombStoneDash/lims-box/issues/94), 2026-08-26: Personnel Pack fulfillment. Recent merged PR #559 already covers its end-to-end test work; remaining production/configuration and inbox proof is outside this planner's scope. Do not requeue or claim the issue resolved.
3. [#95](https://github.com/TombStoneDash/lims-box/issues/95), 2026-08-28: provider OAuth-client audit, not a verified two-file source defect. No credentials or provider configuration were changed.

The saved GitHub snapshot was read at `2026-10-11T00:45:47.5947680Z`: 3 open issues, 7 open PRs, and 41 PRs merged on/after `2026-10-09` (inclusive GitHub date query). Every selected source and test path was compared against all returned PR file lists: **zero overlaps**. Titles and issue bodies were also reviewed for semantic duplicates. The lists are below their request limits (300 issues / 200 PRs per query). Evidence: `lims-box-six-jobs-20261011-github.json` alongside this plan.

## Six jobs

Each job's write set is exactly the one existing source file and one existing test file listed. All tests use the existing `tests/ohworks/*.test.ts` lane. Acceptance tests below are proposed additions, not tests already committed by this planner. Jobs 2 and 3 share a write set and must run sequentially on refreshed bases.

### 1. Reject duplicated reference subjects before verifying an interval

- Source: `lib/ohworks-reference-interval-verification.ts:232` (row-count minimum), `:235` (shape validation), `:265` (acceptance based on outlier count).
- Test: `tests/ohworks/reference-interval-verification.test.ts`.
- Verified defect: twenty copies of the same `subjectId`, each with result 15 inside [10,20], produce `decision: verified`, `totalSubjects: 20`. Only one distinct subject supplied evidence. The source's declared minimum is twenty reference subjects.
- User outcome: verification results must not imply that repeated measurements from one subject satisfy the reference-subject requirement.
- Bounded repair: reject duplicate subject identifiers with a deterministic reason before counting or accepting the panel. Reject both matching and conflicting repeated values; do not silently choose or discard one.
- Acceptance: duplicated ID panel is rejected; twenty distinct valid subjects still verify; existing outlier and insufficient-subject behavior passes. This is a currently standalone synthetic evaluator; no browser caller was found, so this is not claimed as a reproduced production/UI incident.

### 2. Reject inverted report censoring limits

- Source: `lib/ohworks-reporting-format.ts:168` and `:174` validate limits independently; `:256` selects a censoring branch without checking their order.
- Test: `tests/ohworks/reporting-format.test.ts`.
- Verified defect: below-detection limit 10, above-quantitation limit 1, and observed result 5 yield `<10 mg/L` instead of an invalid-format error. The contradictory configuration is presented as an ordinary censored result.
- User outcome: report output should request configuration review rather than display a plausible result from an impossible measuring interval.
- Bounded repair: require the lower censoring limit to be no greater than the upper limit; use the existing typed `formats-malformed` error. Preserve exact censor-limit text and ordinary rounding.
- Acceptance: inverted limits throw `ReportingFormatError`; ordered and equal limits retain defined boundary behavior; existing formatter tests pass.

### 3. Turn unsupported reporting precision into a handled validation error

- Source: `lib/ohworks-reporting-format.ts:162` admits any finite integer precision; `:195` calls `toFixed`; `:250` rejects only negative precision.
- Test: `tests/ohworks/reporting-format.test.ts`.
- Verified defect: `decimalPlaces: 101` and in-range result 5 throw native `RangeError: toFixed() digits argument must be between 0 and 100`, not `ReportingFormatError`.
- User outcome: invalid precision should produce the renderer's normal review/error state instead of an uncaught formatting failure. Existing report-view callers catch the typed error and rethrow other errors.
- Bounded repair: reject unsupported precision during format validation using the existing typed error. Validate before censoring as well, so the same format is not accepted or rejected depending on the particular result.
- Acceptance: 101 and a very large finite integer produce `ReportingFormatError`; 0 and 100 remain supported; negative/fractional precision keeps existing behavior. Execute after job 2, with the same source/test pair, not concurrently.

### 4. Reject radix-prefixed reference-range result text

- Source: `lib/ohworks-reference-range.ts:110`, `:115`, `:121` use unrestricted JavaScript `Number` conversion.
- Test: `tests/ohworks/reference-range.test.ts`.
- Verified defect: the string `0x10` with reference interval [10,20], detection limit 0, and quantitation limit 100 produces `WITHIN REFERENCE RANGE`, silently interpreting the text as decimal 16.
- User outcome: malformed imported result text must be marked invalid instead of acquiring an ordinary report flag. This is a direct evaluator reproduction; the current synthetic lab-day caller supplies numeric converted values, so no browser text-entry exploit is claimed.
- Bounded repair: allow only an explicitly defined decimal/scientific notation grammar, including the supported optional censoring prefix; reject hexadecimal, binary, and octal prefixes before conversion.
- Acceptance: `0x10`, `0b10`, `0o10`, and equivalent censored operands are invalid; ordinary signed decimal/scientific results, surrounding whitespace, and valid censoring remain supported.

### 5. Reject radix-prefixed values in result delta comparisons

- Source: `lib/ohworks-delta-check.ts:172` through `:179` convert arbitrary nonblank strings using `Number`.
- Test: `tests/ohworks/delta-check.test.ts`.
- Verified defect: current value `0x10`, prior value 16, identical subject/analyte/unit, and a valid one-day window yield `status: pass`, `reasonCode: within-limits`, and zero absolute/percent delta.
- User outcome: a malformed result should cause review, not be accepted as an unchanged numeric result. This is verified through the synthetic evaluator; it is not evidence that a live instrument currently sends radix strings.
- Bounded repair: constrain string numeric parsing to decimal/scientific syntax and retain existing current/prior invalid-value block reasons. Keep this local to the named module; no shared parser refactor is needed.
- Acceptance: radix-prefixed current and prior values block with their respective invalid-value reasons, including current input without a prior; normal numeric and decimal/scientific inputs retain behavior.

### 6. Reject unreadable amendment timestamps

- Source: `lib/ohworks-report-amendment.ts:187` through `:196` checks only that the timestamp is nonempty; `:259` through `:263` copies it into the accepted history.
- Test: `tests/ohworks/report-amendment.test.ts`.
- Verified defect: an otherwise valid version-2 amendment with `timestamp: not-a-date` returns `status: VALID`, advances the effective report version to 2, and includes the unreadable timestamp in its accepted history.
- User outcome: report history should not label an amendment valid when its date cannot be interpreted.
- Bounded repair: validate an explicit ISO timestamp and real calendar date before accepting the amendment, using the existing `amendment-malformed` typed error. Do not add authorization, persistence, or live report mutation.
- Acceptance: nonsensical text, whitespace-only dates, and impossible calendar dates fail; supported valid ISO timestamps and existing version/role/reason checks pass. Timestamp chronological-order policy is outside this job.

## Verification performed

- Node `v24.14.1`. The first test attempt failed because the fresh worktree lacked `tsx`, not because a test assertion failed.
- Dependencies installed locally with `npm ci --ignore-scripts --cache .npm-cache --no-audit --no-fund`. Lifecycle scripts were disabled; no database operation was requested.
- Existing tests executed with:

```powershell
node --import tsx --test tests/ohworks/reference-interval-verification.test.ts tests/ohworks/reporting-format.test.ts tests/ohworks/reference-range.test.ts tests/ohworks/delta-check.test.ts tests/ohworks/report-amendment.test.ts
```

Result: **177 passed, 0 failed, 0 skipped**, exit 0. This is a baseline, not proof the proposed defects are fixed.

- A separate in-memory Node/tsx reproduction imported the five unchanged modules, supplied the fabricated inputs above, and asserted each observed defective result. **All six reproduced**, exit 0. The precision case additionally asserted that its error is *not* `ReportingFormatError`. No product/test file was created for this probe.
- Scope limit: invalid-input behavior is proved at module level. Current browser demos use fixtures; no claim is made that all these invalid cases can be entered through their existing UI. No live lab data, clinical validation, deployed-runtime verification, build, or full-suite result is claimed.

## Execution handoff

Objective: repair only the observable decision/formatting behavior described by each job. Inputs: this base, the chosen two-file write set, existing tests, and the fabricated reproduction. Owner: unassigned implementation worker; acquire a valid lane lease before execution. Requested model/effort, effective model, provider-returned model, route, and usage: not exposed. Suggested implementation timeout: 30 minutes/job, retry cap 1; do not expand scope to use up the budget.

Definition of done for each implementation: the counterexample is covered by a regression assertion, expected behavior passes, the existing named test file passes, diff contains only the named source/test pair, and a terminal receipt identifies the resulting artifacts. Recheck live PR coverage before starting; jobs 2 and 3 are serialized. Rollback of a later repair is its ordinary controlled revert. This planner leaves commit and push to the runner as requested.

