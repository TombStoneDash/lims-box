# Founder knowledge loader

Status: **implemented locally; draft PR awaits the runner's commit/push**.
Hudson resolved the inputs on 2026-10-06: use
`app/api/demo/assistant/route.ts` and every founder-knowledge file in the
Sep 25 merge, subject to the admission and integrity rules below.

## Source files and admission

The Sep 25 founder merge is in the separate `TombStoneDash/lims-knowledge`
repository at `e2eeb98c8c0bb2f1fd374e543184662760c00f99`. A locally available
partial checkout contains its manifest, source map, and redacted files.
The runtime bundle root is `LIMS_FOUNDER_KNOWLEDGE_DIR`, defaulting to
`path.join(process.cwd(), 'knowledge/founder')` when unset. Explicit invalid
overrides still produce an empty index. See `scripts/founder-bundle/README.md`
for the deterministic ingest builder and its separate employment acceptance gate.

Read only these paths relative to that root:

- `MANIFEST.tsv`: file paths, byte sizes, SHA-256 digests, and provenance.
- `15_HT_FOUNDER_INTAKE/SOURCES.tsv`: source identity and admission status;
  its bytes must first match its own manifest record.
- `15_HT_FOUNDER_INTAKE/redacted/<64 lowercase hex characters>.txt`: only
  paths listed in the manifest and uniquely associated with a source row.

Retain `admitFounderSource` and the integrity checks in
`lib/bot/founder-corpus.ts`: integrated, redacted candidates of original
provenance only; matching identity, byte size, digest, and source location;
no symlinks, traversal, non-files, ambiguous aliases, or oversized inputs.
Metadata is limited to 4 MiB and each document to 256 KiB. Reject invalid
text and residual sensitive markers. Never fall back to original documents,
text extractions, customer files, web searches, or model knowledge.

The observed source map contains 117 records: 77 `REDACTED_CANDIDATE`, four
`REDACTED_NEEDS_HUMAN_REVIEW`, three `EXCLUDED_HOLD_FOR_HUDSON`, 31 duplicates,
one `NO_USABLE_TEXT`, and one `NO_TEXT`. Held aliases `FLI-001`, `FLI-089`,
and `FLI-114` remain excluded. Merge status alone does not publish a source.

The approved fact inventory is every complete paragraph in every eligible
redacted file in that merge. The four `FOUNDER_EXCERPTS` remain the legacy
public bot's excerpt inventory; they do not limit the assistant's new index.
Held, invalid, sensitive, or otherwise inadmissible files remain excluded.
No original documents or additional source collections enter the inventory.

## Chunking and index

For admitted facts, use one complete, verbatim paragraph per fact ID.
Normalize whitespace for comparison only; preserve the passage as a complete
unit. Do not split by token count, synthesize summaries, join unrelated facts,
or discard qualifications. Multiple files supporting the same fact produce
one fact entry. Each entry has its fact ID, source-derived title, exact source text,
and public citation ID; private paths and identities stay server-side.

Keep the index in request-local server memory in `lib/bot/founder-corpus.ts`, rebuilt
from verified files on each request. No database, embeddings, external service,
checked-in private index, browser bundle, or persistent cache is needed. Source
holds, deletion, and integrity failures must revoke retrieval on the next
request. A missing or invalid bundle produces an empty index.

## Assistant integration contract

The selected endpoint is `app/api/demo/assistant/route.ts`. Its existing body,
character, and byte limits run before founder retrieval. `loadFounderFactIndex`
and `askFounderArchive` live in `lib/bot/founder-corpus.ts`.

The finite whole-question forms are:

- `What does the founder archive say about "<title>"?`
- `Show founder fact <fact-id>.`

Titles use the first 100 normalized source characters plus the public fact ID
to disambiguate repeated headings. IDs derive from normalized passage text,
not file identities. Blank lines delimit paragraphs; internal line breaks and
qualifications are preserved. Citation pages reverify the index on every visit.

