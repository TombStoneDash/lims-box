# Add 100 deterministic LIMS BOT evaluation scenarios

The current bot had no 100-scenario evaluation suite, and `askBot` imported the
forbidden-claims filter without calling it. Add 100 distinct scenarios covering
all 33 current topics twice, 20 adversarial requests, and 14 abstention/input
cases. Every case declares an expected behavior: refuse, product answer, founder
answer, or not-yet. Require unsafe requests to return a targeted refusal and
contact redirect; irrelevant grounded marketing copy fails the evaluation.
Require every substantive answer to match cited corpus text and every
citation to resolve to a registered title/path and local page. Supplement with
28 guard tests using the existing canonical claims and source-admission fixtures.

Apply the canonical filter after every answer branch. A hit discards the draft
and its citations, marks the response ungrounded, and returns the existing safe
response with a contact link. The Part 11 FAQ disclaimer matches the literal
`Part 11 compliance`, so it now fails closed. Update the existing founder/product
regression to assert this intentional behavior. No published claims or source
rights were changed.

A safety check runs before founder routing and product retrieval. Action and
completion requests, credentials, patient decisions, and reportability requests
receive fixed refusals with the responsible human role. Supplementary live tests
cover all nine existing hard-refusal intent fixtures, paraphrases, mixed founder
requests, and unsafe instructions beyond the retrieval length limit.

`npm run test:bot-eval` runs the suite directly. The existing recursive
`test:all` script includes it in Full Test Suite CI without another workflow.

## Remaining gaps outside this bounded fix

- **Part 11 false refusal:** the canonical lexical rule also catches negated
  compliance language. We preserve the strict rule. Restoring a helpful answer
  requires reviewed published copy or a separately reviewed matching policy.
- **Source-rights integration/publication:** the current public corpus cites site
  paths; admission and founder evidence are separate contracts. This change does
  not prove live retrieval enforces rights, freshness, versions, or per-source
  summary limits. Existing tests identify the locked compliance positioning as
  unpublished verbatim. Do not treat a matching citation as independent factual
  verification or expand instrument/manual coverage claims.
- **Filter-specific telemetry:** blocked output still records the existing
  `evidence_missing` outcome, not the spec's `forbidden_claim_blocked` category.
- **Full v2 acceptance remains separate:** model adapter fault injection,
  tenant/source-poisoning retrieval, principal isolation, version conflicts,
  human usefulness review, and the broader section 13.1 domain matrix are not
  established by this deterministic suite. No model or tenant path was added.

## Validation

- `npm run test:bot-eval`: 148 passed (100 scenarios, one inventory check, 28 guards, 19 safety regressions).
- `npm run test:all`: 4,645 passed, zero failures/skips across 291 files.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
The no-critical-failures claim is scoped to these explicit deterministic scenarios;
this suite does not establish the broader v2 acceptance items listed above.
