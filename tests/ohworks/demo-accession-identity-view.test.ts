import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPilotAccessionIdentityView, createPilotAccessionIdentityFixtures,
} from '../../lib/ohworks-demo-accession-identity-view';
import {
  parseSpecimenLabel, explainSpecimenLabelRuleCode, formatSpecimenLabel, KNOWN_SITE_PREFIXES,
  type SpecimenLabelParseResult,
} from '../../lib/ohworks-specimen-label';

// This repo's tsconfig disables strictNullChecks, under which control-flow narrowing on a
// boolean-literal discriminant does not apply, so an explicit type predicate is used instead.
function isDecodedLabel(result: SpecimenLabelParseResult): result is Extract<SpecimenLabelParseResult, { ok: true }> {
  return result.ok === true;
}
import { normalizeIdentifier, scoreIdentifierMatch, explainIdentifierNormalizationError, IdentifierNormalizationError } from '../../lib/ohworks-identifier-normalization';
import { planAliquotSplit, explainAliquotSplitReason } from '../../lib/ohworks-aliquot-split';

test('six fabricated label scenarios match the real parser on exported fixtures', () => {
  const view = buildPilotAccessionIdentityView();
  const fixtures = createPilotAccessionIdentityFixtures();
  assert.equal(fixtures.labels.length, 6);
  assert.deepEqual(view.labelRows.map((row) => row.outcome), [
    'ok', 'ok', 'check-character-invalid', 'mixed-case', 'length-invalid', 'site-prefix-unknown',
  ]);
  fixtures.labels.forEach((raw, index) => {
    const expected = parseSpecimenLabel(raw);
    const row = view.labelRows[index];
    assert.equal(row.raw, raw);
    if (isDecodedLabel(expected)) {
      assert.equal(row.outcome, 'ok');
      assert.equal(row.sitePrefix, expected.parts.sitePrefix);
      assert.equal(row.sequence, expected.parts.sequence);
      assert.equal(row.year, expected.parts.year);
    } else {
      assert.equal(row.outcome, expected.ruleCode);
      assert.equal(row.sitePrefix, null);
      assert.equal(row.sequence, null);
      assert.equal(row.year, null);
      assert.equal(row.explanation, explainSpecimenLabelRuleCode(expected.ruleCode));
    }
  });
  assert.equal(fixtures.labels[0], formatSpecimenLabel({ sitePrefix: 'LAB', sequence: 123, year: 26 }));
  assert.equal(fixtures.labels[1], formatSpecimenLabel({ sitePrefix: 'ENV', sequence: 456, year: 26 }));
});

test('six fabricated identifier scenarios match the real normalizer on exported fixtures', () => {
  const view = buildPilotAccessionIdentityView();
  const fixtures = createPilotAccessionIdentityFixtures();
  assert.equal(fixtures.identifiers.length, 6);
  assert.deepEqual(view.identifierRows.map((row) => row.outcome), [
    'ok', 'ok', 'ok', 'ok', 'undeclared-ocr-position', 'unrecognized-prefix',
  ]);
  assert.deepEqual(view.identifierRows.slice(0, 4).map((row) => row.canonical), [
    'ACC-000123', 'ACC-000123', 'ACC-000123', 'ACC-000123',
  ]);
  fixtures.identifiers.forEach((raw, index) => {
    const row = view.identifierRows[index];
    try {
      const expected = normalizeIdentifier(raw);
      assert.equal(row.outcome, 'ok');
      assert.equal(row.canonical, expected.canonical);
    } catch (error) {
      assert.ok(error instanceof IdentifierNormalizationError);
      assert.equal(row.outcome, error.code);
      assert.equal(row.canonical, null);
      assert.equal(row.explanation, explainIdentifierNormalizationError(error.code));
    }
  });
});

test('three fabricated identifier comparisons match the real scorer on exported fixtures', () => {
  const view = buildPilotAccessionIdentityView();
  const fixtures = createPilotAccessionIdentityFixtures();
  assert.equal(fixtures.identifierPairs.length, 3);
  assert.deepEqual(view.matchRows.map((row) => [row.exact, row.isProbableMatch]), [
    [true, true], [false, true], [false, false],
  ]);
  fixtures.identifierPairs.forEach(({ rawA, rawB }, index) => {
    const expected = scoreIdentifierMatch(rawA, rawB);
    const row = view.matchRows[index];
    assert.equal(row.canonicalA, expected.canonicalA);
    assert.equal(row.canonicalB, expected.canonicalB);
    assert.equal(row.score, expected.score.toFixed(2));
    assert.equal(row.exact, expected.exact);
    assert.equal(row.isProbableMatch, expected.isProbableMatch);
  });
  assert.equal(view.matchRows[0].score, '1.00');
  assert.equal(view.matchRows[1].score, '0.83');
  assert.equal(view.matchRows[2].score, '0.00');
});

