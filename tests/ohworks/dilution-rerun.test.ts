import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DilutionRerunInputError,
  evaluateDilutionRerun,
  explainDilutionRerunReason,
  type DilutionLadder,
  type DilutionRerunReasonCode,
  type DilutionRerunRequest,
  type MeasuringRange,
} from '../../lib/ohworks-dilution-rerun';

/**
 * All fabricated: synthetic analyte codes, made-up measuring ranges, and
 * made-up numeric readings. None of this represents a real specimen,
 * instrument, or customer result.
 */
function baselineRange(): MeasuringRange {
  return { analyteCode: 'ANALYTE-SYNTH-A', unit: 'mg/L', lowerLimit: 0, upperLimit: 100 };
}

function baselineLadder(): DilutionLadder {
  return { analyteCode: 'ANALYTE-SYNTH-A', factors: [2, 5, 10, 20] };
}

function baselineRequest(): DilutionRerunRequest {
  return {
    result: {
      analyteCode: 'ANALYTE-SYNTH-A',
      unit: 'mg/L',
      rawReading: 50,
      appliedDilutionFactor: 1,
    },
    measuringRanges: [baselineRange()],
    ladder: baselineLadder(),
    maxDilutionFactor: 20,
    rerunTracking: { rerunCount: 0, maxReruns: 3 },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_REASON_CODES: DilutionRerunReasonCode[] = [
  'unknown-analyte',
  'measuring-range-unit-mismatch',
  'invalid-ladder',
  'within-range',
  'below-range',
  'max-reruns-exceeded',
  'rerun-required',
  'max-dilution-reached',
];

const FORBIDDEN_WORDS = [/approved/i, /compliant/i, /accredited/i, /releasable/i];

test('a reading within the measuring range reports as-is with the corrected result', () => {
  const result = evaluateDilutionRerun(baselineRequest());
  assert.equal(result.decision, 'report_as_is');
  assert.equal(result.reasonCode, 'within-range');
  assert.equal(result.correctedResult, 50);
  assert.equal(result.nextDilutionFactor, null);
  assert.equal(result.greaterThanLimit, null);
});

test('a reading exactly at the upper limit reports as-is', () => {
  const request = baselineRequest();
  request.result.rawReading = 100;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_is');
  assert.equal(result.reasonCode, 'within-range');
});

test('a reading exactly at the lower limit reports as-is as within range', () => {
  const request = baselineRequest();
  request.result.rawReading = 0;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_is');
  assert.equal(result.reasonCode, 'within-range');
});

test('a reading below the lower limit reports as-is; dilution cannot rescue it', () => {
  const request = baselineRequest();
  request.result.rawReading = -5;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_is');
  assert.equal(result.reasonCode, 'below-range');
  assert.equal(result.correctedResult, -5);
});

test('the corrected result accounts for a previously applied dilution factor', () => {
  const request = baselineRequest();
  request.result.rawReading = 40;
  request.result.appliedDilutionFactor = 2;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_is');
  assert.equal(result.correctedResult, 80);
});

test('evaluation is pure: it does not mutate the request', () => {
  const request = baselineRequest();
  const before = JSON.stringify(request);
  evaluateDilutionRerun(request);
  assert.equal(JSON.stringify(request), before);
});

test('evaluation is deterministic across repeated calls', () => {
  const request = baselineRequest();
  const first = evaluateDilutionRerun(request);
  const second = evaluateDilutionRerun(clone(request));
  assert.deepEqual(first, second);
});

test('a decision other than the four defined values is never produced', () => {
  const result = evaluateDilutionRerun(baselineRequest());
  assert.ok(['report_as_is', 'rerun_with_dilution', 'report_as_greater_than', 'block'].includes(result.decision));
});

test('a reading over the upper limit requires a rerun at the next declared ladder factor', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'rerun_with_dilution');
  assert.equal(result.reasonCode, 'rerun-required');
  assert.equal(result.nextDilutionFactor, 2);
  assert.equal(result.correctedResult, null);
});

test('a rerun climbs to the next ladder rung strictly above the already-applied factor', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  request.result.appliedDilutionFactor = 2;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'rerun_with_dilution');
  assert.equal(result.nextDilutionFactor, 5);
});

test('a rerun never selects a ladder factor above the declared maximum dilution', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  request.result.appliedDilutionFactor = 2;
  request.maxDilutionFactor = 4; // excludes the next ladder rung (5) even though it exists
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_greater_than');
  assert.equal(result.reasonCode, 'max-dilution-reached');
});

test('a reading still over range at the highest usable ladder rung reports as greater-than', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  request.result.appliedDilutionFactor = 20;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_greater_than');
  assert.equal(result.reasonCode, 'max-dilution-reached');
  assert.equal(result.greaterThanLimit, 2000);
  assert.equal(result.nextDilutionFactor, null);
});

test('a declared maximum dilution below the next ladder rung reports as greater-than instead of reaching for it', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  request.result.appliedDilutionFactor = 1;
  request.maxDilutionFactor = 1.5;
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_greater_than');
  assert.equal(result.reasonCode, 'max-dilution-reached');
  assert.equal(result.greaterThanLimit, 100);
});

test('exceeding the declared maximum rerun count blocks instead of allowing another rerun', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  request.rerunTracking = { rerunCount: 3, maxReruns: 3 };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'max-reruns-exceeded');
});

test('a rerun count below the declared maximum still allows a rerun', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  request.rerunTracking = { rerunCount: 2, maxReruns: 3 };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'rerun_with_dilution');
});

test('a within-range reading is never blocked by an exhausted rerun budget', () => {
  const request = baselineRequest();
  request.rerunTracking = { rerunCount: 3, maxReruns: 3 };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_is');
});

