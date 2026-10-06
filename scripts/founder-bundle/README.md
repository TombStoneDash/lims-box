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

The builder normalizes Unicode, removes labelled identifiers including short,
alphanumeric and wrapped values, removes contacts and long digit runs, and
redacts reviewed third-party name tokens in all case variants. The name-token
hash inventory covers this finite, SHA-256-pinned source collection, including
single-name mentions, inverted names, and publication authors. It is not a
universal name recognizer: changing the pinned inputs requires a fresh name
review as well as admission review. Names are not newly published in that list.

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
and every reviewed third-party name token. It also checks the AMCAS question and
the formerly exposed fact ID return the spec refusal, `grounded: false`, and no
sources. The separate generated label/value/separator test covers 1,900 cases.
