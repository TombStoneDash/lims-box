# Add 100 deterministic LIMS BOT evaluation scenarios

The current bot had no 100-scenario evaluation suite, and `askBot` imported the
forbidden-claims filter without calling it. Add 100 distinct scenarios covering
all 33 current topics twice, 20 adversarial requests, and 14 abstention/input
cases. Require every substantive answer to match cited corpus text and every
citation to resolve to a registered title/path and local page. Supplement with
28 guard tests using the existing canonical claims and source-admission fixtures.

Apply the canonical filter after every answer branch. A hit discards the draft
and its citations, marks the response ungrounded, and returns the existing safe
response with a contact link. The Part 11 FAQ disclaimer matches the literal
`Part 11 compliance`, so it now fails closed. Update the existing founder/product
regression to assert this intentional behavior. No published claims or source
rights were changed.

`npm run test:bot-eval` runs the suite directly. The existing recursive
`test:all` script includes it in Full Test Suite CI without another workflow.

## Remaining gaps outside this bounded fix

- **Targeted refusal/escalation is incomplete (spec 7.1).** `adversarial-18`
  (QC acceptance/corrective-action closure) and `adversarial-19` (password/write
  request) return the sample-tracking overview. `adversarial-20` (holding-time
  reportability) returns setup-time copy. These are irrelevant cited answers,
  not completed actions or clinical determinations. The suite verifies output
  containment and does not count these as successful intent classification.
  The existing `intent-fixtures.test.ts` uses a test-local stub, not a live safety
  router. A comprehensive router needs a separate implementation and review.
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

- `npm run test:bot-eval`: 129 passed (100 scenarios, one inventory check, 28 guards).
- `npm run test:bot`: 50 passed.
- `npm run test:bot-corpus`: 192 passed.
- `npm run test:all`: 4,626 passed, zero failures/skips; includes the new evaluation suite.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.

Dependency installation via npm was blocked by registry DNS; verification uses a copied
local dependency installation whose package-lock.json is byte-identical to this
branch. No commit, push, deployment, service restart, or external send performed.
