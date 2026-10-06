# Founder knowledge loader

Status: **round-four scope cut implemented locally; runner commits/publishes**.

## Source files and admission

The bundle is built ONLY from exact source documents committed in
`scripts/founder-bundle/ALLOWLIST.txt`. The entire `15_HT_FOUNDER_INTAKE`
folder and all unlisted documents are excluded. Content filters do not grant
admission. The evidence library's FOUNDER_STORY_SAFE/PUBLIC tags guide whole
professional-document review; a safe claim does not approve a mixed document.
When uncertain, exclude the document.

The builder reads only those listed documents, checks pinned source bytes, and
applies the existing identifier/contact and proper-noun redaction as a second
layer. It then checks the reviewed output digest. Changed sources or outputs
fail closed. No partial-document salvage or intake fallback exists. See
`scripts/founder-bundle/README.md` for the selected sources and reproducible build.

The runtime root defaults to `knowledge/founder`; explicit invalid overrides
return no evidence. Read only `MANIFEST.tsv`, `approved/SOURCES.tsv`, and
`approved/redacted/<64 lowercase hex characters>.txt`. Runtime admission checks
source identity AND the compiled reviewed output hash against `admission.json`.
A valid replacement manifest cannot authorize altered or unlisted content.

Retain byte-size, digest, status, provenance, unique-alias, UTF-8 and path checks.
Reject symlinks, traversal, non-files and ambiguous metadata. Metadata is limited
to 4 MiB, documents to 256 KiB, and the built bundle to less than 20 MiB. Never
fall back to originals, extractions, customer data, web search or model knowledge.

The inventory is every complete paragraph in the two admitted professional
company documents: 79 occurrences / 72 distinct paragraphs. Earlier intake
excerpts and the Administrator passage are no longer admitted. Citation routes
for removed evidence return 404. The historical attribution and exact-question
retrieval contract remain unchanged.

## Privacy verification

Independently sweep every shipped paragraph for medication, surgery, diagnosis,
appointment, leave, therapy, prescription, hospital, doctor, symptom, recovery,
patient, DOB and MRN, plus contact/identifier patterns and names outside the
public vocabulary. No third-party person name is allowed. This assertion is
verification of the reviewed selection, not a content-based admission policy.
All reported medical fact IDs and prior AMCAS/patient queries must return
`EVIDENCE_MISSING_ANSWER`, `grounded: false`, and no sources.

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
perturbs every question, and revokes each supporting file in turn. It copies the
real shipped bundle by default; `TEST_FOUNDER_BUNDLE_DIR` selects another copy.
Rehashed alterations, unlisted documents and intake relocation are also rejected.

Run the full suite, focused founder tests, redaction/allow-list properties,
deterministic rebuild and TypeScript checks. Keep draft PR #526 open and unmerged.
No commit or push is authorized for this worker; the runner publishes the assigned
`codex/r4-526-founder-bundle-allowlist` branch. Its supplied HEAD was `f8fb7ac`;
round-three files from `a2a40c4` were applied before the scope cut. See `PR_BODY.md`.
