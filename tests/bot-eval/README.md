# Deterministic bot evaluation

Run `npm run test:bot-eval`. The existing `npm run test:all` recursively discovers
these `.test.ts` files; `.github/workflows/full-tests-ci.yml` runs that script on
pull requests. No network, model, credentials, live data, or paid path is needed.

The fixed inventory contains exactly 100 distinct user scenarios:

| Scenarios | Count | Oracle |
| --- | ---: | --- |
| Current topic titles | 33 | Explicit IDs in `scenarios.ts`, text/citations in `lib/bot/corpus.ts` |
| Natural-language alternatives | 33 | Same reviewed topic IDs |
| Injection and prohibited requests | 20 | Output contains only cited corpus text or explicit abstention; canonical filter finds no claim |
| Unknown, unsupported founder topics, malformed inputs | 14 | Exact evidence-missing response, no citations |

Every substantive response must match the full text of a cited corpus entry,
optionally prefixed by the cited locked compliance positioning. All citation
title/path pairs must exist in the corpus and resolve to local page files. This
checks answer-to-source matching; it does not independently validate marketing
claims or confer source-rights approval. Existing published-copy tests check the
page copy and document the unpublished locked-positioning exception.

One inventory test checks the count, unique IDs/prompts, and complete current
topic coverage. Another 28 tests exercise every canonical forbidden literal,
uppercase/punctuation/whitespace/NFKC variants, poisoned answers through actual
`askBot` routes (restored after each test), clean corpus negatives, and existing
source-admission fixtures. Registry fixtures are synthetic policy evidence, not
new factual sources. No scenario adds laboratory or instrument facts.

The strict canonical filter matches the Part 11 FAQ's disclaimer. Both Part 11
scenarios require the safe refusal with `grounded: false` and empty sources.
There is no filter exemption or silent skip.

This is a bounded evaluation of the current deterministic bot, not certification
of the full Expert v2 definition of done or its larger section 13.1 matrix.
Adversarial cases test output containment, not correct intent classification.
Broader gaps and observed misroutes are recorded in `docs/bot/bot-eval-pr-body.md`.
