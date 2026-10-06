An unsubscribed or unavailable oldest Resend contact previously aborted maintenance and remained eligible, starving later retries. Source resolution now has a per-contact catch that persists a terminal outcome (unsubscribed or unavailable) before continuing. Terminal updates compare product, identity, source, and the selected outcome; unsubscribed contacts also receive unsubscribed_at. Provider error text is never persisted. Each identity is processed at most once in a snapshot.

Class rule: For any ordering or mixture of healthy, unsubscribed, and unavailable contacts in a selected bounded retry snapshot, each distinct healthy eligible contact receives exactly one retry invocation per run, unavailable/unsubscribed contacts receive no retry and are persisted terminal, and no identity is attempted twice, including duplicate snapshot entries. This assumes terminal persistence and the existing healthy-contact retry dependencies succeed. Database-write errors and HMAC binding mismatches still fail closed. The existing 100-row per-outcome batch bound remains in force.

Coverage exhausts all 1,093 sequences of length zero through six across the three contact states, with duplicated rows and a subsequent run. Mocked production-maintenance coverage also exercises missing contacts, malformed contact data/JSON, transport errors, terminal SQL guards, and draining 101 candidates across bounded runs despite 100 older drafts.

Validation:
- Expanded focused suite: 77 passed, 0 failed.
- npm run typecheck: exit 0.
- npm run test:all: 4,562 passed, 1 failed, 0 skipped across 295 files. The sole failure is tests/bot-founder-corpus.test.ts:459: Windows EPERM creating a file symlink. An isolated rerun reproduces the same environment limitation. Full-suite green remains blocked pending a symlink-capable runner.
- git diff --check: exit 0.

The assigned branch began at 80783a7f rather than d23b981b. The d23b981b patch was applied locally on codex-lenovo/r3-519-lims-sender, preserving newer base changes, before this repair. Keep this PR draft. No commit, push, merge, deployment, or live email was performed. This file is the proposed PR body for the runner; remote PR metadata has not been changed.
