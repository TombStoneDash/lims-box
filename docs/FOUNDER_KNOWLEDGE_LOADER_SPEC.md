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
for the deterministic ingest builder and its evidenced Administrator acceptance gate.

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

## Round-three privacy rule

Retain all contact/identifier redaction from round two. Name handling is now
FAIL-CLOSED: replace every capitalized proper-noun token or sequence with
`[name]` unless it is on the short public allow-list in
`lib/bot/founder-name-allowlist.mjs`. This includes inverted Last, First forms,
initials, possessives, uppercase/mixed-case words, and Unicode-normalized forms.
Ordinary capitalized words are also redacted; never exempt an English dictionary
or attempt to enumerate private names. Allow only the listed founder variants,
products, instruments/vendors, public companies/institutions, US states/cities,
and months/days. The list is part of the reviewed repository change.

Drop the whole original document BEFORE redaction when it contains patient,
clinical-case, diagnosis, DOB, MRN, date-of-birth, medical-record-number, or
specimen-result content. This includes resumes mentioning patients. Do not
salvage individual paragraphs. Retain holds and integrity/provenance checks.
Record excluded paths and reasons in the build report and list them in the PR.
The loader also rejects clinical content in otherwise integrity-valid bundles.

Sweep every shipped paragraph directly from disk against the public allow-list
and contact/identifier patterns. The AMCAS question and
`founder-fact-f5b392827c54da07c7cf476cbd353f4e` (with and without trailing period)
must return `EVIDENCE_MISSING_ANSWER`, `grounded: false`, and no sources.
Apply the full inventory/retrieval/refusal/revocation property to every remaining
paragraph; clinical exclusions and redacted duplicates reduce the prior count.
Career acceptance uses the actual redacted Administrator passage, not an inferred
Senior LIMS Developer claim or an exemption for capitalized job-title words.

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

Run `npm run test:all`, focused founder tests, the shipped-bundle property run,
redaction properties, deterministic rebuild, and `npm run typecheck`. Prepare
one draft PR; do not merge. Work remains uncommitted and unpushed on the assigned
`codex/r3-525-founder-bundle-names` branch for the runner to publish. The round-two
changes from `8135b4fa` are included in this worktree; Git HEAD remains the
supplied base `f8fb7ac`. See `PR_BODY.md` for current validation and exclusions.
