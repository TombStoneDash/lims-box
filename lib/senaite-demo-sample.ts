export function resolveDemoSampleId(raw: string | undefined | null, knownId: string): string | null {
  if (raw == null) return null;

  try {
    return decodeURIComponent(raw).trim().toLowerCase() === knownId.toLowerCase()
      ? knownId
      : null;
  } catch {
    return null;
  }
}

export function resultFlagTone(flag: string): 'ok' | 'attention' | 'neutral' {
  const normalized = flag.trim().toLowerCase();
  // Match low at a word boundary so the reassuring "below" is not an alert.
  if (/above|exceed|high|\blow|out of range|critical|fail/.test(normalized)) {
    return 'attention';
  }
  if (normalized.startsWith('below') || /^(in range|normal|pass)$/.test(normalized)) {
    return 'ok';
  }
  return 'neutral';
}

export const RESULT_FLAG_TONE_CLASS: Record<'ok' | 'attention' | 'neutral', string> = {
  ok: 'bg-green-100 text-green-700',
  attention: 'bg-red-100 text-red-800',
  neutral: 'bg-slate-100 text-slate-700',
};
