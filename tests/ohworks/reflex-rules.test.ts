import assert from 'node:assert/strict';
import test from 'node:test';

import {
  planReflexTests,
  type ReflexPlanInput,
  type ReflexRule,
} from '../../lib/ohworks-reflex-rules';

/**
 * All fabricated: synthetic analyte codes, thresholds, and values. None of
 * this represents a real instrument, patient, or customer result.
 */
function baselineRule(overrides: Partial<ReflexRule> = {}): ReflexRule {
  return {
    id: 'rule-lead-high',
    triggerAnalyte: 'PB',
    comparison: 'gt',
    threshold: 10,
    reflexAnalytes: ['PB_SPECIATION'],
    maxReflexDepth: 1,
    ...overrides,
  };
}

function baselineInput(overrides: Partial<ReflexPlanInput> = {}): ReflexPlanInput {
  return {
    knownAnalytes: ['PB', 'PB_SPECIATION', 'AS', 'AS_CONFIRM', 'AS_CONFIRM_2'],
    rules: [baselineRule()],
    results: [{ analyte: 'PB', value: 15 }],
    ...overrides,
  };
}

test('a rule that fires adds its reflex analyte, attributed to that rule', () => {
  const plan = planReflexTests(baselineInput());
  assert.deepEqual(plan, {
    status: 'ok',
    additions: [{ analyte: 'PB_SPECIATION', ruleId: 'rule-lead-high', depth: 1 }],
  });
});

test('a rule whose comparison does not hold adds nothing', () => {
  const input = baselineInput({ results: [{ analyte: 'PB', value: 5 }] });
  const plan = planReflexTests(input);
  assert.deepEqual(plan, { status: 'ok', additions: [] });
});

test('a reflex analyte already present in results is not re-added', () => {
  const input = baselineInput({
    results: [
      { analyte: 'PB', value: 15 },
      { analyte: 'PB_SPECIATION', value: 3 },
    ],
  });
  const plan = planReflexTests(input);
  assert.deepEqual(plan, { status: 'ok', additions: [] });
});

test('two independent rules fire in declared rule order', () => {
  const input = baselineInput({
    knownAnalytes: ['PB', 'AS', 'PB_SPECIATION', 'AS_CONFIRM'],
    rules: [
      baselineRule({ id: 'rule-lead-high', triggerAnalyte: 'PB', reflexAnalytes: ['PB_SPECIATION'] }),
      baselineRule({
        id: 'rule-arsenic-high',
        triggerAnalyte: 'AS',
        reflexAnalytes: ['AS_CONFIRM'],
      }),
    ],
    results: [
      { analyte: 'PB', value: 15 },
      { analyte: 'AS', value: 20 },
    ],
  });
  const plan = planReflexTests(input);
  assert.deepEqual(plan, {
    status: 'ok',
    additions: [
      { analyte: 'PB_SPECIATION', ruleId: 'rule-lead-high', depth: 1 },
      { analyte: 'AS_CONFIRM', ruleId: 'rule-arsenic-high', depth: 1 },
    ],
  });
});

test('a rule with multiple reflex analytes adds them in declared order, skipping ones already present', () => {
  const input = baselineInput({
    knownAnalytes: ['PB', 'PB_SPECIATION', 'PB_ISOTOPE'],
    rules: [baselineRule({ reflexAnalytes: ['PB_SPECIATION', 'PB_ISOTOPE'] })],
    results: [
      { analyte: 'PB', value: 15 },
      { analyte: 'PB_ISOTOPE', value: 1 },
    ],
  });
  const plan = planReflexTests(input);
  assert.deepEqual(plan, {
    status: 'ok',
    additions: [{ analyte: 'PB_SPECIATION', ruleId: 'rule-lead-high', depth: 1 }],
  });
});

test('a chained reflex fires depth 2 when the depth-1 analyte already has a known result', () => {
  const input = baselineInput({
    knownAnalytes: ['PB', 'PB_SPECIATION', 'PB_CONFIRM'],
    rules: [
      baselineRule({ id: 'rule-lead-high', triggerAnalyte: 'PB', reflexAnalytes: ['PB_SPECIATION'], maxReflexDepth: 1 }),
      baselineRule({
        id: 'rule-speciation-high',
        triggerAnalyte: 'PB_SPECIATION',
        comparison: 'gt',
        threshold: 5,
        reflexAnalytes: ['PB_CONFIRM'],
        maxReflexDepth: 2,
      }),
    ],
    results: [
      { analyte: 'PB', value: 15 },
      { analyte: 'PB_SPECIATION', value: 8 },
    ],
  });
  const plan = planReflexTests(input);
  assert.deepEqual(plan, {
    status: 'ok',
    additions: [{ analyte: 'PB_CONFIRM', ruleId: 'rule-speciation-high', depth: 2 }],
  });
});

