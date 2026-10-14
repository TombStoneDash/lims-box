const FALLBACK = 'The local demo could not answer. Try again.';

function isLocalPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') &&
    !value.startsWith('//') && !/[\\\x00-\x20\x7f]/.test(value);
}

export function replyText(
  ok: boolean,
  body: unknown,
): { text: string; sources: { title: string; path: string }[] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { text: FALLBACK, sources: [] };
  }

  const data = body as Record<string, unknown>;
  if (typeof data.error === 'string' && data.error.trim()) {
    return { text: data.error, sources: [] };
  }
  if (!ok || typeof data.answer !== 'string' || !data.answer.trim()) {
    return { text: FALLBACK, sources: [] };
  }

  const sources: { title: string; path: string }[] = [];
  if (Array.isArray(data.sources)) {
    for (const source of data.sources) {
      if (
        source && typeof source === 'object' && !Array.isArray(source) &&
        typeof source.title === 'string' && source.title.trim() &&
        isLocalPath(source.path)
      ) {
        sources.push({ title: source.title, path: source.path });
      }
    }
  }
  return { text: data.answer, sources };
}
