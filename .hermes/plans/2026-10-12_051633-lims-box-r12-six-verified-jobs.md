# LIMS BOX Six Verified Jobs R12 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Deliver six bounded, user-visible fail-closed repairs verified on current `origin/main`, absent from plans r1-r11, and not covered by an open PR or a merge since 2026-10-09.

**Architecture:** Keep each repair inside its existing pure OHWorks domain evaluator and preserve its public result shape unless a new bounded error code is required. Every job changes exactly the one existing source file and one existing lane test file named below; no route, UI, database, integration, or fixture change is needed.

**Tech Stack:** TypeScript, Node `node:test`, strict assertions, `tsx` loader.

---

## Planning audit and exclusions

- Inspected clean branch `codex/plan-hud-lims-box-20261012-r12` at `7014b6e`, tracking `origin/main`.
- Read the repository guidance and named planning material that exists: `docs/clients/ohworks/README.md`, `docs/clients/ohworks/REQUIREMENTS.md`, `docs/clients/ohworks/ARCHITECTURE.md`, `docs/clients/ohworks/DATA_DICTIONARY.md`, `docs/SYSTEM_MAP.md`, `docs/FOUNDER_KNOWLEDGE_LOADER_SPEC.md`, `docs/testing/full-suite-ci.md`, `docs/senaite-read.md`, and `voice/README.md`. There is no tracked root README, ROADMAP, or TODO document. A repository-wide TODO/FIXME/HACK/XXX scan found no actionable source comment; the sole `XXX` occurrence is deliberate synthetic label data.
- Read every r1-r11 plan artifact from its remote planning branch and compared all 66 prior jobs by behavior, source path, and test path. None of the six jobs below repeats an earlier proposal. In particular, this plan excludes all r11 work now merged into `main`, plus the still-unmerged alternate-radix method-comparison implementation.
- The latest authenticated issue snapshot available in the repository history lists three open issues, oldest first: #72 is portfolio-wide reconciliation, #94 needs production Personnel Pack configuration and an external-inbox proof, and #95 needs a provider OAuth-client audit. None can be reduced honestly to one existing source file plus one existing lane test file, so no issue-derived job is selected.
- Live `gh api` access was attempted and failed because this sandbox cannot reach `api.github.com`; public web search cannot enumerate this private repository. The fallback duplicate review used the authenticated snapshot captured at `2026-10-12T04:46:25.546Z`, current fetched remote refs through `7014b6e`, every recent unmerged branch name/subject, `git log --all --not origin/main` for all twelve selected paths, and all merges since 2026-10-09. The only unmatched recent path commits are stale branch copies of changes already present on `main`; none implements a selected behavior.
- A read-only runtime probe reproduced every counterexample below on current HEAD. Existing source and tests were not changed.

## Job 1: Refuse to accept a specimen from an empty transport log

**User-visible defect:** A specimen with no logger readings is reported `decision: "acceptable"`, with zero excursions and zero excursion time. A receiving operator can therefore see an affirmative transport decision even though no temperature evidence exists.

**Evidence:** `lib/ohworks-transport-conditions.ts:340-349` validates that `readings` is an array but permits an empty array. Lines `403-413` reduce the empty excursion list to zero and pass those zeros to `decide`, whose inclusive checks at `:282-286` return `acceptable`. The runtime probe returned `readingCount: 0` and `decision: "acceptable"`. The current test at `tests/ohworks/transport-conditions.test.ts:227` explicitly records the unsafe baseline.

**Files:**

- Modify: `lib/ohworks-transport-conditions.ts`
- Test: `tests/ohworks/transport-conditions.test.ts`

**Implementation:**

