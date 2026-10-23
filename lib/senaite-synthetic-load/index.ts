import {
  createOHWorksSenaiteSample,
  type OHWorksSampleCreateRequest,
  type SampleCreateContext,
  type SenaiteSampleAdapter,
} from '../ohworks-senaite-create';
import type { OHWorksSyntheticSample } from '../ohworks-synthetic-sample-batch';

/**
 * Loads a batch of synthetic OHWorks samples (point 3 of the ten-point ask:
 * "load 60 synthetic samples") into SENAITE, one sample at a time, through the
 * sample-create contract and an injected SENAITE adapter.
 *
 * It refuses anything that is not synthetic before the first request, so no
 * customer record can travel through it. A sample counts as loaded only when
 * the adapter reports it read back from SENAITE. Because the adapter finds an
 * earlier attempt by its OHWorks ID, re-running the same batch is safe: it
 * finishes what is missing and creates no duplicates.
 */

export const MAX_SYNTHETIC_BATCH = 100;

// Adapter failures that say the whole run is wrong (no credential, a rejected
// sign-in, an index SENAITE ignores, a server that answers nonsense). Carrying
// on would only repeat them, or worse, create samples nobody can find again.
const HALTING_CODES = new Set(['not-configured', 'unauthenticated', 'scope-mismatch', 'invalid-response', 'request-failed']);
// A run of per-sample failures this long is treated as systemic too.
const MAX_CONSECUTIVE_FAILURES = 3;

const SYNTHETIC_ID = /^SYNTHETIC-[A-Z]+-[0-9A-F-]{1,40}$/i;
const SYNTHETIC_ANALYSIS = /^SYNTHETIC-ANALYSIS-\d{1,6}$/;
const ERROR_CODE = /^[a-z][a-z-]{0,39}$/;

export type SyntheticLoadInputErrorCode =
  | 'batch-size'
  | 'not-synthetic'
  | 'tenant-mismatch'
  | 'duplicate-sample-id'
  | 'invalid-context';

export class SyntheticLoadInputError extends Error {
  readonly code: SyntheticLoadInputErrorCode;

  constructor(code: SyntheticLoadInputErrorCode) {
    super(`Synthetic SENAITE load refused: ${code}`);
    this.name = 'SyntheticLoadInputError';
    this.code = code;
  }
}

export type SyntheticLoadSampleResult = {
  sampleId: string;
  status: 'CREATED' | 'REJECTED' | 'SKIPPED';
  senaiteSampleId?: string;
  /** Contract reason codes, plus `senaite-id-reused` from the batch check. */
  reasons: string[];
  /** The adapter's fixed error code, when it threw one. Never upstream text. */
  adapterCode?: string;
};

export type SyntheticLoadResult = {
  /** `loaded` only when every sample was read back from SENAITE. */
  status: 'loaded' | 'partial' | 'halted';
  requested: number;
  created: number;
  rejected: number;
  skipped: number;
  /** Read-back-confirmed samples per matrix. */
  createdByMatrix: Record<string, number>;
  haltedOn?: { sampleId: string; code: string };
  samples: SyntheticLoadSampleResult[];
};

function isSynthetic(sample: unknown): sample is OHWorksSyntheticSample {
  if (sample === null || typeof sample !== 'object') return false;
  const candidate = sample as Record<string, unknown>;
  return ['requestId', 'tenantId', 'clientId', 'sampleId'].every(key =>
    typeof candidate[key] === 'string' && SYNTHETIC_ID.test(candidate[key] as string)) &&
    Array.isArray(candidate.analyses) && candidate.analyses.length > 0 &&
    candidate.analyses.every(code => typeof code === 'string' && SYNTHETIC_ANALYSIS.test(code));
}

