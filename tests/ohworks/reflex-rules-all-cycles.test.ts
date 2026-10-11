import assert from 'node:assert/strict';
import test from 'node:test';

import { planReflexTests, type ReflexRule } from '../../lib/ohworks-reflex-rules';

// Fabricated graph labels and thresholds only; no customer or instrument data.
function rule(id: string, triggerAnalyte: string, ...reflexAnalytes: string[]): ReflexRule {
  return { id, triggerAnalyte, reflexAnalytes, comparison: 'gt', threshold: 1, maxReflexDepth: 20 };
}

function plan(rules: ReflexRule[]) {
  return planReflexTests({
    knownAnalytes: [...new Set(rules.flatMap((r) => [r.triggerAnalyte, ...r.reflexAnalytes]))],
    rules,
    results: [],
  });
}

function assertCycles(rules: ReflexRule[], ids: string[]) {
  assert.deepEqual(plan(rules), {
    status: 'blocked',
    rejections: [...ids].sort().map((ruleId) => ({ code: 'rule-cycle-detected', ruleId })),
  }, `rule order: ${rules.map((r) => r.id).join(', ')}`);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, i) =>
    permutations(items.filter((_, j) => i !== j)).map((rest) => [item, ...rest]),
  );
}

test('overlapping cycles report all four rules in all 24 input permutations', () => {
  const rules = [rule('ab', 'A', 'B'), rule('ba', 'B', 'A'), rule('ac', 'A', 'C'), rule('cb', 'C', 'B')];
  const orders = permutations(rules);
  assert.equal(orders.length, 24);
  for (const ordered of orders) assertCycles(ordered, ['ab', 'ba', 'ac', 'cb']);
});

test('parallel edges and paths report every participant', () => {
  const rules = [
    rule('ab-1', 'A', 'B'), rule('ab-2', 'A', 'B'), rule('bd', 'B', 'D'),
    rule('ac', 'A', 'C'), rule('cd', 'C', 'D'), rule('da', 'D', 'A'),
  ];
  for (const ordered of permutations(rules)) assertCycles(ordered, rules.map((r) => r.id));
});

test('self-loops and disconnected cycles report all participants once', () => {
  const rules = [
    rule('zz', 'Z', 'Z', 'Z'), rule('ab', 'A', 'B'), rule('ba', 'B', 'A'),
    rule('xy', 'X', 'Y'), rule('yx', 'Y', 'X'), rule('acyclic', 'P', 'Q'),
  ];
  assertCycles(rules, ['zz', 'ab', 'ba', 'xy', 'yx']);
  assertCycles([...rules].reverse(), ['zz', 'ab', 'ba', 'xy', 'yx']);
});

test('edges entering, leaving, or connecting cyclic components are not flagged', () => {
  const rules = [
    rule('entry', 'P', 'A'), rule('ab', 'A', 'B'), rule('ba', 'B', 'A'),
    rule('exit', 'B', 'Q'), rule('bridge', 'B', 'X'),
    rule('xy', 'X', 'Y'), rule('yx', 'Y', 'X'), rule('tail', 'Y', 'R'),
  ];
  assertCycles(rules, ['ab', 'ba', 'xy', 'yx']);
  assertCycles([...rules].reverse(), ['ab', 'ba', 'xy', 'yx']);
});

test('a multi-target rule is reported once when any target participates in a cycle', () => {
  for (const targets of [['Q', 'B', 'C'], ['C', 'B', 'Q']]) {
    assertCycles([
      rule('fan-out', 'A', ...targets), rule('ba', 'B', 'A'), rule('ca', 'C', 'A'),
      rule('entry', 'P', 'A'),
    ], ['fan-out', 'ba', 'ca']);
  }
});

test('an acyclic graph with converging paths has no cycle rejections', () => {
  assert.deepEqual(plan([
    rule('ab', 'A', 'B'), rule('ac', 'A', 'C'), rule('bd', 'B', 'D'), rule('cd', 'C', 'D'),
  ]), { status: 'ok', additions: [] });
});
