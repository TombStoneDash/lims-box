import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCriticalRepeat,
  type CriticalRepeatInput,
  type CriticalRepeatPolicy,
  type CriticalRepeatResult,
} from '../../lib/ohworks-critical-repeat';

/**
 * All identifiers and values in this file are synthetic OHWorks test data.
 */
function baselinePolicy(): CriticalRepeatPolicy {
  return {
    analyteCode: 'ANALYTE-SYNTH-DECIMAL',
    unit: 'mmol/L',
    repeatRequired: true,
    tolerance: { absolute: 0.5, percent: 10 },
    maxRepeats: 1,
  };
}

function result(value: unknown, capturedAt: string): CriticalRepeatResult {
  return {
    subjectId: 'subject-synthetic-decimal',
    analyteCode: 'ANALYTE-SYNTH-DECIMAL',
    value,
    unit: 'mmol/L',
    capturedAt,
  };
}

function input(firstValue: unknown, repeatValue: unknown): CriticalRepeatInput {
  return {
    first: result(firstValue, '2026-01-02T12:00:00.000Z'),
    repeats: [result(repeatValue, '2026-01-02T12:15:00.000Z')],
    policy: baselinePolicy(),
  };
}

const INVALID_DECIMAL_TEXT = ['0x10', '0b11', '0o7', '1_000', 'Infinity', '', '  '];

for (const rawValue of INVALID_DECIMAL_TEXT) {
  test(`invalid decimal text ${JSON.stringify(rawValue)} is rejected as a first result`, () => {
    const outcome = evaluateCriticalRepeat(input(rawValue, 16));

    assert.deepEqual(outcome, {
      status: 'discordant',
      reasonCode: 'first-result-value-invalid',
      reportValue: null,
      repeatsEvaluated: 0,
      notifyAllowed: true,
    });
  });

  test(`invalid decimal text ${JSON.stringify(rawValue)} is rejected as a repeat`, () => {
    const outcome = evaluateCriticalRepeat(input(16, rawValue));

    assert.deepEqual(outcome, {
      status: 'discordant',
      reasonCode: 'repeat-value-invalid',
      reportValue: null,
      repeatsEvaluated: 1,
      notifyAllowed: true,
    });
  });
}

const VALID_DECIMAL_VALUES: ReadonlyArray<readonly [unknown, number]> = [
  ['16', 16],
  [' 16 ', 16],
  ['1.6e1', 16],
  ['+16', 16],
  ['.5', 0.5],
  [16, 16],
];

for (const [rawValue, numericValue] of VALID_DECIMAL_VALUES) {
  test(`decimal value ${JSON.stringify(rawValue)} confirms as a first result`, () => {
    const outcome = evaluateCriticalRepeat(input(rawValue, numericValue));

    assert.deepEqual(outcome, {
      status: 'confirmed',
      reasonCode: 'repeat-confirmed',
      reportValue: numericValue,
      repeatsEvaluated: 1,
      notifyAllowed: true,
    });
  });

  test(`decimal value ${JSON.stringify(rawValue)} confirms as a repeat`, () => {
    const outcome = evaluateCriticalRepeat(input(numericValue, rawValue));

    assert.deepEqual(outcome, {
      status: 'confirmed',
      reasonCode: 'repeat-confirmed',
      reportValue: numericValue,
      repeatsEvaluated: 1,
      notifyAllowed: true,
    });
  });
}
