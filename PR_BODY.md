Round four replaces content-based admission with a default-deny document allow-list. Round three still exposed founder medical details through grounded fact retrieval.

**Rule: the bundle is built ONLY from an explicit allow-list of source documents committed at scripts/founder-bundle/ALLOWLIST.txt, and the entire 15_HT_FOUNDER_INTAKE folder plus anything not on the list is excluded.** Identifier and proper-noun redaction remain a second layer. Whole-document professional/career/company review is required; FOUNDER_STORY_SAFE and PUBLIC tags guide that review but never automatically admit a source.

Status: BLOCKED on source selection. The requested /Users/ops/Hermes/planning/LIMS_LEGACY_MINING_20260711/LEGACY_LIMS_EVIDENCE_LIBRARY.md and non-intake source documents are not in this repository or its available Git history. Repository-only scope was preserved; no source, tag, or approval was invented. The allow-list is deliberately empty. This is not ready to merge or deploy.

Current shipped counts: **0 documents; 0 paragraph occurrences; 0 distinct paragraphs/facts.** These counts are verified against BUILD_REPORT.json and disk. The nonempty career/employment acceptance remains blocked; empty-set retrieval and privacy sweeps are not evidence of a useful corpus.

Implementation:
- Build iterates only exact allow-listed paths with pinned original and redacted SHA-256 hashes. It rejects intake paths, traversal, duplicate entries, changed bytes, and stale output directories.
- Runtime independently requires the repository allow-list even for environment overrides; self-authored bundle metadata cannot grant admission. The intake schema is no longer accepted.
- All 48 round-three intake documents are excluded; no paragraphs are salvaged. New output uses 16_FOUNDER_PUBLIC. Next.js traces the policy with the bundle.
- Existing identifier/proper-noun redaction is retained, with an independent disk sweep for every requested health term and unapproved capitalization. No private values are logged by the regression checks.

Verification (local Windows host):
- Focused founder/policy/redaction/source-registry suites: 202 passed, 0 failed, 2 skipped. Skips: Windows EPERM creating a file symlink; nonempty employment acceptance blocked on source material.
- The supplied founder-fact-32746c8a53cc5412546797cc81334179, all additional prior medical/appointment matches (2dbca2eb52bcbaf350700793a08a2ac9, 52342c2e80ed887607b815d06695054e, cf8b47f380c5ec3adc5aa22bcdee1afa), prior application/patient fact IDs, and AMCAS/patient-name questions return the exact refusal, grounded:false, and no sources.
- Synthetic positive retrieval property: 3 explicitly allow-listed files, 4 distinct paragraphs; exact API passages/citations and next-request revocation pass. The real shipped inventory remains empty.
- npm run test:bot: 50 passed, 0 failed.
- npm run typecheck: passed after local Prisma client generation (no database action).
- git diff --check: passed.

Reproduce from the repository root (use repository-local TEMP/TMP on this host):

    node --import tsx --test tests/bot-founder-bundle.test.ts tests/bot-founder-loader.test.ts tests/bot-founder-corpus.test.ts tests/bot/source-registry.test.ts scripts/founder-bundle/redaction.test.mjs scripts/founder-bundle/allowlist.test.mjs scripts/founder-bundle/employment-acceptance.test.ts
    npm run test:bot
    npm run typecheck
    git diff --check

Runner handoff: use this body for ONE draft PR; do not merge. Changes remain uncommitted on codex-lenovo/r4-526-founder-bundle-allowlist. HEAD remains f8fb7ac658cdb762769a07094620042113c1274d (main base); relevant round-three code was populated from origin/codex/r3-525-founder-bundle-names at a2a40c4 without changing shared Git metadata. No commit, push, PR publication, merge, or deployment was performed. Provide the tagged evidence library and non-intake source documents inside this repository, review full documents, populate the allow-list, rebuild, rerun all checks, and update these counts before considering completion.

Rollback: discard only this task's working-tree changes or revert the runner's eventual task commit. No live state changed. Terminal receipt: docs/worker-results/r4-526-founder-bundle-allowlist.json (repository-local handoff because no writable canonical host-results directory is configured in scope).
