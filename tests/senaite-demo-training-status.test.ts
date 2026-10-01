import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evaluateCompetency,
  evaluateStaffTraining,
  evaluateTrainingRegistry,
  registryBadge,
  registrySummaryText,
  TRAINING_AS_OF_DATE,
} from '../lib/senaite-demo-training-status';
import { staff } from '../lib/demo-data';

test('evaluateCompetency derives expiring-soon, current and expired from the dates', () => {
  const soon = evaluateCompetency(
    { name: 'EPA 200.8', certifiedDate: '2024-05-01', expirationDate: '2026-05-01', status: 'Current', assessedBy: 'X' },
    '2026-04-13',
  );
  assert.equal(soon.status, 'expiring-soon');
  assert.equal(soon.daysRemaining, 18);

  const current = evaluateCompetency(
    { name: 'Chain of Custody', certifiedDate: '2024-01-01', expirationDate: '2026-11-15', status: 'Current', assessedBy: 'X' },
    '2026-04-13',
  );
  assert.equal(current.status, 'current');

  const expired = evaluateCompetency(
    { name: 'Lapsed', certifiedDate: '2020-01-01', expirationDate: '2026-01-01', status: 'Expired', assessedBy: 'X' },
    '2026-04-13',
  );
  assert.equal(expired.status, 'expired');
  assert.equal(expired.daysRemaining, 0);
});

test('invalid or unparseable dates fail closed to invalid without throwing', () => {
  const badFormats = ['13/04/2026', '', '2026-13-45', 12345 as unknown as string];
  for (const expirationDate of badFormats) {
    const result = evaluateCompetency(
      { name: 'Bad Date', certifiedDate: '2024-01-01', expirationDate, status: 'Current', assessedBy: 'X' },
      '2026-04-13',
    );
    assert.equal(result.status, 'invalid');
  }
});

test('boundary: exactly on as-of date and exactly on the 60-day edge are expiring-soon', () => {
  const onAsOf = evaluateCompetency(
    { name: 'Boundary', certifiedDate: '2024-01-01', expirationDate: '2026-04-13', status: 'Current', assessedBy: 'X' },
    '2026-04-13',
  );
  assert.equal(onAsOf.status, 'expiring-soon');

  const at60 = evaluateCompetency(
    { name: 'At 60', certifiedDate: '2024-01-01', expirationDate: '2026-06-12', status: 'Current', assessedBy: 'X' },
    '2026-04-13',
  );
  assert.equal(at60.status, 'expiring-soon');

  const at61 = evaluateCompetency(
    { name: 'At 61', certifiedDate: '2024-01-01', expirationDate: '2026-06-13', status: 'Current', assessedBy: 'X' },
    '2026-04-13',
  );
  assert.equal(at61.status, 'current');
});

test('evaluateTrainingRegistry rolls up the real staff fixture and fails closed on empty input', () => {
  const registry = evaluateTrainingRegistry(staff, TRAINING_AS_OF_DATE);
  assert.equal(registry.totalStaff, 4);
  assert.equal(registry.expiredCount, 0);
  assert.equal(registry.expiringSoonCount, 1);

  assert.equal(evaluateTrainingRegistry([], TRAINING_AS_OF_DATE).status, 'invalid');
});

test('evaluateStaffTraining rolls up a single member', () => {
  const martinez = staff.find(member => member.name === 'Julia Martinez')!;
  const evaluation = evaluateStaffTraining(martinez, TRAINING_AS_OF_DATE);
  assert.equal(evaluation.status, 'expiring-soon');
  assert.equal(evaluation.expiringSoonCount, 1);
  assert.equal(evaluation.expiredCount, 0);
});

test('training page derives status from dates instead of hardcoding green', () => {
  const source = readFileSync(new URL('../app/senaite-demo/training/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /from '@\/lib\/senaite-demo-training-status'/);
  assert.doesNotMatch(source, /days from now/);

  const withoutStyleMap = source.replace(/const COMPETENCY_STATUS_STYLE[\s\S]*?\};/, '');
  assert.doesNotMatch(withoutStyleMap, /bg-green-100/);

  const thTags = source.match(/<th\b/g) ?? [];
  const thTagsWithScope = source.match(/<th\b[^>]*scope="col"/g) ?? [];
  assert.equal(thTags.length, thTagsWithScope.length);
  assert.ok(thTags.length >= 5);
});

test('registry summary and badge count unreadable dates and are green only when all current', () => {
  const ok = { name: 'A', competencies: [{ name: 'X', certifiedDate: '2025-01-01', expirationDate: '2027-01-01', status: 'Current', assessedBy: 'Q' }] };
  const bad = { name: 'B', competencies: [{ name: 'Y', certifiedDate: '2025-01-01', expirationDate: 'not-a-date', status: 'Current', assessedBy: 'Q' }] };

  const mixed = evaluateTrainingRegistry([ok, bad]);
  assert.equal(mixed.status, 'invalid');
  assert.equal(registrySummaryText(mixed), '2 staff — 0 expired, 0 expiring within 60 days, 1 unreadable date (as of April 13, 2026, synthetic)');
  assert.deepEqual(registryBadge(mixed), { label: '1 unreadable date', tone: 'slate' });

  const current = evaluateTrainingRegistry([ok]);
  assert.equal(registrySummaryText(current), '1 staff — all competencies current as of April 13, 2026 (synthetic)');
  assert.deepEqual(registryBadge(current), { label: 'All competencies current', tone: 'green' });

  const demo = evaluateTrainingRegistry(staff);
  assert.deepEqual(registryBadge(demo), { label: '1 expiring soon', tone: 'amber' });
  assert.equal(registrySummaryText(evaluateTrainingRegistry([])), 'No staff training records (as of April 13, 2026, synthetic)');
});
