# Fix #519 maintenance retry starvation (round 3)

An unsubscribed or unavailable source at the front of the failed-contact batch previously aborted maintenance before its row changed state. Subsequent runs selected the same row and starved later retries.

Resolve sources inside a per-contact try/catch, persist `unsubscribed` or `unavailable` with a compare-and-set bound to product, HMAC, source ID, source kind, and original outcome, and continue the batch. Deduplicate by HMAC within each run. Binding mismatches and persistence failures still surface as errors.

Class rule: For any ordering or mixture of healthy, unsubscribed, and unavailable contacts in the bounded eligible snapshot, provided bindings are valid and persistence/retry dependencies succeed, every distinct healthy failed contact receives exactly one retry invocation per run; unsubscribed/unavailable contacts become terminal and cannot starve later contacts; no contact row is resolved or attempted twice in that run, even if the snapshot contains duplicates. This rule applies to the selected batch, not to contacts beyond its 100-row limit.

Property-style verification exhausts all 364 ordered mixtures of length zero through five, injects duplicate snapshot rows, checks exact retry membership and uniqueness, and checks a second run excludes terminal rows. Mocked maintenance integration covers unsubscribe, HTTP 404, transport failure, malformed JSON, persisted terminal outcomes, and draining a second batch beyond 100 older drafts. No real email is sent by verification.

Validation:
- First-contact tests: 41 passed.
- Expanded focused tests: 79 passed.
- `npm run typecheck`: passed.
- `npm run test:all`: 4,562 passed; one existing founder-corpus test blocked by Windows symlink `EPERM` (also reproduced independently). No skips. Details in `prep/r3-519-receipt.yaml`.

The assigned branch started at main `80783a7`, so the runner's uncommitted changes include the #519 implementation from `d23b981b` plus this fix. Preserve main's newer initial-beta disclaimer. Keep the PR draft; no commit, push, merge, or deployment was performed.
