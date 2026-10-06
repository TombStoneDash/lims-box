The first-contact sender uses separate bounded draft and retry queries so older drafts cannot consume the retry batch. Round-three review found another starvation path: an unsubscribed or unavailable Resend contact aborted maintenance and remained eligible.

Source resolution now catches failures per contact, persists a terminal `unsubscribed` or `unavailable` outcome, and continues through the selected batch. Terminal updates match the snapshot source and outcome, retain opt-out timestamps, and store fixed error codes without provider text. A per-run HMAC set prevents duplicate snapshot entries from being attempted twice.

Class rule: For any mix and ordering of healthy, unsubscribed, and unavailable contacts in the selected retry-eligible snapshot, every distinct healthy contact gets exactly one retry attempt per run, no contact row is attempted twice, and every unsubscribed/unavailable contact is made terminal so it cannot consume a future retry batch. Existing send gates, HMAC binding checks, and atomic retry reservations still apply; storage failures remain visible.

Property-style verification exhausts all 364 sequences of length 0–5 across healthy/unsubscribed/unavailable states, including duplicate snapshot entries and repeated runs. Production-path tests exhaust 216 three-contact combinations across healthy, unsubscribed, HTTP 404, malformed payload, transport failure, and invalid JSON responses, checking terminal persistence and next-run exclusion. The previous two-run draft-backlog regression remains covered.

Validation on the round-three working tree:
- Expanded focused tests: 87 passed, 0 failed.
- Full repository suite: 4,562 passed, 0 failed.
- TypeScript typecheck and targeted ESLint checks: passed.
- Diff whitespace check against `d23b981b`: passed.

Changes are prepared on assigned branch `codex/r3-519-lims-sender` for the runner to commit and push; this PR remains a draft. The supplied worktree's Git HEAD was `80783a7`; its working files were populated from `d23b981b` before applying the fix because the sandbox denies shared Git metadata writes. The fix differs from `d23b981b` in only the maintenance module, maintenance script, and their two test files. No commit, push, or merge was performed.

Runner handoff: apply this body to draft PR #519. The GitHub metadata update was blocked because the connector requires approval and this session has approval policy `never`.
