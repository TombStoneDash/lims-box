import type { OHWorksSampleCreateRequest } from './ohworks-senaite-create';

export type OHWorksSyntheticProfile = {
  matrixCode: OHWorksSampleCreateRequest['matrixCode'];
  /** Fabricated catalogue codes, in the form SYNTHETIC-ANALYSIS-<1 to 6 digits>. */
  analyses: ReadonlyArray<string>;
};

export type OHWorksSyntheticTargetState =
  | 'received' | 'to-be-verified' | 'verified' | 'published' | 'rejected';

export type OHWorksSyntheticSample = OHWorksSampleCreateRequest & {
  /** Operator's eventual target only; generating this payload performs no transition. */
  targetState: OHWorksSyntheticTargetState;
};

export type OHWorksSyntheticBatchOptions = {
  seed: string | number;
  count?: number;
  /** UTC ISO timestamp: YYYY-MM-DDTHH:mm:ss[.sss]Z. */
  receivedFromIso: string;
  profiles: ReadonlyArray<OHWorksSyntheticProfile>;
};

const STATES: readonly OHWorksSyntheticTargetState[] = [
  'received', 'to-be-verified', 'verified', 'published', 'rejected',
];
const MATRICES = new Set(['water-potable', 'water-waste', 'soil', 'air-ambient']);

/** FNV-1a seed hashing followed by a small deterministic Mulberry32 PRNG. */
function seededRandom(seed: string | number) {
  let state = 2166136261;
  for (const char of `${typeof seed}:${seed}`) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const batchCode = state.toString(16).padStart(8, '0').replace(/(.{4})(.{4})/, '$1-$2');
  return {
    batchCode,
    next: () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * Pure, fabricated create payloads. Profiles are balanced in caller order.
 * Each target receives 20%; remainders go to STATES in the order above.
 * Targets are shuffled independently of profiles to avoid coupling the two.
 * IDs are unique within a batch; replaying identical inputs intentionally reuses IDs.
 * No caller identity or free text is copied into output. Analysis codes must
 * use the documented numeric synthetic namespace, not a real catalogue ID.
 */
export function generateOHWorksSyntheticSamples({
  seed, count = 60, receivedFromIso, profiles,
}: OHWorksSyntheticBatchOptions): OHWorksSyntheticSample[] {
  if ((typeof seed !== 'string' && typeof seed !== 'number') ||
      (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw new Error('A finite numeric or string seed is required.');
  }
  if (!Number.isSafeInteger(count) || count < 0 || count > 100_000) {
    throw new Error('Count must be an integer between 0 and 100000.');
  }
  const receivedFrom = Date.parse(receivedFromIso);
  const canonicalIso = typeof receivedFromIso === 'string' && receivedFromIso.length === 20
    ? receivedFromIso.replace('Z', '.000Z') : receivedFromIso;
  if (typeof receivedFromIso !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(receivedFromIso) ||
      !Number.isFinite(receivedFrom) ||
      new Date(receivedFrom).toISOString() !== canonicalIso) {
    throw new Error('A valid UTC ISO receivedFromIso timestamp is required.');
  }
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.some(profile =>
    !profile || !MATRICES.has(profile.matrixCode) ||
    !Array.isArray(profile.analyses) || profile.analyses.length === 0 ||
    profile.analyses.some(code => typeof code !== 'string' || !/^SYNTHETIC-ANALYSIS-\d{1,6}$/.test(code))
  )) {
    throw new Error('Profiles require supported matrices and synthetic numeric analysis codes.');
  }

  const random = seededRandom(seed);
  const targets = Array.from({ length: count }, (_, index) => STATES[index % STATES.length]);
  for (let index = targets.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random.next() * (index + 1));
    [targets[index], targets[swap]] = [targets[swap], targets[index]];
  }
  return targets.map((targetState, index) => {
    const profileIndex = index % profiles.length;
    const profile = profiles[profileIndex];
    const suffix = `${random.batchCode}-${String(index + 1).padStart(6, '0')}`;
    const received = receivedFrom + index * 60_000;
    const sampled = received - (1 + Math.floor(random.next() * 240)) * 60_000;
    return {
      requestId: `SYNTHETIC-REQUEST-${suffix}`,
      tenantId: 'SYNTHETIC-TENANT-001',
      clientId: `SYNTHETIC-CLIENT-${String(profileIndex + 1).padStart(6, '0')}`,
      sampleId: `SYNTHETIC-SAMPLE-${suffix}`,
      matrixCode: profile.matrixCode,
      dateSampled: new Date(sampled).toISOString(),
      dateReceived: new Date(received).toISOString(),
      analyses: [...profile.analyses],
      targetState,
    };
  });
}
