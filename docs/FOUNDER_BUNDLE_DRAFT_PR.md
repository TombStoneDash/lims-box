Round 4 scope cut: the prior content filters still admitted founder medical details as grounded facts. Source selection is now explicit document admission.

**Rule: the bundle is built ONLY from the explicit allow-list of source documents committed at `scripts/founder-bundle/ALLOWLIST.txt`. The entire `15_HT_FOUNDER_INTAKE` folder, plus anything not on the list, is excluded. Content filtering does not grant admission. When in doubt, leave the document out.**

The selected whole documents are the historical LIMS BOX 7-11-4 marketing framework and the published “Why Small Labs Don't Need Enterprise LIMS” article. Both contain professional company/marketing material only. Selection used the evidence library's FOUNDER_STORY_SAFE/PUBLIC guidance (cluster 4 career/marketing claims and cluster 12 public product material). Claim-level tags do not approve an entire mixed document. All intake documents, mixed founder-history files, medical narratives, applications, and uncertain/proprietary technical sources are excluded in full. No intake paragraph is salvaged. The old Administrator acceptance passage is intentionally removed; retained career framing is tested as historical marketing text, without inferring an employment claim.

Existing contact/identifier and fail-closed proper-noun redaction remain as the second layer. The framework's methodology-author and conditional-prospect names are redacted. Public company/product/place terms remain; no third-party person names remain. Historical goals, dates, template examples, prices and marketing estimates are not asserted as current capabilities or verified customer outcomes.

The allow-list has pinned original and reviewed output SHA-256 digests in `admission.json`. The builder reads exactly these paths and fails on changed inputs or outputs; it never scans a directory. Runtime admission checks the same source/output digest pairs, so changing a file and rewriting its manifest hashes cannot introduce new evidence. The shipped layout is `approved/SOURCES.tsv` and `approved/redacted/`; no intake tree remains.

**Final counts: 2 documents, 79 paragraph occurrences, 72 distinct paragraphs.** `BUILD_REPORT.json` records the counts and allow-list-only rule.

Validation of the prepared round-four tree:

- Full repository suite: **4,571 passed, 0 failed, 0 skipped**.
- Focused founder/bundle/retrieval/citation acceptance: **180 passed**.
- Allow-list and retained identifier/name-redaction properties: **8 passed**, including 1,900 identifier combinations and generated unknown-name/Unicode forms.
- Independent direct-disk sweep covers all 79 paragraph occurrences: no medication, surgery, diagnosis, appointment, leave, therapy, prescription, hospital, doctor, symptom, recovery, patient, DOB or MRN terms; no contact/identifier patterns or unapproved capitalized names. Both whole source documents were read for personal-name review; the automated sweeps cover every redacted output paragraph.
- Exact evidence-missing refusals (`grounded:false`, `sources:[]`) for `founder-fact-32746c8a53cc5412546797cc81334179`, `founder-fact-2dbca2eb52bcbaf350700793a08a2ac9`, `founder-fact-52342c2e80ed887607b815d06695054e`, and `founder-fact-cf8b47f380c5ec3adc5aa22bcdee1afa`, with and without the trailing period. These cover all four medical-related paragraphs identified in the round-three bundle. Prior AMCAS/patient fact IDs and AMCAS/patient-name questions also refuse.
- Retrieval property covers every remaining file paragraph and both supported question forms, exact answer/citation membership, perturbation refusals, and revocation on deletion, corruption, edits, rehashed edits, holds and symlinks. Unlisted but internally consistent documents and intake relocation are rejected.
- Independent rebuild is byte-for-byte identical. Adding both an intake file and an unlisted professional file changes no output bytes. Editing an allow-listed source fails before writing output.
- TypeScript, targeted ESLint, and diff whitespace checks pass. The full-suite environment required generating Prisma Client and copying the existing cached query engine into the local dependency directory; the final suite above passed after that setup.

Runner handoff: this is prepared on assigned branch `codex/r4-526-founder-bundle-allowlist`. The supplied Git HEAD was `f8fb7ac`; files from requested round-three head `a2a40c479d1887c46ecd773cb4d22849efae69f5` were applied before the scope cut. No commit, push, deploy or merge was performed. Keep one draft PR and do not merge. Existing draft #526 still has the round-three remote head until the runner publishes the prepared changes; validation counts above describe the local round-four tree.

PR metadata update was attempted after verification. The GitHub connector rejected it because the action requires approval and this session has approval policy `never`. Apply this body during runner publication; draft #526 remains open and unmerged with its previous remote title/body/head.
