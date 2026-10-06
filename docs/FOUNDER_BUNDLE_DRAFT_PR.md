The founder bundle at 8135b4fa retained a patient name, and requesting founder-fact-f5b392827c54da07c7cf476cbd353f4e returned it as grounded evidence. Round three removes whole clinical documents and replaces the manual private-name inventory with a public allow-list and fail-closed capitalization rule.

Class rule (FAIL-CLOSED): every capitalized proper-noun token or sequence, including inverted “Last, First”, initials, possessives, uppercase/mixed-case words, and Unicode-normalized forms, is replaced with [name] UNLESS it is on the short repository allow-list in lib/bot/founder-name-allowlist.mjs. Exceptions are the listed Hudson Taylor variants, TombStone Dash, LIMS BOX, LIMS Bot, SENAITE, named instruments/vendors (including DiaSorin LIAISON XL and OrchidLive), public companies/institutions, US states/cities, and months/days. Ordinary capitalized words and role titles are also conservatively replaced. There is no private-name deny-list or ordinary-English dictionary exception. NFKC/NFC normalization, invisible-format removal, and complete lexical boundaries prevent variant/prefix bypasses.

Whole-document rule: inspect the original text BEFORE any name or identifier replacement and drop every candidate containing patient/clinical-case markers (patient(s), diagnosis/diagnoses/diagnosed, DOB, MRN, date of birth, medical record number, clinical case, specimen result). Dotted DOB/MRN, underscores/hyphens and Unicode forms are covered. Even resumes mentioning patients are excluded; no paragraphs are salvaged. Runtime admission also rejects these markers in integrity-valid external bundles. Existing source holds, hash locks, contact and identifier redaction remain in force.

Rebuilt deterministically from the original pinned 117-row ingest. The bundle now has 48 documents, 487 paragraph occurrences, and 311 distinct paragraphs. Clinical screening excludes 29 candidates: 28 documents previously shipped in round two and one already excluded candidate. Capitalization redaction also collapses duplicate passages. The earlier 571-paragraph retrieval property is retained over the entire remaining inventory, with both named-question forms, exact answer/citation membership, perturbation refusals, and per-source revocation.

Validation on the final local working tree:

- Full repository suite: 4,572 passed, 0 failed, 0 skipped (all prior 4,570 tests plus two new regressions).
- Focused founder/bundle/employment tests: 177 passed, 0 failed.
- Redaction properties: 7 passed, including 1,900 identifier combinations, 576 generated unknown-name/Unicode forms, all allow-list entries and possessives, and whole-document clinical markers.
- Direct disk sweep: all 487 shipped paragraph occurrences have no capitalized sequence outside the allow-list and no contact/identifier matches; all 29 clinical paths are absent from disk and retrieval metadata.
- The AMCAS questions and reported founder-fact ID (with and without a period) return the exact evidence-missing refusal, grounded:false, sources:[]. The prior round-two exposed fact also refuses.
- Full remaining-bundle retrieval/refusal/revocation/citation properties: 4 passed across 48 documents and 311 distinct paragraphs.
- TypeScript typecheck, targeted ESLint and whitespace checks passed.
- Independent rebuild from the pinned ingest: byte-for-byte identical to the shipped bundle.

Dropped candidate files (reason PATIENT_OR_CLINICAL_CONTENT; paths relative to knowledge/founder):

