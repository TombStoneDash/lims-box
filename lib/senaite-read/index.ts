import 'server-only';

/**
 * Fail-closed, server-only read adapter for a real SENAITE instance.
 *
 * Reads sample summaries using the endpoint from senaite/client.py.
 * Every caller needs server-only configuration, every response is validated
 * before use, and the
 * module never falls back to synthetic fixtures while labelling the result
 * real. Callers see one of four explicit states: unavailable, invalid,
 * empty, or ok.
 */

export interface SenaiteConnectionConfig {
  readonly baseUrl: string;
  readonly token: string;
}

export interface SenaiteSampleRecord {
  readonly source: 'real_senaite';
  readonly id: string;
  readonly sampleType: string;
  readonly reviewState: string;
  readonly clientId: string | null;
  readonly dateReceived: string | null;
}

export type SenaiteUnavailableReason = 'not_configured' | 'network_error' | 'http_error' | 'timeout';

export type SenaiteReadResult =
  | { status: 'unavailable'; reason: SenaiteUnavailableReason; detail: string }
  | { status: 'invalid'; detail: string }
  | { status: 'empty'; source: 'real_senaite' }
  | { status: 'ok'; source: 'real_senaite'; samples: readonly SenaiteSampleRecord[] };

export type SenaiteFetch = (url: string, init: RequestInit) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 10_000;

class SenaiteHttpError extends Error {
  constructor(readonly status: number) {
    super(`SENAITE responded with HTTP ${status}`);
  }
}

export type SenaiteReadEnvironment = {
  SENAITE_BASE_URL?: string;
  SENAITE_API_TOKEN?: string;
};

function readConfig(env: SenaiteReadEnvironment): SenaiteConnectionConfig | undefined {
  const baseUrl = env.SENAITE_BASE_URL?.trim();
  const token = env.SENAITE_API_TOKEN?.trim();
  if (!baseUrl || !token || /[\r\n]/.test(token)) return undefined;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return undefined;
    return { baseUrl: url.href.replace(/\/+$/, ''), token };
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSample(raw: unknown): SenaiteSampleRecord | undefined {
  if (!isRecord(raw)) return undefined;

  const id = raw.getId ?? raw.id;
  const reviewState = raw.review_state;
  if (!isNonEmptyString(id) || !isNonEmptyString(reviewState)) return undefined;

  const sampleType = raw.SampleType ?? raw.getSampleTypeTitle;
  const clientId = isNonEmptyString(raw.getClientID)
    ? raw.getClientID
    : isNonEmptyString(raw.Client)
      ? raw.Client
      : null;
  const dateReceived = isNonEmptyString(raw.getDateReceived) ? raw.getDateReceived : null;

  return {
    source: 'real_senaite',
    id,
    sampleType: isNonEmptyString(sampleType) ? sampleType : 'Unknown',
    reviewState,
    clientId,
    dateReceived,
  };
}

function normalizeResponse(raw: unknown, limit: number): SenaiteReadResult {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    return { status: 'invalid', detail: 'SENAITE response missing an items array' };
  }

  if (raw.items.length > limit) return { status: 'invalid', detail: 'SENAITE response exceeded the requested limit' };
  const samples: SenaiteSampleRecord[] = [];
  for (const item of raw.items) {
    const normalized = normalizeSample(item);
    if (!normalized) {
      return { status: 'invalid', detail: 'SENAITE response contained a malformed sample record' };
    }
    samples.push(normalized);
  }

  if (samples.length === 0) {
    return { status: 'empty', source: 'real_senaite' };
  }
  return { status: 'ok', source: 'real_senaite', samples };
}

async function requestSamples(
  config: SenaiteConnectionConfig,
  fetchImpl: SenaiteFetch,
  reviewState: string,
  limit: number,
  sampleId?: string,
): Promise<unknown> {
  const url =
    `${config.baseUrl}/@@API/senaite/v1/AnalysisRequest` +
    `?review_state=${encodeURIComponent(reviewState)}&sort_on=created&sort_order=descending&limit=${limit}` + (sampleId === undefined ? '' : `&getId=${encodeURIComponent(sampleId)}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new SenaiteHttpError(response.status);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export interface ReadSenaiteSamplesOptions {
  reviewState?: string;
  limit?: number;
  fetchImpl?: SenaiteFetch;
  env?: SenaiteReadEnvironment;
  sampleId?: string;
}

/** Read one bounded page. Missing configuration and upstream failures are data, never fixture fallbacks. */
export async function readSenaiteSamples(options: ReadSenaiteSamplesOptions = {}): Promise<SenaiteReadResult> {
  const config = readConfig(options.env ?? { SENAITE_BASE_URL: process.env.SENAITE_BASE_URL, SENAITE_API_TOKEN: process.env.SENAITE_API_TOKEN });
  if (!config) {
    return {
      status: 'unavailable',
      reason: 'not_configured',
      detail: 'SENAITE_BASE_URL and SENAITE_API_TOKEN must both be set to valid values',
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    return { status: 'unavailable', reason: 'not_configured', detail: 'no fetch implementation is available' };
  }

  const limit = options.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [options.reviewState, options.sampleId].some(value => value !== undefined &&
        (typeof value !== 'string' || !value.trim() || value.length > 200))) {
    return { status: 'invalid', detail: 'Invalid SENAITE sample query' };
  }
  try {
    const raw = await requestSamples(config, fetchImpl, options.reviewState ?? 'sample_received', limit, options.sampleId);
    return normalizeResponse(raw, limit);
  } catch (error) {
    if (error instanceof SenaiteHttpError) {
      return { status: 'unavailable', reason: 'http_error', detail: error.message };
    }
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return { status: 'unavailable', reason: 'timeout', detail: 'SENAITE request timed out' };
    }
    return {
      status: 'unavailable',
      reason: 'network_error',
      detail: 'SENAITE request failed',
    };
  }
}

/** Construction performs no IO. No write operations or arbitrary endpoints are exposed. */
export function createSenaiteReadAdapter(
  env: SenaiteReadEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_API_TOKEN: process.env.SENAITE_API_TOKEN,
  },
  transport: SenaiteFetch = globalThis.fetch,
) {
  const snapshot = { ...env };
  return {
    enabled: readConfig(snapshot) !== undefined,
    listSamples: (query: Pick<ReadSenaiteSamplesOptions, 'sampleId' | 'reviewState' | 'limit'> = {}) =>
      readSenaiteSamples({ ...query, env: snapshot, fetchImpl: transport }),
  };
}
