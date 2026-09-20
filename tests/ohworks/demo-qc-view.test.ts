import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotQcView } from '../../lib/ohworks-demo-qc-view';
import { evaluateQCWestgardMultirule, explainQCWestgardRuleCode } from '../../lib/ohworks-qc-westgard';

test('fabricated runs reproduce real evaluator outcomes, firings and rounded SDIs', () => {
  const view = buildPilotQcView();
  const results = view.runs.flatMap((run) => run.points.map((point) => ({
    runId: run.runId,
    levelId: point.levelId,
    value: point.value,
    timestamp: point.timestamp,
  })));
  assert.equal(view.levels.length, 2);
  assert.equal(results.length, 20);
  const evaluated = evaluateQCWestgardMultirule({ levels: view.levels, results });
  assert.deepEqual(view.runs.map((run) => run.status), evaluated.runs.map((run) => run.status));
  for (const [index, run] of view.runs.entries()) {
    assert.deepEqual(run.firedRules, evaluated.runs[index].violatedRules.map((firing) => ({
      code: firing.rule,
      severity: firing.severity,
      explanation: explainQCWestgardRuleCode(firing.rule),
    })));
    assert.deepEqual(run.points.map((point) => point.sdi), evaluated.points
      .filter((point) => point.runId === run.runId).map((point) => Number(point.sdi.toFixed(2))));
  }
  assert.deepEqual(view.runs.slice(0, 4).map((run) => run.status), ['accepted', 'warning', 'rejected', 'rejected']);
  assert.deepEqual(view.runs[0].firedRules, []);
  assert.deepEqual(view.runs[1].firedRules.map((rule) => rule.code), ['1_2s']);
  assert.deepEqual(view.runs[2].firedRules.filter((rule) => rule.severity === 'reject').map((rule) => rule.code), ['1_3s']);
  assert.deepEqual(view.runs[3].firedRules.filter((rule) => rule.severity === 'reject').map((rule) => rule.code), ['2_2s_across_levels']);
  assert.deepEqual(view.counts, { accepted: 7, warning: 1, rejected: 2 });
  assert.equal(view.runs[0].points[0].sdi, 0.25);
});

test('all fired rules carry explanations and all entity identifiers are synthetic', () => {
  const view = buildPilotQcView();
  for (const level of view.levels) assert.ok(level.levelId.startsWith('SYNTHETIC-'));
  for (const run of view.runs) {
    assert.ok(run.runId.startsWith('SYNTHETIC-'));
    for (const point of run.points) assert.ok(point.levelId.startsWith('SYNTHETIC-'));
    for (const rule of run.firedRules) assert.ok(rule.explanation.trim().length > 0);
  }
});

test('view is deterministic across calls and isolated from caller mutation', () => {
  const first = buildPilotQcView();
  assert.deepEqual(first, buildPilotQcView());
  first.levels[0].mean = 0;
  first.runs[0].points[0].value = 0;
  assert.notDeepEqual(first, buildPilotQcView());
});

test('view module has no clock, environment or fetch dependency', () => {
  const source = readFileSync(new URL('../../lib/ohworks-demo-qc-view.ts', import.meta.url), 'utf8');
  for (const forbidden of ['Date.now(', 'process.env', 'fetch(']) assert.ok(!source.includes(forbidden));
  assert.doesNotMatch(source, /new Date\(\s*\)/);
});
