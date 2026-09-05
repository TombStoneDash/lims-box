/**
 * SENAITE JSON API client adapted from the exact source at
 * bcc97cc5df73941c3e34171e67a64b552e13425e:senaite-real.js.
 * Credentials are required lazily and never have development defaults.
 */
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_SERVER_MESSAGE_INPUT = 4096;
const MAX_SERVER_MESSAGE_OUTPUT = 240;
const REFLECTED_SECRET_KEY = /\b(proxy-authorization|authorization|set-cookie|cookie|password)\b/gi;

export interface SenaiteRecord { [key: string]: unknown; uid?: string | null; path?: string | null; id?: string | null; title?: string | null }
export interface SenaiteResponse { items: SenaiteRecord[]; [key: string]: unknown }
export interface SenaiteClient {
  site: string;
  healthCheck(): Promise<{ ok: boolean; error?: string }>;
  read(resource: string, query?: Record<string, string | number | boolean | readonly string[]>): Promise<SenaiteResponse>;
  readOne(resource: string, uid: string): Promise<SenaiteRecord | null>;
  create(resource: string, parentPath: string, fields: Record<string, unknown>): Promise<SenaiteRecord | null>;
  update(resource: string, uid: string, fields: Record<string, unknown>): Promise<SenaiteRecord | null>;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function escapedQuoteAt(value: string, index: number): { end: number; quote: string; slashCount: number } | null {
  let cursor = index;
  while (value[cursor] === '\\') cursor += 1;
  if (value[cursor] !== '"' && value[cursor] !== "'") return null;
  return { end: cursor + 1, quote: value[cursor], slashCount: cursor - index };
}

function quotedValueEnd(value: string, index: number, quote: string, slashCount: number): number {
  for (let cursor = index; cursor < value.length; cursor += 1) {
    if (value[cursor] !== quote) continue;
    let precedingSlashes = 0;
    for (let before = cursor - 1; before >= 0 && value[before] === '\\'; before -= 1) precedingSlashes += 1;
    if (precedingSlashes === slashCount) return cursor + 1;
  }
  return -1;
}

function lineEnd(value: string, index: number): number {
  const newline = value.slice(index).search(/[\r\n]/);
  return newline === -1 ? value.length : index + newline;
}

function redactStructurallyEscapedSecrets(value: string): string {
  let output = '';
  let consumed = 0;
  REFLECTED_SECRET_KEY.lastIndex = 0;
  for (let match = REFLECTED_SECRET_KEY.exec(value); match; match = REFLECTED_SECRET_KEY.exec(value)) {
    let cursor = match.index + match[0].length;
    const keyClose = escapedQuoteAt(value, cursor);
    if (keyClose) cursor = keyClose.end;
    while (/\s/.test(value[cursor] || '')) cursor += 1;
    if (value[cursor] !== ':' && value[cursor] !== '=') continue;
    cursor += 1;
    while (/\s/.test(value[cursor] || '')) cursor += 1;
    const valueStart = cursor;
    const opening = escapedQuoteAt(value, valueStart);
    let valueEnd: number;
    if (opening) {
      valueEnd = quotedValueEnd(value, opening.end, opening.quote, opening.slashCount);
      if (valueEnd === -1) valueEnd = lineEnd(value, valueStart);
    } else if (/^(?:proxy-)?authorization$/i.test(match[0])) {
      const token = value.slice(valueStart).match(/^(?:(?:basic|bearer)\s+)?[^\s,;}\]]+/i);
      valueEnd = token ? valueStart + token[0].length : valueStart;
    } else if (/^(?:set-cookie|cookie)$/i.test(match[0])) {
      valueEnd = lineEnd(value, valueStart);
    } else {
      const delimiter = value.slice(valueStart).search(/[,;}\]\r\n]/);
      valueEnd = delimiter === -1 ? value.length : valueStart + delimiter;
    }
    if (valueEnd <= valueStart) continue;
    const label = /password/i.test(match[0]) ? 'password' : /cookie/i.test(match[0]) ? 'cookie' : 'authorization';
    output += value.slice(consumed, match.index) + `${label}=[redacted]`;
    consumed = valueEnd;
    REFLECTED_SECRET_KEY.lastIndex = valueEnd;
  }
  return output + value.slice(consumed);
}

