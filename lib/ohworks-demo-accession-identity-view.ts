import {
  formatSpecimenLabel,
  parseSpecimenLabel,
  explainSpecimenLabelRuleCode,
  type SpecimenLabelParseResult,
  type SpecimenLabelRuleCode,
} from './ohworks-specimen-label';
import {
  normalizeIdentifier,
  scoreIdentifierMatch,
  explainIdentifierNormalizationError,
  IdentifierNormalizationError,
  type IdentifierNormalizationErrorCode,
} from './ohworks-identifier-normalization';
import {
  planAliquotSplit,
  explainAliquotSplitReason,
  type AliquotSplitInput,
  type AliquotSplitReasonCode,
  type DerivedAliquot,
} from './ohworks-aliquot-split';

/** All labels, identifiers and volumes below are fabricated examples, not regulatory guidance. */
export function createPilotAccessionIdentityFixtures(): {
  labels: string[];
  identifiers: string[];
  identifierPairs: { rawA: string; rawB: string }[];
  aliquotSplits: { scenario: string; input: AliquotSplitInput }[];
} {
  const goodLabelA = formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 123, year: 26 });
  const goodLabelB = formatSpecimenLabel({ sitePrefix: 'ENV', sequence: 456, year: 26 });

  const lastChar = goodLabelA.slice(-1);
  const swappedCheckChar = lastChar === 'A' ? 'B' : 'A';
  const badCheckCharacterLabel = `${goodLabelA.slice(0, -1)}${swappedCheckChar}`;
  const mixedCaseLabel = `${goodLabelA.slice(0, 3).toLowerCase()}${goodLabelA.slice(3)}`;
  const shortLabel = goodLabelA.slice(0, -1);
  const unknownPrefixLabel = `XXX${goodLabelA.slice(3)}`;

  return {
    labels: [goodLabelA, goodLabelB, badCheckCharacterLabel, mixedCaseLabel, shortLabel, unknownPrefixLabel],
    identifiers: ['acc 000123', 'ACC-000123', 'acc_0123', 'ACC-OO0123', 'EXT-O1234', 'ZZZ-42'],
    identifierPairs: [
      { rawA: 'ACC-000123', rawB: 'acc 000123' },
      { rawA: 'ACC-000123', rawB: 'ACC-000124' },
      { rawA: 'ACC-000123', rawB: 'ACC-999999' },
    ],
    aliquotSplits: [
      {
        scenario: 'Valid three-way split',
        input: {
          parent: { accessionId: 'SYNTHETIC-ACC-101', volume: 100, containerType: 'VIAL', derivationDepth: 0 },
          deadVolume: 10,
          requests: [
            { label: 'A', volume: 20, purpose: 'PRIMARY_ANALYSIS' },
            { label: 'B', volume: 20, purpose: 'QC_REPLICATE' },
            { label: 'C', volume: 20, purpose: 'RETAIN_ARCHIVE' },
          ],
        },
      },
      {
        scenario: 'Over-allocated split',
        input: {
          parent: { accessionId: 'SYNTHETIC-ACC-102', volume: 50, containerType: 'TUBE', derivationDepth: 0 },
          deadVolume: 10,
          requests: [
            { label: 'A', volume: 30, purpose: 'PRIMARY_ANALYSIS' },
            { label: 'B', volume: 30, purpose: 'QC_REPLICATE' },
          ],
        },
      },
      {
        scenario: 'Parent already at maximum derivation depth',
        input: {
          parent: { accessionId: 'SYNTHETIC-ACC-103', volume: 100, containerType: 'VIAL', derivationDepth: 2 },
          deadVolume: 10,
          requests: [{ label: 'A', volume: 20, purpose: 'PRIMARY_ANALYSIS' }],
        },
      },
      {
        scenario: 'Duplicate aliquot label',
        input: {
          parent: { accessionId: 'SYNTHETIC-ACC-104', volume: 100, containerType: 'VIAL', derivationDepth: 0 },
          deadVolume: 10,
          requests: [
            { label: 'A', volume: 20, purpose: 'PRIMARY_ANALYSIS' },
            { label: 'A', volume: 20, purpose: 'QC_REPLICATE' },
          ],
        },
      },
    ],
  };
}

export type PilotLabelRow = {
  raw: string;
  outcome: 'ok' | SpecimenLabelRuleCode;
  sitePrefix: string | null;
  sequence: number | null;
  year: number | null;
  explanation: string;
};

export type PilotIdentifierRow = {
  raw: string;
  outcome: 'ok' | IdentifierNormalizationErrorCode;
  canonical: string | null;
  explanation: string;
};

