import assert from 'node:assert/strict';
import test from 'node:test';

import {
  explainOrderPanelError,
  expandOrderPanels,
  OrderPanelError,
  validateOrderPanelCatalogue,
  type OrderPanelCatalogue,
  type OrderPanelErrorCode,
} from '../../lib/ohworks-order-panel';

/**
 * All fabricated: synthetic panel codes, analyte codes, and orders. None of
 * this represents a real compendium, patient, or order.
 */
const CATALOGUE: OrderPanelCatalogue = {
  BASIC_METABOLIC: [
    { code: 'SODIUM', kind: 'ANALYTE' },
    { code: 'POTASSIUM', kind: 'ANALYTE' },
    { code: 'GLUCOSE', kind: 'ANALYTE' },
  ],
  ELECTROLYTES: [
    { code: 'SODIUM', kind: 'ANALYTE' },
    { code: 'POTASSIUM', kind: 'ANALYTE' },
    { code: 'CHLORIDE', kind: 'ANALYTE' },
  ],
  COMPREHENSIVE_METABOLIC: [
    { code: 'BASIC_METABOLIC', kind: 'PANEL' },
    { code: 'CALCIUM', kind: 'ANALYTE' },
  ],
  DOUBLE_NESTED: [
    { code: 'ELECTROLYTES_WITH_PANEL', kind: 'PANEL' },
    { code: 'MAGNESIUM', kind: 'ANALYTE' },
  ],
  ELECTROLYTES_WITH_PANEL: [
    { code: 'SODIUM', kind: 'ANALYTE' },
    { code: 'BASIC_METABOLIC', kind: 'PANEL' },
  ],
};

const KNOWN_ANALYTES = [
  'SODIUM',
  'POTASSIUM',
  'GLUCOSE',
  'CHLORIDE',
  'CALCIUM',
  'MAGNESIUM',
];

test('expands a flat panel into its declared analyte codes', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [{ code: 'BASIC_METABOLIC', kind: 'PANEL' }]);
  assert.deepEqual(result.analyteCodes, ['SODIUM', 'POTASSIUM', 'GLUCOSE']);
  assert.deepEqual(result.unknownCodes, []);
  assert.deepEqual(result.nestingViolations, []);
});

test('expands a single analyte order line directly', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [{ code: 'CALCIUM', kind: 'ANALYTE' }]);
  assert.deepEqual(result.analyteCodes, ['CALCIUM']);
});

test('de-duplicates analytes across overlapping panels, preserving first-seen order', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [
    { code: 'BASIC_METABOLIC', kind: 'PANEL' },
    { code: 'ELECTROLYTES', kind: 'PANEL' },
  ]);
  assert.deepEqual(result.analyteCodes, ['SODIUM', 'POTASSIUM', 'GLUCOSE', 'CHLORIDE']);
});

test('de-duplicates a single analyte already covered by an earlier panel, keeping first-seen position', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [
    { code: 'BASIC_METABOLIC', kind: 'PANEL' },
    { code: 'SODIUM', kind: 'ANALYTE' },
    { code: 'CALCIUM', kind: 'ANALYTE' },
  ]);
  assert.deepEqual(result.analyteCodes, ['SODIUM', 'POTASSIUM', 'GLUCOSE', 'CALCIUM']);
});

test('expands a panel nested exactly one level below an ordered panel', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [
    { code: 'COMPREHENSIVE_METABOLIC', kind: 'PANEL' },
  ]);
  assert.deepEqual(result.analyteCodes, ['SODIUM', 'POTASSIUM', 'GLUCOSE', 'CALCIUM']);
  assert.deepEqual(result.nestingViolations, []);
});

test('reports a nesting violation for a panel nested two levels deep and excludes it from the analyte list', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [{ code: 'DOUBLE_NESTED', kind: 'PANEL' }]);
  // MAGNESIUM (direct member) and SODIUM (member of the depth-1 nested panel) still expand.
  assert.deepEqual(result.analyteCodes, ['SODIUM', 'MAGNESIUM']);
  assert.deepEqual(result.nestingViolations, [
    { panelCode: 'DOUBLE_NESTED', nestedPanelCode: 'ELECTROLYTES_WITH_PANEL', offendingCode: 'BASIC_METABOLIC' },
  ]);
  // BASIC_METABOLIC's own analytes (POTASSIUM, GLUCOSE) are not pulled in.
  assert.ok(!result.analyteCodes.includes('POTASSIUM'));
  assert.ok(!result.analyteCodes.includes('GLUCOSE'));
});

