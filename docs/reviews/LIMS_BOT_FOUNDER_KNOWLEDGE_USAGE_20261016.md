# LIMS Bot founder-knowledge usage — traced truth (2026-10-16)

**Verdict: PARTIAL.**

The live request paths for both `app/api/bot/route.ts` and
`app/api/demo/assistant/route.ts` do load and answer from `knowledge/founder/`
at request time — but only a single allowlisted document (not the 117-file
`lims-knowledge#1` bundle), and only through a narrow, verbatim exact-match
check that runs *before* the bot's normal retrieval engine, not through it.
The deterministic FAQ engine (`lib/bot/engine.ts`) that handles every other
question on the public bot never cites the founder archive for its own
ranked answers — that path is intentionally off ("Archive excerpts are
loaded and have citation pages, but the bot does not answer from them until
a reviewed answer design and deployment wiring exist.",
`lib/bot/engine.ts:314-316`).

## 1. Does either route load founder knowledge?

Yes, both do, at request time (no build-time bundling/embedding — the bundle
is read from disk inside the request handler on every call).

| Route | Import | Call site | What it loads |
|---|---|---|---|
| `app/api/bot/route.ts:1` | `askFounderCareer` from `@/lib/bot/founder-corpus` | `app/api/bot/route.ts:76` — `askFounderCareer(question) ?? askBot(question)` | Tries the founder archive **first**; falls through to the normal FAQ engine only if it returns `null`. |
| `app/api/demo/assistant/route.ts:1` | `askFounderArchive` from `@/lib/bot/founder-corpus` | `app/api/demo/assistant/route.ts:101` — `askFounderArchive(normalizedQuestion) ?? askDemoAssistant(normalizedQuestion)` | Same first-check pattern, ahead of the synthetic-QC demo engine. |
| `app/api/health/route.ts:2,25` | `getFounderBundleDiagnostics` | health probe body | Read-only row/doc counts, never content. |

