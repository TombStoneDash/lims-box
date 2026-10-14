import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as nextServer from 'next/server';
import { getLabProfile } from '../../lib/demo-labs';
import { askOHWorksAssistant, getRoleViews, resolveRoleView } from '../../lib/ohworks-pilot';

const sourcePath = path.join(process.cwd(), 'app/demo/labs/[labType]/bot/api/route.ts');
const source = readFileSync(sourcePath, 'utf8');

type RouteContext = { params: Promise<{ labType: string }> };
type RawPostHandler = (request: Request, context: RouteContext) => Promise<Response>;
type PostHandler = (request: Request, labType?: string) => Promise<Response>;

function loadRoute(): PostHandler {
  // Evaluate the real route with a stubbed 'server-only' module and the real
  // next/server and lib/ohworks-pilot modules, mirroring how
  // tests/admin/person-detail-server-boundary.test.ts loads a server module.
  const modules: Record<string, unknown> = {
    'server-only': {},
    'next/server': nextServer,
    '@/lib/ohworks-pilot': { askOHWorksAssistant, getRoleViews, resolveRoleView },
    '@/lib/demo-labs': { getLabProfile },
  };
  const exports: { POST?: RawPostHandler } = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  runInNewContext(outputText, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  });
  const raw = exports.POST!;
  return (request, labType = 'clinical') => raw(request, { params: Promise.resolve({ labType }) });
}

const POST = loadRoute();

const SAFE_ERROR_ANSWER = 'The request could not be evaluated. Synthetic demonstration data only.';
const url = 'http://localhost/demo/labs/clinical/bot/api';

function postJson(body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

test('an unsupported roleId fails closed with 400 SAFE_ERROR', async () => {
  const response = await POST(
    postJson({ question: 'What is the status of OW-SYN-S2-10062?', mode: 'expert', roleId: 'superuser' }),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.answer, SAFE_ERROR_ANSWER);
  assert.equal(payload.disposition, 'evidence_missing');
});

test('an empty roleId fails closed with 400 SAFE_ERROR', async () => {
  const response = await POST(
    postJson({ question: 'What is the status of OW-SYN-S2-10062?', mode: 'expert', roleId: '' }),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.answer, SAFE_ERROR_ANSWER);
});

test('a question that is blank after trimming fails closed with 400 SAFE_ERROR', async () => {
  const response = await POST(postJson({ question: '     ', mode: 'expert', roleId: 'worker' }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.answer, SAFE_ERROR_ANSWER);
});

test('a question that is valid only after trimming reaches the assistant trimmed', async () => {
  const rawQuestion = '   What is the status of OW-SYN-S2-10062?   ';
  const response = await POST(postJson({ question: rawQuestion, mode: 'expert', roleId: 'worker' }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, jsonRoundTrip(askOHWorksAssistant(rawQuestion.trim(), 'worker', 'expert')));
});

test('every supported role returns the same grounded body as askOHWorksAssistant', async () => {
  for (const role of getRoleViews()) {
    const question = 'What is the status of OW-SYN-S2-10062?';
    const response = await POST(postJson({ question, mode: 'expert', roleId: role.id }));
    const payload = await response.json();

    assert.equal(response.status, 200, role.id);
    assert.deepEqual(payload, jsonRoundTrip(askOHWorksAssistant(question, role.id, 'expert')), role.id);
  }
});

test('an unknown lab slug fails closed with 404 SAFE_ERROR before reading the body', async () => {
  const response = await POST(
    postJson({ question: 'What is the status of OW-SYN-S2-10062?', mode: 'expert', roleId: 'reviewer' }),
    'nope',
  );
  assert.equal(response.status, 404);
  const payload = (await response.json()) as { answer: string; grounded: boolean };
  assert.equal(payload.answer, SAFE_ERROR_ANSWER);
  assert.equal(payload.grounded, false);
});
