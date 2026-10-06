# LIMS BOT founder question routing

This is the `/api/bot` contract for questions that mention the founder.
The separate `/api/demo/assistant` named-fact contract is documented in
[`FOUNDER_KNOWLEDGE_LOADER_SPEC.md`](../FOUNDER_KNOWLEDGE_LOADER_SPEC.md). The executable eval set is
`tests/bot-founder-corpus.test.ts`: the `intentCases` table (every phrasing a review has used), the
fail-closed, compliance and product-path tests, and a property test that wraps every published
product FAQ question in founder context and requires that none of them cites the founder archive.
Change this document and those tests together.

## Scope of this change

- **Founder questions are answered from the published bio only.** The `founder-bio` entry is the
  same text as the public `/about` page and is cited to `/about`.
- **The founder archive does not answer questions yet.** The loader, its admission rules and the
  public excerpt citation pages ship and stay tested, but the bot does not answer from archive
  excerpts. Nine review rounds showed that keyword routing over private career excerpts keeps
  finding wordings where an excerpt answers a question it does not support. Archive answers need
  their own reviewed design and deployment wiring (`LIMS_FOUNDER_KNOWLEDGE_DIR` has none today), in
  a separate change.
- **The bio never answers a product or organization question.** It is excluded from product FAQ
  ranking, where its "five hospitals, ten labs" line would read as a customer claim, and a founder
  question that mentions a company, team, staff, startup, business, product, customers or clients
  ("Has Hudson Taylor's own company worked with public health labs?") takes the product path.
  Identity phrasing ("Who started this company?", "Whose company is LIMS BOX?") still gets the bio.

## Routing rules, in order

0. **Requests to the bot are unwrapped first.** "Could you tell me who ...", "Could you summarize
   ...", "What can you tell me about ...", "Do you know who ...", "Is it true that ..." are judged by
   the question inside them. Filler such as "exactly" or "really" is ignored. On the founder path
   only the first question counts.
1. **Product questions win.** A question is about the product when it asks what LIMS BOX does,
   includes, supports, costs or makes available; when it is a yes/no question (or a "how ...",
   "if/whether ..." clause) whose subject is not the founder, in any tense, including after a
   leading phrase or an earlier sentence ("With Hudson's experience can instruments import CSV
   files?"); or when, after founder attribution is set aside, it still names the product or the
   present. "Hudson's company", "his team" or "Hudson's LIMS" is the product side. A product question
   with a founder mention is `mixed` and is answered from the product FAQ with the founder words
   removed.
2. **Product compliance is a product question** and leads with the locked compliance positioning. A
   question about the founder's own regulatory history ("Did Hudson ever work for the FDA?") is a
   founder question; the bio does not state it, so the bot says it has no approved material.
3. **Reaching the founder is a contact request** and gets the talk-to-a-person FAQ, unless it is a
   past-tense statement about the founder ("Has the founder worked with call centers?").
4. **Founder questions are split into frame words and a topic.** Frame words name the founder (every
   published form: founder, Hudson, Hud, Taylor, John, Mr.), ask for identity (who built, runs,
   behind, name, bio, introduce, overview, "which person founded LIMS BOX", "whose idea") or ask for
   general background (experience, background, career, roles, prior, has, was).
5. **No topic means the bio.** Identity and general background questions get the bio.
6. **A topic needs a question about the founder's past or credentials**, and the bio must state all
   of it (water testing, public health, labs, education, a degree, certifications). Quantifiers and
   negation (every, all, only, not, "didn't") are never covered. Otherwise the bot says it has no
   approved material.

## Known limits (safe by design)

- Founder history topics the bio does not state ("What configuration experience does the founder
  have?") get the no-approved-material answer until archive answers have their own design.
- A historical question whose subject is not the founder is treated as a product question.
- Wordings the router does not recognize fall to the product FAQ ranking every LIMS BOT question
  already uses, which never includes the bio or the archive.