test('de-duplicates a repeated nesting violation when the same panel is ordered twice', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [
    { code: 'DOUBLE_NESTED', kind: 'PANEL' },
    { code: 'DOUBLE_NESTED', kind: 'PANEL' },
  ]);
  assert.equal(result.nestingViolations.length, 1);
});

test('reports an unknown panel code in the order without throwing, and still expands the rest of the order', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [
    { code: 'NOT_A_REAL_PANEL', kind: 'PANEL' },
    { code: 'CALCIUM', kind: 'ANALYTE' },
  ]);
  assert.deepEqual(result.unknownCodes, [{ code: 'NOT_A_REAL_PANEL', kind: 'PANEL' }]);
  assert.deepEqual(result.analyteCodes, ['CALCIUM']);
});

test('reports an unknown single-analyte code in the order without throwing', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [{ code: 'UNOBTAINIUM', kind: 'ANALYTE' }]);
  assert.deepEqual(result.unknownCodes, [{ code: 'UNOBTAINIUM', kind: 'ANALYTE' }]);
  assert.deepEqual(result.analyteCodes, []);
});

test('reports an unknown analyte discovered while expanding a panel member', () => {
  const catalogue: OrderPanelCatalogue = {
    STRAY_MEMBER_PANEL: [
      { code: 'SODIUM', kind: 'ANALYTE' },
      { code: 'PHLOGISTON', kind: 'ANALYTE' },
    ],
  };
  const result = expandOrderPanels(catalogue, KNOWN_ANALYTES, [{ code: 'STRAY_MEMBER_PANEL', kind: 'PANEL' }]);
  assert.deepEqual(result.analyteCodes, ['SODIUM']);
  assert.deepEqual(result.unknownCodes, [{ code: 'PHLOGISTON', kind: 'ANALYTE' }]);
});

test('de-duplicates unknown codes across multiple occurrences', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [
    { code: 'UNOBTAINIUM', kind: 'ANALYTE' },
    { code: 'UNOBTAINIUM', kind: 'ANALYTE' },
  ]);
  assert.equal(result.unknownCodes.length, 1);
});

test('an unknown analyte code and an unknown panel code with the same string are reported separately', () => {
  const catalogue: OrderPanelCatalogue = {
    X: [{ code: 'SODIUM', kind: 'ANALYTE' }],
  };
  const result = expandOrderPanels(catalogue, KNOWN_ANALYTES, [
    { code: 'GHOST', kind: 'ANALYTE' },
    { code: 'GHOST', kind: 'PANEL' },
  ]);
  assert.deepEqual(result.unknownCodes, [
    { code: 'GHOST', kind: 'ANALYTE' },
    { code: 'GHOST', kind: 'PANEL' },
  ]);
});

test('an empty order expands to an empty result', () => {
  const result = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, []);
  assert.deepEqual(result, { analyteCodes: [], unknownCodes: [], nestingViolations: [] });
});

test('never mutates its inputs and is deterministic for identical inputs', () => {
  const order = [{ code: 'BASIC_METABOLIC', kind: 'PANEL' as const }];
  const first = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, order);
  const second = expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, order);
  assert.deepEqual(first, second);
});

// --- validateOrderPanelCatalogue / fail-closed catalogue integrity ---

test('validateOrderPanelCatalogue accepts a well-formed catalogue', () => {
  assert.doesNotThrow(() => validateOrderPanelCatalogue(CATALOGUE));
});

test('fails closed on a PANEL-kind member referencing an undeclared panel ("unknown panels")', () => {
  const catalogue: OrderPanelCatalogue = {
    ORPHAN_REFERENCE: [{ code: 'NOT_DECLARED', kind: 'PANEL' }],
  };
  assert.throws(
    () => validateOrderPanelCatalogue(catalogue),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-unknown-panel-reference',
  );
});

