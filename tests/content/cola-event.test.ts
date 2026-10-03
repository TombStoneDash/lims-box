import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COLA_EVENT, colaEventPhase } from '../../lib/cola-event';

test('COLA event dates stay canonical', () => {
  assert.deepEqual(COLA_EVENT, { start: '2026-05-06', end: '2026-05-08' });
});

for (const [date, expected] of [
  ['2026-05-05T23:59:59.999Z', 'upcoming'],
  ['2026-05-06T00:00:00.000Z', 'live'],
  ['2026-05-08T00:00:00.000Z', 'live'],
  ['2026-05-08T23:59:59.999Z', 'live'],
  ['2026-05-09T00:00:00.000Z', 'past'],
  ['2026-05-08T20:00:00-04:00', 'past'],
  ['2026-05-09T01:00:00+02:00', 'live'],
] as const) {
  test(`COLA phase at ${date} is ${expected}`, () => {
    assert.equal(colaEventPhase(new Date(date)), expected);
  });
}

test('COLA event is past today', () => {
  assert.equal(colaEventPhase(new Date()), 'past');
});

const page = fs.readFileSync(path.join(process.cwd(), 'app/cola/page.tsx'), 'utf8');

test('page imports the shared phase helper', () => {
  assert.match(page, /import \{[^}]*colaEventPhase[^}]*\} from '@\/lib\/cola-event'/);
});

test('Booth details only appears inside a non-past branch', () => {
  const nonPastBoothBranch = /\{phase !== 'past' && \(\s*<>[^<]*Booth details[^<]*<\/>\s*\)\}/g;
  assert.equal(page.match(nonPastBoothBranch)?.length, 1);
  assert.doesNotMatch(page.replace(nonPastBoothBranch, ''), /Booth details/);
});

test('Event structured data is guarded by a non-past branch', () => {
  assert.match(page, /\{phase !== 'past' && \(\s*<script[\s\S]*?'@type': 'Event'[\s\S]*?\/>\s*\)\}/);
});
