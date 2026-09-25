export type OHWorksAssistantMode = 'expert' | 'discovery';

export type OHWorksAssistantDisposition = 'grounded' | 'refused' | 'evidence_missing' | 'render_blocked';

export interface OHWorksAssistantCitation {
  sourceId: string;
  recordId: string;
  corpusVersion: string;
}

export interface OHWorksAssistantReply {
  answer: string;
  grounded: boolean;
  mode: OHWorksAssistantMode;
  citations: OHWorksAssistantCitation[];
  label: string;
  disposition: OHWorksAssistantDisposition;
  refusalReason?: string;
  matchedClaimCategory?: string;
}

export const ASSISTANT_UNAVAILABLE_TEXT =
  'The local synthetic assistant is unavailable. No result or integration action was attempted.';

const DISPOSITIONS = new Set(['grounded', 'refused', 'evidence_missing', 'render_blocked']);
const MODES = new Set(['expert', 'discovery']);

function parseCitation(value: unknown): OHWorksAssistantCitation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.sourceId !== 'string' ||
    typeof candidate.recordId !== 'string' ||
    typeof candidate.corpusVersion !== 'string'
  ) {
    return null;
  }
  return {
    sourceId: candidate.sourceId,
    recordId: candidate.recordId,
    corpusVersion: candidate.corpusVersion,
  };
}

export function parseAssistantReply(payload: unknown): OHWorksAssistantReply | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.answer !== 'string' || candidate.answer.length === 0) return null;
  if (typeof candidate.grounded !== 'boolean') return null;
  if (typeof candidate.mode !== 'string' || !MODES.has(candidate.mode)) return null;
  if (typeof candidate.label !== 'string') return null;
  if (typeof candidate.disposition !== 'string' || !DISPOSITIONS.has(candidate.disposition)) return null;
  if (!Array.isArray(candidate.citations)) return null;

  const citations: OHWorksAssistantCitation[] = [];
  for (const item of candidate.citations) {
    const citation = parseCitation(item);
    if (!citation) return null;
    citations.push(citation);
  }

  const reply: OHWorksAssistantReply = {
    answer: candidate.answer,
    grounded: candidate.grounded,
    mode: candidate.mode as OHWorksAssistantMode,
    citations,
    label: candidate.label,
    disposition: candidate.disposition as OHWorksAssistantDisposition,
  };

  if (typeof candidate.refusalReason === 'string') {
    reply.refusalReason = candidate.refusalReason;
  }
  if (typeof candidate.matchedClaimCategory === 'string') {
    reply.matchedClaimCategory = candidate.matchedClaimCategory;
  }

  return reply;
}