test('expandOrderPanels fails closed on the same undeclared panel reference before touching the order', () => {
  const catalogue: OrderPanelCatalogue = {
    ORPHAN_REFERENCE: [{ code: 'NOT_DECLARED', kind: 'PANEL' }],
  };
  assert.throws(
    () => expandOrderPanels(catalogue, KNOWN_ANALYTES, [{ code: 'ORPHAN_REFERENCE', kind: 'PANEL' }]),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-unknown-panel-reference',
  );
});

test('fails closed on a panel that references itself (a length-one cycle)', () => {
  const catalogue: OrderPanelCatalogue = {
    SELF_LOOP: [{ code: 'SELF_LOOP', kind: 'PANEL' }],
  };
  assert.throws(
    () => validateOrderPanelCatalogue(catalogue),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-cycle-detected',
  );
});

test('fails closed on a two-panel mutual reference cycle', () => {
  const catalogue: OrderPanelCatalogue = {
    PANEL_A: [{ code: 'PANEL_B', kind: 'PANEL' }],
    PANEL_B: [{ code: 'PANEL_A', kind: 'PANEL' }],
  };
  assert.throws(
    () => validateOrderPanelCatalogue(catalogue),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-cycle-detected',
  );
});

test('fails closed on a longer cycle reachable through an unrelated panel', () => {
  const catalogue: OrderPanelCatalogue = {
    ENTRY: [{ code: 'PANEL_A', kind: 'PANEL' }],
    PANEL_A: [{ code: 'PANEL_B', kind: 'PANEL' }],
    PANEL_B: [{ code: 'PANEL_C', kind: 'PANEL' }],
    PANEL_C: [{ code: 'PANEL_A', kind: 'PANEL' }],
  };
  assert.throws(
    () => validateOrderPanelCatalogue(catalogue),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-cycle-detected',
  );
});

test('cycle detection covers every catalogue entry, not just ones reachable from the first key', () => {
  const catalogue: OrderPanelCatalogue = {
    UNRELATED: [{ code: 'SODIUM', kind: 'ANALYTE' }],
    PANEL_A: [{ code: 'PANEL_B', kind: 'PANEL' }],
    PANEL_B: [{ code: 'PANEL_A', kind: 'PANEL' }],
  };
  assert.throws(
    () => validateOrderPanelCatalogue(catalogue),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-cycle-detected',
  );
});

test('fails closed on an empty panel member code', () => {
  const catalogue: OrderPanelCatalogue = {
    BROKEN: [{ code: '', kind: 'ANALYTE' }],
  };
  assert.throws(
    () => validateOrderPanelCatalogue(catalogue),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-member-code-missing',
  );
});

test('fails closed on an empty known-analyte code', () => {
  assert.throws(
    () => expandOrderPanels(CATALOGUE, ['SODIUM', ''], [{ code: 'CALCIUM', kind: 'ANALYTE' }]),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'known-analyte-code-missing',
  );
});

test('fails closed on an empty order-line code', () => {
  assert.throws(
    () => expandOrderPanels(CATALOGUE, KNOWN_ANALYTES, [{ code: '', kind: 'ANALYTE' }]),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'order-line-code-missing',
  );
});

test('checks catalogue integrity before known-analyte codes and order lines', () => {
  const catalogue: OrderPanelCatalogue = {
    SELF_LOOP: [{ code: 'SELF_LOOP', kind: 'PANEL' }],
  };
  assert.throws(
    () => expandOrderPanels(catalogue, [''], [{ code: '', kind: 'ANALYTE' }]),
    (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-cycle-detected',
  );
});

test('explainOrderPanelError returns deterministic, non-empty text for every error code', () => {
  const codes: OrderPanelErrorCode[] = [
    'catalogue-panel-code-missing',
    'catalogue-member-code-missing',
    'catalogue-unknown-panel-reference',
    'catalogue-cycle-detected',
    'known-analyte-code-missing',
    'order-line-code-missing',
  ];
  for (const code of codes) {
    const message = explainOrderPanelError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});
