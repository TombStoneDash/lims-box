# Founder bundle: explicit document admission

The bundle is built ONLY from the exact source documents in `ALLOWLIST.txt`.
The entire `15_HT_FOUNDER_INTAKE` tree and everything not on that list are
excluded. A document does not become eligible by passing a content filter.
No directory scan, glob, paragraph salvage, or legacy-ingest fallback exists.

The list uses paths relative to the supplied source root. `admission.json`
pins both the original bytes and the reviewed redacted output. Any changed,
missing, linked, or invalid source fails the build; it is never silently skipped
or admitted. Adding a document requires reviewing the entire document and
changing the list and locks together. Runtime admission checks the same source
and output digest pairs, including for explicit external bundle overrides.
Rehashing a modified file and its manifest cannot authorize new content.

## Reviewed scope

The guide was `/Users/ops/Hermes/planning/LIMS_LEGACY_MINING_20260711/LEGACY_LIMS_EVIDENCE_LIBRARY.md`.
`FOUNDER_STORY_SAFE` and `PUBLIC` are claim-level tags, not blanket approval of
all documents containing those tags. Mixed intake, personal, proprietary,
and uncertain source documents were left out in full.

Two complete professional documents remain:

- `clawd/intel/lims-box-7-11-4-framework.md`: historical company marketing
  planning, including a resume-level LIMS career framing. Evidence-library
  cluster 4, claims 78–86: PUBLIC planning and FOUNDER_STORY_SAFE career material.
  The conditional prospect name in claim 85 and the methodology author's name
  are removed by the retained name redaction. Goals, dates, template outcomes,
  pricing, and unverified marketing estimates remain historical source material,
  not verified present-day capability, customer, or employment claims.
- `Projects/lims-box/content/blog/why-small-labs-dont-need-enterprise-lims.md`:
  the company's published professional article about environmental/water lab
  software. This fits the guide's PUBLIC product/marketing category (cluster 12)
  and is also referenced by the cluster 4 content plan. The whole article was
  reviewed; no personal or clinical case narrative is present.

No intake documents, medical history, applications, resumes with mixed personal
material, confidential technical archives, or new authored career summaries are
included. The former Administrator acceptance passage is intentionally gone.

Identifier/contact redaction and the fail-closed capitalized-token redactor are
retained as a second layer. Public product/company/place names remain allowed;
no third-party person name remains in either reviewed output. The name sweep
uses the short public vocabulary, not a private-name deny-list or dictionary.
Medical-term scanning is a verification assertion, not the source selection gate.

## Rebuild and verification

```sh
node scripts/founder-bundle/build.mjs /Users/ops /tmp/new-founder-bundle
node --test scripts/founder-bundle/*.test.mjs
node --import tsx --test tests/bot-founder-bundle.test.ts tests/bot-founder-loader.test.ts tests/bot-founder-corpus.test.ts scripts/founder-bundle/employment-acceptance.test.ts
npm run test:all
npm run typecheck
```

Output must be absent or empty. Review the output and replace `knowledge/founder`
atomically as a repository change; never overlay a rebuild onto an old bundle.
Builds are deterministic and require no network or paid service. Only redacted
text, metadata, and counts ship. No source paths or original documents ship.

The final bundle has **2 documents, 79 paragraph occurrences, and 72 distinct
paragraphs**. Both metadata and documents live outside the excluded intake tree:
`MANIFEST.tsv`, `approved/SOURCES.tsv`, and `approved/redacted/<sha256>.txt`.

The runtime defaults to `knowledge/founder` when the environment override is
unset. Next.js traces it into the assistant, legacy bot, and citation routes.
All retained paragraphs are tested through both supported query forms and their
citations. The property test copies the real shipped bundle by default and
checks deletion, corruption, alterations (including rewritten hashes), holds,
and symlinks. Invalid explicit overrides never fall back to shipped material.

The disk sweep checks every paragraph independently of the loader for the
requested medical terms, identifiers, contacts, and unapproved capitalized names.
The reported medical fact, three other medical-related facts found in the old
bundle, prior AMCAS/patient fact IDs, and AMCAS/patient-name queries all refuse.
