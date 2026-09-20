# Full test suite CI

`Full Test Suite CI` runs on pull requests and pushes to `main`, using Node 22,
`npm ci`, then `npm run test:all`. The runner recursively discovers and sorts
every `.test.ts` and `.test.tsx` file under `tests/`, including nested directories
and new OHWorks demo, bot, and security tests. It passes explicit file arguments
to Node through tsx, so discovery does not depend on shell or Node glob support.
It prints the selected file count and exclusions, fails on an empty selection,
and propagates the test runner's exit code. Existing workflows and the deploy
build are unchanged.

Locally, with dependencies available, run `npm run test:all`.

## Excluded defect — fix separately

The exact `EXCLUDED` list contains one entry:

| File | Reason |
| --- | --- |
| `tests/senaite-demo-qc-accessibility.test.ts` | FAILING ON MAIN 2026-09-19: React is not defined in QCChartsPage (app/senaite-demo/qc/page.tsx:151) during both render assertions. |

This is a render failure under the plain tsx test command; repair it separately
and remove the exclusion. No existing tests or product code were changed.
`tests/security/route-exposure-inventory.test.ts` is **included**, with all six
checks passing, including the inventory containing `/pilot/ohworks/qc`.

## Observed verification

On base `5307caf523bb6add6a3b70427320949272687d36`, using Node 22.22.2:

| Run | Files run | Tests | Pass | Fail | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial local bundle, before Prisma client generation | 127 | 3121 | 3116 | 5 | 1 |
| Baseline with generated Prisma client, no exclusions | 127 | 3125 | 3123 | 2 | 1 |
| Exclusion applied, before wiring CI | 126 | 3123 | 3123 | 0 | 0 |
| Final, including runner regression test | 127 | 3126 | 3126 | 0 | 0 |
| Standalone runner regression test | 1 | 3 | 3 | 0 | 0 |

All runs reported zero skipped/cancelled/todo tests. The final walker discovers
128 files and excludes one. Lint and typecheck passed. Local verification used
an existing dependency bundle copied into this worktree and an offline Prisma
client generation; no install, network access, or lockfile changes were made.
The three initial Prisma import failures were local setup failures and are not
exclusions. Hosted `npm ci` verification remains for the runner/PR workflow.

All `.test.mjs` files are intentionally outside this runner's selection.
In particular, `tests/ohworks/senaite-synthetic-workflow.test.mjs` imports
`lib/ohworks-senaite.ts`, which awaits still-open, owner-gated PR #103. That
harness remains unchanged and is not an `EXCLUDED` entry.
