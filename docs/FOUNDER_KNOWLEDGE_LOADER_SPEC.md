# Founder knowledge loader

Status: **draft; implementation blocked on source scope and assistant contract**.
Inspected on 2026-10-06 against lims-box `efc07ea`, on the assigned
`codex/old-16-lims-founder-knowledge-loader` branch. This document does not
claim that the existing four-excerpt loader covers the founder archive.

## Source files and admission

The Sep 25 founder merge is in the separate `TombStoneDash/lims-knowledge`
repository at `e2eeb98c8c0bb2f1fd374e543184662760c00f99`. A locally available
partial checkout contains its manifest, source map, and redacted files.
The runtime bundle root is `LIMS_FOUNDER_KNOWLEDGE_DIR`.

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

Currently only the four identifier-free passages in `FOUNDER_EXCERPTS`
are admitted to public output: configuration, Omega 11 training, instrument
imports, and data entry/recovery. The surrounding redacted documents still
contain personal material. An exhaustive coverage claim requires an inventory
of all intended founder facts and their publication scope; those four passages
are not that inventory. Do not replace this boundary with unrestricted public
indexing of every redacted document.

## Chunking and index

For publicly admitted facts, use one reviewed, verbatim passage per fact ID.
Normalize whitespace for comparison only; preserve the passage as a complete
unit. Do not split by token count, synthesize summaries, join unrelated facts,
or discard qualifications. Multiple files supporting the same fact produce
one fact entry. Each entry has its fact ID, reviewed title, exact source text,
and public citation ID; private paths and identities stay server-side.

Keep the index in request-local server memory in the founder loader, rebuilt
from verified files on each request. No database, embeddings, external service,
checked-in private index, browser bundle, or persistent cache is needed. Source
holds, deletion, and integrity failures must revoke retrieval on the next
request. A missing or invalid bundle produces an empty index.

## Assistant integration contract to resolve

The requested `src/app/api/assistant/route.ts` and `/api/assistant` do not
exist in this checkout or its available git history. The existing endpoints
are `app/api/bot/route.ts` (published documentation) and
`app/api/demo/assistant/route.ts` (synthetic lab records). They are different
contracts. The requested route comments cannot be quoted or reconstructed
from this source tree. Identify the intended route and supply those comments
before wiring archive answers or adding a replacement endpoint.

Proposed founder retrieval behavior, once that contract is resolved:

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
No model completion belongs on this path. The missing route's additional
constraints remain an explicit unresolved input, not an assumed equivalence
with either existing endpoint.

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

## Completion boundary

Step 2 remains unimplemented. The needed inputs are the intended assistant
route/comments and the complete founder-fact scope, including which additional
passages may be publicly answered or require an authenticated interface.
No new route or archive answer behavior is introduced by this draft. Work
remains on the assigned branch, uncommitted and unpushed for the runner; any
resulting PR must remain a draft and must not be merged.

## Verification of this draft

`npm run test:all` passed on 2026-10-06: 291 test files, 4,544 tests,
zero failures or skips, after offline dependency recovery and Prisma client
generation using a writable temporary cache. `git diff --check` passed.
Running the existing loader against the available merged bundle returned
exactly `founder-configuration`, `founder-training`,
`founder-instrument-imports`, and `founder-data-recovery`. These results verify
the existing baseline, not the unimplemented exhaustive retrieval contract.
