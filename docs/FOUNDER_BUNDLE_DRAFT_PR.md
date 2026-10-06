The shipped founder bundle retained an AMCAS application ID, so a named-fact request returned HTTP 200 with grounded:true and a citation containing it. The rebuilt bundle removes that identifier and third-party names; the AMCAS question and old fact ID now return the spec's evidence-missing text, grounded:false, and no sources.

Class rule: no private identifier survives redaction, where private identifier = any application/account/member/policy/license/case/reference/ID number (label-based: AMCAS, ID, No., #, account, application, SSN, DOB, passport, license, MRN, NPI, EIN, etc.), any digit string of 6 or more digits that is not a 4-digit year or a dated range, any email, phone, street address or P.O. box, plus names of people other than Hudson Taylor. Public company names are permitted.

The builder handles short, alphanumeric, wrapped and Unicode-normalized identifier values, contacts, and long digit runs. A manually reviewed name-token inventory covers third parties in this finite, SHA-256-pinned collection, including single-name mentions, inverted names and publication authors. The inventory stores hashes rather than a new plaintext list of people. Changed inputs still fail the original locks and require a fresh name/admission review; this is not a general-purpose name recognizer.

Rebuilt all 76 eligible documents from the original ingest, regenerated manifest hashes and sizes, and preserved every existing hold and exclusion. The bundle contains 952 paragraph occurrences / 569 distinct paragraphs. A direct disk sweep checks every shipped paragraph, including anything the loader might exclude, for identifier/contact regex matches and reviewed third-party name tokens. The runtime additionally rejects residual AMCAS markers and six-digit runs.

The formerly unsupported Senior LIMS Developer acceptance test now retrieves the LIMS Administrator fact actually present in the material, through the spec's named-fact question form, and checks its exact passage and citation.

Verification of the working tree:
- Full repository suite: 4,570 passed, zero failures (includes the requested existing suite and newer base-branch regressions).
- Focused founder/source-registry/assistant-route suite: 200 passed, zero failures.
- Redaction tests: 4 passed, including 1,900 generated label/suffix/separator/value combinations.
- Evidenced employment acceptance: 1 passed.
- Full-bundle retrieval, refusal, revocation and citation properties: 4 passed over all 76 files and 569 distinct paragraphs.
- TypeScript typecheck and production build: passed.
- Build traces: all 79 bundle files present for the assistant, legacy bot and citation routes.
- Independent deterministic rebuild: byte-for-byte equal.
- Diff whitespace check: passed.

Runner handoff: keep this one PR (#524) in draft; do not merge. Changes are prepared on codex/r2-524-founder-bundle-redaction, with the #524 shipping changes from 1cc43ab8 applied while retaining unrelated base-branch fixes. No commit or push was performed. These verification results describe the local working tree; the runner must commit and publish it before the remote PR contains this fix.