export type PilotIdentifierMatchRow = {
  rawA: string;
  rawB: string;
  canonicalA: string;
  canonicalB: string;
  score: string;
  exact: boolean;
  isProbableMatch: boolean;
  explanation: string;
};

export type PilotAliquotRow = {
  scenario: string;
  parentAccessionId: string;
  status: 'VALID' | 'INVALID';
  children: DerivedAliquot[] | null;
  failureCode: AliquotSplitReasonCode | null;
  requestIndex: number | null;
  explanation: string;
};

export type PilotAccessionIdentityView = {
  labelRows: PilotLabelRow[];
  identifierRows: PilotIdentifierRow[];
  matchRows: PilotIdentifierMatchRow[];
  aliquotRows: PilotAliquotRow[];
  counts: { labelsRefused: number; identifiersUnresolved: number; splitsRefused: number };
};

/** Local narrowing helper: this repo's tsconfig disables strictNullChecks, under which control-flow narrowing on a boolean-literal discriminant does not apply, so an explicit type predicate is used instead. */
function isDecodedLabel(result: SpecimenLabelParseResult): result is Extract<SpecimenLabelParseResult, { ok: true }> {
  return result.ok === true;
}

/** Read-only synthetic evaluation; no backing server or persistence. */
export function buildPilotAccessionIdentityView(): PilotAccessionIdentityView {
  const fixtures = createPilotAccessionIdentityFixtures();

  const labelRows: PilotLabelRow[] = fixtures.labels.map((raw) => {
    const result = parseSpecimenLabel(raw);
    if (isDecodedLabel(result)) {
      return {
        raw,
        outcome: 'ok',
        sitePrefix: result.parts.sitePrefix,
        sequence: result.parts.sequence,
        year: result.parts.year,
        explanation: `Decoded site ${result.parts.sitePrefix}, sequence ${result.parts.sequence}, year ${result.parts.year}.`,
      };
    }
    return {
      raw,
      outcome: result.ruleCode,
      sitePrefix: null,
      sequence: null,
      year: null,
      explanation: explainSpecimenLabelRuleCode(result.ruleCode),
    };
  });

  const identifierRows: PilotIdentifierRow[] = fixtures.identifiers.map((raw) => {
    try {
      const normalized = normalizeIdentifier(raw);
      return { raw, outcome: 'ok', canonical: normalized.canonical, explanation: `Normalized to canonical form ${normalized.canonical}.` };
    } catch (error) {
      if (!(error instanceof IdentifierNormalizationError)) throw error;
      return { raw, outcome: error.code, canonical: null, explanation: explainIdentifierNormalizationError(error.code) };
    }
  });

  const matchRows: PilotIdentifierMatchRow[] = fixtures.identifierPairs.map(({ rawA, rawB }) => {
    const result = scoreIdentifierMatch(rawA, rawB);
    const score = result.score.toFixed(2);
    const explanation = result.exact
      ? `Exact match at canonical form ${result.canonicalA}.`
      : result.isProbableMatch
        ? `Probable match (score ${score}); a person should confirm before merging these records.`
        : `No match; canonical forms differ (score ${score}).`;
    return {
      rawA, rawB, canonicalA: result.canonicalA, canonicalB: result.canonicalB,
      score, exact: result.exact, isProbableMatch: result.isProbableMatch, explanation,
    };
  });

  const aliquotRows: PilotAliquotRow[] = fixtures.aliquotSplits.map(({ scenario, input }) => {
    const result = planAliquotSplit(input);
    if (result.status === 'VALID') {
      return {
        scenario, parentAccessionId: result.parentAccessionId, status: 'VALID', children: result.children,
        failureCode: null, requestIndex: null,
        explanation: `Split accepted; ${result.children.length} aliquot${result.children.length === 1 ? '' : 's'} derived.`,
      };
    }
    return {
      scenario, parentAccessionId: result.parentAccessionId, status: 'INVALID', children: null,
      failureCode: result.failure.code, requestIndex: result.failure.requestIndex ?? null,
      explanation: explainAliquotSplitReason(result.failure.code),
    };
  });

  return {
    labelRows, identifierRows, matchRows, aliquotRows,
    counts: {
      labelsRefused: labelRows.filter((row) => row.outcome !== 'ok').length,
      identifiersUnresolved: identifierRows.filter((row) => row.outcome !== 'ok').length,
      splitsRefused: aliquotRows.filter((row) => row.status !== 'VALID').length,
    },
  };
}
