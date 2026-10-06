# Founder knowledge loader — round four scope cut

Only documents explicitly approved in scripts/founder-bundle/ALLOWLIST.txt may
enter knowledge/founder. The entire 15_HT_FOUNDER_INTAKE folder and all unlisted
documents are excluded, regardless of candidate status or apparent safe content.
See scripts/founder-bundle/README.md for the reviewed-path/hash format and build.

Runtime admission requires the repository policy, exact redacted output hash,
manifest integrity, a unique integrated source mapping, and bounded regular
files without symlinks. The new bundle uses 16_FOUNDER_PUBLIC/SOURCES.tsv and
16_FOUNDER_PUBLIC/redacted/<source-sha256>.txt. The old intake schema is rejected.
An environment override can change the bundle location, never its admission
policy. Missing or invalid policy fails closed. Identifiers and proper nouns are
still redacted as a second layer; content filtering cannot admit a document.

Whole blank-line-delimited paragraphs retain their fact identities and exact
retrieval/citation behavior. Unknown facts return EVIDENCE_MISSING_ANSWER,
grounded:false, and no citations. Removed evidence revokes citations on the
next request. Private source filenames and hashes never appear in answers.

Current status: BLOCKED on missing tagged non-intake evidence sources; shipped
inventory is 0 documents / 0 paragraphs. Synthetic retrieval coverage does not
establish a useful production corpus. No merge or deployment is authorized.
