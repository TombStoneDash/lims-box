import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createSessionToken, verifySessionToken } from '../../lib/ohworks-tenant/auth-core';
import type { TenantPrincipal } from '../../lib/ohworks-tenant/model';
import { authorizeAction, permissionsFor } from '../../lib/ohworks-tenant/permissions';

const root = resolve(import.meta.dirname, '../..');
const customerFiles = [
  'app/pilot/ohworks/layout.tsx', 'app/pilot/ohworks/login/page.tsx', 'app/pilot/ohworks/page.tsx',
  'app/pilot/ohworks/samples/page.tsx', 'app/pilot/ohworks/results/page.tsx',
  'app/pilot/ohworks/reports/page.tsx', 'app/pilot/ohworks/reports/[reportId]/page.tsx',
  'app/pilot/ohworks/personnel/page.tsx', 'app/pilot/ohworks/audit/page.tsx',
  'app/pilot/ohworks/instrument/page.tsx',
];

test('customer-rendered source omits internal presentation language', () => {
  const renderedSource = customerFiles.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
  for (const phrase of ['supervised demo', 'discovery simulator', 'local proof', 'deterministic corpus', 'hypothesis', 'not authentication', 'does not prove', 'claims boundary']) {
    assert.doesNotMatch(renderedSource.toLowerCase(), new RegExp(phrase.replaceAll(' ', '\\s+')));
  }
  assert.doesNotMatch(renderedSource, /sales pitch|engineering evidence|role switch/i);
});

test('the customer shell and login each render exactly one shared environment marker', () => {
  const badge = readFileSync(resolve(root, 'app/pilot/ohworks/_components/test-environment-badge.tsx'), 'utf8');
  const layout = readFileSync(resolve(root, 'app/pilot/ohworks/layout.tsx'), 'utf8');
  const login = readFileSync(resolve(root, 'app/pilot/ohworks/login/page.tsx'), 'utf8');
  assert.equal((badge.match(/TEST ENVIRONMENT/g) ?? []).length, 1);
  assert.equal((layout.match(/<TestEnvironmentBadge\s*\/>/g) ?? []).length, 1);
  assert.equal((login.match(/<TestEnvironmentBadge\s*\/>/g) ?? []).length, 1);
});

test('signed sessions reject tampering, expiry, and cross-tenant payload changes', () => {
  const principal: TenantPrincipal = { accountId: 'acct-review', username: 'configured-user', displayName: 'Priya North', role: 'reviewer' };
  const secret = 'a-secure-test-only-session-key-which-is-long-enough';
  const token = createSessionToken(principal, secret, 1_000);
  assert.equal(verifySessionToken(token, secret, 2_000)?.role, 'reviewer');
  assert.equal(verifySessionToken(`${token.slice(0, -1)}x`, secret, 2_000), null);
  assert.equal(verifySessionToken(token, secret, 1_000 + 8 * 60 * 60 * 1000 + 1), null);
  assert.equal(verifySessionToken(token, 'another-secure-test-only-session-key-value', 2_000), null);
});

test('roles cannot exceed their explicit permissions', () => {
  assert.deepEqual([...permissionsFor('receiving')].sort(), ['sample:accession', 'sample:queue', 'sample:read']);
  assert.equal(permissionsFor('scientist').includes('result:review'), false);
  assert.equal(permissionsFor('reviewer').includes('result:release'), false);
  assert.equal(permissionsFor('approver').includes('result:review'), false);
  assert.equal(permissionsFor('laboratory_manager').includes('result:review'), false);
  assert.equal(permissionsFor('laboratory_manager').includes('result:release'), true);
  const receiving: TenantPrincipal = { accountId: 'acct-receiving', username: 'configured-user', displayName: 'Elliot Mercer', role: 'receiving' };
  assert.deepEqual(authorizeAction(receiving, 'release', 'Technical review'), { ok: false, reason: 'Your account is not permitted to perform this action.' });
  const approver: TenantPrincipal = { ...receiving, accountId: 'acct-approver', role: 'approver' };
  assert.deepEqual(authorizeAction(approver, 'release', 'Result available'), { ok: false, reason: 'The action is not available while the sample is Result available.' });
});

test('the customer route disables the previous assistant endpoint', () => {
  const route = readFileSync(resolve(root, 'app/pilot/ohworks/bot/api/route.ts'), 'utf8');
  assert.match(route, /status:\s*404/);
  const nav = readFileSync(resolve(root, 'app/pilot/ohworks/layout.tsx'), 'utf8');
  assert.doesNotMatch(nav, /\/pilot\/ohworks\/bot/);
});
