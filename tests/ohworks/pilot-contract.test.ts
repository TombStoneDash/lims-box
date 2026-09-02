import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

import {
  discoveryGates,
  instrumentMappings,
  pilotMeta,
  syntheticPersonnel,
  syntheticSamples,
} from '../../lib/ohworks-pilot';

const root = resolve(import.meta.dirname, '../..');
const routeFiles = [
  'app/pilot/ohworks/layout.tsx',
  'app/pilot/ohworks/page.tsx',
  'app/pilot/ohworks/samples/page.tsx',
  'app/pilot/ohworks/instrument/page.tsx',
  'app/pilot/ohworks/personnel/page.tsx',
  'app/pilot/ohworks/audit/page.tsx',
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
];

test('pilot uses only explicitly synthetic fixtures', () => {
  assert.equal(pilotMeta.dataClass, 'Synthetic demonstration data only');
  assert.equal(pilotMeta.annualVolumeRange, '30,000–40,000');
  assert.match(pilotMeta.instrumentCandidate, /unconfirmed/i);
  assert.ok(syntheticSamples.every((sample) => sample.id.startsWith('OW-SYN-')));
  assert.ok(syntheticPersonnel.every((person) => person.id.startsWith('SYN-P')));
  assert.ok(instrumentMappings.some((mapping) => mapping.status === 'Discovery required'));
});

test('all pilot routes retain synthetic or discovery language and avoid unsafe claims', () => {
  const combined = routeFiles.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
  assert.match(combined, /Synthetic/i);
  assert.match(combined, /Discovery/i);
  assert.match(combined, /customer-reported/i);
  assert.doesNotMatch(combined, /OHWorks (?:is|is now) (?:ISO|accredited|compliant|validated)/i);
  assert.doesNotMatch(combined, /\b(?:is|are|now|fully|clinically)\s+(?:accredited|validated|guaranteed)\b|\bcompliant with\b|\bISO[- ]?15189 certified\b/i);
  assert.doesNotMatch(combined, /production[- ]ready/i);
  assert.doesNotMatch(combined, /(?:£|\$)\s?\d|\bprice(?:d|s|ing)?\s+(?:at|from)\b/i);
  assert.doesNotMatch(combined, /patient name|date of birth|nhs number/i);
});

test('discovery gates preserve the unknown customer contract', () => {
  const gateText = discoveryGates.map((gate) => `${gate.area} ${gate.question}`).join(' ');
  assert.match(gateText, /exact make, model/i);
  assert.match(gateText, /identity provider/i);
  assert.match(gateText, /pilot success/i);
});

test('synthetic fixtures exercise every displayed workflow state', () => {
  const fixtureStates = new Set<string>(syntheticSamples.map((sample) => sample.state));
  for (const stage of ['Accessioned', 'Queued', 'Instrument result', 'Technical review', 'Released']) {
    assert.ok(fixtureStates.has(stage), `${stage} should have a synthetic fixture`);
  }
});

test('the complete client handoff document set exists', () => {
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