1. Replace the empty-log acceptance test with a failing assertion that `evaluateTransportConditions` throws `TransportConditionsError` with a new bounded code, `readings-empty`.
2. Add `readings-empty` to `TransportConditionsErrorCode` and `ERROR_MESSAGES` with static privacy-safe text.
3. After validating that the readings value is an array, fail with `readings-empty` when its length is zero, before computing excursions or a decision.
4. Add a control proving that a one-reading in-band log retains its current bounded result; do not invent a minimum time span or alter excursion duration semantics in this job.
5. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/transport-conditions.test.ts` and expect zero failures.

**Acceptance:** The evaluator never emits `acceptable` without at least one valid logger reading, while all nonempty valid logs retain current classification behavior.

## Job 2: Keep consumable reorder outputs finite

**User-visible defect:** Individually finite inventory inputs can overflow during reorder math. With `averageDailyUsage: Number.MAX_VALUE` and two days of lead/target cover, the evaluator returns `reorderPoint: Infinity` and `reorderQuantity: Infinity`, values that can leak directly into the facility-readiness surface.

**Evidence:** `lib/ohworks-consumable-inventory.ts:209-227` validates each declaration field independently as finite, but `:368-378` does not validate the derived stock sum, cover, reorder point, target level, reorder quantity, or expired total. The runtime probe returned both reorder fields as `Infinity` while still returning the normal `reorder-needed` status.

**Files:**

- Modify: `lib/ohworks-consumable-inventory.ts`
- Test: `tests/ohworks/consumable-inventory.test.ts`

**Implementation:**

1. Add failing tests for overflow in `averageDailyUsage * leadTimeDays`, `averageDailyUsage * targetCoverDays`, and the sum of two finite lot quantities. Assert one new typed `ConsumableInventoryError` code, `derived-value-invalid`, rather than accepting a non-finite result.
2. Add `derived-value-invalid` to `ConsumableInventoryErrorCode`, `ERROR_MESSAGES`, and the exhaustive explanation tests.
3. Compute the derived values in named locals and check every externally returned numeric aggregate with `Number.isFinite` before status classification or result construction. Preserve `daysOfCover: null` for zero usage.
4. Extend the guard to `expiredQuantityTotal` and intermediate FEFO arithmetic so no successful result can contain `NaN` or either infinity.
5. Add a boundary control with large but representable values and assert exact finite output, preventing an arbitrary small cap from replacing the arithmetic guard.
6. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/consumable-inventory.test.ts` and expect zero failures.

**Acceptance:** Every successful inventory result contains only finite numeric metrics (except the documented `daysOfCover: null` case), and any finite inputs whose derived arithmetic is not representable fail through the typed, privacy-safe error path.

## Job 3: Reject a maintenance registry record for the wrong instrument

**User-visible defect:** Looking up `requested-instrument` can retrieve a schedule whose embedded `instrumentId` is `different-instrument`; when that wrong record has no tasks, the gate reports the requested instrument as `usable` with `no-scheduled-tasks`.

**Evidence:** `lib/ohworks-instrument-maintenance.ts:343-349` looks up and shape-validates the record, but never compares `raw.instrumentId` with the requested key. Lines `366-368` then return `usable` for the mismatched empty schedule. The runtime probe returned the requested ID with `decision: "usable"` even though its only registry record identified another instrument.

**Files:**

- Modify: `lib/ohworks-instrument-maintenance.ts`
- Test: `tests/ohworks/instrument-maintenance.test.ts`

**Implementation:**

1. Add a failing test whose registry key and embedded `instrumentId` differ; assert a sanitized typed input failure before task evaluation.
2. Add a distinct `schedule-instrument-mismatch` member to `MaintenanceGateInputErrorCode` and `INPUT_ERROR_MESSAGES` so callers can distinguish corrupt lookup identity from a malformed task list.
3. Immediately after structural schedule validation, require `raw.instrumentId === instrumentId`; do not trim, case-fold, or rewrite opaque instrument IDs.
4. Add controls proving an exact matching record still evaluates and two distinct but similar IDs do not alias.
5. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/instrument-maintenance.test.ts` and expect zero failures.

**Acceptance:** A maintenance decision can only be derived from the schedule that explicitly identifies the requested instrument; mismatched records never make an instrument usable.

## Job 4: Keep future critical-value notifications from clearing shift handoff

**User-visible defect:** A pending critical value with `notifiedAt` one day after the checklist's `now` is labeled informational, and the checklist reports `readyForHandoff: true`. Future evidence can therefore clear a blocking notification obligation.

**Evidence:** `lib/ohworks-shift-handoff-checklist.ts:134-143` treats any calendar-valid notification timestamp as acknowledged without comparing it to `now`. Lines `187-207` compute readiness solely from the resulting severities. The runtime probe used `now` on January 1 and `notifiedAt` on January 2 and returned an info item with zero blockers.

**Files:**

- Modify: `lib/ohworks-shift-handoff-checklist.ts`
- Test: `tests/ohworks-shift-handoff-checklist.test.ts`

**Implementation:**

1. Add failing tests for a notification after `now`, exactly at `now`, and the same instant written with a different explicit offset.
2. Pass the parsed checklist time into the critical-value item builder. Treat notification evidence as acknowledged only when both instants are valid and `notifiedAt <= now` by epoch value.
3. Keep future notification evidence blocking and use deterministic text explaining that the notification time is after the checklist time; do not expose any new data beyond fields already rendered by this module.
4. Preserve the existing invalid-`now` blocking item and ensure a future critical notification does not double-count unrelated failures.
5. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks-shift-handoff-checklist.test.ts` and expect zero failures.

