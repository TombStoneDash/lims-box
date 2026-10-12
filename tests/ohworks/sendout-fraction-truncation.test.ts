import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateSendout, type SendoutEvent, type SendoutInput } from '../../lib/ohworks-sendout';

/**
 * All fabricated: synthetic reference-lab ids, courier references, and
 * timestamps. None of this represents a real specimen, patient, lab, or
 * shipment.
 *
 * These tests cover the sub-millisecond fraction truncation fix in
 * parseStrictTimestamp: fractional seconds must be truncated to
 * milliseconds (matching the audit-trail, accession, and transport
 * modules), not rounded, so a fraction like `.9996` must not carry into
 * the next second.
 */
function baselineInput(overrides: Partial<SendoutInput> = {}): SendoutInput {
  return {
    referenceLabId: 'REFLAB_ALPHA',
    declaredTurnaroundDays: 1,
    events: [],
    ...overrides,
  };
}

test('a near-but-before timestamp with a rounding-prone fraction is not treated as a duplicate', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-03-01T00:00:00Z' },
    { state: 'shipped', occurredAt: '2026-03-01T10:00:00.9996Z', courierReference: 'TRACK-12345' },
    {
      state: 'received_by_reference',
      occurredAt: '2026-03-01T10:00:01.000Z',
      courierReference: 'TRACK-12345',
    },
  ];
  const summary = evaluateSendout(baselineInput({ events }), '2026-03-05T00:00:00Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.failure, undefined);
  assert.equal(summary.expectedResultDate, '2026-03-02T10:00:01.000Z');
});

test('expectedResultDate truncates a rounding-prone received_by_reference fraction instead of rolling it into the next second', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-03-01T00:00:00Z' },
    { state: 'shipped', occurredAt: '2026-03-01T09:00:00Z', courierReference: 'TRACK-99999' },
    {
      state: 'received_by_reference',
      occurredAt: '2026-03-01T10:00:00.9996Z',
      courierReference: 'TRACK-99999',
    },
  ];
  const summary = evaluateSendout(baselineInput({ events }), '2026-03-05T00:00:00Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.expectedResultDate, '2026-03-02T10:00:00.999Z');
});

test('a three-digit millisecond fraction behaves as before (no truncation change)', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-03-01T00:00:00Z' },
    { state: 'shipped', occurredAt: '2026-03-01T10:00:00.999Z', courierReference: 'TRACK-12345' },
    {
      state: 'received_by_reference',
      occurredAt: '2026-03-01T10:00:01.000Z',
      courierReference: 'TRACK-12345',
    },
  ];
  const summary = evaluateSendout(baselineInput({ events }), '2026-03-05T00:00:00Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.failure, undefined);
});

test('a single-digit fraction still expands by zero-padding, not truncation of value', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-03-01T00:00:00Z' },
    { state: 'shipped', occurredAt: '2026-03-01T10:00:00.5Z', courierReference: 'TRACK-12345' },
    {
      state: 'received_by_reference',
      occurredAt: '2026-03-01T10:00:00.6Z',
      courierReference: 'TRACK-12345',
    },
  ];
  const summary = evaluateSendout(baselineInput({ events }), '2026-03-05T00:00:00Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.failure, undefined);
});

test('a timestamp with no fraction behaves as before', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-03-01T00:00:00Z' },
    { state: 'shipped', occurredAt: '2026-03-01T10:00:00Z', courierReference: 'TRACK-12345' },
    {
      state: 'received_by_reference',
      occurredAt: '2026-03-01T10:00:01Z',
      courierReference: 'TRACK-12345',
    },
  ];
  const summary = evaluateSendout(baselineInput({ events }), '2026-03-05T00:00:00Z');
  assert.equal(summary.status, 'VALID');
  assert.equal(summary.failure, undefined);
});

test('an identical timestamp (including fraction) still yields timestamp-duplicate', () => {
  const events: SendoutEvent[] = [
    { state: 'prepared', occurredAt: '2026-03-01T00:00:00Z' },
    { state: 'shipped', occurredAt: '2026-03-01T10:00:00.9996Z', courierReference: 'TRACK-12345' },
    {
      state: 'received_by_reference',
      occurredAt: '2026-03-01T10:00:00.9996Z',
      courierReference: 'TRACK-12345',
    },
  ];
  const summary = evaluateSendout(baselineInput({ events }), '2026-03-05T00:00:00Z');
  assert.equal(summary.status, 'INVALID');
  assert.deepEqual(summary.failure, { eventIndex: 2, code: 'timestamp-duplicate' });
});
