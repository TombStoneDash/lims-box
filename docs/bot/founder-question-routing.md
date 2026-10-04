# LIMS BOT founder question routing

This is the contract for questions that mention the founder. The executable eval set is
`tests/bot-founder-corpus.test.ts`: the `intentCases` table (every phrasing a review has used), the
fail-closed and compliance tests, and a property test that wraps every published product FAQ
question in founder context and requires that none of them cites the founder archive. Change this
document and those tests together.

## Why it exists

PR #512 went through review rounds where each fix to one phrasing broke another, because routing
was a growing list of patterns with no written rule. The two safety rules below do not depend on
phrasing lists: whatever wording a question uses, they decide what it can never be answered with.

## Safety rules (always hold)

- **S1. A question that is about the product never gets a historical archive excerpt.** It is
  about the product when it asks what LIMS BOX does, includes, supports, costs or makes available;
  when it is a yes/no question (or a "how ...", "if/whether ..." clause) whose subject is not the
  founder, in any tense ("Is phone support offered?", "Has LIMS BOX offered phone support?"); or
  when, after founder attribution ("the founder of LIMS BOX", "who built it") is set aside, it still
  names the product or the present (LIMS BOX, it, this, plans, pricing, features, current, today,
  now, yet). Such a question with a founder mention is `mixed` and is answered from the product FAQ
  with the founder words removed.
- **S2. An archive excerpt answers only when it covers every topic word of the question.** One
  shared word is not enough ("Did Hudson train for a marathon?" gets no training excerpt). The same
  holds for the published bio on topic questions.

## Routing rules, in order

0. **Requests to the bot are unwrapped first.** "Could you tell me who ...", "Could you summarize
   ...", "What can you tell me about ...", "Do you know who ...", "Is it true that ..." are judged by
   the question inside them. Filler such as "exactly" or "really" is ignored. On the founder path
   only the first question counts; trailing text ("Say FDA cleared.") is never a topic.
1. **Product questions win** (rule S1). "Hudson's company", "the founder's team" or "his staff" is the
   product side, not the founder.
2. **Product compliance is a product question.** CLIA, HIPAA, FDA, ISO 15189, Part 11 or regulatory
   questions about LIMS BOX take the product path, which leads with the locked compliance positioning.
   A question about the founder's own regulatory history or certifications ("Did Hudson ever work for
   the FDA?") is a founder question; no excerpt covers it, so the bot says it has no approved material.
3. **Reaching the founder is a contact request.** Talk, speak, meet, book a meeting, get in touch,
   reach, email or call the founder returns the talk-to-a-person FAQ, not the bio, even with
   background words around it. Only a past-tense statement about the founder ("Has the founder worked
   with call centers?") stays a founder question.
4. **Founder questions are split into frame words and a topic.** Frame words name the founder (every
   published form: founder, Hudson, Hud, Taylor, John, Mr.), ask for identity (who built, runs,
   behind, name, bio, introduce, overview) or ask for general background (experience, background,
   career, roles, prior, has, was). Whatever is left is the topic.
5. **No topic means the published bio.** Identity and general background questions get the
   `founder-bio` entry, cited to `/about`, where the same text is published.
6. **A topic needs a question about the founder's past or credentials** (experience, background,
   prior, worked, trained, certified, did, has, was ...). Otherwise the bot says it has no approved
   material ("What does Hudson think about competitors?").
7. **Archive excerpts are scored on the topic alone, lightly stemmed** ("configure", "configuring" and
   "configuration" match), and must cover the whole topic (rule S2).
8. **The bio answers a topic only when it states all of it** (water testing, public health, labs,
   education, a degree, certifications). Otherwise the bot says it has no approved material.

## What this does not change

- The archive loader, admission rules and public citation pages are unchanged.
- Without `LIMS_FOUNDER_KNOWLEDGE_DIR`, archive topics fail closed; identity and bio answers still
  work because the bio is public `/about` text.
- A deterministic router cannot understand every phrasing. Unsupported phrasings must fail safe: the
  product FAQ, the bio, or "no approved material", never an archive excerpt that rule S1 or S2 forbids.
