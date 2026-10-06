# Ship the founder knowledge bundle with the assistant

Production currently has no founder bundle, so founder archive retrieval returns evidence-missing. This change builds and includes the reviewed ingest as 76 redacted text documents (under 0.5 MB), defaults the runtime to `knowledge/founder` when the environment is unset, and traces the bundle into the assistant, legacy bot, and citation routes. All admission and per-request integrity checks remain active.

The deterministic builder pins the 117-row ingest and the original admission decisions, applies contact redactions, hashes every emitted file, and reports all exclusions. No original blobs or unredacted texts are included.

## Incomplete acceptance / do not merge

The required question “Where did Hudson Taylor work as Senior LIMS Developer?” cannot be grounded from this ingest: all 82 extracted texts and the merged redacted inventory lack the word “Developer”. The explicit acceptance test at `scripts/founder-bundle/employment-acceptance.test.ts` fails with `grounded: false`. An approved source for the employer and role, followed by an exact reviewed question-to-fact mapping, is required. No employment fact was invented or substituted with the Administrator passages.

This work is uncommitted and unpushed as requested. GitHub returned 422 “No commit found” for `codex/old-16d-founder-bundle-ship`; the runner must commit/push before opening this one draft PR. Do not merge. Production rollout and the live employment check remain incomplete.

## Validation

- `npm run test:all`: 4,550 passed.
- Focused founder corpus, source registry, and assistant-route tests: 192 passed.
- Redaction unit tests: 2 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; emitted traces contain all 79 bundle files for all three relevant routes.
- Deterministic rebuild: byte-for-byte equal to the working-tree bundle.
- Real-bundle inventory/question/refusal/revocation/citation properties: all 4 passed, covering 76 files and 571 distinct paragraphs.
- Employment acceptance test: fails due to missing evidence, as described above.
- `git diff --check`: passed.

## Skipped aliases

No files exceeded 256 KiB. Every excluded alias is listed below and in `knowledge/founder/BUILD_REPORT.json`.

- `EXCLUDED_HOLD_FOR_HUDSON`: FLI-001, FLI-089, FLI-114.
- `REDACTED_NEEDS_HUMAN_REVIEW`: FLI-016, FLI-065, FLI-086, FLI-091.
- `NO_USABLE_TEXT`: FLI-017.
- `DUPLICATE`: FLI-018, FLI-019, FLI-042, FLI-044, FLI-059, FLI-068, FLI-092, FLI-093, FLI-094, FLI-095, FLI-096, FLI-097, FLI-098, FLI-099, FLI-100, FLI-101, FLI-102, FLI-103, FLI-104, FLI-105, FLI-106, FLI-107, FLI-108, FLI-109, FLI-110, FLI-111, FLI-112, FLI-113, FLI-115, FLI-116, FLI-117.
- `NO_TEXT`: FLI-057.
- `RESIDUAL_SENSITIVE_OR_INVALID_TEXT`: FLI-062.
