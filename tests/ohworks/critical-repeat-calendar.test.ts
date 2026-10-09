import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCriticalRepeat,
  type CriticalRepeatInput,
  type CriticalRepeatPolicy,
  type CriticalRepeatResult,
} from '../../lib/ohworks-critical-repeat';

/**
 * All fabricated: synthetic subject/analyte identifiers and made-up numeric
 * values. None of this represents a real patient, sample, or result.
 */
function baselinePolicy(): CriticalRepeatPolicy {
  return {
    analyteCode: 'ANALYTE-SYNTH-CAL',
    unit: 'mmol/L',
    repeatRequired: false,
    tolerance: { absolute: 0.5, percent: 10 },
    maxRepeats: 2,
  };
}

function baselineFirst(capturedAt: string): CriticalRepeatResult {
  return {
    subjectId: 'subject-synthetic-cal',
    analyteCode: 'ANALYTE-SYNTH-CAL',
    value: 10,
    unit: 'mmol/L',
    capturedAt,
  };
}

function baselineRepeat(capturedAt: string, value: number): CriticalRepeatResult {
  return {
    subjectId: 'subject-synthetic-cal',
    analyteCode: 'ANALYTE-SYNTH-CAL',
    value,
    unit: 'mmol/L',
    capturedAt,
  };
}

test('an impossible first-result calendar date (Feb 30) fails closed to discordant with no repeat', () => {
  const input: CriticalRepeatInput = {
    first: baselineFirst('2026-02-30T12:00:00Z'),
    repeats: [],
    policy: baselinePolicy(),
  };
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'first-result-timestamp-invalid');
  assert.equal(result.reportValue, null);
  assert.equal(result.repeatsEvaluated, 0);
  assert.equal(result.notifyAllowed, true);
});

test('an otherwise-agreeing repeat with an impossible calendar date fails closed to discordant', () => {
  const policy = baselinePolicy();
  policy.repeatRequired = true;
  const input: CriticalRepeatInput = {
    first: baselineFirst('2026-01-02T12:00:00Z'),
    repeats: [baselineRepeat('2026-02-30T12:00:00Z', 10.1)],
    policy,
  };
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'repeat-timestamp-invalid');
  assert.equal(result.reportValue, null);
  assert.equal(result.repeatsEvaluated, 1);
  assert.equal(result.notifyAllowed, true);
});

test('February 29th in a non-leap year fails closed to discordant', () => {
  const input: CriticalRepeatInput = {
    first: baselineFirst('2025-02-29T12:00:00Z'),
    repeats: [],
    policy: baselinePolicy(),
  };
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'discordant');
  assert.equal(result.reasonCode, 'first-result-timestamp-invalid');
  assert.equal(result.reportValue, null);
  assert.equal(result.repeatsEvaluated, 0);
  assert.equal(result.notifyAllowed, true);
});

test('a valid leap-day timestamp (Feb 29 in a leap year) is accepted and confirms', () => {
  const input: CriticalRepeatInput = {
    first: baselineFirst('2024-02-29T12:00:00Z'),
    repeats: [],
    policy: baselinePolicy(),
  };
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.reasonCode, 'repeat-not-required');
  assert.equal(result.reportValue, 10);
  assert.equal(result.repeatsEvaluated, 0);
  assert.equal(result.notifyAllowed, true);
});

test('a valid explicit-offset repeat timestamp is accepted and confirms', () => {
  const policy = baselinePolicy();
  policy.repeatRequired = true;
  const input: CriticalRepeatInput = {
    first: baselineFirst('2026-01-02T12:00:00+00:00'),
    repeats: [baselineRepeat('2026-01-02T14:00:00+01:00', 10.1)],
    policy,
  };
  const result = evaluateCriticalRepeat(input);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.reasonCode, 'repeat-confirmed');
  assert.equal(result.reportValue, 10);
  assert.equal(result.repeatsEvaluated, 1);
  assert.equal(result.notifyAllowed, true);
});
