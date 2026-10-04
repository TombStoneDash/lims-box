# Demo page truth correction

The Oct 4 recording findings remained on base revision
`20fe652f8112fab00d7d24ed03e4e647ee1196a1` for the offline badge and
recording report claim. The custody step already used demo wording, but still
claimed timestamp/IP capture and a recorded audit entry; its handler only calls
`setSigned(true)`. It now describes a page-local synthetic signature without a
saved record. The footer requires internet, and the recording report and its
overlay describe a static synthetic preview without compliance or speed promises.

`planning/LIMS_DEMO_RUNBOOK_20260804.md` is absent from this checkout. Matrix
comparison could not be performed; corrections use the supplied findings and
the actual page implementation. No replacement capability matrix was invented.

The new string regressions run in `test:demo-hardening` and are automatically
discovered by `test:all`, used by `.github/workflows/full-tests-ci.yml`.
The existing rendered navigation test now expects the revised signature text.

## Terminal receipt

```yaml
task_id: w3-lims-demo-page-truth
run_id: w3-lims-demo-page-truth-20261004-local
host_id: DESKTOP-1TV907A
host_role: lenovo
repo: lims-box
branch_or_worktree: codex-lenovo/w3-lims-demo-page-truth
owner: current worker under direct user branch assignment
objective: correct the reported demo claims and add CI regression coverage
constraints: code/tests/docs only; no commit, push, deployment, or external sends
inputs: user Oct 4 findings and checked-out page implementations
requested_model: not-exposed
requested_reasoning_effort: not-exposed
client_effective_model: not-exposed
provider_returned_model_id: not-exposed
model_evidence_source: not-exposed
route_id: not-exposed
started_at: not-exposed
ended_at: 2026-10-04T15:35:02-07:00
terminal_state: PASS
verification:
  - npm run test:demo-hardening; exit 0; 23 passed
  - npm run test:commercial-claims; exit 0; 9 passed
  - node --import tsx --test tests/demo/*.test.ts tests/demo/*.test.tsx; exit 0; 64 passed
  - npm run typecheck; exit 0
  - git diff --check; exit 0
artifacts:
  - app/demo/page.tsx
  - app/demo/record/page.tsx
  - tests/demo/page-truth.test.ts
  - tests/demo/step-progress.test.tsx
  - package.json
usage_delta: not-exposed
blocker: none for the reported copy corrections; referenced runbook unavailable
rollback: revert only this task's uncommitted patch
next_safe_action: runner review and commit
```

No canonical worker-results directory is configured inside this repository.
This local receipt respects the user instruction to keep all writes in the repo.
