import type { LiaisonResult } from '../ohworks-liaison-import';

export type SenaiteResultImportEnvironment = {
  SENAITE_BASE_URL?: string;
  /** A separately provisioned token allowed to edit analysis results. Never the read-only token. */
  SENAITE_RESULT_IMPORT_TOKEN?: string;
};

export type SenaiteResultImportOptions = {
  /** Only results captured by this LIAISON XL serial are considered. */
  instrumentSerial: string;
  /** Default false: plan only, with GETs and no writes. */
  apply?: boolean;
};

export type SenaiteResultSkipReason =
  | 'unexpected-instrument' | 'sample-not-found' | 'sample-not-received' | 'no-analysis'
  | 'ambiguous-analysis' | 'analysis-not-editable' | 'existing-result' | 'unit-mismatch';

export type SenaiteResultOutcome = { sampleId: string; keyword: string } & (
  | { status: 'ready'; result: string }
  | { status: 'written'; result: string }
  | { status: 'skipped'; reason: SenaiteResultSkipReason }
  | { status: 'failed'; reason: 'write-failed' | 'write-unconfirmed' }
);

export type SenaiteResultImportErrorCode =
  | 'invalid-input' | 'unauthenticated' | 'request-failed' | 'invalid-response' | 'scope-mismatch';

export type SenaiteResultImportResult =
  | { status: 'not_configured' }
  | { status: 'error'; code: SenaiteResultImportErrorCode }
  | { status: 'ok'; applied: boolean; outcomes: SenaiteResultOutcome[] };

/** Bounded so one export can never fan out into an unbounded number of requests. */
export const MAX_IMPORT_RESULTS = 200;
const MAX_SAMPLE_ANALYSES = 100;
const PLONE_UID = /^[0-9a-f]{32}$/;
// SENAITE accepts a result only before submission; later states belong to review.
const EDITABLE_STATES = new Set(['unassigned', 'assigned']);

