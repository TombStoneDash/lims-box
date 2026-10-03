// LIMS BOT front door (lims-knowledge 30_LIMS_BOT/LIMS_BOT_FRONT_DOOR_SPEC_v1.md,
// build order steps 1 and 3): "Click to try" capability cards and `?bot=`
// deep links that open /bot with a question pre-filled.
//
// Card questions must stay answerable from the published corpus; the tests
// check each one returns a grounded, cited answer.

export const BOT_PROMPT_PARAM = 'bot';

// Same limit as the engine's MAX_QUESTION_LENGTH (a test keeps them equal).
// Not imported, so client components do not bundle the corpus.
export const MAX_PROMPT_LENGTH = 500;

export interface CapabilityCard {
  category: string;
  question: string;
}

export const CAPABILITY_CARDS: CapabilityCard[] = [
  { category: 'Instrument answers', question: 'Which instruments does LIMS BOX connect to?' },
  { category: 'Survey readiness', question: 'What is the personnel pack?' },
  { category: 'Paper to system', question: 'We are on paper and spreadsheets. Can you migrate our existing data?' },
  { category: 'Straight talk', question: 'Is LIMS BOX CLIA certified?' },
];

// Reads the pre-filled question from a URL query string. Returns null when the
// parameter is missing or blank. Control characters are dropped and the result
// is capped at the chat input's limit, so a link can never exceed what a
// visitor could type.
export function readBotPrompt(search: string): string | null {
  const raw = new URLSearchParams(search).get(BOT_PROMPT_PARAM);
  if (!raw) return null;
  const prompt = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return prompt ? prompt.slice(0, MAX_PROMPT_LENGTH) : null;
}

export function botHref(prompt: string): string {
  return `/bot?${new URLSearchParams({ [BOT_PROMPT_PARAM]: prompt }).toString()}`;
}
