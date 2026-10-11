# LIMS BOX: six verified repair jobs, planner r4

Task: `plan-hud-lims-box-20261011-r4`. Host: Lenovo `DESKTOP-1TV907A`. User-assigned planning owner and branch: `codex-lenovo/plan-hud-lims-box-20261011-r4`. Initial worktree was clean. Base HEAD and live origin main both resolved to `b997191bfd250459be058737e8915f8f00280722` on 2026-10-11. Live main was checked at approximately 11:14 UTC.

Planning only: product and existing test files are unchanged. No commit, push, email, deployment, database operation, external task claim, or canonical lease issuance. The direct user assignment authorizes this planning lane; proposals do not claim implementation ownership. External Hermes/Linear/worker directories were not accessed because the user confines work to this repository. Future implementation requires its own ownership reconciliation.

## Discovery and exclusions

Read the OHWorks and voice READMEs, SYSTEM_MAP, OHWorks REQUIREMENTS, FOUNDER_KNOWLEDGE_LOADER_SPEC, full-suite test-layout documentation, Personnel Pack security documentation, OAuth audit, source and relevant tests. Tracked-file discovery found no root README, ROADMAP, or TODO document. A case-insensitive TODO/FIXME search of app, components, lib, voice, and senaite returned no matches. The docs' future/discovery-only assumptions were not promoted to missing product features.

All open issues were reviewed oldest first:

