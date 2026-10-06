# Founder bundle: explicit document admission

The bundle is built ONLY from the exact source documents listed in ALLOWLIST.txt.
The entire 15_HT_FOUNDER_INTAKE folder and every unlisted document are excluded.
Content filters do not grant admission. Never relocate an intake document to
make it eligible. Review each complete source as professional/career/company
material only; use FOUNDER_STORY_SAFE and PUBLIC in the requested
LEGACY_LIMS_EVIDENCE_LIBRARY.md as guidance. When in doubt, omit the document.

Each non-comment line has four tab-separated columns:
source-relative-path, SHA-256 of original UTF-8 bytes, SHA-256 after the existing
identifier/proper-noun redaction, and evidence-library tag. Exact hashes prevent
later source edits from inheriting approval. No glob, recursive discovery,
original/text fallback, or automatic promotion from a tag is permitted.

Run from the repository root:

    node scripts/founder-bundle/build.mjs EVIDENCE_ROOT EMPTY_OUTPUT_DIRECTORY

The output must be absent or empty, so stale documents cannot survive a rebuild.
Review it before replacing knowledge/founder. The runtime also checks the
repository allow-list and output hashes, including for explicit environment
overrides. Bundle-local manifests and allow-lists cannot self-authorize content.
Next.js traces the repository policy with the bundle into the three relevant routes.

The round-three identifier and proper-noun redaction functions are retained.
Existing runtime clinical and identifier checks remain defense in depth only.
The bundle sweep independently checks every shipped paragraph for identifiers,
health terms, and unapproved capitalization, including content the loader rejects.

## Current source blocker

The requested /Users/ops/Hermes/planning/LIMS_LEGACY_MINING_20260711/
LEGACY_LIMS_EVIDENCE_LIBRARY.md and non-intake source documents are unavailable
in this repository and its available Git history. The allow-list is deliberately
empty: zero shipped documents, zero paragraph occurrences, zero distinct facts.
This is a BLOCKED source-selection result, not completed useful retrieval.
No replacement source, tag, career claim, or approval has been invented.

Tests use separate synthetic policies in isolated temporary directories; they
never amend the actual publication allow-list. The synthetic retrieval property
covers three documents and four distinct paragraphs. Shipped retrieval remains
empty until the source blocker is resolved; the employment acceptance is skipped
with that explicit reason. Re-run it after selecting real sources.
