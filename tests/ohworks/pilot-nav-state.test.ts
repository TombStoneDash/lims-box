import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { isPilotNavActive, roleChangeAnnouncement } from '../../lib/ohworks-pilot-nav-state';

const root = resolve(import.meta.dirname, '../..');

test('isPilotNavActive matches exact paths and tolerates a single trailing slash', () => {
  assert.equal(isPilotNavActive('/pilot/ohworks/qc', '/pilot/ohworks/qc'), true);
  assert.equal(isPilotNavActive('/pilot/ohworks/qc/', '/pilot/ohworks/qc'), true);
  assert.equal(isPilotNavActive('/pilot/ohworks/qc', '/pilot/ohworks/qc/'), true);
  assert.equal(isPilotNavActive('/pilot/ohworks', '/pilot/ohworks/qc'), false);
  assert.equal(isPilotNavActive('/pilot/ohworks/qc', '/pilot/ohworks'), false);
  assert.equal(isPilotNavActive(null, '/pilot/ohworks'), false);
  assert.equal(isPilotNavActive(undefined, '/pilot/ohworks'), false);
  assert.equal(isPilotNavActive('', '/pilot/ohworks'), false);
});

test('roleChangeAnnouncement announces the resolved role or pending state', () => {
  assert.equal(roleChangeAnnouncement('Technical reviewer', false), 'Showing the Technical reviewer view.');
  assert.equal(roleChangeAnnouncement('Technical reviewer', true), 'Updating view...');
  assert.equal(roleChangeAnnouncement(undefined, false), '');
});

const navLink = readFileSync(resolve(root, 'app/pilot/ohworks/_components/pilot-nav-link.tsx'), 'utf8');
const roleSwitch = readFileSync(resolve(root, 'app/pilot/ohworks/_components/role-switch.tsx'), 'utf8');
const navState = readFileSync(resolve(root, 'lib/ohworks-pilot-nav-state.ts'), 'utf8');

test('pilot-nav-link.tsx exposes the active page and keeps the icon map parseable', () => {
  assert.match(navLink, /aria-current/);
  assert.match(navLink, /isPilotNavActive\(/);
  assert.match(navLink, /aria-hidden/);
  assert.match(navLink, /const icons = \{[\s\S]*?\} as const/);
});

test('role-switch.tsx announces role changes and stays inside the contract', () => {
  assert.match(roleSwitch, /role="status"/);
  assert.match(roleSwitch, /aria-live="polite"/);
  assert.match(roleSwitch, /id="ohworks-synthetic-role"/);
  assert.match(roleSwitch, /aria-describedby="ohworks-synthetic-role-note"/);
  assert.match(roleSwitch, /Demo role simulator - not authentication/);
  assert.doesNotMatch(roleSwitch, /@\/lib\/ohworks-pilot/);
  assert.doesNotMatch(roleSwitch, /fixtures\/ohworks/);
  assert.doesNotMatch(roleSwitch, /workflowCases/);
  assert.doesNotMatch(roleSwitch, /assistantKnowledge/);
});

test('lib/ohworks-pilot-nav-state.ts stays a pure module with no pilot fixture imports', () => {
  assert.doesNotMatch(navState, /ohworks-pilot'/);
  assert.doesNotMatch(navState, /ohworks-pilot"/);
});
