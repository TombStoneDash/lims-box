Draft PR title: Restore readable founder career evidence and cited career answers

Replace the two over-redacted sources with `docs/founder/FOUNDER_STORY.md`, the factual career material from sections 1–4 of the approved FOUNDER_STORY_SAFE narrative. Remove editorial notes, verification columns, unsupported claims, and disputed figures; retain attribution for self-reported experience. The allow-list now contains only that document, and the rebuilt bundle contains one document with 26 complete, distinct paragraphs.

Preserve proper nouns only for this exact, hash-locked document while retaining identifier/contact redaction and all runtime integrity checks. Preserve numbered Markdown headings instead of mistaking them for single-hash identifier labels. Remove the stale bundled files completely.

Both the chat (`/api/bot`) and demo assistant (`/api/demo/assistant`) now answer the three reviewed natural-language career questions with complete admitted passages and working fact citations. Matching remains bounded to whole questions, so appended instructions, private-data questions, and revoked fact IDs still refuse. Other documents retain the existing proper-noun redaction policy.

Validation:
- `npm run test:all`: 4,573 passed, zero failures.
- Founder suite plus career acceptance: 184 passed; after adding chat-endpoint wiring, the three career acceptance tests passed again against both endpoints and rendered citations.
- Allow-list and redaction suite: 10 passed, including contact/identifier redaction under the story exception and default proper-noun redaction for other paths.
- The disk sweep passed for personal-health terms, identifiers, emails, phones, and addresses. Previous leak queries and revoked fact IDs still refuse.
- `npm run typecheck`, targeted ESLint, `npm run build`, and `git diff --check` passed.
- Rebuilding from the repository into a fresh directory reproduced every shipped bundle file byte-for-byte. The reviewed story also survives processing byte-for-byte.

Test setup: reused local dependencies with a byte-identical package lock and Prisma schema after the first dependency directory proved to lack its generated Prisma client. The final full-suite run has no skips or failures.

Runner handoff: create exactly one draft PR from `codex/r5-founder-bundle-career-story`; do not merge. Changes are intentionally uncommitted and unpushed, as requested. The GitHub draft PR cannot contain these changes until the runner commits and pushes this branch.
