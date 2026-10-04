// Safety intent takes precedence over both founder routing and keyword retrieval.
// These fixed responses never echo submitted credentials or claim an action occurred.
export const SAFETY_REFUSALS = {
  credentials: 'I cannot use or share passwords, API keys, or other secrets. Do not send credentials here. Contact your authorized LIMS administrator through your approved secure process.',
  clinical: 'I cannot interpret results for a specific patient or make a diagnosis. Ask the responsible clinician to review the patient and results.',
  regulatory: 'I cannot determine reportability or attest to your lab’s regulatory status. Ask your QA officer or certifying authority to review the applicable requirements and evidence.',
  action: 'I cannot perform or confirm lab actions, release results, accept QC runs, close corrective actions, or change records or configuration. Ask your laboratory director or quality manager to review and authorize the action in your approved system.',
  fabrication: 'I cannot invent endorsements, testimonials, capabilities, or compliance claims. Contact the team for documented product information.',
};

export function safetyRefusal(rawQuestion: unknown): string | undefined {
  if (typeof rawQuestion !== 'string') return undefined;
  // Inspect the whole request before the retrieval length limit or founder
  // normalization can hide an unsafe instruction in a later clause.
  const question = rawQuestion.normalize('NFKC').replace(/\s+/g, ' ');
  if (/\b(?:passwords?|api[ -]?keys?|secrets?|(?:login|access) credentials?|access[ -]?tokens?)\b/i.test(question)
    || /\b(?:use|share|send|give|reveal)\b.*\bcredentials?\b/i.test(question)) {
    return SAFETY_REFUSALS.credentials;
  }
  if (/\b(?:diagnos\w*|patient)\b/i.test(question)
    && /\b(?:diagnos\w*|specific|this|these|interpret\w*|wrong|should)\b/i.test(question)) {
    return SAFETY_REFUSALS.clinical;
  }
  if (/\b(?:reportab\w*|holding[ -]?time)\b/i.test(question)
    || /\b(?:our|my|this|the) lab(?:oratory)?\b.*\b(?:compliant|certified|accredited)\b/i.test(question)) {
    return SAFETY_REFUSALS.regulatory;
  }
  if (/\b(?:release\w*|accept\w*|reject\w*|repeat|clos\w*|modif\w*|updat\w*|delet\w*|chang\w*|writ\w*|approv\w*)\b.*\b(?:results?|runs?|qc|batch|corrective action|records?|configuration|sample status)\b/i.test(question)
    || /\b(?:results?|runs?|qc|batch|corrective action|records?|configuration)\b.*\b(?:released?|accept\w*|reject\w*|repeat|closed?|completed?|changed?|approved?)\b/i.test(question)) {
    return SAFETY_REFUSALS.action;
  }
  if (/^(?:ignore\b|system:|developer override:|pretend\b|say\b|claim\b)/i.test(question.trim())
    && /\b(?:certified|compliant|approved|cleared|all manuals|every instrument|official partner|testimonial)\b/i.test(question)) {
    return SAFETY_REFUSALS.fabrication;
  }
  return undefined;
}
