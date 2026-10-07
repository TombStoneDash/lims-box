Draft PR title: Fix symlinked founder bundle roots and expose read-only diagnostics

A deployment whose `knowledge/founder` root is a symlink silently loses its founder facts. Resolve the configured root once and allow that deployment-level link, while preserving all checks against links inside the bundle, path escapes, oversized/nonregular files, invalid metadata, unapproved sources, and altered content.

Add one structured error line per Node process on the first load failure, containing the root, failing relative file, exception name, and a controlled reason. Arbitrary exception messages and document content are excluded. `GET /api/health` now includes `founderBundle: {root, exists, manifestRows, sourcesRows, documents, error}` and traces the founder files into its deployment. Counts reflect parsed metadata and admitted documents; errors describe the first failure in that read. Health remains HTTP 200 with no-store headers; HEAD remains bodyless. Reads are not cached, so revocation and recovery remain immediate.

The baseline already canonicalized the root but rejected root symlinks before doing so. Direct comparison confirms 72 facts through a real root, zero through a symlink on the baseline, and 72 through the same symlink after this change.

The reported `What is the LIMS BOX 7-11-4 framework?` question is separately excluded by the existing founder routing gate: it returns null before reading the bundle. This PR preserves that routing policy and verifies retrieval using a supported founder-fact question.

Validation:
- 253 relevant tests passed, including symlinked roots/ancestors from a different cwd, internal-link rejection, health shape and content exclusion, corrupt/missing metadata, once-per-process logging, and recovery.
- TypeScript checking and targeted ESLint passed.
- Baseline and fixed clean-copy production builds passed. The fixed compiled health and assistant handlers passed from the separate symlinked `var/task` layout: 3 manifest rows, 2 source rows, 2 documents, no error, and a grounded founder-fact response. `next start` was attempted and rejected by the sandbox before listening.
- Production-layout reproduction script: `node scripts/diagnostics/founder-production-layout.mjs`; add `--baseline` to build the HEAD loader and health route. It builds a clean source copy, starts from a separate `var/task` directory with a symlinked founder bundle, and checks health, founder retrieval, and failure logging. It also invokes the compiled handlers before attempting the listener for environments that restrict sockets.

Execution constraints: localhost listeners are prohibited by this sandbox (`listen EPERM`). GitHub API access also failed. Full HTTP verification and creation of the single draft PR must be completed by the runner. No commit, push, or merge was performed.
