Draft PR title: Re-land LIMS first-contact sender v4; supersedes #522

Supersedes #522. Reconcile its maintenance changes with main while preserving main's terminal-state compare-and-set, existing unsubscribe timestamps, failed-only retry limits, and fail-closed handling of ambiguous sends. Missing, unsubscribed, malformed, empty, or whitespace-only source addresses cannot hold up later healthy contacts. Persistence failures and HMAC binding mismatches still fail closed.

Most sender changes from #522 are already on main. This patch retains its blank-address guard, expands bounded-batch coverage with mixed source failures, checks 1,093 source-state orderings, and verifies terminal persistence errors are surfaced. The existing production-resolver permutation coverage is preserved and extended to empty/blank addresses.

Sending remains OFF unless FIRST_CONTACT_EMAIL_ENABLED is exactly true and every existing approval/configuration gate passes. The example environment explicitly sets false. No deployment settings are changed and no email was sent.

Validation on Node 24.14.1 (no email sent; synthetic/mocked sender calls):
- npm ci: exit 0; dependency manifests and lockfiles unchanged.
- node --import tsx --test tests/first-contact*.test.ts: exit 0, 43 passed, zero skipped.
- npm run lint: exit 0, including a final run after the test fixture correction.
- npm run typecheck: exit 0, including a final run after the test fixture correction.
- npm run test:all: exit 1; all 299 files discovered, 4,608 tests, 4,605 passed, 3 failed, zero skipped. The failures are unchanged founder tests requiring symlink creation: tests/bot-founder-corpus.test.ts:458, tests/bot-founder-diagnostics.test.ts:27, tests/bot-founder-loader.test.ts:141. All fail with EPERM on this Windows host. Full-suite green remains blocked pending a symlink-capable runner.
- Supplemental four .test.mjs files (not discovered by test:all): 26 passed, 2 failed. Both failures are in unchanged tests/tooling/provenance-classifier.test.mjs: symlink EPERM at line 110 and POSIX chmod-unreadable behavior not enforced on Windows at line 135.
- git diff --check: exit 0; no unresolved conflict markers.

For validation only, four hash-checked knowledge/founder files were restored to exact HEAD bytes to avoid Git CRLF conversion changing content hashes. Their original checkout bytes were restored afterward; no founder files are part of this patch. Test temporary directories and install cache stayed inside the repository. Local logs are under ignored node_modules/.validation (test-all-final.log, first-contact.log, lint-final.log, typecheck-final.log, test-mjs.log).


Runner handoff: commit and push the assigned codex-lenovo/bo-lims-box-first-contact-sender-v4 branch and open exactly one draft PR against main using this title/body. Do not merge. Git metadata writes are sandbox-blocked because this worktree's shared git directory is outside the writable repository: reset and merge could not begin. The working-tree resolution was produced with git merge-file using merge base 80783a7f71d963d86bb6f501c5ceb82be18344d8, #522 head 770bef43134fbc68fef78dd16e6aa4055022cc29, and main ef1f4da1633e6d4e90348ea613055691f1131580. Branch HEAD remains main; no merge ancestry is claimed. The runner must establish the requested PR-branch/main ancestry if required before committing the resolved tree. No commit, push, or draft PR was created by this worker.
