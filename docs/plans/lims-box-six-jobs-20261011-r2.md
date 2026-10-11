# LIMS BOX: six verified jobs, round 2

Task: `plan-hud-lims-box-20261011-r2`. Base: `351676fdab0d1284f31f9a6603ae3c1342292798`. Assigned worktree branch: `codex/plan-hud-lims-box-20261011-r2`. Planning only; product and test files remain unchanged. No commit, push, outbound message, deployment, or database operation was performed.

## Intake and duplicate check

Read the OHWorks and voice READMEs, `docs/SYSTEM_MAP.md`, `docs/FOUNDER_KNOWLEDGE_LOADER_SPEC.md`, OHWorks requirements, test-suite documentation, relevant source and tests. This checkout has no root README, ROADMAP, or TODO document. Case-insensitive TODO/FIXME searches of app, components, lib, voice, and senaite found no markers. The docs' discovery-only integration ideas are not treated as promised features.

Reviewed open GitHub issues oldest first:

- [#72](https://github.com/TombStoneDash/lims-box/issues/72): cross-repository reconciliation, not a specific two-file product repair.
- [#94](https://github.com/TombStoneDash/lims-box/issues/94): fulfillment configuration and live inbox proof. Recent [#559](https://github.com/TombStoneDash/lims-box/pull/559) adds PDF testing; it does not prove the whole issue resolved. Do not duplicate that test work or send mail.
- [#95](https://github.com/TombStoneDash/lims-box/issues/95): provider OAuth audit, not a verified one-source-file defect.

Live GitHub review found 9 open PRs and 46 PRs merged on/after 2026-10-09. The final merged search requested 100 results and returned 46. Fetched changed-file patches for all 55 PRs, reviewed selected-path overlaps, and read the six jobs in open planning PR [#604](https://github.com/TombStoneDash/lims-box/pull/604); none is repeated here. The companion `lims-box-six-jobs-20261011-r2-github.json` records PR titles, state, head/base SHAs, paths, and relevant overlap patches.

No selected source or test file overlaps an open implementation PR. Two recent merges touch selected source files, but neither covers the proposed behavior: [#598](https://github.com/TombStoneDash/lims-box/pull/598) changes only mark-complete confirmation, while jobs 1–2 concern result recording and label printing; [#600](https://github.com/TombStoneDash/lims-box/pull/600) changes pending-list pagination, while job 3 concerns returned sample identity. Their exact patches are retained in the snapshot. The three admin pages and their selected tests have no overlap with the reviewed PR file sets.

## Six jobs

Each job has exactly one existing source file and one existing test file as its entire implementation write set. File:line evidence refers to the base above. All examples are fabricated. No live lab incident or browser session is claimed.

### 1. Stop announcing rejected result writes as recorded

- **Source:** `voice/commands.py:170` (especially lines 178–179).
- **Test:** `tests/voice/test_record_result_target_selection.py`.
- **Verified defect:** with current sample `SYNTH-A`, a client response of `{"success": false, "error": "synthetic rejection"}` to recording `7` for `pH` produces `Result 7 recorded for pH on sample SYNTH-A.` The handler discards the returned body.
- **User outcome:** the technician hears an unconfirmed/rejected-write message instead of assuming the result was saved.
- **Bounded repair:** validate the command's response before choosing success feedback; reject explicit failure/error and malformed or unconfirmed responses. Preserve the active sample and make only one write attempt. Keep successful-response handling tied to an explicit supported confirmation shape; do not claim physical or clinical outcomes.
- **Acceptance:** a mocked executor test covers explicit rejection, contradictory success-plus-error, missing/malformed confirmation, successful confirmation, and transport failure. Rejection never contains the affirmative recorded sentence. Existing client target-selection checks still pass. Add these executor cases to the named test file; no client-module edit is required.

### 2. Stop announcing rejected sticker requests as accepted

- **Source:** `voice/commands.py:230` (especially lines 241–247).
- **Test:** `tests/voice/test_print_label_feedback.py`.
- **Verified defect:** for an existing synthetic sample with UID and API metadata, a sticker response of `{"success": false, "error": "synthetic printer rejection"}` produces `Label print request accepted for sample SYNTH-A.` The body is ignored.
- **User outcome:** a technician knows when a label request was not accepted and does not proceed believing a label is coming.
- **Bounded repair:** distinguish explicit acceptance from rejected/unconfirmed payloads, preserving exception handling and the distinction between request acceptance and physical printing. Update the existing fake client to return an explicit confirmation in its happy-path case; its current empty-body fixture is not confirmation evidence.
- **Acceptance:** failure/error, contradictory confirmation, and malformed/empty responses cannot produce accepted feedback; a supported explicit acceptance can. Missing sample/metadata still makes no POST; each attempted request happens once; session context is unchanged. No printer or network is needed for the tests.

### 3. Reject a sample lookup that explicitly returns a different sample ID

- **Source:** `senaite/client.py:97` (especially lines 105–109).
- **Test:** `tests/voice/test_sample_lookup_selection.py`.
- **Verified defect:** when the lookup for `SYNTH-A` returns the sole item `{"uid":"uid-b","getId":"SYNTH-B"}`, `transition_sample('SYNTH-A', 'submit')` posts to `AnalysisRequest/uid-b/transition/submit`. Only singleton count and UID validity are checked. This reproduction mocked both search and POST; no write reached a server.
- **User outcome:** a mismatched upstream response cannot silently redirect the technician's command to another explicitly identified sample.
- **Bounded repair:** validate returned identity when the response explicitly supplies it, and raise a clear error if it contradicts the requested ID. Preserve the established UID-only response contract rather than inventing a new mandatory provider field. Do not silently normalize a different sample into a match.
- **Acceptance:** explicit mismatching `getId` (and the supported `id` fallback, if supplied) prevents result and transition POSTs; exact matching IDs still work; absent optional identity retains existing behavior; zero/multiple/malformed target checks still pass.

### 4. Remove the competency review submission dead end in read-only admin

- **Source:** `app/admin/competencies/[id]/page.tsx:77` (form at line 81, submit at line 166).
- **Test:** `tests/admin-read-only-person-flow.test.ts`.
- **Verified defect:** the page always offers the editable Log review event form. For its authenticated URL, the real access evaluator permits GET but returns `read_only`, HTTP 405 for POST. Filling the form cannot save a review under the shipped policy.
- **User outcome:** the user learns that review history is read-only before spending time completing the form.
- **Bounded repair:** use the existing admin mutation capability to withhold the form and show a concise read-only explanation with a link to the synthetic operator sandbox. Keep the existing review history and GET export available outside any mutation-only section.
- **Acceptance:** disabled capability exposes no enabled review submission; history, latest-review information, back navigation, and export remain available; the policy is unchanged. Extend the named existing read-only admin test with this page's contract.

### 5. Remove the document-version submission dead end in read-only admin

- **Source:** `app/admin/documents/[id]/page.tsx:61` (form at line 68, submit at line 135).
- **Test:** `tests/admin-read-only-person-flow.test.ts`.
- **Verified defect:** the empty state tells the user to add a version below, and the page offers Save version. The real access evaluator returns HTTP 405 for an authenticated POST to this URL, so the advertised action cannot work.
- **User outcome:** document viewers see truthful read-only guidance instead of filling an unusable version/approval form.
- **Bounded repair:** use the existing capability to withhold the mutation form and correct the empty-state invitation. Preserve current-document links, version history, and navigation; offer the synthetic sandbox for rehearsal.
- **Acceptance:** no enabled version POST form under the disabled capability, no instruction to add a version below, and existing current-version/history output stays readable. Extend the named test with this page's contract.

### 6. Remove personnel detail actions that promise unavailable mutations

- **Source:** `app/admin/people/[id]/page.tsx:52` (edit link), `:232` (revoke form), `:253` (grant section).
- **Test:** `tests/admin/person-detail-server-boundary.test.ts`.
- **Verified defect:** an active authorization renders Revoke; available procedures render Grant authorization. The page also links to edit/log flows. Authenticated POST to the person URL returns HTTP 405. The forms are not guarded by the existing disabled mutation capability.
- **User outcome:** a reviewer can inspect personnel and authorization records without being offered controls that fail to save.
- **Bounded repair:** apply the existing capability to mutation forms and edit/log entry links on this page; show read-only guidance and a sandbox link. Keep record detail, authorization history, GET exports, and navigation. Update the current test that requires an unconditional revoke form so it verifies the read-only rendering contract and still disallows client handlers in this server component.
- **Acceptance:** disabled capability exposes no enabled grant/revoke forms or misleading edit/log entry points; active/revoked authorization information and export links remain; no server action or access-policy changes are needed.

## Shared policy evidence and verification

For jobs 4–6, `lib/admin-capabilities.ts:3` returns false; `lib/demo-access.ts:92` rejects non-safe methods; `middleware.ts` applies that decision to all admin descendants. This is an existing product boundary, not a request to enable writes. The three pages implement separate user flows and each can be corrected entirely within its named source file.

Executed on Node v22.22.2. The fresh worktree has no local dependency installation; Node used an existing readable tsx loader at `/private/tmp/actorlab-plan-r2-probes/node_modules/tsx/dist/loader.mjs`. No package or lockfile was changed.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/voice -p 'test_*selection.py'
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/voice -p 'test_print_label_feedback.py'
node --import /private/tmp/actorlab-plan-r2-probes/node_modules/tsx/dist/loader.mjs --test tests/admin-read-only-person-flow.test.ts tests/admin/person-detail-server-boundary.test.ts tests/security/demo-access.test.ts
```

Results: **17 Python selection tests + 5 print-feedback tests + 13 Node tests passed; zero failures**, each command exit 0. The individual result-selection and sample-selection files were also run directly: 4 and 6 passed. These are existing baseline tests; they do not establish that the six defects are fixed.

Two in-memory probes asserted the three exact voice outcomes above and checked each admin page's unguarded form together with the real evaluator's authenticated GET/POST decisions. **All six reproductions passed**, both commands exit 0. Reproducible probe code is in `lims-box-six-jobs-20261011-r2-proof.md`. Admin evidence is source-plus-policy verification, not a launched browser or database-backed rendering. No full-suite, build, deployment, microphone, or printer validation is claimed for this documentation-only plan.

## Ownership and handoff

Host identity reconciled as `MAIN-DAISY.local`, managed ID `mac-mini-local`, role `main-daisy`. The canonical running queue contains this exact slug and repository, with claim time `2026-10-11T04:05:20Z`, runner PID 14761, non-secret route `acct-25f765e1`. The user explicitly assigned this worktree; the queue's generic repository directory is not authority to edit a different checkout. Process inspection was sandbox-denied, so live PID ownership is not independently asserted.

Read canonical Hermes roots/router pointers, the running task, repository lock/claimed-directory listings, the 04:08:28Z LIMS feeder snapshot, upstream plan #604, and Linear search results for lims-box. The feeder reported no active repository tasks and no repository lock; the running Codex queue provided the actual planner claim. Linear returned portfolio/domain/auth/older personnel items, not a competing claim for these six repairs. No new worker claim or implementation dispatch was made.

Implementation owner: unassigned; acquire a fresh lane claim and recheck PR coverage before starting. Serialize jobs 1–2 because they share source; serialize jobs 4–5 because they share a test. All other jobs remain bounded to their named two-file write sets. Suggested timeout: 30 minutes per job, retry cap 1; model/effort/budget not exposed. Each job is done when its counterexample is covered with expected behavior, its named test passes, its diff stays within the two files, and its implementation receipt is recorded.

The canonical receipt destination is `/Users/ops/Hermes/inbox/dispatch/30_WORKER_RESULTS`, outside this session's writable roots. A repository-local receipt is staged under `docs/worker-results/` for the authorized runner to collect. No permission escalation or canonical queue mutation was attempted. Rollback of this plan is removal of its documentation artifacts; later product repairs use ordinary controlled reverts. Commit and push belong to the runner.