function validateBatch(samples: unknown, context: SampleCreateContext): asserts samples is OHWorksSyntheticSample[] {
  if (!context || typeof context.tenantId !== 'string' || !SYNTHETIC_ID.test(context.tenantId)) {
    throw new SyntheticLoadInputError('invalid-context');
  }
  if (!Array.isArray(samples) || samples.length === 0 || samples.length > MAX_SYNTHETIC_BATCH) {
    throw new SyntheticLoadInputError('batch-size');
  }
  if (!samples.every(isSynthetic)) throw new SyntheticLoadInputError('not-synthetic');
  if (samples.some(sample => sample.tenantId !== context.tenantId)) throw new SyntheticLoadInputError('tenant-mismatch');
  if (new Set(samples.map(sample => sample.sampleId)).size !== samples.length ||
      new Set(samples.map(sample => sample.requestId)).size !== samples.length) {
    throw new SyntheticLoadInputError('duplicate-sample-id');
  }
}

function errorCode(error: unknown): string | undefined {
  const code = error !== null && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && ERROR_CODE.test(code) ? code : undefined;
}

/**
 * Sequential on purpose: SENAITE assigns sample IDs in order, and one request
 * at a time keeps a failure attributable to one sample. `targetState` is not
 * applied here; receiving and later transitions are separate steps.
 */
export async function loadSyntheticSamplesIntoSenaite(
  samples: ReadonlyArray<OHWorksSyntheticSample>,
  context: SampleCreateContext,
  adapter: SenaiteSampleAdapter,
): Promise<SyntheticLoadResult> {
  validateBatch(samples, context);

  const results: SyntheticLoadSampleResult[] = [];
  const createdByMatrix: Record<string, number> = {};
  const seenSenaiteIds = new Map<string, string>();
  let haltedOn: SyntheticLoadResult['haltedOn'];
  let consecutiveFailures = 0;

  for (const sample of samples) {
    if (haltedOn) {
      results.push({ sampleId: sample.sampleId, status: 'SKIPPED', reasons: [] });
      continue;
    }
    const { targetState, ...request } = sample;
    let adapterCode: string | undefined;
    const observed: SenaiteSampleAdapter = {
      async createSample(createRequest: OHWorksSampleCreateRequest) {
        try {
          return await adapter.createSample(createRequest);
        } catch (error) {
          adapterCode = errorCode(error);
          throw error;
        }
      },
    };

    const result = await createOHWorksSenaiteSample(request, context, observed);
    const entry: SyntheticLoadSampleResult = {
      sampleId: sample.sampleId,
      status: result.status,
      reasons: result.reasons.map(reason => reason.code),
      ...(result.senaiteSampleId ? { senaiteSampleId: result.senaiteSampleId } : {}),
      ...(adapterCode ? { adapterCode } : {}),
    };

    // Two OHWorks samples must never resolve to one SENAITE sample.
    if (entry.status === 'CREATED' && entry.senaiteSampleId) {
      if (seenSenaiteIds.has(entry.senaiteSampleId)) {
        entry.status = 'REJECTED';
        entry.reasons = ['senaite-id-reused'];
        delete entry.senaiteSampleId;
      } else {
        seenSenaiteIds.set(entry.senaiteSampleId, sample.sampleId);
        createdByMatrix[sample.matrixCode] = (createdByMatrix[sample.matrixCode] ?? 0) + 1;
      }
    }
    results.push(entry);

    if (entry.status === 'CREATED') {
      consecutiveFailures = 0;
      continue;
    }
    consecutiveFailures += 1;
    if (adapterCode && HALTING_CODES.has(adapterCode)) {
      haltedOn = { sampleId: sample.sampleId, code: adapterCode };
    } else if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      haltedOn = { sampleId: sample.sampleId, code: 'repeated-failures' };
    }
  }

  const count = (status: SyntheticLoadSampleResult['status']) => results.filter(entry => entry.status === status).length;
  const created = count('CREATED');
  return {
    status: haltedOn ? 'halted' : created === samples.length ? 'loaded' : 'partial',
    requested: samples.length,
    created,
    rejected: count('REJECTED'),
    skipped: count('SKIPPED'),
    createdByMatrix,
    ...(haltedOn ? { haltedOn } : {}),
    samples: results,
  };
}
