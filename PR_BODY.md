Re-land #317: cover email-validation dependencies in Attribution CI

Supersedes #317 (`ohworks-ci-email-validation-trigger-r16`). Its final commit, `07ea045107e3d79690fb72d5a8ce41e7579ef517`, adds `lib/emailValidation.ts` to the Attribution CI pull-request and main-push path filters. This update also retains that branch's preceding dependency additions for `lib/earlyAccessApplication.ts` and `lib/earlyAccessHandler.ts`, which connect the early-access route to email validation.

The dedicated trigger changes are absent from current main (`ef1f4da1633e6d4e90348ea613055691f1131580`), so this is not a docs-only re-land. Main already has broader all-PR test coverage through `3c2b09743282a2d539b38feb62f3bd55b6fc656b`; that coverage does not add these paths to the separate Attribution CI workflow, which also builds the application.

Preserve the current self-hosted Daisy runner, concurrency control, tests, typecheck, and build. The stale branch includes an older customer-tenant/SENAITE rewrite; importing that historical implementation would replace the current OHWorks demo and generic read-only SENAITE adapter. This bounded change carries forward the named CI task's intent only.

Full-suite result: `npm run test:all` discovered 299 files and ran 4,605 tests. With the four hash-checked founder fixtures temporarily restored to exact committed bytes, 4,602 passed and 3 failed (exit 1, zero skipped). All three failures are Windows `EPERM` from `symlinkSync` in `bot-founder-corpus`, `bot-founder-diagnostics`, and `bot-founder-loader`. The initial CRLF checkout run had 40 failures; the byte-correct rerun removed 37. Original fixture bytes were restored and verified afterward, with no founder changes in the final diff. A symlink-capable runner must supply the green full-suite result. Local logs are retained under ignored `node_modules/reland-317-*.log`.

Local verification (Node 24.14.1):
- `npm ci --cache .npm-cache --no-audit --no-fund`: exit 0; Prisma generated; lockfile unchanged.
- YAML parse and assertions: exit 0; both events include all three dependencies; main-push branch, Daisy runner, and attribution/typecheck/build steps preserved.
- `npm run test:attribution`: 11 passed, exit 0.
- `npm run test:email-validation`: 14 passed, exit 0.
- `npm run lint`: exit 0.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; 86 static pages generated. Lint and typecheck were run independently because the existing Next configuration skips them during build.

Runner handoff:
- Fetched `origin/main` and `pull/317/head` into `origin/pr-317`, and re-read #317's description and 14-commit history. No remote task branch or replacement PR existed at the time of checking.
- `git merge --no-commit --no-ff origin/pr-317` was attempted but failed before starting: Git could not create the worktree's `ORIG_HEAD.lock` in its external common Git directory (Permission denied). This sandbox permits repository file edits but not that Git metadata write. The six-line workflow patch is prepared; no merge state or merge commit was created.
- In the runner, preserve these prepared artifacts, perform the normal merge on `codex-lenovo/reland-lims-box-317`, and resolve the historical OHWorks changes to current main while retaining this workflow patch. Include a passing full-suite result before marking the re-land complete.
- The runner owns committing and pushing. After that, check for an existing PR on this head and create exactly ONE draft PR against main using this body if none exists. Do not merge, deploy, close, comment on, or otherwise modify #317.
- No commit, push, draft PR, deployment, or email was performed by this worker. Draft creation is pending the runner's commit/push; GitHub cannot open a PR from uncommitted local files.
