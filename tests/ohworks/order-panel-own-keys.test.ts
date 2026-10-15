import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expandOrderPanels,
  OrderPanelError,
  validateOrderPanelCatalogue,
  type OrderPanelCatalogue,
} from '../../lib/ohworks-order-panel';

const INHERITED_CODES = ['constructor', 'toString', '__proto__'];

test('undeclared inherited panel codes are unknown while valid order lines still expand', () => {
  const catalogue: OrderPanelCatalogue = {
    VALID: [{ code: 'ANALYTE_A', kind: 'ANALYTE' }],
  };
  const result = expandOrderPanels(catalogue, ['ANALYTE_A', 'ANALYTE_B'], [
    ...INHERITED_CODES.map((code) => ({ code, kind: 'PANEL' as const })),
    { code: 'VALID', kind: 'PANEL' },
    { code: 'ANALYTE_B', kind: 'ANALYTE' },
  ]);

  assert.deepEqual(result.unknownCodes, INHERITED_CODES.map((code) => ({ code, kind: 'PANEL' })));
  assert.deepEqual(result.analyteCodes, ['ANALYTE_A', 'ANALYTE_B']);
  assert.deepEqual(result.nestingViolations, []);
});

test('undeclared inherited nested panel references raise the typed catalogue error', () => {
  for (const code of INHERITED_CODES) {
    const catalogue: OrderPanelCatalogue = {
      OUTER: [{ code, kind: 'PANEL' }],
    };
    assert.throws(
      () => validateOrderPanelCatalogue(catalogue),
      (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-unknown-panel-reference',
      code,
    );
    assert.throws(
      () => expandOrderPanels(catalogue, [], [{ code: 'OUTER', kind: 'PANEL' }]),
      (error: unknown) => error instanceof OrderPanelError && error.code === 'catalogue-unknown-panel-reference',
      code,
    );
  }
});

test('explicitly declared own panels, including inherited-looking names, expand', () => {
  const catalogue: OrderPanelCatalogue = {
    OUTER: INHERITED_CODES.map((code) => ({ code, kind: 'PANEL' as const })),
    constructor: [{ code: 'ANALYTE_A', kind: 'ANALYTE' as const }],
    toString: [{ code: 'ANALYTE_B', kind: 'ANALYTE' as const }],
    ['__proto__']: [{ code: 'ANALYTE_C', kind: 'ANALYTE' }],
  };
  const result = expandOrderPanels(catalogue, ['ANALYTE_A', 'ANALYTE_B', 'ANALYTE_C'], [
    { code: 'OUTER', kind: 'PANEL' },
    ...INHERITED_CODES.map((code) => ({ code, kind: 'PANEL' as const })),
  ]);

  assert.deepEqual(result.analyteCodes, ['ANALYTE_A', 'ANALYTE_B', 'ANALYTE_C']);
  assert.deepEqual(result.unknownCodes, []);
  assert.deepEqual(result.nestingViolations, []);
});

test('null-prototype catalogues support declared panels and nested references', () => {
  const catalogue: Record<string, readonly { code: string; kind: 'ANALYTE' | 'PANEL' }[]> = Object.create(null);
  catalogue.OUTER = [{ code: 'INNER', kind: 'PANEL' }];
  catalogue.INNER = [{ code: 'ANALYTE_A', kind: 'ANALYTE' }];

  const result = expandOrderPanels(catalogue, ['ANALYTE_A'], [{ code: 'OUTER', kind: 'PANEL' }]);
  assert.deepEqual(result.analyteCodes, ['ANALYTE_A']);
  assert.deepEqual(result.unknownCodes, []);
});