The disk read itself: `lib/bot/founder-corpus.ts:22` —
`founderBundleRoot()` defaults to `path.join(process.cwd(), 'knowledge/founder')`
(overridable via `LIMS_FOUNDER_KNOWLEDGE_DIR`). `readFounderBundle()`
(`lib/bot/founder-corpus.ts:88-161`) re-reads and hash-verifies
`MANIFEST.tsv`, `approved/SOURCES.tsv`, and every admitted
`approved/redacted/<sha256>.txt` file **on every call** — there is no
module-level cache, matching the comment at `lib/bot/founder-corpus.ts:200`
("This index lives for one request, so holds/deletion revoke it
immediately.").

## 2. If yes: which files, how many chunks, how are they used?

**Which files.** `knowledge/founder/` currently ships exactly **one**
admitted document, not the 117-file bundle:

- `knowledge/founder/MANIFEST.tsv` — 2 data rows total: the one redacted
  document (`approved/redacted/d90f0703…7e5b98.txt`) and the `SOURCES.tsv`
  metadata row.
- `knowledge/founder/approved/SOURCES.tsv` — 1 source row, alias `FLI-004`,
  `bot_status=REDACTED_CANDIDATE`, `status=INTEGRATED`.
- `knowledge/founder/BUILD_REPORT.json` — `"documents": 1`,
  `"distinctParagraphs": 26`, `"selection": "ALLOWLIST_ONLY"`,
  `"excludedTrees": ["15_HT_FOUNDER_INTAKE"]`.
- `scripts/founder-bundle/admission.json:1-6` — the single allowlist entry,
  sourced from `docs/founder/FOUNDER_STORY.md` (a curated career narrative,
  not raw intake material).

Git history confirms the narrowing: commit `cbc2858` ("ship only
allow-listed professional documents") and `d3f1ee4` ("founder knowledge from
the approved career story only (v5)", 2026-10-06) deleted the two prior
redacted documents and replaced them with this single file, explicitly
excluding the `15_HT_FOUNDER_INTAKE` tree. The original ingestion of the
full merged `lims-knowledge` bundle was commit `6c14fc0` — the content has
since been deliberately cut down to one file.

**How many chunks.** `loadFounderFactIndex()` (`lib/bot/founder-corpus.ts:202-219`)
splits that one document on blank lines into paragraphs, producing the 26
distinct facts reported in `BUILD_REPORT.json`. Each fact gets a stable id
`founder-fact-<sha256-prefix>` (`founder-corpus.ts:211`).

**How it reaches an answer — not a retrieval/prompt pipeline, an exact-match
gate:**

- There is no LLM anywhere in this path. `grep` across `lib/bot`,
  `app/api/bot`, `app/api/demo` for `openai|anthropic|chat.completions|
  generateText|LLM` returns nothing. Both routes are deterministic
  string/keyword matchers; "the prompt" does not exist as a concept here.
- `app/api/bot/route.ts` only reaches the archive for 3 fixed, hard-coded
  whole-question strings in `CAREER_QUERIES`
  (`lib/bot/founder-corpus.ts:229-233`), matched by trim+lowercase equality
  (`founder-corpus.ts:234-236`). Anything else returns `null` and falls
  through to `askBot`.
- `app/api/demo/assistant/route.ts` calls `askFounderArchive` directly
  (`founder-corpus.ts:243-259`) on any question containing
  `/founder|hudson|hud|taylor/i`, but it only returns a grounded answer if
  the question exactly equals one of `founderFactQuestions(fact)`'s two
  fixed templates (`What does the founder archive say about "<title>"?` /
  `Show founder fact <id>.`, `founder-corpus.ts:222-227`) or one of the 3
  `CAREER_QUERIES` passages — i.e. you must already know a fact's id/title,
  or ask one of 3 scripted questions. There is no keyword ranking or
  retrieval over the 26 facts; `founder-corpus.ts:245-246` explicitly says
  "No keyword fallback."
- `lib/bot/engine.ts`'s own `answerFounderQuestion` (`engine.ts:305-322`),
  used by `askBot` for every founder-flavored question that isn't one of
  those 3 scripted strings, answers only from the static, hard-coded
  `corpus` array's `founder-bio` entry (`lib/bot/corpus.ts`) — it never
  calls into `founder-corpus.ts` and never cites the archive
  (`engine.ts:314-316`, confirmed by the existing test suite at
  `tests/bot-founder-corpus.test.ts:102-153` and `:279-303`, which assert
  archive-sourced questions return `EVIDENCE_MISSING_ANSWER` even with a
  full bundle loaded).
- `loadFounderCorpus()` (`founder-corpus.ts:169-187`, keyed off the 4
  hard-coded `FOUNDER_EXCERPTS` in `lib/bot/source-registry.ts:247-272`,
  unrelated to the 26 paragraph facts) is used only by the static citation
  page `app/bot/sources/[...path]/page.tsx:3,16-20` to render `/bot/sources/*`
  pages for sources already cited — it is not in either POST handler's
  answer path.

**Net effect:** the founder archive is wired into both live endpoints, but
functions as an allowlisted lookup table for 3 pre-approved questions (plus
a citation-id passthrough on the demo route), not as a knowledge source the
bot can be asked about freely, and not as prompt/context fed to a model
(there is no model).

## 3. If this were "NOT USED": smallest wiring (not implemented)

N/A as stated — it is used, just narrowly. For completeness, the smallest
change to broaden it to genuine retrieval (**description only, not
implemented, per task scope**):

1. Add the 26-fact index (`loadFounderFactIndex()`) as a scored candidate
   pool inside `answerFounderQuestion()` in `lib/bot/engine.ts`, reusing the
   existing `tokenize`/`scoreEntry` machinery already used for the product
   `corpus`, gated behind the same `FOUNDER_HISTORY_PATTERN` intent check
   that already exists there.
2. Keep the evidence-missing default and `MIN_SCORE` threshold so an
   unmatched topic still refuses rather than guessing.
3. No LLM/prompt changes needed — the engine is deterministic, so "wiring
   in retrieval" means adding the founder facts to the one ranking table
   `answerFounderQuestion` already consults, not building a new
   prompt-construction or embedding pipeline.

This is a design/scope decision already flagged in-repo ("does not answer
from them until a reviewed answer design and deployment wiring exist",
`engine.ts:315`) — it is not an oversight, and this task does not implement
it.

## Evidence table

| # | Claim | File:line |
|---|---|---|
| 1 | `bot/route.ts` tries founder archive before the FAQ engine | `app/api/bot/route.ts:1,76` |
| 2 | `demo/assistant/route.ts` tries founder archive before the demo engine | `app/api/demo/assistant/route.ts:1,101` |
| 3 | Bundle root defaults to `knowledge/founder`, read per request | `lib/bot/founder-corpus.ts:22,200` |
| 4 | Manifest/sources/redacted files hash-verified on every call | `lib/bot/founder-corpus.ts:88-161` |
| 5 | Only 1 document currently admitted | `knowledge/founder/MANIFEST.tsv`, `knowledge/founder/approved/SOURCES.tsv`, `scripts/founder-bundle/admission.json:1-6` |
| 6 | Bundle was deliberately narrowed from the merged multi-file set to 1 allowlisted file | `knowledge/founder/BUILD_REPORT.json` (`ALLOWLIST_ONLY`, excludes `15_HT_FOUNDER_INTAKE`); commits `6c14fc0`, `cbc2858`, `d3f1ee4` |
| 7 | 26 paragraph-level facts extracted from that 1 document | `lib/bot/founder-corpus.ts:202-219`; `knowledge/founder/BUILD_REPORT.json` |
| 8 | Only 3 fixed whole-question strings trigger the archive on `/api/bot` | `lib/bot/founder-corpus.ts:229-241` |
| 9 | `/api/demo/assistant` only matches fixed citation-form questions | `lib/bot/founder-corpus.ts:222-227,243-259` |
| 10 | No keyword fallback/ranking over the archive | `lib/bot/founder-corpus.ts:245-246` |
| 11 | The core FAQ engine's founder answers come from the static `corpus`, not the archive | `lib/bot/engine.ts:305-322` (esp. `314-316`) |
| 12 | Existing tests assert archive-sourced questions still refuse via `askBot` | `tests/bot-founder-corpus.test.ts:102-153,279-303` |
| 13 | `loadFounderCorpus`/`FOUNDER_EXCERPTS` are citation-page-only, not in either POST path | `lib/bot/founder-corpus.ts:169-187`; `lib/bot/source-registry.ts:247-272`; `app/bot/sources/[...path]/page.tsx:3,16-20` |
| 14 | No LLM call anywhere in this path | repo-wide grep of `lib/bot`, `app/api/bot`, `app/api/demo` for `openai\|anthropic\|chat.completions\|generateText\|LLM` — no matches |
