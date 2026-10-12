# LIMS BOX Six Verified Jobs R10 Implementation Plan

> **For Hermes:** Use the subagent-driven-development skill to implement this plan task-by-task. Jobs 2 and 3 share a write set and must run serially; all other jobs have disjoint write sets.

**Goal:** Deliver six bounded, user-visible input-safety fixes that are present on `codex/plan-hud-lims-box-20261012-r10`, absent from plans r1-r9, and not covered by the latest available open-PR inventory or by merges since 2026-10-09.

**Architecture:** Keep each fix inside its existing pure OHWorks domain module. Preserve the public shapes and the modules' privacy-safe, fail-closed behavior. Add regression coverage only in that module's existing lane test; do not add UI, route, storage, or integration dependencies.

**Tech Stack:** TypeScript, Node's `node:test`, strict assertions, `tsx` loader.

---

## Planning audit and scope proof

- Branch/HEAD inspected: `codex/plan-hud-lims-box-20261012-r10` at `517591d`, tracking `origin/main` with a clean worktree before this plan was written.
- Repository guidance read: `docs/SYSTEM_MAP.md`, `docs/FOUNDER_KNOWLEDGE_LOADER_SPEC.md`, `docs/testing/full-suite-ci.md`, `docs/senaite-read.md`, `docs/clients/ohworks/README.md`, and `voice/README.md`. The checkout has no root `README.md`, `SPEC.md`, `ROADMAP.md`, or `TODO.md`; the available named specifications/readmes above were used instead.
- A repository-wide TODO/FIXME/HACK/XXX scan found no actionable inline marker in the relevant application, library, voice, SENAITE, script, or test lanes.
- Earlier plan artifacts r1-r9 were read from their remote plan branches and their job inventories were compared by behavior, not merely title. None of the six jobs below repeats one of those 54 jobs. In particular, Job 5 is about blank report/test-class identity, not r6's blank recipient role; Jobs 2-3 are not r9's verbal-readback boolean work or the recently merged invalid-timestamp change.
- Live `gh issue list` and `gh pr list` were attempted but GitHub was unreachable from this sandbox. The fallback is the repository's latest authenticated GitHub snapshot, captured at `2026-10-12T04:46:25.546Z` on the r9 planning branch, plus current fetched remote branch refs. The open issues, oldest first, were [#72](https://github.com/TombStoneDash/lims-box/issues/72), [#94](https://github.com/TombStoneDash/lims-box/issues/94), and [#95](https://github.com/TombStoneDash/lims-box/issues/95). None is selected: #72 is cross-repository reconciliation rather than a bounded one-source/one-test product change; #94 is a fulfillment/live-inbox proof item already represented by merged work; #95 is an OAuth/provider audit outside this lane. The 19 open PRs in that snapshot and newer fetched r10 branches were checked by changed path; none touches a source/test pair selected below.
- `git log --since=2026-10-09` was checked for every selected source and test. The only relevant recent merges were `8f2b037` (unparseable critical-attempt timestamps) and `16243fd` (blank distribution recipient roles). Both leave the distinct reproductions below present.
- Baseline verification passed: the five named lane suites and the two closest demo consumers ran together with **223 tests passed, 0 failed**.
- A read-only runtime probe reproduced every defect on current HEAD: hexadecimal volume/temperature were accepted; string `"false"` acknowledged a critical result; a future attempt produced a 75-minute wait; blank and contradictory assistant replies parsed; blank report/test-class tokens distributed; and a blank actor ID advanced result review.

## Job 1: Reject non-decimal specimen volume and temperature strings

**User-visible defect:** An accession can be accepted with JavaScript-only numeric spellings such as volume `0x1f4` and temperature `0x4`. Browser/API users expect laboratory measurements to use decimal notation; accepting hexadecimal input can silently turn a malformed specimen measurement into an apparently valid one.

**Evidence:** `lib/ohworks-sample-rejection.ts:263-270` feeds any nonblank string to `Number()`. That helper controls volume at lines 586-596 and temperature at lines 599-607. The current probe accepted both hexadecimal fields with status `ACCEPT`.

**Files:**

- Modify: `lib/ohworks-sample-rejection.ts`
- Test: `tests/ohworks/sample-rejection.test.ts`

