import assert from 'node:assert/strict';
import test from 'node:test';

import { TatInputError, resolveTatTarget, type TatCatalogue, type TatOrderRequest } from '../../lib/ohworks-tat-catalogue';

const catalogue: TatCatalogue = {
  rows: [
    { testCode: 'TEST-SYNTH-DATE', priority: 'routine', dayType: 'weekday', targetHours: 24 },
    { testCode: 'TEST-SYNTH-DATE', priority: 'routine', dayType: 'weekend', targetHours: 48 },
    { testCode: 'TEST-SYNTH-DATE', priority: 'routine', dayType: 'holiday', targetHours: 72 },
  ],
  holidayDates: ['2026-01-03'],
};

function request(receivedAt: string): TatOrderRequest {
  return {
    orderId: 'order-synthetic-date',
    testCode: 'TEST-SYNTH-DATE',
    priority: 'routine',
    receivedAt,
  };
}

function assertInvalidReceivedAt(receivedAt: string): void {
  assert.throws(
    () => resolveTatTarget(catalogue, request(receivedAt)),
    (error: unknown) => error instanceof TatInputError && error.code === 'invalid-received-at',
  );
}

test('February 30 and February 29 in a non-leap year fail before calendar rollover', () => {
  assertInvalidReceivedAt('2026-02-30T12:00:00Z');
  assertInvalidReceivedAt('2026-02-29T12:00:00Z');
});

test('written hour, minute, and second fields must be in range', () => {
  assertInvalidReceivedAt('2026-03-02T24:00:00Z');
  assertInvalidReceivedAt('2026-03-02T12:60:00Z');
  assertInvalidReceivedAt('2026-03-02T12:00:60Z');
});

test('a real leap day and an equivalent explicit-offset instant resolve identically', () => {
  const utc = resolveTatTarget(catalogue, request('2024-02-29T12:00:00Z'));
  const offset = resolveTatTarget(catalogue, request('2024-02-29T14:00:00+02:00'));
  assert.equal(utc.dayType, 'weekday');
  assert.equal(utc.receivedAt, '2024-02-29T12:00:00.000Z');
  assert.equal(utc.dueAt, '2024-03-01T12:00:00.000Z');
  assert.deepEqual(offset, utc);
});

test('a declared holiday keeps precedence over a weekend after UTC conversion', () => {
  const resolution = resolveTatTarget(catalogue, request('2026-01-02T22:00:00-02:00'));
  assert.equal(resolution.receivedAt, '2026-01-03T00:00:00.000Z');
  assert.equal(resolution.dayType, 'holiday');
  assert.equal(resolution.targetHours, 72);
  assert.equal(resolution.dueAt, '2026-01-06T00:00:00.000Z');
});
