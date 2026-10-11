# LIMS BOX: six verified jobs (planner r3)

Task: `plan-hud-lims-box-20261011-r3`. Owner: user-assigned isolated planning lane on Lenovo `DESKTOP-1TV907A`. Branch: `codex-lenovo/plan-hud-lims-box-20261011-r3`. Base and live GitHub main at verification: `73d7f774172968d6eef9b06e84e01178b2a573be`.

Planning only. Product and existing test files are unchanged. No commit, push, email, deployment, or production writes. No external queue or Linear state was accessed: the user confines this task to this repository. These proposals do not claim implementation ownership; implementation workers must reconcile their own leases before editing.

## Discovery and exclusions

Read the voice and OHWorks READMEs, OHWorks REQUIREMENTS, SYSTEM_MAP, FOUNDER_KNOWLEDGE_LOADER_SPEC, test-layout documentation, source, and relevant existing tests. There is no root README, ROADMAP, or TODO document in this checkout. A case-insensitive TODO/FIXME search of app, components, lib, voice, and senaite returned no markers. Future/discovery-only architecture assumptions were not treated as committed missing features.

Reviewed all three open GitHub issues oldest first:

1. [#72](https://github.com/TombStoneDash/lims-box/issues/72), July 23: cross-repository commander reconciliation, not a specific two-file implementation job.
2. [#94](https://github.com/TombStoneDash/lims-box/issues/94), August 26: automatic Personnel Pack fulfillment; merged PR #559 already supplies the recent end-to-end test work. Remaining production configuration/inbox evidence is not a verified source defect within this scope. Issue closure is not claimed.
3. [#95](https://github.com/TombStoneDash/lims-box/issues/95), August 28: provider OAuth-client audit; cannot honestly reduce the requested account audit to one existing source file and one test.

Live snapshots alongside this plan retain complete issue bodies and PR file lists: `lims-box-r3-issues.json`, `lims-box-r3-open-prs.json`, `lims-box-r3-merged-prs.json`. The merged query uses inclusive `merged:>=2026-10-09`. All query results are below the 500-item limit. Open PR #604 was also inspected at the patch level: its six proposals cover reference-subject duplication, reporting limit order, reporting precision, radix reference values, radix delta values, and amendment timestamps. None is repeated here. Open PRs for competency controls, lot comparison, consumable waste, first contact, and the older pilot deployment were excluded. Every selected source/test path has zero overlap with the saved open and recently merged PR file lists.

## Six jobs

Each job has exactly one existing source file and one existing test file as its entire implementation write set. Tests follow the existing `tests/ohworks/*.test.ts` layout. Jobs 1/2 share a pair, as do 4/5: execute each pair sequentially on refreshed bases. All findings below reproduced against unchanged source with synthetic data. Browser fixtures do not expose arbitrary evaluator input, so these are not claims of current production incidents or browser-input exploits.

### 1. Reject nonexistent calendar dates in effective catalog selection

- **Source:** `lib/ohworks-effective-dating.ts:132` (`parseUtcInstant`), especially `:136`; used for version dates at `:224`/`:230` and result time at `:288`.
- **Test:** `tests/ohworks/effective-dating.test.ts`.
- **Verified:** a valid open-ended GLU definition and result timestamp `2026-02-30T00:00:00Z` return `decision: resolved`. JavaScript silently rolls the date into March. The same parser admits impossible effective-from/to dates.
- **User outcome:** the synthetic lab-day trace should refuse invalid dates rather than select a method/reference definition for an invented instant.
- **Repair:** validate actual UTC calendar fields before accepting parsed timestamps; use existing version/result timestamp rejection codes.
- **Acceptance:** impossible February/April dates reject for result, effective-from, and effective-to; valid leap day and ordinary UTC fractional-second inputs remain accepted. Preserve half-open interval boundaries and gap/overlap behavior.

### 2. Reject inverted reference intervals in effective catalog definitions

- **Source:** `lib/ohworks-effective-dating.ts:160` checks finite bounds without checking their order.
- **Test:** `tests/ohworks/effective-dating.test.ts`.
- **Verified:** a definition with `lowerBound: 100, upperBound: 70` resolves normally and returns that inverted interval as the selected definition.
- **User outcome:** catalog selection should identify bad configuration immediately instead of presenting an invalid reference interval as successfully resolved. The synthetic lab-day pipeline consumes the returned interval; this finding does not assert that downstream evaluators release it.
- **Repair:** require lower bound <= upper bound during structural validation and return existing `version-malformed` rejection. Validate the whole catalog, including entries outside the queried time window, consistent with the current contract.
- **Acceptance:** inverted bounds reject, equal bounds retain support, ordered finite bounds resolve, and existing nonfinite-bound tests pass. Run after job 1.

### 3. Handle prototype-named unknown panels without crashing expansion

- **Source:** `lib/ohworks-order-panel.ts:136` and `:261` use `in` for declared-panel membership; `:250` iterates the selected value.
- **Test:** `tests/ohworks/order-panel.test.ts`.
- **Verified:** `expandOrderPanels({}, [], [{kind: 'PANEL', code: 'constructor'}])` throws native `TypeError: catalogue[panelCode] is not iterable`. `constructor` is inherited, not a declared panel.
- **User outcome:** an unrecognized order code should appear in unknown-code feedback while valid order lines still expand, rather than aborting the whole expansion. This evaluator currently has test callers only; no browser integration is claimed.
- **Repair:** use own-key membership for both order lookup and nested catalogue references. Keep explicit own properties usable, including null-prototype catalogs.
- **Acceptance:** undeclared `constructor`, `toString`, and `__proto__` order codes are reported unknown; undeclared nested panel references produce the existing typed catalogue error; explicitly declared own panels still expand. Existing cycle and nesting checks pass.

### 4. Return a handled error for missing prototype-named comment values

- **Source:** `lib/ohworks-result-comments.ts:239` reads inherited values; `:243` calls `trim()` without validating the resolved value's type.
- **Test:** `tests/ohworks/result-comments.test.ts`.
- **Verified:** a valid template `Reviewed by {constructor}` with declared placeholder `constructor` and request `values: {}` throws native `TypeError: value.trim is not a function`, not `CommentRenderError`.
- **User outcome:** the comment review view catches typed renderer errors and shows refusal feedback; this native error escapes that handling. Missing values should yield a readable refusal instead of a render failure.
- **Repair:** require an own supplied property for each placeholder and validate that value before trimming. Use existing missing-value/request error codes; never substitute inherited data.
- **Acceptance:** absent `constructor`, `toString`, and `__proto__` values yield typed missing-value errors; explicit own string values work, including null-prototype value maps; non-string own values retain typed rejection.

### 5. Make repeated comment-code output independent of request order

- **Source:** `lib/ohworks-result-comments.ts:261` through `:268` compare only priority/code; `:287` retains every request before sorting.
- **Test:** `tests/ohworks/result-comments.test.ts`.
- **Verified:** two NOTE requests rendering `Reviewed by Alice` and `Reviewed by Bob` produce opposite output ordering when the input array is reversed. Equal code/priority comparisons return zero, so stable sort preserves input order. The module explicitly promises request-order-independent output.
- **User outcome:** the synthetic comment display should not reorder the same comments simply because an importer or caller enumerates requests differently.
- **Repair:** preserve every requested comment and add a deterministic text tiebreaker after priority and code. Use code-unit comparison for host-independent ordering; identical rendered comments may remain equal.
- **Acceptance:** permutations of repeated-code requests with different values return identical arrays; all comments remain present; distinct-code priority ordering, duplicate identical text, and existing refusal behavior remain intact. Run after job 4.

### 6. Reject worklist specimens with blank identifiers

- **Source:** `lib/ohworks-worklist.ts:155` validates duplicates, priority and sequence but not identifier contents; `:245` copies a blank identifier into a patient entry.
- **Test:** `tests/ohworks/worklist.test.ts`.
- **Verified:** `{specimenId: '', priority: 'stat', accessionSequence: 1}` produces a normal QC-bracketed run whose patient row has `specimenId: ''`.
- **User outcome:** a planned worklist must not contain an unidentifiable specimen row. Reject it with explicit input feedback before producing an apparently usable plan. This evaluator currently has test callers only; no current browser worklist is claimed.
- **Repair:** add a typed invalid-specimen-ID check for non-string, empty, and whitespace-only IDs before duplicate checking. Keep valid identifier bytes unchanged, so this does not silently merge distinct identities.
- **Acceptance:** empty/whitespace IDs and runtime non-string values throw `WorklistSequencingError`; valid IDs and duplicate-ID rejection remain unchanged; sequencing, QC brackets, and run splitting still pass.

## Executed verification

Node v24.14.1. Dependencies installed locally with lifecycle scripts disabled; no database operation was requested. Existing tests were not edited.

```powershell
node --import tsx --test tests/ohworks/effective-dating.test.ts tests/ohworks/order-panel.test.ts tests/ohworks/result-comments.test.ts tests/ohworks/worklist.test.ts tests/ohworks/synthetic-lab-day.test.ts tests/ohworks/demo-sendout-cancellation-comments-view.test.ts
node --import tsx docs/plans/lims-box-r3-reproduce.mjs
```

Baseline: **146 passed, 0 failed, 0 skipped**, exit 0; saved output: `lims-box-r3-tests.txt`. Reproduction asserts the six current defects, not their desired fixes. The reproduction script is a planning evidence artifact, not a replacement for regression assertions in the named existing test files. No full-suite, build, production, or clinical-validation result is claimed.

## Implementation handoff

Inputs: pinned base, selected source/test pair, reproduction, and expected behavior above. Owner/model route/budget: unassigned or not-exposed. Suggested bound: 30 minutes per implementation, retry cap 1; do not broaden the write set. Recheck current PR coverage and obtain lane ownership before each job. Done means the observed counterexample has a passing regression for the corrected behavior, the existing test file passes, the diff changes only the selected pair, and a terminal implementation receipt is returned. Later repair rollback is a controlled revert; this planner leaves all commit/push actions to the runner.

