import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatSessionDate, isUpcoming, upcomingOnly } from '../../lib/webinar-sessions';

test('drops yesterday and keeps today through its last millisecond and tomorrow', () => {
  const now = new Date(2026, 3, 22, 23, 59, 59, 999);
  const sessions = [
    { id: 'yesterday', date: '2026-04-21' },
    { id: 'today', date: '2026-04-22' },
    { id: 'tomorrow', date: '2026-04-23' },
  ];
  assert.equal(isUpcoming(sessions[0].date, now), false);
  assert.equal(isUpcoming(sessions[1].date, now), true);
  assert.equal(isUpcoming(sessions[2].date, now), true);
  assert.deepEqual(upcomingOnly(sessions, now), sessions.slice(1));
  assert.equal(sessions.length, 3);
  assert.equal(isUpcoming('2026-04-22', new Date(2026, 3, 23)), false);
});

test('an empty list stays empty', () => {
  assert.deepEqual(upcomingOnly([], new Date(2026, 3, 22)), []);
});

test('formats the intended weekday and calendar date', () => {
  const label = formatSessionDate('2026-04-22');
  assert.match(label, /Wednesday/);
  assert.match(label, /April 22/);
});

test('invalid dates are not upcoming', () => {
  const now = new Date(2026, 0, 1);
  for (const date of ['invalid', '', '2026-02-30', '2026-13-01']) {
    assert.equal(isUpcoming(date, now), false);
  }
});

test('the page uses session helpers and offers an honest empty state', () => {
  const source = readFileSync(new URL('../../app/webinar/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /from '@\/lib\/webinar-sessions'/);
  assert.match(source, /upcomingOnly\(upcomingSessions, new Date\(\)\)/);
  assert.match(source, /formatSessionDate\(session.date\)/);
  assert.match(source, /No live sessions are scheduled right now/);
  assert.match(source, /href="\/contact"/);
  assert.match(source, /href="\/demo"/);
  assert.doesNotMatch(source, /upcomingSessions\.map/);
});