- `15_HT_FOUNDER_INTAKE/redacted/21c5459596b5963c4c09c60f72379b3a9370417bb762283dc6d31bdcd820d031.txt` (FLI-003)
- `15_HT_FOUNDER_INTAKE/redacted/e52eb60726ade084ebcfdba7f06a5aa92968418deb1ef52b51d696317b1b51c8.txt` (FLI-004)
- `15_HT_FOUNDER_INTAKE/redacted/b9c3178217644c349b18099b46dc769e4022ccdfa44ce42b198377755554b47a.txt` (FLI-011)
- `15_HT_FOUNDER_INTAKE/redacted/ef053deac17048bec9022609022b5e71f5e77a5cf5ec5506ab51eb2d179daa5a.txt` (FLI-013)
- `15_HT_FOUNDER_INTAKE/redacted/f6e58c72da1e27dd02cc6d0b8bad703c8976245dd2ef72cca09fd13f1490eed7.txt` (FLI-014)
- `15_HT_FOUNDER_INTAKE/redacted/74a2eaec08c5fb39fc8a826ad4baa55d1d9241e37cb5d85f3787444e90a82b5e.txt` (FLI-015)
- `15_HT_FOUNDER_INTAKE/redacted/9f8a8934d6515f13c17cbfbaf29c962f3e27c48aca82d2864cd4ef72b8ae73db.txt` (FLI-024)
- `15_HT_FOUNDER_INTAKE/redacted/4c4d39b33f91173b290a4c782d12df3a02c78c3260b18226bb8df40c90db6f40.txt` (FLI-030)
- `15_HT_FOUNDER_INTAKE/redacted/2bd0920c5940c6af84e4e6457c6cbc42c6816d0418a4c1c7caa209d2e16a9636.txt` (FLI-031)
- `15_HT_FOUNDER_INTAKE/redacted/2485524633f041ee93fd19282f8d89e794ab129fbdcf43ff3af0b4ed815c75a5.txt` (FLI-041)
- `15_HT_FOUNDER_INTAKE/redacted/29e931f5b6a8949ba13ed2a316360ac2d2ccbb7d7e5f8ac35c1e8d561ffd3816.txt` (FLI-043)
- `15_HT_FOUNDER_INTAKE/redacted/f2bc7e62d8e2d466038e37a09062444ab09030d298566e3a304f2cc63f798ba2.txt` (FLI-045)
- `15_HT_FOUNDER_INTAKE/redacted/ef0c5863c452160fd192ac360d6b34e425c5afaa2fcd63a427cc56daf0515642.txt` (FLI-051)
- `15_HT_FOUNDER_INTAKE/redacted/5e52f5d971b64a0762b3b4cc802c38998a61f1ea304386532ac792585979eae9.txt` (FLI-062)
- `15_HT_FOUNDER_INTAKE/redacted/c65117f29122b49c74b2b12a2e943d60e8605188cc9c2673d98ca28c80a61f2b.txt` (FLI-069)
- `15_HT_FOUNDER_INTAKE/redacted/6711df0617641562dc8e5bc08d1e30add665776dc45463a7f8149710cf515cc2.txt` (FLI-070)
- `15_HT_FOUNDER_INTAKE/redacted/c57c96bbe1dcdc33291119d4d6b755c4ac68d7131d353b27552b50600d9f7e92.txt` (FLI-071)
- `15_HT_FOUNDER_INTAKE/redacted/1bd775543e14f80352e8a5e226d4122bce846e0d78c1e99cc101a53bc399d3b9.txt` (FLI-072)
- `15_HT_FOUNDER_INTAKE/redacted/f86306004d24b58eac7b686f47ade591516c412b8fd28074b80bf9fca0ff3eb0.txt` (FLI-073)
- `15_HT_FOUNDER_INTAKE/redacted/136fd34fdc0f543daba0fa13b256786855c97daff3b502855417cc149f31d17b.txt` (FLI-075)
- `15_HT_FOUNDER_INTAKE/redacted/b61e03e7521251bac6ff2edfce8f2b31aaa724b9674b6e88b6bfed41e90b7d76.txt` (FLI-076)
- `15_HT_FOUNDER_INTAKE/redacted/7ff830b91701d09a66a6c17434d1af7499cfb4ce79d23d5921db74180d3f38a7.txt` (FLI-077)
- `15_HT_FOUNDER_INTAKE/redacted/20d0a07bed8adc0efadbd9b7be9b87cfd23ded9616d323ac808149d11e8c8849.txt` (FLI-079)
- `15_HT_FOUNDER_INTAKE/redacted/00a5cc564e41955aa23d2ba9a0b6cf06bcc8fb1ff3b26ade8745d1dc84f1586c.txt` (FLI-080)
- `15_HT_FOUNDER_INTAKE/redacted/bb31ac9665d8177213072c3e73693524d7e7e96f5a36ec995eaddf65f4a7c90e.txt` (FLI-081)
- `15_HT_FOUNDER_INTAKE/redacted/f2e4425bbfaa1ca7075daff068b40739f535d0a6ae331db09549d1da052b3931.txt` (FLI-083)
- `15_HT_FOUNDER_INTAKE/redacted/c780ebf292e61da8307277ee5b4f7b17adcfb952c86c46da657dfdf7e9452e98.txt` (FLI-084)
- `15_HT_FOUNDER_INTAKE/redacted/243040564a85218b4f1fbf65448f666fbaccb186b9c3e28371d0f10d47cf6616.txt` (FLI-085)
- `15_HT_FOUNDER_INTAKE/redacted/383d1e568808db19bee713f1c1b1b3d76c2754d5c240be15563458e308ff8166.txt` (FLI-088)

Runner handoff: keep one draft PR; do not merge. This body describes the prepared round-three working tree on codex/r3-525-founder-bundle-names. The worktree started at f8fb7ac; all changes from requested round-two head 8135b4fa were applied before this fix. No commit, push, or merge was performed. The runner must commit/publish the assigned branch and apply this body to the resulting draft PR. Until then, remote PR #525 still points to the round-two head and does not contain these code changes.

PR metadata update attempted after verification: GitHub connector refused because approval is required and this session has approval policy never. PR #525 remains open and draft with its prior body/head. Apply this prepared body when the runner publishes the code; no additional PR was created.
