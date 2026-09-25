import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateLockoutState, requiresSupervisorOverrideToUnlock } from '../../lib/ohworks-poct-lockout';

/**
 * All fabricated: synthetic device identifiers and timestamps. None of this
 * represents a real device or patient.
 */
const DEVICE_ID = 'poct-synthetic-glucose-01';
const NOW = '2026-09-19T12:00:00.000Z';
const QC_FREQUENCY_HOURS = 8;

// ---------------------------------------------------------------------------
// evaluateLockoutState: every lastQcResult branch
// ---------------------------------------------------------------------------

test('a failed QC result always locks the device, regardless of timing', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'fail',
    lastQcAt: NOW,
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.match(result.reason, /fail/i);
});

test('a failed QC result locks the device even when it was very recent', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'fail',
    lastQcAt: '2026-09-19T11:59:00.000Z',
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
});

test('a not_run QC result locks the device with a no-QC-on-record reason', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'not_run',
    lastQcAt: null,
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, false);
  assert.equal(result.reason, `Device ${DEVICE_ID} is locked out: no QC on record.`);
});

test('a null lastQcAt locks the device with a no-QC-on-record reason even if a result is somehow present', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: null,
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.reason, `Device ${DEVICE_ID} is locked out: no QC on record.`);
});

test('a passing QC result within frequency unlocks the device', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T08:00:00.000Z',
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, false);
  assert.equal(result.qcOverdue, false);
});

test('a passing QC result beyond frequency locks the device as overdue', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T03:00:00.000Z',
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, true);
  assert.match(result.reason, /overdue/i);
});

// ---------------------------------------------------------------------------
// Frequency boundary: exactly at, just under, just over qcFrequencyHours
// ---------------------------------------------------------------------------

test('exactly at qcFrequencyHours elapsed, a passing QC is still valid (boundary is inclusive)', () => {
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

test('just under qcFrequencyHours elapsed, a passing QC is valid', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T04:00:01.000Z', // 7h 59m 59s before NOW
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, false);
  assert.equal(result.qcOverdue, false);
});

test('just over qcFrequencyHours elapsed, a passing QC is overdue', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T03:59:59.000Z', // 8h 0m 1s before NOW
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.equal(result.locked, true);
  assert.equal(result.qcOverdue, true);
});

// ---------------------------------------------------------------------------
// Prior lockout cleared by a fresh pass
// ---------------------------------------------------------------------------

test('a fresh passing QC within frequency clears a prior lockout', () => {
  const result = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T11:30:00.000Z',
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: true,
  });
  assert.equal(result.locked, false);
  assert.equal(result.qcOverdue, false);
});

test('priorLockoutActive does not force a lock when the current QC state would otherwise unlock', () => {
  const withPrior = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T08:00:00.000Z',
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: true,
  });
  const withoutPrior = evaluateLockoutState({
    deviceId: DEVICE_ID,
    lastQcResult: 'pass',
    lastQcAt: '2026-09-19T08:00:00.000Z',
    now: NOW,
    qcFrequencyHours: QC_FREQUENCY_HOURS,
    priorLockoutActive: false,
  });
  assert.deepEqual(withPrior, withoutPrior);
});

// ---------------------------------------------------------------------------
// requiresSupervisorOverrideToUnlock: both branches
// ---------------------------------------------------------------------------

test('a lockout caused by a genuine QC failure requires a supervisor override', () => {
  assert.equal(requiresSupervisorOverrideToUnlock({ locked: true, lastQcResult: 'fail' }), true);
});

test('a lockout caused by an overdue-but-passing QC does not require a supervisor override', () => {
  assert.equal(requiresSupervisorOverrideToUnlock({ locked: true, lastQcResult: 'pass' }), false);
});

test('a lockout caused by no QC on record does not require a supervisor override', () => {
  assert.equal(requiresSupervisorOverrideToUnlock({ locked: true, lastQcResult: 'not_run' }), false);
});

test('an unlocked device never requires a supervisor override, even if lastQcResult is fail', () => {
  assert.equal(requiresSupervisorOverrideToUnlock({ locked: false, lastQcResult: 'fail' }), false);
});
