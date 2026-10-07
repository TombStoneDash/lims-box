# Founder bundle: explicit document admission

`ALLOWLIST.txt` contains exactly `docs/founder/FOUNDER_STORY.md`, relative to the
repository root. This is the factual career material from sections 1–4 of
`/Users/ops/Hermes/planning/LIMS_LEGACY_MINING_20260711/HUDSON_LIMS_CREDIBILITY_AND_FOUNDER_STORY.md`,
authorized as FOUNDER_STORY_SAFE. Editorial notes, verification columns,
unsupported publication/timing claims, confidential vendor details, and disputed
scale figures are omitted. Self-reported experience and competencies retain
attribution. Laboratory protocols and instrument names describe professional
work, not personal health information. No other source or intake tree is admitted.

`admission.json` locks both source and processed output hashes. Only the exact
story path bypasses proper-noun redaction, preserving Hudson Taylor, employers,
institutions, and technical terminology. Identifier/contact redaction remains
active. All other paths retain proper-noun redaction. Numbered Markdown headings
are preserved, while single-hash identifier labels remain redacted. Runtime
admission still verifies the same digest pairs; rewritten manifests cannot admit
modified content. Missing files, holds, corruption, and internal symlinks fail closed.

## Rebuild and verification

```sh
node scripts/founder-bundle/build.mjs . /tmp/new-founder-bundle
node --test scripts/founder-bundle/*.test.mjs
node --import tsx --test tests/bot-founder*.test.ts scripts/founder-bundle/employment-acceptance.test.ts
npm run test:all
npm run typecheck
```

The output directory must be absent or empty. Replace `knowledge/founder` with
the complete output; never overlay old files. Rebuilds are deterministic and
require no external source checkout, network, or paid service.

The shipped inventory is **1 document, 26 paragraph occurrences, 26 distinct
paragraphs**. Metadata and processed text live at `MANIFEST.tsv`,
`approved/SOURCES.tsv`, and `approved/redacted/<sha256>.txt`.

Both `/api/bot` and `/api/demo/assistant` support the three reviewed career
questions through complete
admitted paragraphs and their existing fact citation pages. Exact whole-question
matching rejects appended instructions, negation, and private-data requests.
Fact-ID lookup remains available for every admitted paragraph. The independent
disk sweep checks personal-health terms, identifiers, emails, phones, and postal
addresses; the reviewed story is also checked for unwanted `[name]` replacements.
Existing leak questions and revoked fact IDs must continue to refuse.