test('every comparison operator evaluates correctly at its boundary', () => {
  const scenarios: Array<{ comparison: ReflexRule['comparison']; threshold: number; value: number; fires: boolean }> = [
    { comparison: 'gt', threshold: 10, value: 10, fires: false },
    { comparison: 'gt', threshold: 10, value: 11, fires: true },
    { comparison: 'gte', threshold: 10, value: 10, fires: true },
    { comparison: 'lt', threshold: 10, value: 10, fires: false },
    { comparison: 'lt', threshold: 10, value: 9, fires: true },
    { comparison: 'lte', threshold: 10, value: 10, fires: true },
    { comparison: 'eq', threshold: 10, value: 10, fires: true },
    { comparison: 'eq', threshold: 10, value: 10.1, fires: false },
  ];
  for (const scenario of scenarios) {
    const input = baselineInput({
      rules: [baselineRule({ comparison: scenario.comparison, threshold: scenario.threshold })],
      results: [{ analyte: 'PB', value: scenario.value }],
    });
    const plan = planReflexTests(input);
    assert.equal(plan.status, 'ok');
    assert.equal(plan.status === 'ok' && plan.additions.length === 1, scenario.fires);
  }
});

test('no rules and no results plans a trivially empty, ok result', () => {
  const plan = planReflexTests({ knownAnalytes: [], rules: [], results: [] });
  assert.deepEqual(plan, { status: 'ok', additions: [] });
});

test('a blank rule id fails closed', () => {
  const input = baselineInput({ rules: [baselineRule({ id: '  ' })] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'rule-id-invalid'));
});

test('duplicate rule ids fail closed', () => {
  const input = baselineInput({
    rules: [baselineRule({ id: 'dup' }), baselineRule({ id: 'dup', triggerAnalyte: 'AS' })],
  });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'rule-id-duplicate' && r.ruleId === 'dup'));
});

