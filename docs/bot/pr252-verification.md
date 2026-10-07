# LIMS-BOT-8-TOPICS-252-FIX-TESTS

Draft PR title: `test(bot): lock in PR #252's eight published topics on current main`

PR #252's eight topics are already present on the assigned base (`7cd31aa`),
through `378c862` / PR #509. That change also fixed the suggestion-ranking
collision where `script` matched inside `subscription`. Keep those changes;
reapplying the original patch would duplicate corpus IDs.

The later repair commit `e8e74fc` identifies Windows file URL and CRLF test
failures. Current main already contains equivalent fixes: calendar subprocess
imports use escaped file URLs, the accessibility assertion normalizes CRLF, and
the liaison fixture converts `\r?\n` without doubling carriage returns. No test
exclusions or weaker routing assertions are needed.

This PR adds the eight-topic tests and substring-suggestion regression to
`npm run test:bot`, and the topic tests to `npm run test:bot-corpus`. Each topic
now checks its complete answer against its published page source (normalizing
JSX whitespace and entities), passes the commercial-claims output filter, and
retains its answer and citation when an explicit LIMS BOX product question is
wrapped in founder context. This is checkout source verification, not a claim
that a deployment was inspected.

| Topic | Published source |
| --- | --- |
| Field Scout | `/field-scout` |
| Open-source license | `/partners` |
| Illustrative case study | `/case-study` |
| Implementation fee | `/pricing` |
| Plan changes | `/pricing` |
| Clinical labs | `/clinical` |
| Environmental labs | `/environmental` |
| Synthetic demo | `/clinical` |

The routing implementation, corpus, `docs/bot/founder-question-routing.md`, and
`tests/bot-founder-corpus.test.ts` are unchanged. Unsupported founder questions
continue to fail closed, and archive answers remain disabled for `/api/bot`.

## Verification

- `npm run test:bot`: 108 passed.
- `npm run test:bot-corpus`: 239 passed, including the founder contract.
- `npm run typecheck`: passed.
- `npm exec eslint -- tests/bot/corpus-batch2-topics.test.ts`: passed.
- `npm run test:all`: 4,589 passed across 298 test files; zero failures,
  skips, cancellations, or exclusions.
- `git diff --check`: passed.

Dependencies were installed from the local npm cache. Prisma generation required
the cached native engines because the sandbox cannot update the user cache;
the query engine was copied into the generated, ignored client directory.
Initial full runs failed on that incomplete local setup and were rerun after
repair. Another run hit transient `ENOSPC` errors creating fixtures; the suite
was rerun once disk space was available. No dependency or lockfile changes were
required.

Prepared on `codex/bo-lims-bot-8-topics`. The runner owns the commit, push, and
draft PR publication; no commit, push, merge, or deployment was performed here.