1. [#72](https://github.com/TombStoneDash/lims-box/issues/72), 2026-07-23: cross-repository commander reconciliation. It does not specify a bounded one-source/one-test repair.
2. [#94](https://github.com/TombStoneDash/lims-box/issues/94), 2026-08-26: automatic Personnel Pack fulfillment. Recent merged PR #559 covers its end-to-end PDF verification work. Remaining production configuration/inbox proof cannot be claimed from this read-only planner and is not requeued here. The issue is not declared resolved.
3. [#95](https://github.com/TombStoneDash/lims-box/issues/95), 2026-08-28: provider OAuth-client audit. The account inventory and keep/retire decisions cannot honestly be reduced to a verified two-file product job.

Saved GitHub snapshots, collected around 11:14 UTC, contain 3 open issues, 9 open PRs, and 60 PRs merged on/after 2026-10-09 (inclusive query). Each query limit was 500, so none reached the cap. See `lims-box-r4-issues.json`, `lims-box-r4-open-prs.json`, and `lims-box-r4-merged-prs.json` alongside this plan. All ten selected source/test paths were compared with every returned PR file list: **zero overlaps**.

Open planning PRs [#604](https://github.com/TombStoneDash/lims-box/pull/604) and [#621](https://github.com/TombStoneDash/lims-box/pull/621) were also read at patch level. Their proposals cover reference-subject duplication, reporting limit order/precision, reference-range and delta-check radix parsing, amendment timestamps, effective catalog dates/bounds, prototype panel/comment lookup, comment order, and blank worklist identifiers. None is repeated here. In particular, job 5 below changes the separate report-version comparator, not either numeric evaluator named in #604. Other open PRs cover competency controls, lot comparison, consumables, first contact, or pilot runtime work and were excluded.

## Six jobs

Each job's entire implementation write set is exactly the one existing source file and one existing test file named below. Job 3 and job 4 share a pair and must execute sequentially on refreshed bases. Existing lane layout includes both `tests/ohworks/*.test.ts` and the established root `tests/ohworks-shift-handoff-checklist.test.ts`; do not relocate tests or introduce a new test layout.

### 1. Reject impossible worksheet-event dates before advancing state

- Source: `lib/ohworks-worksheet-verification.ts:351` and `:268`.
- Test: `tests/ohworks/worksheet-verification.test.ts`.
- Verified counterexample: a valid synthetic prepare event dated `2026-02-30T12:00:00Z` returns `blocked: false`, advances to `prepared`, and retains that nonexistent date in history. Validation uses Date.parse plus a Z suffix; JavaScript rolls February 30 into March.
- User outcome: worksheet preparation/verification history should refuse an invalid event date instead of presenting it as accepted evidence. The evaluator feeds the CAPA/worksheet demo view and panel; current browser fixtures use valid dates, so this is a module-level reproduction, not a browser incident.
- Bounded repair: validate the literal calendar and time fields before accepting a UTC event, using existing `timestamp-invalid` refusal and preserving state/history on rejection.
- Acceptance: February 30, non-leap February 29, April 31 and 24:00 refuse; valid leap day and supported UTC fractional seconds work. Cover prepare and a later transition; existing role separation, replay and chronological checks must continue passing.

### 2. Refuse impossible sample dates before calling the SENAITE adapter

- Source: `lib/ohworks-senaite-create.ts:162` and `:168`.
- Test: `tests/ohworks/senaite-create-contract.test.ts`.
- Verified counterexample: dateSampled `2026-02-30T09:00:00Z`, dateReceived `2026-03-02T11:00:00Z`, and otherwise valid synthetic inputs invoke the in-memory adapter once and return `CREATED`. A nonexistent collection day is treated as a valid timestamp.
- User outcome: sample creation should explain invalid collection/receipt dates before submission, preventing an apparently successful accession with impossible provenance. This is an injected contract currently exercised by tests, not proof of a live connected SENAITE deployment.
- Bounded repair: validate actual calendar fields for both dates and preserve the existing sampled/received invalid reason codes. Require unambiguous supported ISO timestamps; keep valid explicit timezone offsets supported. Do not change the adapter or wire a live integration.
- Acceptance: impossible sampled and received dates each return `REJECTED` with the corresponding reason and **zero adapter calls**; valid leap dates, ordinary UTC/offset timestamps, and receipt-before-collection behavior remain covered. Use only fake adapters.

### 3. Keep unreadable worklist timing from clearing shift handoff

- Source: `lib/ohworks-shift-handoff-checklist.ts:97` and `:104`.
- Test: `tests/ohworks-shift-handoff-checklist.test.ts`.
- Verified counterexample: a pending STAT item with enteredAt `not-a-date` is classified `info`, with `readyForHandoff: true` and zero blocking issues. Date.parse produces NaN, whose age comparison is false. An invalid `now` likewise defeats the age check.
- User outcome: an outgoing analyst should see unresolved timing as blocking review, rather than readiness inferred from an age that cannot be computed. This checklist feeds the synthetic shift-handoff panel; malformed inputs were supplied directly to the evaluator.
- Bounded repair: validate the supplied clock and worklist timestamps before age classification. Return an explicit blocking checklist item/explanation for unreadable or nonexistent dates; preserve the return shape and avoid introducing an uncaught exception into the panel.
- Acceptance: invalid enteredAt and invalid now cannot return ready; invalid calendar dates cannot be normalized into plausible ages; valid fresh STAT, the exact 60-minute boundary, stale STAT/critical and valid routine behavior remain unchanged. An invalid clock must be reported even for an otherwise empty checklist.

### 4. Do not treat empty notification evidence as an acknowledged critical result

- Source: `lib/ohworks-shift-handoff-checklist.ts:120` through `:126`.
- Test: `tests/ohworks-shift-handoff-checklist.test.ts`.
- Verified counterexample: a pending critical value with notifiedAt `''` yields `info`, `readyForHandoff: true`, and the description `was notified at .`. The only evidence check is `!== null`.
- User outcome: handoff must continue to flag a critical result when its notification timestamp is absent or unusable, instead of telling the analyst it was notified.
- Bounded repair: require a valid, nonblank, real notification timestamp before classifying the item as acknowledged. Missing/invalid evidence remains blocking with truthful wording; do not send notifications or add persistence. Reuse the local validator introduced by job 3 when available.
- Acceptance: null, empty, whitespace-only, unreadable and impossible-calendar notification dates stay blocking and never claim notification; a valid notification timestamp retains `info`. Execute after job 3, with the same two-file write set.

### 5. Preserve corrections from radix-prefixed result text in report diffs

- Source: `lib/ohworks-result-diff.ts:166` and `:209`.
- Test: `tests/ohworks/result-diff.test.ts`.
- Verified counterexample: old value `'0x10'` and new value `16` for the same analyte produce no changed entries and no change lines. Unrestricted Number conversion makes malformed imported text numerically equal to the corrected decimal value.
- User outcome: the corrected-report footer and audit diff should show this edit instead of hiding it. The comparator feeds the synthetic quality-events audit view; its current fixed fixtures do not contain radix text.
- Bounded repair: constrain numeric string recognition to supported decimal/scientific notation. Treat other nonblank strings as qualitative text, consistent with the existing row contract, so a change from such text to a numeric value is significant with `nonnumeric-value-changed` and no numeric delta. Do not reject all qualitative results or modify shared parsers.
- Acceptance: hexadecimal, binary and octal strings changed to their JavaScript numeric equivalents each produce a significant changed entry and footer line; ordinary decimal/scientific equivalents still compare numerically; identical qualitative text stays unchanged and qualitative edits remain significant.

### 6. Report every rule in overlapping reflex cycles

- Source: `lib/ohworks-reflex-rules.ts:159` and `:163`.
- Test: `tests/ohworks/reflex-rules.test.ts`.
- Verified counterexample: rules ab: A->B, ba: B->A, ac: A->C, cb: C->B return cycle rejections for ab and ba only. All four edges lie on cycles, including A->C->B->A. The global visited-node shortcut skips the later path through B. Permuting the same rules changes the reported set.
- User outcome: a rule author should receive the complete, stable list of misconfigured reflex rules rather than fixing one reported loop only to discover another omitted one. The existing contract explicitly promises every cycle-participating rule; the synthetic lab-day pipeline currently exposes block codes, not all rule IDs, so the precise incomplete-ID reproduction is at evaluator level. Blocking itself already works; this job does not claim a release bypass.
- Bounded repair: identify every edge within a cyclic strongly connected component (or an equivalent complete method), including self-loops; return the existing sorted `rule-cycle-detected` rejections. Avoid unrelated changes to rule firing or depth calculations.
- Acceptance: the four-rule graph returns all four IDs in any input order; parallel paths, self-loops and disconnected cycles report every participating rule; incoming/outgoing non-cycle edges are not falsely flagged. Existing acyclic depth and expansion tests pass.

## Executed verification

Node v24.14.1. Installed fresh-worktree dependencies using `npm ci --ignore-scripts --cache .npm-cache --no-audit --no-fund` (exit 0, 459 packages). Lifecycle scripts were disabled; no database operation was run. The temporary repository-local install cache was removed after completion.

```powershell
node --import tsx --test tests/ohworks/worksheet-verification.test.ts tests/ohworks/senaite-create-contract.test.ts tests/ohworks-shift-handoff-checklist.test.ts tests/ohworks/result-diff.test.ts tests/ohworks/reflex-rules.test.ts tests/ohworks/demo-shift-handoff-view.test.ts tests/ohworks/demo-capa-worksheet-view.test.ts tests/ohworks/demo-quality-events-view.test.ts tests/ohworks/synthetic-lab-day.test.ts
node --import tsx docs/plans/lims-box-r4-reproduce.mjs
```

Existing baseline: **197 passed, 0 failed, 0 skipped**, exit 0; output saved in `lims-box-r4-tests.txt`. The second command asserts all six current defects and exits 0; it is a planning proof script, not a regression suite asserting desired repaired behavior. No product/test files were edited. No full-suite, build, live deployment, or clinical validation is claimed.

## Implementation handoff

Objective: repair only each specified observable behavior. Inputs: pinned base, named source/test pair, counterexample script and acceptance criteria. Implementation owner/model route/budget: unassigned or not-exposed. Suggested bound: 30 minutes/job, retry cap 1. Obtain implementation ownership and recheck live PR coverage before each job; serialize jobs 3/4. Done means the counterexample has a passing regression for the corrected behavior, the entire named test file passes, the diff stays inside the two-file write set, and a terminal receipt identifies the result. Roll back a later implementation with its normal controlled revert. This planner leaves all commit/push actions to the runner.
