import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  discoveryGates,
  getApprovedSourceIds,
  pilotMeta,
  syntheticSamples,
  workflowEvaluations,
} from '../../lib/ohworks-pilot';

const root = resolve(import.meta.dirname, '../..');
const routeFiles = [
  'app/pilot/ohworks/layout.tsx',
  'app/pilot/ohworks/_components/role-switch.tsx',
  'app/pilot/ohworks/page.tsx',
  'app/pilot/ohworks/samples/page.tsx',
  'app/pilot/ohworks/instrument/page.tsx',
  'app/pilot/ohworks/personnel/page.tsx',
  'app/pilot/ohworks/audit/page.tsx',
  'app/pilot/ohworks/bot/page.tsx',
  'app/pilot/ohworks/bot/assistant-console.tsx',
  'app/pilot/ohworks/bot/api/route.ts',
];
const docs = [
  'README.md',
  'SOURCE_REGISTER.md',
  'REQUIREMENTS.md',
  'ARCHITECTURE.md',
  'DATA_DICTIONARY.md',
  'SECURITY_AND_PRIVACY.md',
  'UAT_SCRIPT.md',
  'DEPLOY_CHECKLIST.md',
  'RISK_REGISTER.md',
  'ROLLBACK.md',
  'CHANGE_LOG.md',
  'DEMO_CONTRACT.md',
  'GARY_QUESTION_ANSWER_MATRIX.md',
];

test('pilot remains synthetic, supervised, and discovery-only in route copy', () => {
  const combined = routeFiles.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
  assert.match(combined, /Synthetic demonstration data only/i);
  assert.match(combined, /Demo role simulator - not authentication/i);
  assert.match(combined, /LIAISON XL.*Orchidlive.*hypothesis/i);
  assert.match(combined, /distinct authorized technical-review event/i);
  assert.doesNotMatch(combined, /production[- ]ready/i);
  assert.doesNotMatch(combined, /live integration is supported/i);
  assert.doesNotMatch(combined, /\b(?:is|are|now)\s+(?:accredited|certified|validated)\b/i);
});

test('synthetic workflow fixtures cover all six states and validate successfully', () => {
  assert.equal(pilotMeta.dataClass, 'Synthetic demonstration data only');
  const fixtureStates = new Set<string>(syntheticSamples.map((sample) => sample.state));
  for (const stage of ['Accessioned', 'Queued', 'Instrument result', 'Quarantined', 'Technical review', 'Released']) {
    assert.ok(fixtureStates.has(stage), `${stage} should have a synthetic fixture`);
  }
  assert.ok(workflowEvaluations.every((evaluation) => evaluation.valid), 'every workflow case should validate');
});

test('approved OHWorks assistant sources exclude pending discovery notes', () => {
  assert.deepEqual(
    getApprovedSourceIds().sort(),
    [
      'ohworks-source-orchidlive-001',
      'ohworks-source-policy-001',
      'ohworks-source-unsafe-001',
      'ohworks-source-workflow-001',
    ],
  );
});

test('discovery gates enumerate the unresolved supplier packet', () => {
  const gateText = discoveryGates.map((gate) => `${gate.area} ${gate.question}`).join(' ');
  for (const phrase of [
    'topology',
    'protocol and transport',
    'versions',
    'interface guide',
    'sample messages',
    'test environment',
    'licensing',
    'source of truth',
    'acknowledgements',
    'replay and error behavior',
    'supported fields',
  ]) {
    assert.match(gateText.toLowerCase(), new RegExp(phrase.replaceAll(' ', '\\s+')));
  }
});

test('the complete supervised-demo document set exists', () => {
  for (const doc of docs) {
    const content = readFileSync(resolve(root, 'docs/clients/ohworks', doc), 'utf8');
    assert.ok(content.length > 200, `${doc} should contain substantive guidance`);
  }
});

test('deployment guide keeps external and production gates stopped', () => {
  const deploy = readFileSync(resolve(root, 'docs/clients/ohworks/DEPLOY_CHECKLIST.md'), 'utf8');
  for (const gate of ['G-AUTH', 'G-PRODWRITE', 'G-SEND', 'G-PUBLISH', 'G-SPEND', 'G-DNSBILL']) {
    assert.match(deploy, new RegExp(gate));
  }
  assert.match(deploy, /No item.*authorization to deploy/i);
});

test('assistant client bundle boundary contains no fixture or server assistant imports', () => {
  const client = readFileSync(resolve(root, 'app/pilot/ohworks/bot/assistant-console.tsx'), 'utf8');
  const roleSwitch = readFileSync(resolve(root, 'app/pilot/ohworks/_components/role-switch.tsx'), 'utf8');
  const route = readFileSync(resolve(root, 'app/pilot/ohworks/bot/api/route.ts'), 'utf8');
  assert.doesNotMatch(client, /@\/lib\/ohworks-pilot|fixtures\/ohworks|askOHWorksAssistant/);
  assert.doesNotMatch(roleSwitch, /@\/lib\/ohworks-pilot|fixtures\/ohworks|workflowCases|assistantKnowledge/);
  assert.match(client, /fetch\('\/pilot\/ohworks\/bot\/api'/);
  assert.match(route, /import 'server-only'/);
  assert.match(route, /askOHWorksAssistant/);
});
