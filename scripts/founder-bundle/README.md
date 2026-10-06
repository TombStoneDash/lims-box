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

The original integration receipt defines contact redaction: email, URL,
telephone, SSN, street address, PO box, state/ZIP, birth date, and AAMC ID.
The builder applies those rules before computing output digests. Four sources
pending human review, three holds, duplicates, and unusable/absent text stay
excluded. Any residual loader-sensitive marker excludes the whole document.
Names are retained under the existing founder policy; referee documents stay
held. `BUILD_REPORT.json` lists every skipped alias and reason. Raw or redacted
documents over 256 KiB are skipped, and a bundle at least 20 MiB is rejected.

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

The last command is a separate, currently failing acceptance gate. None of the
82 supplied extracted texts contains “Developer”; neither does the eligible
merged redacted inventory. An approved source naming the employer and role is
needed before “Where did Hudson Taylor work as Senior LIMS Developer?” can be
answered with evidence. Once supplied, review its complete passage and add an
exact whole-question mapping to that fact; do not infer a role from the LIMS
Administrator passages. General free-text founder questions remain unsupported.
