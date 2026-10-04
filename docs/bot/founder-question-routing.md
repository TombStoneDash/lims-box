# LIMS BOT founder question routing

This is the contract for questions that mention the founder. The executable eval set is
`tests/bot-founder-corpus.test.ts` (`intentCases` plus the fail-closed and compliance tests). Change
this document and that table together.

## Why it exists

PR #512 went through five review rounds where each fix to one phrasing broke another. The routing
was a growing list of regular expressions with no written rule. The rules below are what the code
implements; the eval table holds every phrasing a review has used.

## Rules, in order

1. **Current product questions win.** If a question asks what LIMS BOX does, includes, supports,
   costs or makes available (active or passive voice), it is a product question. A founder mention
   only makes it `mixed`, and `mixed` is answered from the product FAQ with the founder words removed.
   Historical founder excerpts never answer a current product question.
2. **Compliance questions always take the product path.** They must lead with the locked compliance
   positioning sentence, which only the product path gives. A founder mention makes them `mixed`.
3. **Reaching the founder is a contact request.** "Can I meet Hudson?", "How can I reach the
   founder?" return the talk-to-a-person FAQ, not the bio. A question about the founder's past that
   happens to contain "call" ("Has the founder worked with call centers?") stays a founder question.
4. **Founder questions are split into frame words and a topic.** Frame words name the founder (every
   published form: founder, Hudson, Hud, Taylor, John, Mr.), ask for identity (who built, behind,
   name, bio) or ask for general background (experience, background, career, has, was).
   Whatever is left is the topic.
5. **No topic means the published bio.** Identity and general background questions get the
   `founder-bio` entry, cited to `/about`, where the same text is published. Examples: "Who is
   Hudson Taylor?", "founder bio", "What is the founder's background?".
6. **A topic needs a history question.** If the question does not ask about the founder's past
   (experience, background, worked, trained, did, has, was ...), the bot says it has no approved
   material. Example: "What does Hudson think about competitors?".
7. **Archive excerpts are scored on the topic only.** Founder and history words never count toward
   an excerpt's score, so they cannot make an unrelated excerpt qualify. An excerpt needs the
   normal minimum score (one keyword hit).
8. **The bio covers topics it states.** If no excerpt qualifies but the bio states the topic
   (water, public health, labs, education, a degree), the bio answers. Otherwise the bot says it
   has no approved material.

## What this does not change

- The archive loader, admission rules and public citation pages are unchanged.
- Without `LIMS_FOUNDER_KNOWLEDGE_DIR`, archive topics fail closed; identity and bio answers still
  work because the bio is public `/about` text.
