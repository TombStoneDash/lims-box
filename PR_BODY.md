Draft PR title: Re-land SENAITE read adapter with token configuration and passing workflow contracts

Build-out register: LIMS-SENAITE-READ-ADAPTER-103. Replaces closed, unmerged PR #103 on current main.

The OHWorks HTTP workflow harness imported a missing module and all twelve cases failed. Migrate that harness to the generic server-only `lib/senaite-read` adapter, preserving its sample-summary and QC assertions. Consolidate the earlier generic reader around `SENAITE_BASE_URL` / `SENAITE_API_TOKEN` and Bearer authentication. Missing or invalid configuration returns an explicit `unavailable / not_configured` result without a request. Upstream failures return safe results without leaking bodies or exception messages into pages.

Reads use one bounded GET, HTTPS, encoded filters, no redirects or caching, and a ten-second abort deadline. The parser rejects malformed or oversized pages and never substitutes demo data. No write API or page activation is introduced. Document configuration and the replacement of the older Basic-auth environment variables.

Contract coverage replays checked-in synthetic HTTP payloads and tests aliases, optional fields, empty/malformed responses, configuration, HTTP errors, safe failure text, and actual timer abortion. These are fabricated offline fixtures derived from PR #103's contract, not live lab captures. Update the repository test discovery to include `.test.mjs` so the twelve migrated workflow cases run in CI; correct their obsolete default-export import for the current loader.

Validation:
- `npm run test:all`: 4,615 passed, zero failures, skips, or cancellations. Includes all twelve migrated workflow cases.
- `npm run test:senaite-read`: 8 passed.
- `node --import tsx --test tests/ohworks/senaite-synthetic-workflow.test.mjs`: 12 passed.
- `npm run typecheck`: passed.
- Targeted ESLint for the adapter, both test files, and test runner: passed.
- `git diff --check`: passed.

Verification used Node 22.22.2 and existing local dependencies with a byte-identical package lock. No live SENAITE credentials or requests were used.

Runner handoff: commit and push the supplied changes on `codex/bo-lims-senaite-read-adapter`, then create exactly one draft PR against `main` using this title/body. Do not merge. The changes are intentionally uncommitted and unpushed; a GitHub draft containing them requires the runner's commit/push step.