**Implementation:**

1. Add failing tests showing hexadecimal, binary, and octal spellings produce `volume-invalid` or `temperature-invalid` instead of acceptance.
2. Define the accepted grammar explicitly as a trimmed finite decimal number, including ordinary integer, fractional, signed, and scientific decimal forms already supported by callers. Reject alternate-radix prefixes, `Infinity`, `NaN`, and empty/whitespace-only strings.
3. Replace the unrestricted string `Number()` path in `toFiniteNumber` with grammar validation followed by finite conversion. Preserve finite numeric inputs and do not change range/unit checks.
4. Verify with:

   ```bash
   node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/sample-rejection.test.ts
   ```

**Acceptance:** Decimal and decimal-scientific inputs retain their existing decisions; alternate-radix strings deterministically add the correct invalid-measurement reason and cannot yield `ACCEPT`.

## Job 2: Require literal boolean acknowledgment in critical escalation

**User-visible defect:** A structurally malformed attempt with `reached: "false"` is truthy, so escalation stops and the UI reports “already acknowledged” even though nobody acknowledged the critical result.

**Evidence:** `lib/ohworks-critical-notification-escalation.ts:81-89` treats any truthy `reached` value as acknowledgment, while lines 98-100 use the same unchecked value when counting failed attempts. The current probe returned the acknowledged sentinel and no target for string `"false"`.

**Files:**

- Modify: `lib/ohworks-critical-notification-escalation.ts`
- Test: `tests/ohworks-critical-notification-escalation.test.ts`

**Implementation:**

1. Add failing tests for `reached` values `"false"`, `"true"`, `0`, `1`, and missing, alongside controls for literal `true` and `false`.
2. Validate every attempt's `reached` field before planning. Only literal `true` may short-circuit as acknowledged and only literal `false` may count as a failed attempt.
3. Fail closed with a sanitized typed error for non-boolean values; never echo an attempt or contact value in the message.
4. Verify with:

   ```bash
   node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks-critical-notification-escalation.test.ts
   ```

**Acceptance:** String `"false"` can no longer suppress escalation; literal booleans preserve existing plans; malformed values yield a deterministic privacy-safe error.

## Job 3: Reject critical contact attempts timestamped after the planning clock

**User-visible defect:** A contact attempt recorded in the future is accepted. Subtracting it from `now` produces negative elapsed time and an inflated wait; with a 15-minute interval, a one-hour-future attempt currently tells staff to wait 75 minutes.

**Evidence:** `lib/ohworks-critical-notification-escalation.ts:120-135` verifies only parseability, then subtracts an attempt time from `now` without enforcing `attemptTime <= nowTime`. The current probe returned `action: "wait"` and `waitMinutes: 75`.

**Files:**

- Modify: `lib/ohworks-critical-notification-escalation.ts`
- Test: `tests/ohworks-critical-notification-escalation.test.ts`

**Implementation:**

1. Add failing cases for an attempt one millisecond and one hour after `now`, plus boundary coverage for an attempt exactly at `now`.
2. During the existing attempt timestamp loop, reject any finite attempt time greater than the validated `nowTime` using a sanitized deterministic error. Keep the recently merged behavior for unparseable timestamps.
3. Preserve exact wait calculations for valid past timestamps and the equality boundary.
4. Verify with:

   ```bash
   node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks-critical-notification-escalation.test.ts
   ```

**Acceptance:** No escalation plan can contain wait time derived from a future attempt; an attempt exactly at `now` still yields the configured minimum wait.

## Job 4: Fail closed on blank or contradictory assistant replies

**User-visible defect:** The assistant UI can render a blank response, and can label a response `grounded: true` while its disposition is `refused` and it has no citations. That makes the evidence indicator misleading precisely where the product promises grounded answers.

**Evidence:** `lib/ohworks-assistant-reply.ts:45-60` checks `answer.length` rather than trimmed content, permits a blank label and citation fields, and validates `grounded`, `disposition`, and `citations` independently. Current probes accepted both a whitespace-only answer and `{ grounded: true, disposition: "refused", citations: [] }`.

**Files:**

- Modify: `lib/ohworks-assistant-reply.ts`
- Test: `tests/ohworks/assistant-reply.test.ts`

