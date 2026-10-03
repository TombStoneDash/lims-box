import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotReleaseAuthorizationView, createPilotReleaseAuthorizationFixtures, DEMO_NOW } from '../../lib/ohworks-demo-release-authorization-view';
import { authorizeAnalystRelease, explainAuthorizationRule } from '../../lib/ohworks-analyst-authorization';
import { evaluateLockoutState, requiresSupervisorOverrideToUnlock } from '../../lib/ohworks-poct-lockout';

test('all seven fabricated release scenarios match the real authorization rules', () => {
  const view = buildPilotReleaseAuthorizationView();
  const fixtures = createPilotReleaseAuthorizationFixtures();
  assert.equal(view.now, DEMO_NOW);
  assert.deepEqual(view.releaseRows.map((row) => row.decision), ['AUTHORIZED', 'AUTHORIZED', 'REFUSED', 'REFUSED', 'REFUSED', 'REFUSED', 'REFUSED']);
  assert.deepEqual(view.releaseRows.map((row) => row.rule), [
    'routine-authorized', 'critical-authorized-with-second-reviewer', 'second-reviewer-required',
    'second-reviewer-same-as-analyst', 'competency-expired', 'analyst-suspended', 'method-unknown',
  ]);
  assert.equal(fixtures.releases.length, 7);
  fixtures.releases.forEach(({ analyst, candidate }, index) => {
    assert.equal(candidate.timestamp, DEMO_NOW);
    const result = authorizeAnalystRelease(analyst, candidate);
    assert.deepEqual(view.releaseRows[index], { ...result, method: candidate.method, flag: candidate.flag,
      analystId: analyst.analystId, explanation: explainAuthorizationRule(result.rule) });
    assert.ok(view.releaseRows[index].explanation.trim());
  });
  assert.equal(view.counts.refusedReleases, 5);
});

test('four fabricated devices match real lockout and supervisor override decisions', () => {
  const view = buildPilotReleaseAuthorizationView();
  const fixtures = createPilotReleaseAuthorizationFixtures();
  assert.equal(fixtures.devices.length, 4);
  assert.deepEqual(view.deviceRows.map((row) => row.locked), [false, true, true, true]);
  assert.deepEqual(view.deviceRows.map((row) => row.qcOverdue), [false, false, true, false]);
  assert.deepEqual(view.deviceRows.map((row) => row.overrideRequired), [false, true, false, false]);
  assert.deepEqual(view.deviceRows.map((row) => row.lastQcResult), ['pass', 'fail', 'pass', 'not_run']);
  assert.deepEqual(view.deviceRows.map((row) => row.hoursSinceLastQc), ['1.3', '1.0', '10.0', '—']);
  fixtures.devices.forEach((device, index) => {
    assert.equal(device.now, DEMO_NOW);
    const result = evaluateLockoutState(device);
    const row = view.deviceRows[index];
    assert.equal(row.deviceId, device.deviceId);
    assert.equal(row.lastQcResult, device.lastQcResult);
    assert.equal(row.locked, result.locked);
    assert.equal(row.qcOverdue, result.qcOverdue);
    assert.equal(row.reason, result.reason);
    assert.ok(row.reason.trim());
    assert.equal(row.overrideRequired, requiresSupervisorOverrideToUnlock({ locked: result.locked, lastQcResult: device.lastQcResult }));
  });
  assert.equal(view.counts.lockedDevices, 3);
});

test('all fixture and displayed identifiers are clearly synthetic', () => {
  const fixtures = createPilotReleaseAuthorizationFixtures();
  const view = buildPilotReleaseAuthorizationView();
  const ids = fixtures.releases.flatMap(({ analyst, candidate }) => [
    analyst.analystId, candidate.resultId, candidate.method, ...analyst.competencies.map((entry) => entry.method),
    ...(candidate.secondReviewerId ? [candidate.secondReviewerId] : []),
  ]);
  ids.push(...fixtures.devices.map((device) => device.deviceId));
  ids.push(...view.releaseRows.flatMap((row) => [row.resultId, row.method, row.analystId]), ...view.deviceRows.map((row) => row.deviceId));
  for (const id of ids) assert.match(id, /^SYNTHETIC-/);
  assert.equal(new Set(view.releaseRows.map((row) => row.resultId)).size, 7);
  assert.equal(new Set(view.deviceRows.map((row) => row.deviceId)).size, 4);
});

test('builder is deterministic, uses fresh fixtures and has no ambient inputs', () => {
  const before = buildPilotReleaseAuthorizationView();
  const fixtures = createPilotReleaseAuthorizationFixtures();
  fixtures.releases[0].analyst.competencies.length = 0;
  fixtures.devices[0].lastQcResult = 'fail';
  assert.deepEqual(buildPilotReleaseAuthorizationView(), before);
  assert.deepEqual(buildPilotReleaseAuthorizationView(), buildPilotReleaseAuthorizationView());
  const source = readFileSync('lib/ohworks-demo-release-authorization-view.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});

test('personnel panel is role-filtered, read-only and immediately before discovery', () => {
  const source = readFileSync('app/pilot/ohworks/personnel/page.tsx', 'utf8');
  const title = 'Release authorization and device lockout (fabricated)';
  assert.equal(source.split(title).length - 1, 1);
  assert.match(source, /visiblePersonnel\.length > 0 && \(\s*<section[^>]*>\s*<h2[^>]*>Release authorization and device lockout/);
  assert.match(source, /const releaseAuthorization = buildPilotReleaseAuthorizationView\(\)/);
  const panelEnd = source.indexOf('</section>', source.indexOf(title));
  assert.match(source.slice(panelEnd), /^<\/section>\s*\)\}\s*<section[^>]*>\s*<div[^>]*>\s*<AlertTriangle[^>]*\/>\s*<h2[^>]*>Discovery still required for real users/);
  const panel = source.slice(source.indexOf(title), panelEnd);
  assert.equal((panel.match(/<table\b/g) ?? []).length, 2);
  assert.match(panel, /not authentication and not a real authorization record/);
  assert.doesNotMatch(source, /['"]use client['"]|<form\b|fetch\s*\(|authorizeAnalystRelease\(|evaluateLockoutState\(|requiresSupervisorOverrideToUnlock\(/);
});
