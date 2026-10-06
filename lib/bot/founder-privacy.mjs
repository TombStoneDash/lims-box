import { FOUNDER_NAME_ALLOWLIST } from './founder-name-allowlist.mjs';

// Compatibility forms (including fullwidth/math letters), decomposed accents,
// and invisible format controls must not create a bypass between letters.
export const normalizeFounderText = (text) => text.normalize('NFKC').replace(/\p{Cf}/gu, '').normalize('NFC');

// Run on the original document BEFORE identifier/name replacement. Deliberately
// excludes even resumes mentioning patients: there is no paragraph salvage.
export function containsClinicalContent(text) {
  return /(?<!\p{L})(?:patients?|diagnos(?:is|es|ed)|d\.?o\.?b\.?|m\.?r\.?n\.?|date[\s_-]+of[\s_-]+birth|medical[\s_-]+record[\s_-]+(?:number|no|id)|clinical[\s_-]+cases?|specimen[\s_-]+results?)(?!\p{L})/iu.test(normalizeFounderText(text));
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exceptions = FOUNDER_NAME_ALLOWLIST.slice().sort((a, b) => b.length - a.length)
  .map((value) => escape(value).replace(/ /g, '[ \\t]+')).join('|');
// Complete lexical boundaries only. An allow-listed prefix in an unknown name
// never grants an exception to the remaining token(s).
const allowed = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${exceptions})(?:['’]s)?(?![\\p{L}\\p{M}\\p{N}_])`, 'giu');
const words = /[\p{L}\p{M}\p{N}_]+(?:['’\-][\p{L}\p{M}\p{N}_]+)*/gu;
const redactUnapproved = (text) => text.replace(words, (word) => /[\p{Lu}\p{Lt}]/u.test(word) ? '[name]' : word);

export function redactFounderNames(input) {
  const text = normalizeFounderText(input);
  let result = '';
  let end = 0;
  for (const match of text.matchAll(allowed)) {
    result += redactUnapproved(text.slice(end, match.index)) + match[0];
    end = match.index + match[0].length;
  }
  return result + redactUnapproved(text.slice(end));
}