**Implementation:**

1. Add failing parser cases for whitespace-only answer/label/citation identifiers, grounded-without-citations, grounded with a non-`grounded` disposition, and disposition `grounded` with `grounded: false`.
2. Require trimmed nonempty display and citation identity fields without silently rewriting accepted values.
3. Enforce one coherent grounded state: `grounded === true` iff disposition is `grounded`, and that state requires at least one valid citation. Non-grounded safe-error/refusal payloads remain valid with an empty citation list.
4. Verify with:

   ```bash
   node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/assistant-reply.test.ts
   ```

**Acceptance:** Blank output never reaches the console renderer, and a reply cannot claim grounding without a grounded disposition and usable citation provenance.

## Job 5: Reject whitespace-only report and test-class identifiers

**User-visible defect:** A final report whose reference token and test class are spaces can be marked `DISTRIBUTED` and produce a routed entry with a blank class. Operators cannot identify or audit that delivery.

**Evidence:** `lib/ohworks-report-distribution.ts:161-170` defines nonempty as raw length greater than zero. Lines 177-196 accept and copy blank-looking report/test-class tokens; lines 213-214 apply the same weak check to matrix classes. The current probe returned `DISTRIBUTED` with a whitespace-only reference and routed class.

**Files:**

- Modify: `lib/ohworks-report-distribution.ts`
- Test: `tests/ohworks/report-distribution.test.ts`

**Implementation:**

1. Add failing cases for a whitespace-only report reference, report test class, and matrix allowed class, while keeping the already-fixed blank recipient-role coverage intact.
2. Make the shared string predicate require `trim().length > 0`. Preserve exact opaque tokens for valid inputs; validation must not normalize identities or change matching.
3. Assert existing typed outcomes: invalid report reference uses `report-reference-token-invalid`, invalid report class uses `test-classes-invalid`, and invalid matrix class uses `rule-malformed`.
4. Verify with:

   ```bash
   node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/report-distribution.test.ts
   ```

**Acceptance:** No distributed summary or routed entry can carry a whitespace-only report reference or test class, and valid opaque identifiers remain byte-for-byte unchanged.

## Job 6: Reject whitespace-only identities in result review events and context

**User-visible defect:** A submit event with an actor ID made entirely of spaces currently advances a result from `draft` to `ready_for_review` and records that unusable actor in history, breaking the audit trail shown to reviewers.

**Evidence:** `lib/ohworks-result-review-state.ts:194-213` uses raw string length for all event identity fields, and lines 216-222 do the same for workflow context. Lines 224-235 then freeze the blank-looking actor identity into event history. The current probe advanced successfully with `actorId: "   "`.

**Files:**

- Modify: `lib/ohworks-result-review-state.ts`
- Test: `tests/ohworks/result-review-state.test.ts`

**Implementation:**

1. Add table-driven failing cases for whitespace-only event ID, result ID, tenant ID, actor role, actor ID, reason code, timestamp, and whitespace-only context tenant/result IDs.
2. Strengthen structural identity validation to require trimmed nonempty strings. Preserve original valid identifiers and let the existing enum/timestamp/reason validators continue to produce their established downstream blocks.
3. Assert malformed events produce the module's existing sanitized event-input failure and malformed context produces its existing context-input failure; neither may advance state or append history.
4. Verify with:

   ```bash
   node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/result-review-state.test.ts
   ```

**Acceptance:** A review transition cannot be attributed to a blank identity, malformed input adds no history, and all valid transition/replay behavior remains unchanged.

## Final verification and delivery guardrails

Run each named command after its job, then run the combined regression command:

```bash
node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/sample-rejection.test.ts tests/ohworks-critical-notification-escalation.test.ts tests/ohworks/assistant-reply.test.ts tests/ohworks/report-distribution.test.ts tests/ohworks/result-review-state.test.ts
```

Expected result: all five suites pass, including the six new regressions, with zero failures. Keep each job constrained to its one source file and one named test file. Do not modify production integrations, send outreach, or introduce real patient/customer/contact data. The runner owns commits; implementation workers should return changed paths, the exact verification command/result, and a rollback note (`git revert <runner-created-commit>` once committed).
