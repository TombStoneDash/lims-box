import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNonconformanceRecord,
  transitionNonconformance,
  type NonconformanceActionInput,
  type NonconformanceRecord,
} from '../../lib/ohworks-nonconformance';

/**
 * All fabricated: synthetic record/tenant identifiers, actor ids, and
 * timestamps. None of this represents a real lab, sample, or patient
 * record. Regression coverage for lims-box#566: an impossible calendar or
 * clock field must be refused as `timestamp-invalid` before Date.parse can
 * silently normalize it into a nearby valid instant.
 */
const RECORD = (): NonconformanceRecord => createNonconformanceRecord('nc-synthetic-calendar-1', 'tenant-synthetic-calendar-1');

function contain(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return { kind: 'CONTAIN', actorId: 'actor-investigator-1', containmentAction: 'Quarantine synthetic batch.', ...overrides };
}

function recordRootCause(overrides: Partial<NonconformanceActionInput> = {}): NonconformanceActionInput {
  return { kind: 'RECORD_ROOT_CAUSE', actorId: 'actor-investigator-1', rootCause: 'TRAINING_GAP', ...overrides };
}

test('refuses February 30 on the first event and leaves the record untouched', () => {
  const before = RECORD();
  const beforeSnapshot = JSON.stringify(before);
  const result = transitionNonconformance(before, contain(), 'investigator', '2026-02-30T12:00:00Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'timestamp-invalid' });
  assert.equal(JSON.stringify(before), beforeSnapshot);
  assert.equal(before.state, 'OPEN');
  assert.deepEqual(before.history, []);
});

test('refuses April 31 after a valid event, leaving state and history at the prior accepted event', () => {
  const first = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-01T12:00:00Z');
  assert.equal(first.ok, true);
  const accepted = (first as { ok: true; record: NonconformanceRecord }).record;
  const acceptedSnapshot = JSON.stringify(accepted);

  const second = transitionNonconformance(accepted, recordRootCause(), 'investigator', '2026-04-31T12:00:00Z');
  assert.deepEqual(second, { ok: false, refusalCode: 'timestamp-invalid' });
  assert.equal(JSON.stringify(accepted), acceptedSnapshot);
  assert.equal(accepted.state, 'CONTAINED');
  assert.equal(accepted.history.length, 1);
  assert.equal(accepted.history[0].occurredAt, '2026-01-01T12:00:00Z');
});

test('refuses February 29 in a non-leap year and leaves the record untouched', () => {
  const before = RECORD();
  const beforeSnapshot = JSON.stringify(before);
  const result = transitionNonconformance(before, contain(), 'investigator', '2026-02-29T00:00:00Z');
  assert.deepEqual(result, { ok: false, refusalCode: 'timestamp-invalid' });
  assert.equal(JSON.stringify(before), beforeSnapshot);
  assert.equal(before.state, 'OPEN');
  assert.deepEqual(before.history, []);
});

test('accepts a genuine leap day as a control', () => {
  const result = transitionNonconformance(RECORD(), contain(), 'investigator', '2024-02-29T00:00:00Z');
  assert.equal(result.ok, true);
  const record = (result as { ok: true; record: NonconformanceRecord }).record;
  assert.equal(record.state, 'CONTAINED');
  assert.equal(record.history[0].occurredAt, '2024-02-29T00:00:00Z');
});

test('accepts valid fractional seconds as a control', () => {
  const result = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-01T12:00:00.123456Z');
  assert.equal(result.ok, true);
  const record = (result as { ok: true; record: NonconformanceRecord }).record;
  assert.equal(record.state, 'CONTAINED');
  assert.equal(record.history[0].occurredAt, '2026-01-01T12:00:00.123456Z');
});

test('a second valid transition after a valid first event still advances the record', () => {
  const first = transitionNonconformance(RECORD(), contain(), 'investigator', '2026-01-01T12:00:00Z');
  assert.equal(first.ok, true);
  const accepted = (first as { ok: true; record: NonconformanceRecord }).record;

  const second = transitionNonconformance(accepted, recordRootCause(), 'investigator', '2026-04-30T12:00:00Z');
  assert.equal(second.ok, true);
  const record = (second as { ok: true; record: NonconformanceRecord }).record;
  assert.equal(record.state, 'ROOT_CAUSE_RECORDED');
  assert.equal(record.history.length, 2);
});

test('keeps the existing timestamp-not-utc refusal for an otherwise-valid non-UTC date', () => {
  const before = RECORD();
  const beforeSnapshot = JSON.stringify(before);
  const result = transitionNonconformance(before, contain(), 'investigator', '2026-02-28T12:00:00.000+05:00');
  assert.deepEqual(result, { ok: false, refusalCode: 'timestamp-not-utc' });
  assert.equal(JSON.stringify(before), beforeSnapshot);
  assert.deepEqual(before.history, []);
});
