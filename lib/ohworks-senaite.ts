import 'server-only';

/**
 * Fail-closed, server-only read adapter for a real SENAITE instance.
 *
 * Mirrors the read surface of senaite/client.py (search_samples / get_sample)
 * but is source-only in this repo: every caller must supply explicit
 * server-only configuration, every response is validated before use, and the
 * module never falls back to synthetic fixtures while labelling the result
 * real. Callers see one of four explicit states: unavailable, invalid,
 * empty, or ok.
 */

export interface SenaiteConnectionConfig {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
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

export type OHWorksSenaiteMode = 'synthetic' | 'real';

const REQUEST_TIMEOUT_MS = 10_000;

class SenaiteHttpError extends Error {
  constructor(readonly status: number) {
    super(`SENAITE responded with HTTP ${status}`);
  }
}

export function resolveOHWorksSenaiteMode(env: NodeJS.ProcessEnv = process.env): OHWorksSenaiteMode {
  return env.OHWORKS_SENAITE_MODE === 'real' ? 'real' : 'synthetic';
}

export function readSenaiteConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SenaiteConnectionConfig | undefined {
  const baseUrl = env.OHWORKS_SENAITE_BASE_URL?.trim();
  const username = env.OHWORKS_SENAITE_USERNAME?.trim();
  const password = env.OHWORKS_SENAITE_PASSWORD;
  if (!baseUrl || !username || !password) return undefined;

  try {
    new URL(baseUrl);
  } catch {
    return undefined;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), username, password };
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

function normalizeResponse(raw: unknown): SenaiteReadResult {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    return { status: 'invalid', detail: 'SENAITE response missing an items array' };
  }

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
): Promise<unknown> {
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const url =
    `${config.baseUrl}/@@API/senaite/v1/AnalysisRequest` +
    `?review_state=${encodeURIComponent(reviewState)}&sort_on=created&sort_order=descending&limit=${limit}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
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
  env?: NodeJS.ProcessEnv;
}

/**
 * Reads real SENAITE samples. Requires OHWORKS_SENAITE_BASE_URL,
 * OHWORKS_SENAITE_USERNAME, and OHWORKS_SENAITE_PASSWORD; returns
 * `unavailable` rather than calling out when any are missing. Never
 * substitutes synthetic fixtures for a failed or empty real read.
 */
export async function readSenaiteSamples(options: ReadSenaiteSamplesOptions = {}): Promise<SenaiteReadResult> {
  const config = readSenaiteConfigFromEnv(options.env ?? process.env);
  if (!config) {
    return {
      status: 'unavailable',
      reason: 'not_configured',
      detail: 'OHWORKS_SENAITE_BASE_URL, OHWORKS_SENAITE_USERNAME, and OHWORKS_SENAITE_PASSWORD must all be set',
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    return { status: 'unavailable', reason: 'not_configured', detail: 'no fetch implementation is available' };
  }

  try {
    const raw = await requestSamples(config, fetchImpl, options.reviewState ?? 'sample_received', options.limit ?? 25);
    return normalizeResponse(raw);
  } catch (error) {
    if (error instanceof SenaiteHttpError) {
      return { status: 'unavailable', reason: 'http_error', detail: error.message };
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'unavailable', reason: 'timeout', detail: 'SENAITE request timed out' };
    }
    return {
      status: 'unavailable',
      reason: 'network_error',
      detail: error instanceof Error ? error.message : 'unknown SENAITE read error',
    };
  }
}
