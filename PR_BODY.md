Draft PR title: Re-land generic read-only SENAITE adapter and restore 12 workflow tests

PR #103 was closed unmerged, leaving the OHWorks HTTP harness importing a missing module. Use the existing generic `lib/senaite-read` adapter with `SENAITE_BASE_URL` and `SENAITE_API_TOKEN` (Bearer authentication). Missing, blank, or unsafe configuration returns `{ status: 'not_configured' }` without HTTP. Request and response failures return fixed safe result codes rather than throwing into pages.

Preserve a single bounded GET to the AnalysisRequest collection, HTTPS-only credentials, no redirects/cookies/cache/retries, a ten-second timeout, query validation, and strict summary projection. No route activation or write operations are introduced. Legacy Basic-auth environment settings no longer enable this adapter; the deployment API/gateway must support a provisioned read-only Bearer token.

Migrate all 12 OHWorks workflow checks to the generic contract, including the Westgard QC hold scenario. Rename the harness to `.test.ts` so the unchanged full-suite runner discovers it. Replay recorded synthetic response fixtures; verify client/analysis fields and pagination URLs do not escape the summary boundary. Add missing/partial/default environment and token-header validation coverage. Fixture provenance explicitly records that these are synthetic snapshots, not live captures.

Validation on Node 24.14.1:
- `npm run test:senaite-read`: 7 passed, exit 0.
- `node --import tsx --test tests/ohworks/senaite-synthetic-workflow.test.ts`: 12 passed, exit 0.
- `npm run typecheck`: passed, exit 0.
- Targeted ESLint for adapter and both test files: passed, exit 0.
- `git diff --check`: passed.
- `npm run test:all`: 299 files, 4,586 tests; 4,583 passed, 3 failed, zero skipped; exit 1. All 19 SENAITE checks passed. The remaining failures are existing founder tests calling `symlinkSync`, rejected by this Windows host with EPERM (bot-founder-corpus line 458, bot-founder-diagnostics line 27, and bot-founder-loader line 141). A green full-suite result remains required from a symlink-capable runner.

Windows setup detail: the first full run had 40 founder-bundle failures because Git CRLF checkout conversion changed hash-checked fixture bytes. Temporarily restoring four knowledge/founder files to exact HEAD bytes reduced this to the three symlink permission failures. Their original checkout line endings were restored afterward; there is no founder source change in this PR. Dependencies were installed within the repository using `npm ci`; the lockfile is unchanged. Full local output remains at ignored `node_modules/senaite-test-all.log`.

Runner handoff: commit and push only `codex-lenovo/bo-lims-senaite-read-adapter`, then open exactly one draft PR against main. Do not merge. Changes are intentionally uncommitted and unpushed; no GitHub PR has been created by this worker. Re-run the full suite on the runner before claiming a green result.
