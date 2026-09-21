import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stepTabLabel } from '../../lib/demo-steps';

test('labels the current step', () => {
  assert.equal(stepTabLabel(1, 'Chain of Custody', true), 'Step 2 of 3: Chain of Custody (current)');
});

test('uses one-based numbering without marking non-current steps', () => {
  assert.equal(stepTabLabel(0, 'Sample Entry', false), 'Step 1 of 3: Sample Entry');
  assert.equal(stepTabLabel(2, 'Demo Report', false), 'Step 3 of 3: Demo Report');
});

test('trims the label', () => {
  assert.equal(stepTabLabel(1, '  Chain of Custody \n', false), 'Step 2 of 3: Chain of Custody');
});

const source = readFileSync(new URL('../../app/demo/page.tsx', import.meta.url), 'utf8');

test('step buttons expose their full name and current state', () => {
  assert.ok(source.includes('aria-label={stepTabLabel(i, step.label, currentStep === step.id)}'));
  assert.ok(source.includes("aria-current={currentStep === step.id ? 'step' : undefined}"));
});

test('read-only sample fields use a description list', () => {
  assert.ok(source.includes('<dl'));
  assert.ok(source.includes('<dt'));
  assert.ok(source.includes('<dd'));
  assert.ok(!source.includes('<label className="block'));
});

test('calendar has a named widget and an always-visible safe fallback', () => {
  assert.ok(source.includes('aria-label="Schedule a demo"'));
  assert.ok(source.includes('Calendar not loading?'));
  assert.ok(source.includes('Open the scheduling page in a new tab'));
  assert.match(source, /<a href=\{CALENDLY_URL\} target="_blank" rel="noopener noreferrer"/);
});
