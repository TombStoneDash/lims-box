# LIMS BOT founder question routing

This is the contract for questions that mention the founder. The executable eval set is
`tests/bot-founder-corpus.test.ts` (`intentCases` plus the fail-closed and compliance tests). Change
this document and that table together.

## Why it exists

PR #512 went through five review rounds where each fix to one phrasing broke another. The routing
was a growing list of regular expressions with no written rule. The rules below are what the code
implements; the eval table holds every phrasing a review has used.

## Rules, in order

0. **Requests to the bot are unwrapped first.** "Could you tell me who ...", "Do you know who ...",
   "Do you have any info on ..." are judged by the question inside them.
1. **Current product questions win.** A question is about the product today when it asks what
   LIMS BOX does, includes, supports, costs or makes available, or when it is a present-tense
   yes/no question (or a "how ...", "if/whether ..." clause) whose subject is not the founder, whatever
   its verb: "Is phone support offered?", "Can samples be tracked?", "Is chain of custody handled?".
   Questions about the founder use the founder as subject ("Does the founder have ...", "Is Hudson
   ...") or the past tense ("Has Hudson worked ...", "Did the founder train ..."). A founder mention
   only makes a product question `mixed`, and `mixed` is answered from the product FAQ with the
   founder words removed. Historical founder excerpts never answer a current product question.
2. **Product compliance always takes the product path.** Questions about CLIA, HIPAA, FDA, ISO 15189,
   Part 11 or regulations must lead with the locked compliance positioning sentence, which only the
   product path gives. A founder mention makes them `mixed`. A person's own certifications ("Was
   Hudson certified as a water specialist?") are background, not product compliance.
3. **Reaching the founder is a contact request.** Talk, speak, meet, book a meeting, get in touch,
   reach, email or call the founder returns the talk-to-a-person FAQ, not the bio. A question about
   the founder's past that happens to contain one of these words ("Has the founder worked with call
   centers?") stays a founder question.
4. **Founder questions are split into frame words and a topic.** Frame words name the founder (every
   published form: founder, Hudson, Hud, Taylor, John, Mr.), ask for identity (who built, behind,
   name, bio, introduce) or ask for general background (experience, background, career, prior, has,
   was). Whatever is left is the topic.
5. **No topic means the published bio.** Identity and general background questions get the
   `founder-bio` entry, cited to `/about`, where the same text is published. Examples: "Who is
   Hudson Taylor?", "founder bio", "What is the founder's background?".
6. **A topic needs a history question.** If the question does not ask about the founder's past
   (experience, background, prior, worked, trained, did, has, was ...), the bot says it has no
   approved material. Example: "What does Hudson think about competitors?".
7. **Archive excerpts are scored on the topic only.** Founder and history words never count toward
   an excerpt's score, so they cannot make an unrelated excerpt qualify. Topic words are lightly
   stemmed ("configuring" finds the configuration excerpt). An excerpt needs the normal minimum
   score (one keyword hit).
8. **The bio covers topics it states.** If no excerpt qualifies but the bio states the topic
   (water, public health, labs, education, a degree, certifications), the bio answers. Otherwise the
   bot says it has no approved material.

## What this does not change

- The archive loader, admission rules and public citation pages are unchanged.
- Without `LIMS_FOUNDER_KNOWLEDGE_DIR`, archive topics fail closed; identity and bio answers still
  work because the bio is public `/about` text.