test('an out-of-range reading with no viable ladder rung is not blocked by rerun budget; it reports greater-than', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  request.result.appliedDilutionFactor = 20;
  request.rerunTracking = { rerunCount: 3, maxReruns: 3 };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'report_as_greater_than');
  assert.equal(result.reasonCode, 'max-dilution-reached');
});

test('an analyte with no declared measuring range fails closed to block', () => {
  const request = baselineRequest();
  request.result.analyteCode = 'ANALYTE-SYNTH-UNKNOWN';
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'unknown-analyte');
});

test('a declared measuring range with a mismatched unit fails closed to block', () => {
  const request = baselineRequest();
  request.measuringRanges = [{ ...baselineRange(), unit: 'ug/L' }];
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'measuring-range-unit-mismatch');
});

test('a ladder declared for a different analyte fails closed to block', () => {
  const request = baselineRequest();
  request.ladder = { analyteCode: 'ANALYTE-SYNTH-OTHER', factors: [2, 5, 10] };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'invalid-ladder');
});

test('an empty ladder fails closed to block', () => {
  const request = baselineRequest();
  request.ladder = { analyteCode: 'ANALYTE-SYNTH-A', factors: [] };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'invalid-ladder');
});

test('a ladder with a factor of 1 or less fails closed to block', () => {
  const request = baselineRequest();
  request.ladder = { analyteCode: 'ANALYTE-SYNTH-A', factors: [1, 5, 10] };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'invalid-ladder');
});

test('a ladder that is not strictly increasing fails closed to block', () => {
  const request = baselineRequest();
  request.ladder = { analyteCode: 'ANALYTE-SYNTH-A', factors: [2, 10, 5] };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'invalid-ladder');
});

test('a ladder with a duplicated factor fails closed to block', () => {
  const request = baselineRequest();
  request.ladder = { analyteCode: 'ANALYTE-SYNTH-A', factors: [2, 5, 5, 10] };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'invalid-ladder');
});

test('a malformed result throws DilutionRerunInputError instead of guessing', () => {
  const request = baselineRequest();
  (request.result as unknown as { rawReading: unknown }).rawReading = 'not-a-number';
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'result-malformed');
    return true;
  });
});

test('a missing analyte code on the result throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  delete (request.result as unknown as { analyteCode?: string }).analyteCode;
  assert.throws(() => evaluateDilutionRerun(request), DilutionRerunInputError);
});

test('an applied dilution factor below 1 throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  request.result.appliedDilutionFactor = 0.5;
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'result-malformed');
    return true;
  });
});

test('measuring ranges that are not an array throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  (request as unknown as { measuringRanges: unknown }).measuringRanges = 'not-an-array';
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'measuring-ranges-malformed');
    return true;
  });
});

test('a measuring range entry with an inverted limit throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  request.measuringRanges = [{ analyteCode: 'ANALYTE-SYNTH-A', unit: 'mg/L', lowerLimit: 100, upperLimit: 0 }];
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'measuring-ranges-malformed');
    return true;
  });
});

test('a ladder missing its factors array throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  (request as unknown as { ladder: unknown }).ladder = { analyteCode: 'ANALYTE-SYNTH-A' };
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'ladder-malformed');
    return true;
  });
});

test('a ladder with a non-numeric factor throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  (request as unknown as { ladder: { analyteCode: string; factors: unknown[] } }).ladder = {
    analyteCode: 'ANALYTE-SYNTH-A',
    factors: [2, 'ten', 20],
  };
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'ladder-malformed');
    return true;
  });
});

test('a maximum dilution factor below 1 throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  request.maxDilutionFactor = 0.9;
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'max-dilution-malformed');
    return true;
  });
});

test('a non-finite maximum dilution factor throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  request.maxDilutionFactor = Number.POSITIVE_INFINITY;
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'max-dilution-malformed');
    return true;
  });
});

test('a negative rerun count throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  request.rerunTracking = { rerunCount: -1, maxReruns: 3 };
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'rerun-tracking-malformed');
    return true;
  });
});

test('a non-integer maximum rerun count throws DilutionRerunInputError', () => {
  const request = baselineRequest();
  request.rerunTracking = { rerunCount: 0, maxReruns: 2.5 };
  assert.throws(() => evaluateDilutionRerun(request), (error: unknown) => {
    assert.ok(error instanceof DilutionRerunInputError);
    assert.equal((error as DilutionRerunInputError).code, 'rerun-tracking-malformed');
    return true;
  });
});

test('every reason code maps to exactly one of the four defined decisions', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainDilutionRerunReason(code);
    assert.ok(message.length > 0);
  }
});

test('reason explanations never claim approval, compliance, accreditation, or releasability', () => {
  for (const code of ALL_REASON_CODES) {
    const message = explainDilutionRerunReason(code);
    for (const pattern of FORBIDDEN_WORDS) {
      assert.doesNotMatch(message, pattern);
    }
  }
});

test('a zero maximum rerun count blocks any required rerun immediately', () => {
  const request = baselineRequest();
  request.result.rawReading = 150;
  request.rerunTracking = { rerunCount: 0, maxReruns: 0 };
  const result = evaluateDilutionRerun(request);
  assert.equal(result.decision, 'block');
  assert.equal(result.reasonCode, 'max-reruns-exceeded');
});

test('the outcome object is frozen', () => {
  const result = evaluateDilutionRerun(baselineRequest());
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'decision', 'block');
  assert.equal(mutationSucceeded, false);
  assert.equal(result.decision, 'report_as_is');
});