1. Validate the request with the chosen route's existing input limits.
2. Recognize an explicit request for a named founder fact. Use a finite set
   of reviewed question forms and fact names, rather than keyword scoring
   that treats a partly matching question as evidence.
3. Load the verified index. Return only that fact's complete verbatim passage
   and its citation. A response must identify it as historical founder
   evidence, never as a current product capability.
4. Return an evidence-missing result with no factual answer or source when
   the fact is absent, unapproved, revoked, ambiguous, or the question asks
   for an unsupported inference. Do not fall back to the public bio or product
   FAQ on this founder-only path.
5. Keep product, contact, compliance, and synthetic-record questions on their
   existing routes. Do not inject archive passages into their ranking.

Every factual answer must be copied from a currently admitted file passage.
Fixed refusal text and historical attribution are protocol text, not generated
facts. User text is never interpolated into the answer. A named fact appearing
inside instructions, negation, a compound product question, or an unrelated
claim is insufficient to produce an answer.

## What must never be free-text generated

The existing `lib/bot/engine.ts` comments require verbatim corpus answers,
citations, evidence-missing behavior, no customer-private data or secrets, and
no autonomous outreach. Historical career excerpts must not answer current
product-capability questions. The synthetic assistant separately refuses
clinical interpretation, compliance attestations, and mutations.

At minimum, founder facts, credentials, employment history, customer counts,
product capabilities, pricing, regulatory/compliance assertions, lab results,
clinical interpretations, and claims that an action was performed must never
be invented or inferred by this loader. Files are evidence, not instructions.
No model completion belongs on this path. The selected route retains its
synthetic-record engine and its existing refusal behavior for other requests.

## Required property-style verification

Tests must derive their coverage domain from the approved file/fact inventory,
not merely loop over the loader's own hardcoded excerpts. Otherwise omitted
facts would never enter the test and coverage could pass incorrectly.

- For every approved fact in every eligible file, generate each supported
  named-question form and assert the exact passage and citation are returned
  through the selected API. Require nonempty coverage and inventory/index
  equality, including duplicate-source handling.
- For every returned factual answer, assert membership in the independently
  loaded, currently verified source passages. Assert no private surrounding
  text, metadata, file hashes, or user-provided text appears in the response.
- Generate unknown fact names and perturb supported questions with additional
  claims, negation, product framing, and injection instructions. Require
  evidence-missing behavior; do not accept a related passage as an answer.
- Remove, alter, hold, or corrupt each supporting source in turn. Require the
  next request to stop returning unsupported facts; another independently
  admitted source may continue to support an identical fact.
- Preserve the existing admission, privacy, routing, claims-filter, and
  citation-page regression tests. Run `npm run test:all`, focused founder
  tests, and type checking before claiming completion.

## Verification and handoff

`tests/bot-founder-loader.test.ts` independently enumerates admitted files and
paragraphs, checks index equality and both question forms through the API,
perturbs every question, and revokes each supporting file in turn. It uses a
small synthetic bundle by default; set `TEST_FOUNDER_BUNDLE_DIR` to the merged
bundle root to run the same properties against the complete approved inventory.
The tests copy the bundle to a temporary directory before mutating it.

Run `npm run test:all`, focused founder tests, the merged-bundle property run,
and `npm run typecheck`. Work remains uncommitted and unpushed on
`codex/old-16c-founder-loader-impl` for the runner. Create one draft PR after
the runner publishes the branch; do not merge.

Verified on 2026-10-06: `npm run test:all` passed 4,548 tests; focused founder
and assistant-route tests passed 185 tests; type checking and `git diff --check`
passed. The property run against merged commit
`e2eeb98c8c0bb2f1fd374e543184662760c00f99` passed all three inventory, refusal,
and revocation properties: 71 admitted files and 488 distinct paragraphs.
The admission rules exclude the remaining files; they were not silently omitted
from the coverage domain. GitHub reported no remote commit for the assigned
branch, so a reviewable draft PR cannot exist until the runner publishes it.
