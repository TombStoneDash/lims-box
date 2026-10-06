# Founder bundle build

Run from the repository root:

```sh
node scripts/founder-bundle/build.mjs /path/to/LIMS_FOUNDER_117_INGEST_20260925 /tmp/new-founder-bundle
```

The output must be empty or absent. Review the generated files, then replace
`knowledge/founder` with that output. Builds are deterministic; timestamps are
the source review timestamp, not the wall clock. No original blobs, extracted
texts, source filenames, or local paths are copied to the output.

`admission.json` preserves all 117 alias/status decisions from
`TombStoneDash/lims-knowledge` commit
`e2eeb98c8c0bb2f1fd374e543184662760c00f99`, plus SHA-256 locks on the supplied
ingest's extracted text. The ingest manifest itself is also pinned. Changed
inputs require an explicit provenance/admission review and updated locks;
the builder never silently approves a new source. The original source map
omits held hashes; the input locks retain their ingest hashes for identity only.

The class rule is: no private identifier survives redaction. Private identifiers
include any application/account/member/policy/license/case/reference/ID number
(label-based: AMCAS, ID, No., #, account, application, SSN, DOB, passport,
license, MRN, NPI, EIN, etc.); any digit string of six or more digits (four-digit
years and dated ranges are preserved); any email, phone, street address or P.O.
box; and names of people other than Hudson Taylor. Public company names remain.

Name handling is FAIL-CLOSED: every capitalized token or sequence is replaced
with `[name]` unless it is a whole entry in the short public allow-list in
`lib/bot/founder-name-allowlist.mjs`. There is no private-name deny-list. The
exceptions cover Hudson Taylor variants, approved product/instrument/vendor and
public institution names, listed US states/cities, and months/days. Ordinary
capitalized words, job titles, initials, inverted names, possessives, and
uppercase or mixed-case names are conservatively redacted. This intentionally
reduces readability rather than trying to infer which unknown words are people.
Matching uses NFKC/NFC normalization and strips invisible format controls before
checking whole lexical boundaries. No ordinary-English dictionary is exempted.

Before any identifier or name redaction, the builder drops the WHOLE original
document if it contains patient/clinical-case markers: patient(s), diagnosis,
diagnoses, diagnosed, DOB, MRN, date of birth, medical record number, clinical
case, or specimen result. Dotted identifiers, underscore/hyphen separators,
fullwidth characters and invisible controls are covered. Even a career resume
mentioning patients is dropped; safe-looking paragraphs are never salvaged.
The runtime applies the same clinical gate to verified external overrides.

The previous contact/identifier redactions and all source integrity locks remain.
Generated redaction markers are lowercase so they need no capitalization exception.

Existing holds and review statuses remain unchanged. Residual loader-sensitive
markers exclude the whole document. `BUILD_REPORT.json` records skipped aliases.
Documents over 256 KiB and bundles at least 20 MiB remain rejected.

The runtime defaults to `knowledge/founder` when
`LIMS_FOUNDER_KNOWLEDGE_DIR` is unset. Explicit invalid paths still fail closed.
Next.js traces this bundle into the assistant, legacy bot, and citation routes.

Verification:

```sh
node --test scripts/founder-bundle/redaction.test.mjs
TEST_FOUNDER_BUNDLE_DIR="$PWD/knowledge/founder" node --import tsx --test tests/bot-founder-loader.test.ts
npm run test:all
npm run typecheck
node --import tsx --test scripts/founder-bundle/employment-acceptance.test.ts
```

The acceptance test now retrieves the LIMS Administrator fact present in the
material using the specified whole-question form and verifies its exact passage
and citation. No Senior LIMS Developer employment claim is inferred.

`tests/bot-founder-bundle.test.ts` sweeps every paragraph directly from disk,
including files the loader might exclude. It checks identifier/contact regexes
and every capitalized token against only the public allow-list. It also checks the AMCAS question and
both formerly exposed fact IDs return the spec refusal, `grounded: false`, and no
sources. The separate generated label/value/separator test covers 1,900 cases.

Round three ships 48 documents with 487 paragraph occurrences / 311 distinct
paragraphs. All 29 clinical exclusions (28 previously shipped documents and one
previously excluded candidate) are recorded with paths in `BUILD_REPORT.json`
and listed in `PR_BODY.md`. Deterministic rebuilds must match every output byte.
