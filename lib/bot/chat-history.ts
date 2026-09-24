export interface BotSource {
  title: string;
  path: string;
}

export interface ChatItem {
  role: 'user' | 'bot';
  text: string;
  sources?: BotSource[];
  followUp?: { label: string; path: string };
  suggestions?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocalPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') &&
    !value.startsWith('//') && !/[\\\u0000-\u0020\u007f]/.test(value);
}

function normalizeHistory(value: unknown): ChatItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-30).flatMap((entry): ChatItem[] => {
    if (!isRecord(entry) || (entry.role !== 'user' && entry.role !== 'bot') ||
      typeof entry.text !== 'string') return [];

    const item: ChatItem = { role: entry.role, text: entry.text.slice(0, 4000) };
    if (Array.isArray(entry.sources)) {
      const sources = entry.sources.flatMap((source): BotSource[] =>
        isRecord(source) && typeof source.title === 'string' && isLocalPath(source.path)
          ? [{ title: source.title, path: source.path }] : []);
      if (sources.length) item.sources = sources;
    }
    if (isRecord(entry.followUp) && typeof entry.followUp.label === 'string' &&
      isLocalPath(entry.followUp.path)) {
      item.followUp = { label: entry.followUp.label, path: entry.followUp.path };
    }
    if (Array.isArray(entry.suggestions) &&
      entry.suggestions.every((suggestion) => typeof suggestion === 'string')) {
      item.suggestions = [...entry.suggestions];
    }
    return [item];
  });
}

export function serializeHistory(items: readonly ChatItem[]): string {
  return JSON.stringify(normalizeHistory(items));
}

export function parseHistory(raw: string | null): ChatItem[] {
  if (typeof raw !== 'string') return [];
  try {
    return normalizeHistory(JSON.parse(raw));
  } catch {
    return [];
  }
}
