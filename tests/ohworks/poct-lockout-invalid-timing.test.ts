import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateLockoutState } from '../../lib/ohworks-poct-lockout';

/**
 * All fabricated: synthetic device identifiers and timestamps. None of this
 * represents a real device or patient.
 */
const DEVICE_ID = 'poct-synthetic-glucose-02';
const NOW = '2026-09-19T12:00:00.000Z';
const QC_FREQUENCY_HOURS = 8;
const INVALID_TIMING_REASON = `Device ${DEVICE_ID} is locked out: QC timing is invalid.`;

// ---------------------------------------------------------------------------
// Invalid QC timing: each cause locks out with an "invalid timing" reason,
// not an "overdue" reason.
// ---------------------------------------------------------------------------

test('a lastQcAt later than now locks out as invalid timing, not overdue', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-10-12T08:00:00.000Z',
    now: '2026-10-10T09:00:00.000Z',
    qcFrequencyHours: 24,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, INVALID_TIMING_REASON);
});

test('an unparseable now locks out as invalid timing', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T08:00:00.000Z',
    now: 'not-a-timestamp',
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, INVALID_TIMING_REASON);
});

test('an unparseable lastQcAt locks out as invalid timing', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: 'not-a-timestamp',
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, INVALID_TIMING_REASON);
});

test('a non-finite (Infinity) qcFrequencyHours locks out as invalid timing, even for a very old QC', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2020-01-01T00:00:00.000Z',
    now: NOW,
    qcFrequencyHours: Infinity,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, INVALID_TIMING_REASON);
});

test('a NaN qcFrequencyHours locks out as invalid timing', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T08:00:00.000Z',
    now: NOW,
    qcFrequencyHours: NaN,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, INVALID_TIMING_REASON);
});

test('a negative qcFrequencyHours locks out as invalid timing', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T08:00:00.000Z',
    now: NOW,
    qcFrequencyHours: -8,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, INVALID_TIMING_REASON);
});

test('a zero qcFrequencyHours locks out as invalid timing', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T08:00:00.000Z',
    now: NOW,
    qcFrequencyHours: 0,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, INVALID_TIMING_REASON);
});

// ---------------------------------------------------------------------------
// Boundary regression: lastQcAt exactly equal to now (elapsed 0) stays
// unlocked, since it is not later than now and frequency is positive/finite.
// ---------------------------------------------------------------------------

test('lastQcAt exactly equal to now (zero elapsed) remains unlocked, not invalid timing', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: NOW,
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, false);
  assert.equal(result.qcOverdue, false);
});

test('exactly at qcFrequencyHours elapsed remains the inclusive unlocked boundary, not invalid timing', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T04:00:00.000Z', // exactly 8 hours before NOW
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, false);
  assert.equal(result.qcOverdue, false);
});

// ---------------------------------------------------------------------------
// Fail-precedence regressions: a genuine QC failure or no-QC-on-record wins
// over invalid timing checks, since those branches return before timing is
// ever examined.
// ---------------------------------------------------------------------------

test('a failed QC result locks out with the failure reason even when timing is also invalid', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'fail',
    lastQcAt: '2026-10-12T08:00:00.000Z', // later than now; would be invalid timing
    now: NOW,
    qcFrequencyHours: -1, // also invalid
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.match(result.reason, /last QC run failed/i);
  assert.notEqual(result.reason, INVALID_TIMING_REASON);
});

test('a not_run QC result locks out with the no-QC-on-record reason even when qcFrequencyHours is invalid', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'not_run',
    lastQcAt: null,
    now: NOW,
    qcFrequencyHours: NaN,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, `Device ${DEVICE_ID} is locked out: no QC on record.`);
  assert.notEqual(result.reason, INVALID_TIMING_REASON);
});

test('a null lastQcAt locks out with the no-QC-on-record reason even when now is unparseable', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: null,
    now: 'not-a-timestamp',
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, `Device ${DEVICE_ID} is locked out: no QC on record.`);
  assert.notEqual(result.reason, INVALID_TIMING_REASON);
});
