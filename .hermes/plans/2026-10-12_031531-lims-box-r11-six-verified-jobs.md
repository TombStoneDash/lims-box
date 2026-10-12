# LIMS BOX Six Verified Jobs R11 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Deliver six bounded, user-visible fail-closed repairs verified on current `origin/main`, absent from plans r1-r10, and not covered by an open PR or a merge since 2026-10-09.

**Architecture:** Keep every repair inside its existing pure OHWorks domain evaluator and preserve its public decision/result shape wherever possible. Each job may change exactly the one existing source file and one existing lane test file named below; use the module's typed error/result conventions and add no route, UI, storage, or integration dependency.

**Tech Stack:** TypeScript, Node `node:test`, strict assertions, `tsx` loader.

---

## Planning audit and exclusions

- Inspected clean branch `codex/plan-hud-lims-box-20261012-r11` at `0c8191514cbe9fff21440444d44dc880b8e74252`, tracking `origin/main`.
- Read the available repository guidance: `docs/SYSTEM_MAP.md`, `docs/FOUNDER_KNOWLEDGE_LOADER_SPEC.md`, `docs/clients/ohworks/README.md`, `docs/clients/ohworks/REQUIREMENTS.md`, `docs/clients/ohworks/ARCHITECTURE.md`, `docs/clients/ohworks/DATA_DICTIONARY.md`, `docs/testing/full-suite-ci.md`, `docs/senaite-read.md`, and `voice/README.md`. There is no tracked root README, ROADMAP, or TODO document. A repository scan found no actionable TODO/FIXME/HACK/XXX marker in the application, library, voice, SENAITE, script, or test lanes.
- Read the complete r1-r10 plan artifacts from their remote planning branches and compared all 60 earlier jobs by behavior, not only title or path. None of the six jobs below repeats an earlier proposal. Job 2 deliberately picks up chronological ordering that r1 explicitly left outside its timestamp-shape job; it does not repeat that completed timestamp validation.
- The latest authenticated issue snapshot lists three open issues, oldest first: [#72](https://github.com/TombStoneDash/lims-box/issues/72) is cross-repository portfolio reconciliation, [#94](https://github.com/TombStoneDash/lims-box/issues/94) requires production Personnel Pack configuration/inbox proof and is constrained by the no-email rule, and [#95](https://github.com/TombStoneDash/lims-box/issues/95) is a provider OAuth-client audit. None names a bounded, uncovered one-source/one-test repository repair, so no issue-derived job is selected.
- Live `gh` access was attempted and failed because this sandbox cannot connect to `api.github.com`; public web search cannot enumerate this private repository. The fallback review used the authenticated r9 snapshot captured at `2026-10-12T04:46:25.546Z`, current fetched remote refs, all branches not merged into current `origin/main`, and local merge history through PR #713. No selected behavior or source/test pair is present in the current recent unmerged implementation branches. Recent merges touching Jobs 1-3 were read and are distinct: method-comparison non-finite derived statistics (`7e6906a`), amendment timestamp syntax/calendar validity (`c35a905` / #654), and carryover decimal threshold roundoff (`15024ce` / #666).
- A read-only runtime probe reproduced all six counterexamples on current HEAD. Existing source and tests were not changed.

## Job 1: Reject alternate-radix values in method comparisons

**User-visible defect:** A reference value of `"0x10"` is silently converted to decimal 16. Paired with candidate value 16, the evaluator reports `acceptable`, zero difference, and zero percent difference, so the method-performance view can present malformed laboratory text as valid comparison evidence.

**Evidence:** `lib/ohworks-method-comparison.ts:175-183` sends any nonblank string through unrestricted `Number()`, and `:311-317` uses that result as ordinary reference/candidate evidence. The verified two-pair probe returned `decision: "acceptable"` with the first difference equal to zero.

**Files:**

- Modify: `lib/ohworks-method-comparison.ts`
- Test: `tests/ohworks/method-comparison.test.ts`

**Implementation:**

1. Add failing table-driven tests for hexadecimal, binary, and octal strings in both `referenceValue` and `candidateValue`; assert the existing position-specific `reference-value-invalid` or `candidate-value-invalid` code.
2. Define a local trimmed decimal/scientific grammar (signed integer, fractional, and exponent forms) and require a string to match it before `Number()` conversion.
3. Preserve finite numeric inputs, surrounding whitespace on valid decimal text, and the existing accepted numeric-looking decimal-string behavior.
4. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/method-comparison.test.ts` and expect zero failures.

**Acceptance:** Alternate-radix text never contributes to an acceptable comparison or its statistics; ordinary decimal/scientific text and numeric inputs retain their current results.

## Job 2: Reject report amendment timestamps that move backward

**User-visible defect:** A valid version 2 amendment dated January 2 followed by valid version 3 dated January 1 returns `status: "VALID"`, advances the current version to 3, and displays a backwards report history.

**Evidence:** `lib/ohworks-report-amendment.ts:187-203` validates timestamp syntax and calendar fields, but the application loop at `:248-282` checks only versions, reason, and role before appending the timestamp. The verified probe accepted both records in reverse chronology.

**Files:**

- Modify: `lib/ohworks-report-amendment.ts`
- Test: `tests/ohworks/report-amendment.test.ts`

**Implementation:**

1. Add failing tests for a later amendment before, and exactly simultaneous with, the prior accepted amendment; include mixed `Z`/offset spellings so comparison is by instant rather than string.
2. Add a `timestamp-out-of-order` amendment reason, privacy-safe explanation, and next action in the existing bounded maps.
3. Track the previous accepted timestamp's epoch value while walking the chain and reject a new amendment unless its instant is strictly later. Keep timestamp shape/calendar failures as `amendment-malformed` and preserve the current rule priority before chronology where documented.
4. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/report-amendment.test.ts` and expect zero failures.

**Acceptance:** A valid amendment chain cannot move backward or reuse an instant; chronological `Z` and offset timestamps continue to work, and the partial accepted chain stops before the offending record.

## Job 3: Refuse blank carryover result and analyte identities

**User-visible defect:** A run whose only result ID and analyte code are spaces, paired with a rule whose analyte code is spaces, returns a `clear` assessment carrying a blank-looking result ID. The analytical workflow therefore presents a resolved carryover outcome with no usable result or analyte identity.

**Evidence:** `lib/ohworks-carryover.ts:144-159` and `:173-190` require raw length only. Lines `:206-211` then install the blank-looking analyte rule in the lookup map, allowing the result to resolve normally. The verified probe returned `reasonCode: "no-preceding-high"`.

**Files:**

- Modify: `lib/ohworks-carryover.ts`
- Test: `tests/ohworks/carryover.test.ts`

**Implementation:**

1. Add failing tests for whitespace-only result IDs, result analyte codes, and rule analyte codes, plus controls proving valid opaque identifiers are preserved without normalization.
2. Strengthen the result identity predicate to require `trim().length > 0`; continue using `result-missing-identity` for malformed result identity.
3. Strengthen rule validation the same way; continue using `rules-invalid` for a blank rule analyte.
4. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/carryover.test.ts` and expect zero failures.

**Acceptance:** No carryover assessment or rule lookup can be keyed by a whitespace-only identity, while nonblank identifiers remain byte-for-byte unchanged in output.

## Job 4: Refuse blank chain-of-custody identities

**User-visible defect:** A whitespace-only reference token and a transfer between two different whitespace-only actor strings return `status: "VALID"`. Operators can therefore receive a valid custody decision with no usable specimen reference or releasing/receiving actor identity.

**Evidence:** `lib/ohworks-chain-of-custody.ts:255-275` defines every required identity as raw length greater than zero, and `:288-301` accepts the reference and transfer before the business-rule loop. The verified probe returned `{"referenceToken":"   ","status":"VALID"}`.

**Files:**

- Modify: `lib/ohworks-chain-of-custody.ts`
- Test: `tests/ohworks/chain-of-custody.test.ts`

**Implementation:**

1. Add failing cases for a whitespace-only reference token, releasing actor, receiving actor, role, timestamp, and present-but-blank seal ID.
2. Make the shared required-string predicate require non-whitespace content. Preserve exact valid opaque tokens; validation must not trim or rewrite accepted actor/reference identities.
3. Retain `reference-token-invalid` for the reference and `transfer-malformed` for blank transfer fields; existing bounded role, timestamp, seal, and continuity decisions remain unchanged.
4. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/chain-of-custody.test.ts` and expect zero failures.

**Acceptance:** A chain cannot be declared valid using blank-looking reference or actor evidence, and valid chains preserve their existing privacy-safe output.

## Job 5: Refuse blank instrument identities before qualification

**User-visible defect:** A registry record keyed by spaces, containing the same whitespace-only `instrumentId` and otherwise valid stages, returns `decision: "qualified"` and `reasonCode: "fully-qualified"`. The facility-readiness surface can therefore show a qualified instrument that has no usable identity.

**Evidence:** `lib/ohworks-equipment-qualification.ts:209-210` uses raw length for identity, `:245-272` accepts that record, and `:314-326` looks it up and proceeds. The verified probe qualified the blank instrument for a January 10 run.

**Files:**

- Modify: `lib/ohworks-equipment-qualification.ts`
- Test: `tests/ohworks/equipment-qualification.test.ts`

**Implementation:**

1. Add failing tests for a whitespace-only requested instrument ID and a whitespace-only `instrumentId` in a registry record, plus a control for valid opaque IDs containing internal spaces.
2. Change the shared nonempty-string helper to require trimmed content, preserving original accepted values rather than normalizing them.
3. Assert the request fails with existing `instrument-id-malformed`; a malformed blank record continues to use `instrument-record-malformed`. Preserve all qualification-stage and calendar behavior.
4. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/equipment-qualification.test.ts` and expect zero failures.

**Acceptance:** No blank-looking instrument can become qualified or appear as qualified in the readiness model; valid identified instruments retain current decisions.

## Job 6: Return a typed error for a non-array sample-volume panel

**User-visible defect:** Passing `null` as the test panel throws native `TypeError: tests is not iterable` instead of the module's privacy-safe `SampleVolumeError`. A malformed API/runtime payload can therefore escape the normal handled-error path and surface as a generic failure.

**Evidence:** `lib/ohworks-sample-volume.ts:128-151` iterates `tests` without checking `Array.isArray`, and `:190-203` calls that validator after only the two volume checks. The verified probe produced a native `TypeError` with no typed error code.

**Files:**

- Modify: `lib/ohworks-sample-volume.ts`
- Test: `tests/ohworks/sample-volume.test.ts`

**Implementation:**

1. Add failing runtime-shape tests for `null`, an object, and a string cast as the panel, while preserving the intentionally supported empty array.
2. Add `tests-not-array` to `SampleVolumeErrorCode` and `ERROR_MESSAGES` with a static privacy-safe message.
3. Guard `tests` with `Array.isArray` before iteration and throw `SampleVolumeError('tests-not-array')`; preserve the current validation order for specimen volume, dead volume, then panel shape.
4. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/sample-volume.test.ts` and expect zero failures.

**Acceptance:** Malformed non-array panels always use the typed handled error, an empty panel remains valid, and all existing sufficiency calculations remain unchanged.

## Verification performed on the unchanged baseline

- Runtime probe: all six defective behaviors reproduced, exit 0. This proves the current defects, not their fixes.
- Focused lane suites:

  ```bash
  node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/method-comparison.test.ts tests/ohworks/report-amendment.test.ts tests/ohworks/carryover.test.ts tests/ohworks/chain-of-custody.test.ts tests/ohworks/equipment-qualification.test.ts tests/ohworks/sample-volume.test.ts
  ```

  Result: **231 passed, 0 failed, 0 skipped/cancelled/todo**, exit 0.

- Related recent-regression and demo-consumer suites:

  ```bash
  node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/demo-method-performance-view.test.ts tests/ohworks/method-comparison-unavailable-bias.test.ts tests/ohworks/demo-report-delivery-view.test.ts tests/ohworks/report-amendment-timestamp.test.ts tests/ohworks/carryover-decimal-threshold.test.ts tests/ohworks/demo-analytical-run-view.test.ts tests/ohworks/demo-facility-readiness-view.test.ts tests/ohworks/equipment-qualification-calendar-dates.test.ts
  ```

  Result: **198 passed, 0 failed, 0 skipped/cancelled/todo**, exit 0.

## Final implementation guardrails

Implement each job with a failing regression first, then the minimal source repair, then its named lane command. After all six jobs, rerun both combined commands above. Keep every job's diff to exactly its named source/test pair; no job needs a new file, UI change, database operation, external service, or real patient/customer data. Jobs are otherwise disjoint and may be implemented independently. The runner owns commits and push; each implementation receipt should state changed paths, exact test result, remaining blocker, and ordinary `git revert <commit>` rollback.
