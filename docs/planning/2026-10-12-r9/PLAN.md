# LIMS BOX: six verified jobs, planner r9

Planning only on `codex/plan-hud-lims-box-20261012-r9`, base `004e6a6`, host `MAIN-DAISY.local`. Product code and existing tests are unchanged. No commit, push, deployment, email, database access or new worker claim. The six machine-readable packets are in `proposed-jobs/`.

## Selection and duplicate review

Read the voice and OHWorks READMEs, OHWorks REQUIREMENTS, SYSTEM_MAP, founder knowledge loader SPEC, testing/full-suite-ci, relevant source and existing tests. There is no root README, ROADMAP or TODO file at this revision. Case-insensitive TODO/FIXME search across app, lib, components, voice, senaite and scripts returned no markers. Discovery-only assumptions in the docs were not promoted into promised missing features.

The authenticated GitHub connector supplied live data after the CLI failed to connect. Open issues were requested by creation ascending: [#72](https://github.com/TombStoneDash/lims-box/issues/72) concerns cross-repository reconciliation, [#94](https://github.com/TombStoneDash/lims-box/issues/94) concerns PDF fulfillment with recent verification work in merged [#559](https://github.com/TombStoneDash/lims-box/pull/559), and [#95](https://github.com/TombStoneDash/lims-box/issues/95) requires provider OAuth inventory. None provides an uncovered, verified single-source implementation job within this assignment; remaining production/inbox acceptance is not claimed complete.

Reviewed 20 open PRs including their complete changed-file lists and 109 merged PRs since 2026-10-09 inclusive. Daily UTC partitions avoided the search connector's 100-item cap. The six proposed source/test pairs have no overlap with open PR files. Read prior planning packets or plan text from #535, #545, #552, #566, #573, #597, #604, #611, #621, #627, #641, #664, #673 and #681, covering r1–r8 and the earlier second-account plan. The adjacent github-review.json retains those proposals, issue data, open-file exclusions, merged titles and the inspected related repair patches. Same-file recent fixes are distinguished per job below; none repairs the new reproductions.

These are verified defects in synthetic evaluator outputs. The culture/crossmatch, quality-indicator, release-authorization and order-intake views consume these evaluators. Their shipped fixtures are fixed and do not expose arbitrary input entry: this plan does not claim a current browser exploit, production incident or clinical validation. Jobs 2, 3 and 6 specifically test runtime-malformed values that TypeScript declarations do not validate. User impact is the incorrect status, explanation or metric these evaluators return.

## Six jobs

Each job owns exactly one existing source file and one existing test file. Tests use the actual existing lane layout, including the top-level verbal-order test. Jobs 4 and 5 must execute sequentially because they share both files.

### 1. Reject invalid culture timestamps before scheduling or clearing overdue reads

- Source: `lib/ohworks-micro-culture-incubation.ts:62`.
- Test: `tests/ohworks/micro-culture-incubation.test.ts`.
- File/line evidence and reproduction: Lines 62, 127–133 use Date.parse without validating written calendar fields or checking parsed finiteness. Blood culture plated 2026-02-30T08:00:00Z produces its first read at 2026-03-03T08:00:00.000Z; isReadOverdue with dueAt='bad-date' returns false.
- User-visible effect: The crossmatch/culture evaluator supplies invented read dates and can hide overdue status when timing evidence is unreadable.
- Bounded repair: Validate caller-supplied UTC ISO calendar/clock fields and finite instants for platedAt, dueAt and now before arithmetic. Throw a deliberate RangeError for invalid timing, rather than publishing a schedule or false overdue result. Preserve supported fractional seconds, valid leap days, UTC-only documented timestamps, grace checks and strict overdue boundaries.
- Acceptance: Impossible February/April dates, unreadable text and missing UTC zone are rejected in all three timestamp positions; valid leap days and before/equal/after grace boundaries work. Existing culture-grace tests remain green.
- Nonduplication: Earlier #545 culture work and merged #549 validate grace hours only; the inspected patch does not validate timestamps.

### 2. Require a known antibody-screen state before clearing crossmatch

- Source: `lib/ohworks-bloodbank-crossmatch-hold.ts:90`.
- Test: `tests/ohworks/bloodbank-crossmatch-hold.test.ts`.
- File/line evidence and reproduction: Lines 90 and 98 recognize pending and positive, then lines 106–112 unconditionally clear the remaining states. With valid O/positive blood group, no history, age 1 of 72 hours, one requested unit, antibodyScreenResult='indeterminate' returns clear_to_crossmatch and falsely says the screen is negative.
- User-visible effect: The crossmatch result can show eligibility without a recorded negative screen.
- Bounded repair: Validate antibodyScreenResult against the three declared values before disposition and throw a deliberate input error for unknown, missing or non-string runtime values. Do not coerce unknown states into negative and do not change declared pending/positive/negative policy or age/count validation.
- Acceptance: Unknown strings, empty strings, undefined, null and non-string states never clear crossmatch; valid negative with no history clears, pending holds, positive/history holds, and expired samples still hold.
- Nonduplication: Earlier crossmatch jobs and merged #547/#589 repair ages and unit counts only; both patches were inspected.

### 3. Keep POCT locked unless the recorded QC outcome is explicitly pass

- Source: `lib/ohworks-poct-lockout.ts:67`.
- Test: `tests/ohworks/poct-lockout.test.ts`.
- File/line evidence and reproduction: Lines 67–81 handle fail/not_run, but lines 103–110 unlock any remaining value with fresh timing. lastQcResult='error', valid QC at 08:00, now 09:00, frequency 24 and priorLockoutActive=true returns locked=false and says QC passed.
- User-visible effect: The release-authorization demo evaluator can claim a device is unlocked after a QC outcome it does not recognize.
- Bounded repair: Refuse every QC outcome outside pass/fail/not_run with locked=true, qcOverdue=false and an accurate invalid-outcome reason. Preserve explicit pass timing checks, fail/not_run outcomes and supervisor override semantics.
- Acceptance: error, empty/missing/null and non-string outcomes stay locked even with recent timing; only explicit pass may unlock; valid fail/not_run and timing regressions pass.
- Nonduplication: Earlier POCT proposals and merged #582 cover time/frequency validation, not outcome membership; patch inspected.

### 4. Count distinct reported results in the corrected-report percentage

- Source: `lib/ohworks-quality-indicators.ts:417`.
- Test: `tests/ohworks/quality-indicators.test.ts`.
- File/line evidence and reproduction: Lines 385 and 414 build unique result-ID sets, but line 417 uses resultsReported.length for the denominator. One corrected R1 gives 100%; repeating the same reported R1 row produces 50% with the same numerator and no new result.
- User-visible effect: The quality-indicator output can turn a missed 60% correction-rate target into a met target merely because a report row was imported twice.
- Bounded repair: Use the existing reportedResultIds.size as the corrected-report denominator so numerator and denominator both count distinct results. Keep this job limited to corrected-report rate; do not redefine turnaround or critical-notification metrics.
- Acceptance: Repeated identical report rows leave corrected-report percentage unchanged; duplicate correction rows remain deduplicated; two distinct reports with one correction give 50%; zero reports remain null; unknown corrected IDs still reject.
- Nonduplication: Earlier #552 and merged #555 deduplicate specimen rejection rates. The inspected patch does not change correctedReportRate. Distinct metric and defect.

### 5. Preserve every declared quality-indicator key in serialized output

- Source: `lib/ohworks-quality-indicators.ts:390`.
- Test: `tests/ohworks/quality-indicators.test.ts`.
- File/line evidence and reproduction: Lines 390/395 and 402/407 populate ordinary objects using declared string keys. An own __proto__ rejection target from JSON, with one matching rejected specimen, produces Object.keys=[] and JSON {}, losing its 100% indicator; the value becomes the output object's prototype.
- User-visible effect: The quality view enumerates output with Object.entries, so a valid declared indicator disappears from the table and JSON export.
- Bounded repair: Build both output dictionaries using own data properties (for example Object.fromEntries or defineProperty) so all admitted string keys are preserved without prototype setters. Preserve ordinary-object compatibility if existing consumers/tests depend on it; never ban an otherwise valid declared key merely to hide the bug.
- Acceptance: Own __proto__, constructor and toString keys survive Object.entries and JSON serialization for rejection and turnaround metrics with correct values; ordinary keys and object prototype remain intact. Run after job 4 on a refreshed base because they share both files.
- Nonduplication: The earlier own-key jobs concern other modules; #555 changes unique specimen counts, not dictionary construction. No open PR touches this pair.

### 6. Require boolean true for verbal read-back evidence

- Source: `lib/ohworks-verbal-order-readback.ts:111`.
- Test: `tests/ohworks-verbal-order-readback.test.ts`.
- File/line evidence and reproduction: Lines 103 and 111 use truthiness for evidence. With a verbal order and valid synthetic identity/text, readBackPerformed=true and readBackConfirmedByOriginator='false' returns compliant=true, status=compliant and no issues; literal false correctly refuses.
- User-visible effect: The order-intake evaluator can count textual false as explicit confirmation and report a verbal order ready.
- Bounded repair: Only literal true may establish performed or confirmed evidence. Use existing missing_readback/readback_not_confirmed refusal states for absent or non-boolean evidence on verbal orders. Preserve the explicit orderReceivedVerbally=false non-applicable contract; reject malformed orderReceivedVerbally values rather than treating missing evidence as a non-verbal order.
- Acceptance: Text false/true, numbers, null and objects cannot establish performed/confirmed evidence; boolean true works and boolean false keeps its existing reason. Explicit non-verbal orders remain not_applicable regardless of unused fields. Tests exercise malformed runtime input with casts, without broadening production interfaces.
- Nonduplication: No earlier plan or open/recent PR covers verbal read-back boolean evidence.

## Verification

Executed against unchanged source with Node v22.22.2 and an existing read-only local tsx loader at `/private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs`. No dependency installation or lockfile edit.

- `reproduce.cjs`: exit 0, six asserted defect witnesses plus valid/refusal controls. Exact observations are in `observations.json`. These assertions establish current bugs, not successful fixes; do not add them to CI as desired behavior.
- Fourteen existing test files: exit 0, 159 passed, zero failed/skipped/cancelled/todo, in `tests.tap`.
- Additional release-authorization consumer test: exit 0, 5 passed, zero failed/skipped/cancelled/todo, in `release-view.tap`.
- Total: **164 passing tests** across 15 existing files. The five distinct designated test files are included. No full-suite/build or live-service result is claimed.

Reproduce from repo root, using `tsx` after dependencies are available (the executed commands substituted the absolute loader above):

```sh
node --import tsx docs/planning/2026-10-12-r9/reproduce.cjs
node --import tsx --test tests/ohworks/micro-culture-incubation.test.ts tests/ohworks/bloodbank-crossmatch-hold.test.ts tests/ohworks/poct-lockout.test.ts tests/ohworks/quality-indicators.test.ts tests/ohworks-verbal-order-readback.test.ts tests/ohworks/culture-grace-validation.test.ts tests/ohworks/crossmatch-age-validation.test.ts tests/ohworks/crossmatch-unit-count-validation.test.ts tests/ohworks/poct-lockout-invalid-timing.test.ts tests/ohworks/rejection-rate-unique-specimens.test.ts tests/ohworks/demo-crossmatch-culture-view.test.ts tests/ohworks/demo-quality-indicators-view.test.ts tests/ohworks/demo-order-intake-view.test.ts tests/ohworks/demo-instrument-readiness-view.test.ts
node --import tsx --test tests/ohworks/demo-release-authorization-view.test.ts
```

Final GitHub refresh at 04:45 UTC found 19 open PRs, none newly opened since the 20-PR file review; October 12 merges were unchanged. See `github-final-check.json`.

## Ownership and handoff

Owner: this user-assigned isolated read-only planner. The branch was clean at entry. Reviewed worktree identity, local upstream history, repository receipts and GitHub ownership/PR evidence. No implementation dispatch, lease mutation or queue claim occurred; no Linear issue identifier was supplied. The inspected shared worker registry is dated June and is not asserted to establish current ownership. Canonical external intake/lease reconciliation remains the runner's responsibility before implementation, not a blocker to this already assigned planning task.

Each implementation takes its packet, pinned source evidence and synthetic reproduction as inputs. Model route/budget are not exposed. Suggested timeout: 30 minutes per bounded implementation; retry cap 1. Definition of done: regression for corrected behavior passes in the named existing test file, related existing checks pass, only the designated pair changes, and a terminal receipt records proof. Recheck PRs and ownership immediately before claiming. Jobs 4 then 5 serialize.

Receipt is staged in the existing repository `docs/worker-results` layout for runner collection. The inspected host runner's external receipt directory is outside this sandbox's writable roots; no external delivery is claimed. Rollback/recovery for this plan: remove only the newly added planning artifacts and six packets. Product files, branch HEAD and production remain unchanged.