test('a rule triggering on an analyte outside the declared panel fails closed', () => {
  const input = baselineInput({ rules: [baselineRule({ triggerAnalyte: 'UNKNOWN_ANALYTE' })] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(
    plan.status === 'blocked' &&
      plan.rejections.some((r) => r.code === 'trigger-analyte-unknown' && r.analyte === 'UNKNOWN_ANALYTE'),
  );
});

test('a rule reflexing to an analyte outside the declared panel fails closed', () => {
  const input = baselineInput({ rules: [baselineRule({ reflexAnalytes: ['NOT_IN_PANEL'] })] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(
    plan.status === 'blocked' &&
      plan.rejections.some((r) => r.code === 'reflex-analyte-unknown' && r.analyte === 'NOT_IN_PANEL'),
  );
});

test('an empty reflex-analytes list fails closed', () => {
  const input = baselineInput({ rules: [baselineRule({ reflexAnalytes: [] })] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'reflex-analytes-empty'));
});

test('an unrecognized comparison fails closed', () => {
  const input = baselineInput({
    rules: [baselineRule({ comparison: 'between' as unknown as ReflexRule['comparison'] })],
  });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'comparison-invalid'));
});

test('a non-finite threshold fails closed', () => {
  const input = baselineInput({ rules: [baselineRule({ threshold: NaN })] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'threshold-non-finite'));
});

test('a zero maximum reflex depth fails closed', () => {
  const input = baselineInput({ rules: [baselineRule({ maxReflexDepth: 0 })] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'max-reflex-depth-invalid'));
});

test('a non-integer maximum reflex depth fails closed', () => {
  const input = baselineInput({ rules: [baselineRule({ maxReflexDepth: 1.5 })] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'max-reflex-depth-invalid'));
});

test('a result analyte outside the declared panel fails closed', () => {
  const input = baselineInput({ results: [{ analyte: 'GHOST', value: 1 }] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(
    plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'result-analyte-unknown' && r.analyte === 'GHOST'),
  );
});

test('a duplicate result analyte fails closed', () => {
  const input = baselineInput({
    results: [
      { analyte: 'PB', value: 15 },
      { analyte: 'PB', value: 16 },
    ],
  });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(
    plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'result-analyte-duplicate' && r.analyte === 'PB'),
  );
});

test('a non-finite result value fails closed', () => {
  const input = baselineInput({ results: [{ analyte: 'PB', value: Infinity }] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked' && plan.rejections.some((r) => r.code === 'result-value-non-finite'));
});

test('a rule that reflexes back onto its own trigger analyte (self-cycle) fails closed', () => {
  const input = baselineInput({ rules: [baselineRule({ triggerAnalyte: 'PB', reflexAnalytes: ['PB'] })] });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(
    plan.status === 'blocked' &&
      plan.rejections.some((r) => r.code === 'rule-cycle-detected' && r.ruleId === 'rule-lead-high'),
  );
});

test('two rules that reflex into each other form a cycle and fail closed, citing both rule ids', () => {
  const input = baselineInput({
    knownAnalytes: ['PB', 'AS'],
    rules: [
      baselineRule({ id: 'rule-a', triggerAnalyte: 'PB', reflexAnalytes: ['AS'] }),
      baselineRule({ id: 'rule-b', triggerAnalyte: 'AS', reflexAnalytes: ['PB'] }),
    ],
    results: [{ analyte: 'PB', value: 15 }],
  });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.status === 'blocked');
  if (plan.status === 'blocked') {
    const cycleRuleIds = plan.rejections.filter((r) => r.code === 'rule-cycle-detected').map((r) => r.ruleId);
    assert.deepEqual(cycleRuleIds.sort(), ['rule-a', 'rule-b']);
  }
});

test('a cycle is reported even when current results never reach it', () => {
  const input = baselineInput({
    knownAnalytes: ['PB', 'AS', 'CD'],
    rules: [
      baselineRule({ id: 'rule-a', triggerAnalyte: 'CD', reflexAnalytes: ['AS'] }),
      baselineRule({ id: 'rule-b', triggerAnalyte: 'AS', reflexAnalytes: ['CD'] }),
    ],
    results: [{ analyte: 'PB', value: 15 }],
  });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
});

test('a chain that would need to fire beyond a rule declared maximum depth fails closed', () => {
  const input = baselineInput({
    knownAnalytes: ['PB', 'PB_SPECIATION', 'PB_CONFIRM'],
    rules: [
      baselineRule({ id: 'rule-lead-high', triggerAnalyte: 'PB', reflexAnalytes: ['PB_SPECIATION'], maxReflexDepth: 1 }),
      baselineRule({
        id: 'rule-speciation-high',
        triggerAnalyte: 'PB_SPECIATION',
        reflexAnalytes: ['PB_CONFIRM'],
        maxReflexDepth: 1,
      }),
    ],
    results: [
      { analyte: 'PB', value: 15 },
      { analyte: 'PB_SPECIATION', value: 8 },
    ],
  });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  assert.ok(
    plan.status === 'blocked' &&
      plan.rejections.some((r) => r.code === 'reflex-depth-exceeded' && r.ruleId === 'rule-speciation-high'),
  );
});

test('multiple independent schema defects are all reported, deterministically sorted', () => {
  const input = baselineInput({
    rules: [baselineRule({ threshold: NaN, maxReflexDepth: 0 })],
    results: [{ analyte: 'GHOST', value: 1 }],
  });
  const plan = planReflexTests(input);
  assert.equal(plan.status, 'blocked');
  if (plan.status === 'blocked') {
    const codes = plan.rejections.map((r) => r.code);
    assert.deepEqual([...codes].sort(), codes);
    assert.ok(codes.includes('threshold-non-finite'));
    assert.ok(codes.includes('max-reflex-depth-invalid'));
    assert.ok(codes.includes('result-analyte-unknown'));
  }
});

test('planning is pure: it does not mutate the input', () => {
  const input = baselineInput();
  const before = JSON.stringify(input);
  planReflexTests(input);
  assert.equal(JSON.stringify(input), before);
});

test('planning is deterministic across repeated calls with the same input', () => {
  const first = planReflexTests(baselineInput());
  const second = planReflexTests(baselineInput());
  assert.deepEqual(first, second);
});
