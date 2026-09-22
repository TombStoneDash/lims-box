import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evaluateCompetency,
  evaluateStaffTraining,
  evaluateTrainingRegistry,
  TRAINING_AS_OF_DATE,
} from '../lib/senaite-demo-training-status';
import { staff } from '../lib/demo-data';

function competency(overrides: Partial<Parameters<typeof evaluateCompetency>[0]> = {}) {
  return {
    name: 'Safety / PPE',
    certifiedDate: '2024-01-01',
    expirationDate: '2026-05-01',
    status: 'Current',
    assessedBy: 'HR',
    ...overrides,
  };
}

test('expiring-soon: a competency inside the 60-day warning band', () => {
  const result = evaluateCompetency(competency({ expirationDate: '2026-05-01' }), '2026-04-13');
  assert.equal(result.status, 'expiring-soon');
  assert.equal(result.daysRemaining, 18);
});

test('current: a competency well beyond the warning band', () => {
  const result = evaluateCompetency(competency({ expirationDate: '2026-11-15' }), '2026-04-13');
  assert.equal(result.status, 'current');
});

test('expired: a past expiration date clamps days remaining to zero, never negative', () => {
  const result = evaluateCompetency(competency({ expirationDate: '2026-01-01' }), '2026-04-13');
  assert.equal(result.status, 'expired');
  assert.equal(result.daysRemaining, 0);
});

test('invalid: malformed, empty, out-of-range, and non-string dates fail closed without throwing', () => {
  assert.equal(evaluateCompetency(competency({ expirationDate: '13/04/2026' })).status, 'invalid');
  assert.equal(evaluateCompetency(competency({ expirationDate: '' })).status, 'invalid');
  assert.equal(evaluateCompetency(competency({ expirationDate: '2026-13-45' })).status, 'invalid');
  assert.doesNotThrow(() => evaluateCompetency(competency({ expirationDate: 12345 as unknown as string })));
  assert.equal(evaluateCompetency(competency({ expirationDate: 12345 as unknown as string })).status, 'invalid');
});

test('boundary: expirationDate equal to asOfDate is expiring-soon, not expired', () => {
  const result = evaluateCompetency(competency({ expirationDate: '2026-04-13' }), '2026-04-13');
  assert.equal(result.status, 'expiring-soon');
});

test('boundary: exactly 60 days out is expiring-soon, 61 days out is current', () => {
  const at60 = evaluateCompetency(competency({ expirationDate: '2026-06-12' }), '2026-04-13');
  assert.equal(at60.daysRemaining, 60);
  assert.equal(at60.status, 'expiring-soon');

  const at61 = evaluateCompetency(competency({ expirationDate: '2026-06-13' }), '2026-04-13');
  assert.equal(at61.daysRemaining, 61);
  assert.equal(at61.status, 'current');
});

test('evaluateTrainingRegistry over the real fixture matches the known expiring competency', () => {
  const result = evaluateTrainingRegistry(staff, TRAINING_AS_OF_DATE);
  assert.equal(result.totalStaff, 4);
  assert.equal(result.expiredCount, 0);
  assert.equal(result.expiringSoonCount, 1);
});

test('evaluateTrainingRegistry fails closed to invalid on empty input', () => {
  assert.equal(evaluateTrainingRegistry([], TRAINING_AS_OF_DATE).status, 'invalid');
});

test('evaluateStaffTraining rolls up per-member counts', () => {
  const member = staff.find(s => s.name === 'Julia Martinez')!;
  const result = evaluateStaffTraining(member, TRAINING_AS_OF_DATE);
  assert.equal(result.status, 'expiring-soon');
  assert.equal(result.expiringSoonCount, 1);
  assert.equal(result.expiredCount, 0);
});

test('training page wires the derived evaluator and drops the false "from now" claim', () => {
  const source = readFileSync(new URL('../app/senaite-demo/training/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /from '@\/lib\/senaite-demo-training-status'/);
  assert.doesNotMatch(source, /days from now/);

  const greenLines = source.split('\n').filter(line => line.includes('bg-green-100'));
  assert.ok(greenLines.length > 0, 'expected a derived status style map containing the current style');
  for (const line of greenLines) {
    assert.match(line, /current:\s*'bg-green-100/, `expected "bg-green-100" to only appear in a derived status style map, found: ${line}`);
  }
});

test('every <th> in the training page carries scope="col"', () => {
  const source = readFileSync(new URL('../app/senaite-demo/training/page.tsx', import.meta.url), 'utf8');
  const allThs = source.match(/<th[\s>]/g) ?? [];
  const scopedThs = source.match(/<th[^>]*scope="col"/g) ?? [];
  assert.equal(allThs.length, scopedThs.length);
  assert.ok(allThs.length >= 5);
});
