# Demo page truth correction

The Oct 4 findings remain present at base `20fe652f8112fab00d7d24ed03e4e647ee1196a1`.
The assigned branch was clean before editing. This run used the user's explicit
assignment to this isolated worktree; it did not claim another queue item.

`/demo` now describes its signature as page-only synthetic state and states that
the web app has no offline mode. `/demo/record` labels the report as a synthetic
preview, removes compliance and generation-time claims, and identifies its
playback screens as static examples. The reported phrase "The full transfer
chain is locked" was not present in this checkout; regression coverage prevents
it appearing in the demo page.

Source limitation: `planning/LIMS_DEMO_RUNBOOK_20260804.md` is absent from this
checkout. Verification used the user's reported capability limits, the local
implementation, and `app/evidence/page.tsx`. Exact runbook reconciliation was not
possible. No canonical worker-results directory is configured in this repository;
this receipt stays inside the assigned repository for the runner to collect.

```yaml
task_id: w3-lims-demo-page-truth
run_id: w3-lims-demo-page-truth-20261004-local
host_id: DESKTOP-1TV907A
host_role: lenovo
repo: lims-box
branch_or_worktree: codex-lenovo/w3-lims-demo-page-truth
requested_model: not-exposed
requested_reasoning_effort: not-exposed
client_effective_model: not-exposed
provider_returned_model_id: not-exposed
model_evidence_source: not-exposed
route_id: not-exposed
started_at: not-exposed
ended_at: 2026-10-04T21:56:57.4837558Z
terminal_state: PASS
verification:
  - "npm run test:commercial-claims: exit 0, 12 passed"
  - "node --import tsx --test <all tests/demo/*.test.ts and *.test.tsx>: exit 0, 61 passed"
  - "npm run typecheck: exit 0 after local Prisma client generation"
  - "eslint on both changed pages and both changed test files: exit 0"
  - "git diff --check: exit 0"
  - "CI wiring: full-test-suite-ci.yml runs test:all; its recursive runner includes both changed test files"
artifacts:
  - app/demo/page.tsx
  - app/demo/record/page.tsx
  - tests/content/commercial-claims.test.ts
  - tests/demo/step-progress.test.tsx
usage_delta: not-exposed
blocker: none for implementation and local checks; referenced runbook unavailable
rollback: Revert only the four listed file diffs and remove this receipt.
next_safe_action: Runner review and commit; no commit or push performed by this worker.
```

Verification ran with Node v24.14.1. CI specifies Node 22. Dependencies were
installed with lifecycle scripts disabled, then `prisma generate` produced the
local client without a database connection. Initial verification found the old
custody-message expectation in two navigation tests and missing generated Prisma
types; both were resolved before the successful reruns. The full suite and a
browser session were not run for these bounded copy changes.