function configuration(env: SenaiteResultImportEnvironment) {
  const { SENAITE_BASE_URL: rawUrl, SENAITE_RESULT_IMPORT_TOKEN: token } = env;
  if (!rawUrl?.trim() || !token?.trim() || /[\s\x00-\x1f\x7f]/.test(token)) return null;
  try {
    const url = new URL(rawUrl);
    // Credentials travel only over TLS, to this configured origin, without redirects.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    const api = (route: string) => {
      const endpoint = new URL(url);
      endpoint.pathname = `${url.pathname.replace(/\/+$/, '')}/@@API/senaite/v1/${route}`;
      return endpoint;
    };
    return { api, authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const optionalString = (value: unknown) => value == null || typeof value === 'string';

type Analysis = { uid: string; keyword: string; reviewState: string; unit: string; result: string };

/**
 * senaite.jsonapi builds catalog queries only from keys that are catalog
 * indexes and silently drops the rest, so every returned record is checked
 * against the sample it was asked for. Any foreign record fails the import.
 */
function analysesFromPayload(payload: unknown, sampleUid: string): Analysis[] | 'scope-mismatch' | null {
  if (!record(payload) || payload.success === false || !Array.isArray(payload.items) ||
      payload.items.length > MAX_SAMPLE_ANALYSES) return null;
  if (typeof payload.next === 'string' && payload.next) return null;
  const analyses: Analysis[] = [];
  for (const item of payload.items) {
    if (!record(item)) return null;
    if (item.parent_uid !== sampleUid) return 'scope-mismatch';
    if (typeof item.uid !== 'string' || !PLONE_UID.test(item.uid) ||
        typeof item.Keyword !== 'string' || !item.Keyword.trim() ||
        typeof item.review_state !== 'string' ||
        !optionalString(item.Unit) || !optionalString(item.Result)) return null;
    analyses.push({
      uid: item.uid,
      keyword: item.Keyword,
      reviewState: item.review_state,
      unit: typeof item.Unit === 'string' ? item.Unit.trim() : '',
      result: typeof item.Result === 'string' ? item.Result.trim() : '',
    });
  }
  return analyses;
}

/** Plain decimal text, so the stored result reads back exactly as the instrument reported it. */
function resultText(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const text = String(value);
  if (!/e/i.test(text)) return text;
  // Rare: very small or large values. Fixed notation avoids SENAITE storing exponent text.
  const fixed = value.toFixed(12);
  if (/e/i.test(fixed)) return null;
  const trimmed = fixed.replace(/\.?0+$/, '');
  return Number(trimmed) === value ? trimmed : null;
}

function validInput(results: unknown, options: unknown): options is SenaiteResultImportOptions {
  if (!Array.isArray(results) || results.length > MAX_IMPORT_RESULTS || !record(options)) return false;
  if (typeof options.instrumentSerial !== 'string' || !options.instrumentSerial.trim()) return false;
  if (options.apply !== undefined && typeof options.apply !== 'boolean') return false;
  const seen = new Set<string>();
  for (const result of results) {
    if (!record(result) || typeof result.sampleId !== 'string' || !result.sampleId.trim() ||
        result.sampleId.length > 200 || typeof result.keyword !== 'string' || !result.keyword.trim() ||
        typeof result.value !== 'number' || !Number.isFinite(result.value) ||
        typeof result.unit !== 'string' || typeof result.instrument !== 'string') return false;
    const key = JSON.stringify([result.sampleId, result.keyword]);
    // Two values for one analysis cannot both be right; the parser rejects these too.
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

type JsonCall = { payload: unknown } | { code: 'request-failed' | 'invalid-response' };

/**
 * LIAISON XL → SENAITE result import (10-point ask, point 5). Server-side only.
 *
 * Takes results already parsed by `parseLiaisonExport` and maps each one to
 * exactly one SENAITE analysis: same sample ID, same service keyword, sample
 * received, analysis not yet submitted, no result entered, and the same unit.
 * Anything else is skipped with a fixed reason. The whole plan is built from
 * GETs before any write, so a read failure part-way writes nothing.
 *
 * With `apply: true` each ready result is written as the analysis `Result`
 * only, then read back. It never submits, verifies, retracts or overwrites;
 * an analyst still reviews and submits every imported value in SENAITE.
 */
export function createSenaiteResultImporter(
  env: SenaiteResultImportEnvironment = {
    SENAITE_BASE_URL: process.env.SENAITE_BASE_URL,
    SENAITE_RESULT_IMPORT_TOKEN: process.env.SENAITE_RESULT_IMPORT_TOKEN,
  },
  transport: typeof fetch = globalThis.fetch,
) {
  const config = configuration(env);

  async function call(url: URL, body?: unknown): Promise<JsonCall> {
    if (!config) return { code: 'request-failed' };
    try {
      const response = await transport(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: config.authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return { code: 'request-failed' };
      try {
        return { payload: await response.json() };
      } catch {
        return { code: 'invalid-response' };
      }
    } catch {
      // Never expose upstream bodies, URLs, credentials, or transport exceptions.
      return { code: 'request-failed' };
    }
  }

  return {
    enabled: config !== null,
    async importResults(results: readonly LiaisonResult[], options: SenaiteResultImportOptions): Promise<SenaiteResultImportResult> {
      if (!config) return { status: 'not_configured' };
      if (!validInput(results, options)) return { status: 'error', code: 'invalid-input' };
      const apply = options.apply === true;
      const serial = options.instrumentSerial.trim();

      // A rejected token reads as Anonymous, who finds no samples; prove sign-in first.
      const identity = await call(config.api('users/current'));
      if ('code' in identity) return { status: 'error', code: identity.code };
      const items = record(identity.payload) && Array.isArray(identity.payload.items) ? identity.payload.items : null;
      if (!items || items.length !== 1 || !record(items[0]) || typeof items[0].authenticated !== 'boolean') {
        return { status: 'error', code: 'invalid-response' };
      }
      if (!items[0].authenticated) return { status: 'error', code: 'unauthenticated' };

      type Sample = { status: 'missing' } | { status: 'not-received' } | { status: 'received'; analyses: Analysis[] };
      const samples = new Map<string, Sample>();
      async function loadSample(sampleId: string): Promise<Sample | { code: SenaiteResultImportErrorCode }> {
        const url = config!.api('AnalysisRequest');
        url.searchParams.set('getId', sampleId);
        url.searchParams.set('limit', '2');
        const listing = await call(url);
        if ('code' in listing) return { code: listing.code };
        const { payload } = listing;
        if (!record(payload) || payload.success === false || !Array.isArray(payload.items)) return { code: 'invalid-response' };
        // An ignored getId filter returns other samples; only an exact ID match counts.
        const matches = payload.items.filter(item => record(item) && item.id === sampleId);
        if (matches.length === 0) return { status: 'missing' };
        if (matches.length > 1) return { code: 'invalid-response' };
        const [sample] = matches as Record<string, unknown>[];
        if (typeof sample.uid !== 'string' || !PLONE_UID.test(sample.uid)) return { code: 'invalid-response' };
        if (sample.review_state !== 'sample_received') return { status: 'not-received' };

        const analysesUrl = config!.api('Analysis');
        analysesUrl.searchParams.set('getRequestUID', sample.uid);
        analysesUrl.searchParams.set('complete', 'yes');
        analysesUrl.searchParams.set('limit', String(MAX_SAMPLE_ANALYSES));
        const analysesListing = await call(analysesUrl);
        if ('code' in analysesListing) return { code: analysesListing.code };
        const analyses = analysesFromPayload(analysesListing.payload, sample.uid);
        if (analyses === 'scope-mismatch') return { code: 'scope-mismatch' };
        if (analyses === null) return { code: 'invalid-response' };
        return { status: 'received', analyses };
      }

      // Plan every result from reads alone before anything is written.
      const planned: (SenaiteResultOutcome & { analysisUid?: string })[] = [];
      for (const result of results) {
        const base = { sampleId: result.sampleId, keyword: result.keyword };
        if (result.instrument.trim() !== serial) {
          planned.push({ ...base, status: 'skipped', reason: 'unexpected-instrument' });
          continue;
        }
        if (!samples.has(result.sampleId)) {
          const loaded = await loadSample(result.sampleId);
          if ('code' in loaded) return { status: 'error', code: loaded.code };
          samples.set(result.sampleId, loaded);
        }
        const sample = samples.get(result.sampleId)!;
        if (sample.status === 'missing') { planned.push({ ...base, status: 'skipped', reason: 'sample-not-found' }); continue; }
        if (sample.status === 'not-received') { planned.push({ ...base, status: 'skipped', reason: 'sample-not-received' }); continue; }
        const matching = sample.analyses.filter(analysis => analysis.keyword === result.keyword);
        // A retest leaves the retracted original beside the new analysis; only one may be open.
        const open = matching.filter(analysis => EDITABLE_STATES.has(analysis.reviewState));
        const skip = (reason: SenaiteResultSkipReason) => planned.push({ ...base, status: 'skipped', reason });
        if (matching.length === 0) { skip('no-analysis'); continue; }
        if (open.length === 0) { skip('analysis-not-editable'); continue; }
        if (open.length > 1) { skip('ambiguous-analysis'); continue; }
        const [analysis] = open;
        if (analysis.result) { skip('existing-result'); continue; }
        // No unit conversion: a different unit means a mapping error, not a value to rescale.
        if (!analysis.unit || analysis.unit !== result.unit.trim()) { skip('unit-mismatch'); continue; }
        const text = resultText(result.value);
        if (text === null) return { status: 'error', code: 'invalid-input' };
        planned.push({ ...base, status: 'ready', result: text, analysisUid: analysis.uid });
      }

      const strip = ({ analysisUid: _uid, ...outcome }: (typeof planned)[number]): SenaiteResultOutcome => outcome;
      if (!apply) return { status: 'ok', applied: false, outcomes: planned.map(strip) };

      const outcomes: SenaiteResultOutcome[] = [];
      for (const entry of planned) {
        if (entry.status !== 'ready' || !entry.analysisUid) { outcomes.push(strip(entry)); continue; }
        const base = { sampleId: entry.sampleId, keyword: entry.keyword };
        // Only the result field is sent: no transition, analyst, instrument or remarks.
        const written = await call(config.api('update'), { uid: entry.analysisUid, Result: entry.result });
        if ('code' in written || !record(written.payload) || written.payload.success === false) {
          outcomes.push({ ...base, status: 'failed', reason: 'write-failed' });
          continue;
        }
        const readBack = await call(config.api(`Analysis/${entry.analysisUid}`));
        const item = 'payload' in readBack && record(readBack.payload) && Array.isArray(readBack.payload.items) &&
          readBack.payload.items.length === 1 ? readBack.payload.items[0] : null;
        const confirmed = record(item) && item.uid === entry.analysisUid &&
          typeof item.Result === 'string' && item.Result.trim() === entry.result;
        outcomes.push(confirmed
          ? { ...base, status: 'written', result: entry.result }
          : { ...base, status: 'failed', reason: 'write-unconfirmed' });
      }
      return { status: 'ok', applied: true, outcomes };
    },
  };
}
