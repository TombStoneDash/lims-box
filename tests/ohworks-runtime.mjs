import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const prohibited = ['supervised demo', 'discovery simulator', 'local proof', 'deterministic corpus', 'hypothesis', 'not authentication', 'does not prove', 'claims boundary'];

function makeAccount(id, displayName, role) {
  const username = `${role}-${randomBytes(6).toString('hex')}`;
  const password = randomBytes(24).toString('base64url');
  const salt = randomBytes(16);
  return {
    username,
    password,
    config: { id, username, displayName, role, passwordSalt: salt.toString('hex'), passwordHash: scryptSync(password, salt, 64).toString('hex') },
  };
}

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Built runtime exited before becoming ready');
    try {
      const response = await fetch(`${baseUrl}/pilot/ohworks/login`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Built runtime did not become ready');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('built customer runtime enforces auth, roles, rendered copy, persistence, and the complete workflow', async () => {
  const dataDirectory = await mkdtemp(resolve(tmpdir(), 'ohworks-built-runtime-'));
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const manager = makeAccount('acct-manager', 'Morgan Vale', 'laboratory_manager');
  const receiving = makeAccount('acct-receiving', 'Elliot Mercer', 'receiving');
  const scientist = makeAccount('acct-scientist', 'Dana Wells', 'scientist');
  const reviewer = makeAccount('acct-reviewer', 'Priya North', 'reviewer');
  const approver = makeAccount('acct-approver', 'Avery Hart', 'approver');
  const auditor = makeAccount('acct-auditor', 'Cameron Stone', 'auditor');
  const accountConfigs = [manager, receiving, scientist, reviewer, approver, auditor].map((account) => account.config);
  const serverEnv = {
    ...process.env,
    NODE_ENV: 'production',
    OHWORKS_DATA_DIR: dataDirectory,
    OHWORKS_SESSION_SECRET: randomBytes(48).toString('base64url'),
    OHWORKS_TEST_ACCOUNTS_JSON: JSON.stringify(accountConfigs),
    OHWORKS_INTERNAL_PROOF_ENABLED: 'false',
    OHWORKS_PUBLIC_ORIGIN: baseUrl,
  };
  const launch = (publicOrigin = baseUrl) => {
    const env = { ...serverEnv };
    if (publicOrigin === null) delete env.OHWORKS_PUBLIC_ORIGIN;
    else env.OHWORKS_PUBLIC_ORIGIN = publicOrigin;
    return spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  };
  let child = launch();
  try {
    await waitForServer(baseUrl, child);

    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/api/health`)).status, 200);

    const loginPage = await fetch(`${baseUrl}/pilot/ohworks/login`);
    const loginHtml = await loginPage.text();
    assert.equal((loginHtml.match(/<span[^>]*data-testid="test-environment-marker"/g) ?? []).length, 1);

    for (const route of ['/pilot/ohworks', '/pilot/ohworks/samples', '/pilot/ohworks/results', '/pilot/ohworks/reports', '/pilot/ohworks/personnel', '/pilot/ohworks/audit']) {
      const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
      assert.equal(response.status, 307, route);
      assert.equal(response.headers.get('location'), '/pilot/ohworks/login', route);
    }

    const unauthenticatedAction = await fetch(`${baseUrl}/pilot/ohworks/api/actions`, {
      method: 'POST', headers: { origin: baseUrl, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'release', sampleId: 'OW-260904-107' }),
    });
    assert.equal(unauthenticatedAction.status, 401);

    async function login(account) {
      const response = await fetch(`${baseUrl}/pilot/ohworks/api/login`, {
        method: 'POST', redirect: 'manual', headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-host': 'attacker.example:99999',
          'x-forwarded-proto': 'garbage',
        },
        body: new URLSearchParams({ username: account.username, password: account.password }),
      });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), `${baseUrl}/pilot/ohworks`);
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);
      return cookie;
    }

    const failedLogin = await fetch(`${baseUrl}/pilot/ohworks/api/login`, {
      method: 'POST', redirect: 'manual', headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-host': 'attacker.example:99999',
        'x-forwarded-proto': 'garbage',
      },
      body: new URLSearchParams({ username: manager.username, password: 'not-the-password' }),
    });
    assert.equal(failedLogin.status, 303);
    assert.equal(failedLogin.headers.get('location'), `${baseUrl}/pilot/ohworks/login?error=1`);

    async function action(cookie, actionName, sampleId) {
      const response = await fetch(`${baseUrl}/pilot/ohworks/api/actions`, {
        method: 'POST', headers: { cookie, origin: baseUrl, 'content-type': 'application/json' }, body: JSON.stringify({ action: actionName, sampleId }),
      });
      return { response, body: await response.json() };
    }

    const managerCookie = await login(manager);
    const reviewerCookie = await login(reviewer);
    const approverCookie = await login(approver);
    const receivingCookie = await login(receiving);
    const scientistCookie = await login(scientist);
    const auditorCookie = await login(auditor);

    const auditorAudit = await fetch(`${baseUrl}/pilot/ohworks/audit`, { headers: { cookie: auditorCookie } });
    assert.equal(auditorAudit.status, 200);
    assert.match(await auditorAudit.text(), /Audit history/);

    const logout = await fetch(`${baseUrl}/pilot/ohworks/api/logout`, {
      method: 'POST', redirect: 'manual', headers: {
        cookie: auditorCookie,
        'x-forwarded-host': 'attacker.example:99999',
        'x-forwarded-proto': 'garbage',
      },
    });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.get('location'), `${baseUrl}/pilot/ohworks/login`);
    assert.match(logout.headers.get('set-cookie') ?? '', /ohworks_test_session=;/);

    const badOrigin = await fetch(`${baseUrl}/pilot/ohworks/api/actions`, {
      method: 'POST', headers: { cookie: managerCookie, origin: 'https://invalid.example', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue', sampleId: 'OW-260904-101' }),
    });
    assert.equal(badOrigin.status, 403);
    assert.equal((await action(receivingCookie, 'release', 'OW-260904-107')).response.status, 403);
    assert.equal((await action(scientistCookie, 'release', 'OW-260904-107')).response.status, 403);
    assert.equal((await action(approverCookie, 'technical_review', 'OW-260904-103')).response.status, 403);
    assert.equal((await action(managerCookie, 'technical_review', 'OW-260904-103')).response.status, 403);

    const accessioned = await action(managerCookie, 'accession');
    assert.equal(accessioned.response.status, 200, JSON.stringify(accessioned.body));
    const sampleId = accessioned.body.sampleId;
    assert.equal((await action(managerCookie, 'queue', sampleId)).body.state, 'Queued');
    assert.equal((await action(managerCookie, 'record_result', sampleId)).body.state, 'Result available');
    assert.equal((await action(reviewerCookie, 'technical_review', sampleId)).body.state, 'Technical review');
    assert.equal((await action(reviewerCookie, 'release', sampleId)).response.status, 403);
    assert.equal((await action(approverCookie, 'release', sampleId)).body.state, 'Released');

    const rejected = await action(managerCookie, 'accession');
    await action(managerCookie, 'queue', rejected.body.sampleId);
    await action(managerCookie, 'record_result', rejected.body.sampleId);
    assert.equal((await action(reviewerCookie, 'reject', rejected.body.sampleId)).body.state, 'Rejected');
    assert.equal((await action(approverCookie, 'release', rejected.body.sampleId)).response.status, 409);

    const customerRoutes = ['/pilot/ohworks', '/pilot/ohworks/samples', '/pilot/ohworks/results', '/pilot/ohworks/reports', '/pilot/ohworks/reports/RPT-260904-108', '/pilot/ohworks/personnel', '/pilot/ohworks/audit', '/pilot/ohworks/instrument'];
    for (const route of customerRoutes) {
      const response = await fetch(`${baseUrl}${route}`, { headers: { cookie: managerCookie } });
      assert.equal(response.status, 200, route);
      const html = await response.text();
      assert.equal((html.match(/<span[^>]*data-testid="test-environment-marker"/g) ?? []).length, 1, route);
      assert.equal((html.match(/<div[^>]*>All records in this test tenant are fictional/g) ?? []).length, 1, route);
      for (const phrase of prohibited) assert.equal(html.toLowerCase().includes(phrase), false, `${route}: ${phrase}`);
    }
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/bot`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/bot/api`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/bot/api`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${baseUrl}/internal/ohworks-proof`)).status, 404);

    await stopServer(child);
    child = launch();
    await waitForServer(baseUrl, child);
    const managerAfterRestart = await login(manager);
    const reportId = `RPT-${sampleId.slice(3)}`;
    const persistedReport = await fetch(`${baseUrl}/pilot/ohworks/reports/${reportId}`, { headers: { cookie: managerAfterRestart } });
    assert.equal(persistedReport.status, 200);
    const persistedHtml = await persistedReport.text();
    assert.match(persistedHtml, new RegExp(reportId));
    assert.match(persistedHtml, /Priya North/);
    assert.match(persistedHtml, /Avery Hart/);

    await stopServer(child);
    child = launch(null);
    await waitForServer(baseUrl, child);
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/api/health`)).status, 503);
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/api/login`, { method: 'POST' })).status, 503);
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/api/logout`, { method: 'POST' })).status, 503);
    assert.match(await (await fetch(`${baseUrl}/pilot/ohworks/login`)).text(), /Account access is temporarily unavailable/);

    await stopServer(child);
    child = launch('ftp://invalid.example');
    await waitForServer(baseUrl, child);
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/api/health`)).status, 503);
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/api/login`, { method: 'POST' })).status, 503);
    assert.equal((await fetch(`${baseUrl}/pilot/ohworks/api/logout`, { method: 'POST' })).status, 503);
    assert.match(await (await fetch(`${baseUrl}/pilot/ohworks/login`)).text(), /Account access is temporarily unavailable/);
  } finally {
    await stopServer(child);
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