test('four fabricated aliquot split scenarios match the real planner on exported fixtures', () => {
  const view = buildPilotAccessionIdentityView();
  const fixtures = createPilotAccessionIdentityFixtures();
  assert.equal(fixtures.aliquotSplits.length, 4);
  assert.deepEqual(view.aliquotRows.map((row) => [row.status, row.failureCode]), [
    ['VALID', null],
    ['INVALID', 'over-allocation'],
    ['INVALID', 'derivation-depth-exceeded'],
    ['INVALID', 'child-id-duplicate'],
  ]);
  fixtures.aliquotSplits.forEach(({ input }, index) => {
    const expected = planAliquotSplit(input);
    const row = view.aliquotRows[index];
    assert.equal(row.parentAccessionId, expected.parentAccessionId);
    assert.equal(row.status, expected.status);
    if (expected.status === 'VALID') {
      assert.deepEqual(row.children, expected.children);
    } else {
      assert.equal(row.failureCode, expected.failure.code);
      assert.equal(row.requestIndex, expected.failure.requestIndex ?? null);
      assert.equal(row.explanation, explainAliquotSplitReason(expected.failure.code));
    }
  });
  assert.equal(view.aliquotRows[0].children?.length, 3);
  assert.equal(view.aliquotRows[3].requestIndex, 1);
});

test('headline counts match refused and unresolved rows', () => {
  const view = buildPilotAccessionIdentityView();
  assert.deepEqual(view.counts, {
    labelsRefused: view.labelRows.filter((row) => row.outcome !== 'ok').length,
    identifiersUnresolved: view.identifierRows.filter((row) => row.outcome !== 'ok').length,
    splitsRefused: view.aliquotRows.filter((row) => row.status !== 'VALID').length,
  });
  assert.equal(view.counts.labelsRefused, 4);
  assert.equal(view.counts.identifiersUnresolved, 2);
  assert.equal(view.counts.splitsRefused, 3);
});

test('error rows do not throw out of the builder and every explanation is non-empty', () => {
  assert.doesNotThrow(() => buildPilotAccessionIdentityView());
  const view = buildPilotAccessionIdentityView();
  for (const row of [...view.labelRows, ...view.identifierRows, ...view.matchRows, ...view.aliquotRows]) {
    assert.ok(row.explanation.trim());
  }
});

test('fabricated identifiers use synthetic prefixes where the module allows it', () => {
  const fixtures = createPilotAccessionIdentityFixtures();
  const view = buildPilotAccessionIdentityView();
  for (const { input } of fixtures.aliquotSplits) {
    assert.match(input.parent.accessionId, /^SYNTHETIC-/);
  }
  for (const row of view.aliquotRows) {
    assert.match(row.parentAccessionId, /^SYNTHETIC-/);
    for (const child of row.children ?? []) {
      assert.match(child.childId, /^SYNTHETIC-/);
    }
  }
  for (const prefix of KNOWN_SITE_PREFIXES) {
    assert.match(prefix, /^[A-Z]{3}$/);
  }
});

test('builder is deterministic', () => {
  const first = buildPilotAccessionIdentityView();
  assert.deepEqual(first, buildPilotAccessionIdentityView());
});

test('view-model source has no ambient inputs', () => {
  const source = readFileSync('lib/ohworks-demo-accession-identity-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random|process\.env|fetch\s*\(/);
});

test('panel is a read-only server component with no forbidden copy', () => {
  const source = readFileSync('app/pilot/ohworks/_components/accession-identity-panel.tsx', 'utf8');
  assert.doesNotMatch(source, /['"]use client['"]/);
  assert.match(source, /fabricated/);
  assert.match(source, /import \{ buildPilotAccessionIdentityView \} from '@\/lib\/ohworks-demo-accession-identity-view';/);
  assert.doesNotMatch(source, /production-ready/i);
  assert.doesNotMatch(source, /live integration is supported/i);
  assert.doesNotMatch(source, /\b(?:is|are|now)\s+(?:accredited|certified|validated)\b/i);
  assert.doesNotMatch(source, /<form\b|fetch\s*\(/);
});

test('accessions page imports and renders AccessionIdentityPanel exactly once', () => {
  const source = readFileSync('app/pilot/ohworks/accessions/page.tsx', 'utf8');
  assert.equal((source.match(/import \{ AccessionIdentityPanel \} from '@\/app\/pilot\/ohworks\/_components\/accession-identity-panel';/g) ?? []).length, 1);
  assert.equal((source.match(/<AccessionIdentityPanel\s*\/>/g) ?? []).length, 1);
});