**Acceptance:** Only valid notification evidence at or before the checklist instant can turn a critical value into an informational handoff item; future evidence always keeps handoff blocked.

## Job 5: Reject duplicate records in a purge manifest

**User-visible defect:** Two eligible entries with the same `recordId` produce a successful purge manifest containing that ID twice. An operator or downstream purge worker can receive duplicate deletion instructions for one laboratory record.

**Evidence:** `lib/ohworks-record-retention.ts:310-328` validates each entry independently and pushes every ID without tracking prior IDs. The runtime probe returned `recordIds: ["SYN-R", "SYN-R"]` for two entries with different record classes but the same record identity.

**Files:**

- Modify: `lib/ohworks-record-retention.ts`
- Test: `tests/ohworks/record-retention.test.ts`

**Implementation:**

1. Add failing tests for adjacent and non-adjacent duplicate record IDs in otherwise eligible batches; assert the entire manifest fails and no partial result is returned.
2. Add `duplicate-record-id` to `RecordRetentionErrorCode` and `ERROR_MESSAGES`, then include it in the exhaustive message test.
3. Track exact record IDs in a local `Set` during manifest construction. After the existing eligibility and missing-ID checks, throw `RecordRetentionError('duplicate-record-id')` before appending a repeated ID.
4. Preserve input order for distinct IDs and exact opaque-ID comparison; do not trim or case-fold identifiers as part of this job.
5. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/record-retention.test.ts` and expect zero failures.

**Acceptance:** Every successful purge manifest names each record exactly once, and any duplicate makes the all-or-nothing batch fail through a bounded privacy-safe error.

## Job 6: Refuse whitespace-only corrective-action evidence

**User-visible defect:** A full CAPA workflow with `implementationEvidence: "   "` and `closureSummary: "   "` reaches `finalState: "closed"`. The quality-events surface can therefore display a closed corrective action with no usable implementation or closure evidence.

**Evidence:** `lib/ohworks-corrective-action.ts:229-230` defines nonempty as raw string length. The evidence gates at `:466-470` and `:481-493` reuse that predicate, so whitespace passes both. The runtime probe accepted all five events and returned `blocked: false`, `finalState: "closed"`.

**Files:**

- Modify: `lib/ohworks-corrective-action.ts`
- Test: `tests/ohworks/corrective-action.test.ts`

**Implementation:**

1. Add failing table-driven tests for whitespace-only investigation scope, proposed action, implementation evidence, closure summary, and reopen finding. Assert each existing field-specific block code.
2. Add a local predicate for required human-entered evidence that requires `trim().length > 0`. Use it at the kind-specific gates without trimming or rewriting accepted text.
3. Keep bounded enum checks for root cause and effectiveness outcome unchanged. Preserve structural typed errors for non-string fields and the existing PII check order.
4. Add a control proving nonblank evidence with intentional surrounding whitespace is preserved byte-for-byte in accepted history.
5. Run `node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/corrective-action.test.ts` and expect zero failures.

**Acceptance:** No corrective action can advance or close using blank-looking required evidence, while valid evidence remains unchanged in the immutable event history.

## Verification performed on the unchanged baseline

- Runtime probe: all six counterexamples reproduced, exit 0. This proves the defects, not their fixes.
- Focused baseline suites:

  ```bash
  node --import /private/tmp/lims551-deps/node_modules/tsx/dist/loader.mjs --test tests/ohworks/transport-conditions.test.ts tests/ohworks/consumable-inventory.test.ts tests/ohworks/instrument-maintenance.test.ts tests/ohworks-shift-handoff-checklist.test.ts tests/ohworks/record-retention.test.ts tests/ohworks/corrective-action.test.ts
  ```

  Result: **203 passed, 0 failed, 0 skipped/cancelled/todo**, exit 0.

## Final implementation guardrails

Implement each job with the failing regression first, then the minimal source repair, then its named focused suite. After all six jobs, rerun the combined 203-test command above, `npm run typecheck`, and `npm run test:all`. Keep every job's diff to exactly its named source/test pair; no job needs a new file, UI edit, dependency, database operation, external service, or real patient/customer data. The runner owns commits and push; this planning worker must not commit or push.