function markerAwareBound(value: string, limit = MAX_SERVER_MESSAGE_OUTPUT): string {
  if (value.length <= limit) return value;
  const markers = [...value.matchAll(/\b(?:authorization|cookie|password)=\[redacted\]/g)];
  if (markers.length === 0) return value.slice(0, limit);
  const suffix = `... ${markers.map((match) => match[0]).join(' ')}`;
  const prefix = value.slice(0, Math.max(0, limit - suffix.length - 1)).trimEnd();
  return `${prefix}${prefix ? ' ' : ''}${suffix}`.slice(0, limit);
}

function boundedServerMessage(value: unknown): string {
  const sanitized = redactStructurallyEscapedSecrets(String(value ?? '').slice(0, MAX_SERVER_MESSAGE_INPUT)).replace(/[\r\n\t]+/g, ' ');
  return markerAwareBound(sanitized);
}

function normalizeRecord(value: unknown): SenaiteRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as SenaiteRecord;
  return {
    ...record,
    uid: String(record.uid ?? record.UID ?? '') || null,
    path: String(record.path ?? record.Path ?? '') || null,
    id: String(record.id ?? record.getId ?? '') || null,
    title: String(record.title ?? record.Title ?? '') || null,
  };
}

function firstItem(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)) return (payload as { items: unknown[] }).items[0] ?? null;
  return payload;
}

export function createSenaiteClient(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): SenaiteClient {
  const env = options.env ?? process.env;
  const baseUrl = required(env.SENAITE_URL, 'SENAITE_URL').replace(/\/+$/, '');
  const user = required(env.SENAITE_USER, 'SENAITE_USER');
  const password = required(env.SENAITE_PASS, 'SENAITE_PASS');
  const site = required(env.SENAITE_SITE ?? 'senaite', 'SENAITE_SITE');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const apiBase = `${baseUrl}/${encodeURIComponent(site)}/@@API/senaite/v1`;
  const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

  async function request(endpoint = '', { method = 'GET', body, query }: { method?: string; body?: unknown; query?: Record<string, string | number | boolean | readonly string[]> } = {}): Promise<Record<string, unknown>> {
    const suffix = endpoint ? `/${String(endpoint).replace(/^\/+/, '')}` : '';
    const url = new URL(`${apiBase}${suffix}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
      else url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: { Authorization: authorization, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : boundedServerMessage(error instanceof Error ? error.message : error);
      throw new Error(`SENAITE API ${method} ${url.pathname} ${reason}`);
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try { payload = JSON.parse(text) as Record<string, unknown>; }
      catch { if (response.ok) throw new Error(`SENAITE API ${method} ${url.pathname} returned non-JSON content`); }
    }
    if (!response.ok) {
      const detail = boundedServerMessage(payload.message ?? payload.error ?? text ?? response.statusText);
      throw new Error(`SENAITE API ${method} ${url.pathname}: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
    }
    return payload;
  }

  return {
    site,
    async healthCheck() {
      try { await request('version'); return { ok: true }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'SENAITE unavailable' }; }
    },
    async read(resource, query = {}) {
      const payload = await request(resource, { query });
      const items = Array.isArray(payload.items) ? payload.items.map(normalizeRecord).filter((item): item is SenaiteRecord => item !== null) : [];
      return { ...payload, items };
    },
    async readOne(resource, uid) { return normalizeRecord(firstItem(await request(`${resource}/${encodeURIComponent(required(uid, 'SENAITE object UID'))}`))); },
    async create(resource, parentPath, fields) { return normalizeRecord(firstItem(await request(`${resource}/create`, { method: 'POST', body: { parent_path: parentPath, ...fields } }))); },
    async update(resource, uid, fields) { return normalizeRecord(firstItem(await request(`${resource}/update/${encodeURIComponent(required(uid, 'SENAITE object UID'))}`, { method: 'POST', body: fields }))); },
  };
}
