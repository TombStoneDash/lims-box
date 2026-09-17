import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ReportingFormatError,
  explainReportingFormatError,
  formatReportedResult,
  type ReportingFormat,
  type ReportingFormatErrorCode,
  type ReportRequest,
} from '../../lib/ohworks-reporting-format';

/**
 * All fabricated: synthetic analyte codes, made-up decimal places,
 * censoring symbols/limits, unit labels, and qualitative bands. None of
 * this represents a real specimen, instrument, or customer result.
 */
function baselineFormat(): ReportingFormat {
  return {
    analyteCode: 'ANALYTE-SYNTH-A',
    unit: 'mg/L',
    decimalPlaces: 2,
    belowDetectionSymbol: '<',
    belowDetectionLimit: 0.1,
    aboveQuantitationSymbol: '>',
    aboveQuantitationLimit: 100,
    qualitativeThresholds: null,
  };
}

function baselineRequest(): ReportRequest {
  return {
    analyteCode: 'ANALYTE-SYNTH-A',
    value: 12.345,
    formats: [baselineFormat()],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_ERROR_CODES: ReportingFormatErrorCode[] = [
  'request-malformed',
  'formats-malformed',
  'unknown-analyte',
  'non-finite-result',
  'negative-decimal-places',
];

test('an in-range result is rounded to the declared decimal places and unit appended', () => {
  const request = baselineRequest();
  request.value = 12.3;
  const result = formatReportedResult(request);
  assert.equal(result.reportString, '12.30 mg/L');
  assert.equal(result.censoring, null);
});

test('an in-range result rounds using the declared decimal places', () => {
  const request = baselineRequest();
  request.value = 12.344;
  const result = formatReportedResult(request);
  assert.equal(result.reportString, '12.34 mg/L');
});

test('a result exactly at the below-detection limit is in range, not censored', () => {
  const request = baselineRequest();
  request.value = 0.1;
  const result = formatReportedResult(request);
  assert.equal(result.censoring, null);
  assert.equal(result.reportString, '0.10 mg/L');
});

test('a result exactly at the above-quantitation limit is in range, not censored', () => {
  const request = baselineRequest();
  request.value = 100;
  const result = formatReportedResult(request);
  assert.equal(result.censoring, null);
  assert.equal(result.reportString, '100.00 mg/L');
});

test('a result strictly below the detection limit is censored low, reporting the limit itself', () => {
  const request = baselineRequest();
  request.value = 0.05;
  const result = formatReportedResult(request);
  assert.equal(result.censoring, 'below-detection');
  assert.equal(result.reportString, '<0.1 mg/L');
});

test('a result strictly above the quantitation limit is censored high, reporting the limit itself', () => {
  const request = baselineRequest();
  request.value = 150;
  const result = formatReportedResult(request);
  assert.equal(result.censoring, 'above-quantitation');
  assert.equal(result.reportString, '>100 mg/L');
});

test('a censored limit is never rounded to the declared decimal places, even when it has more precision', () => {
  const request = baselineRequest();
  request.formats = [{ ...baselineFormat(), decimalPlaces: 1, belowDetectionLimit: 0.123456 }];
  request.value = 0.01;
  const result = formatReportedResult(request);
  assert.equal(result.censoring, 'below-detection');
  assert.equal(result.reportString, '<0.123456 mg/L');
});

test('a censored above-quantitation limit is never rounded to the declared decimal places', () => {
  const request = baselineRequest();
  request.formats = [{ ...baselineFormat(), decimalPlaces: 0, aboveQuantitationLimit: 99.987 }];
  request.value = 500;
  const result = formatReportedResult(request);
  assert.equal(result.censoring, 'above-quantitation');
  assert.equal(result.reportString, '>99.987 mg/L');
});

test('a rounded-to-zero negative value is never reported as negative zero', () => {
  const request = baselineRequest();
  request.formats = [{ ...baselineFormat(), decimalPlaces: 2, belowDetectionLimit: -1 }];
  request.value = -0.001;
  const result = formatReportedResult(request);
  assert.equal(result.censoring, null);
  assert.equal(result.reportString, '0.00 mg/L');
});

test('a declared qualitative threshold produces the matching label for an in-range result', () => {
  const request = baselineRequest();
  request.formats = [
    {
      ...baselineFormat(),
      qualitativeThresholds: [
        { label: 'Negative', minValue: 0, maxValue: 5 },
        { label: 'Equivocal', minValue: 5, maxValue: 20 },
        { label: 'Positive', minValue: 20, maxValue: null },
      ],
    },
  ];
  request.value = 12.345;
  const result = formatReportedResult(request);
  assert.equal(result.qualitativeLabel, 'Equivocal');
});

test('a qualitative threshold band boundary is inclusive on the lower bound and exclusive on the upper bound', () => {
  const request = baselineRequest();
  request.formats = [
    {
      ...baselineFormat(),
      qualitativeThresholds: [
        { label: 'Negative', minValue: 0, maxValue: 5 },
        { label: 'Positive', minValue: 5, maxValue: null },
      ],
    },
  ];
  request.value = 5;
  const lowResult = formatReportedResult({ ...request, value: 4.999999 });
  const boundaryResult = formatReportedResult(request);
  assert.equal(lowResult.qualitativeLabel, 'Negative');
  assert.equal(boundaryResult.qualitativeLabel, 'Positive');
});

test('the topmost qualitative band with a null maxValue has no upper bound', () => {
  const request = baselineRequest();
  request.formats = [
    {
      ...baselineFormat(),
      qualitativeThresholds: [{ label: 'Positive', minValue: 20, maxValue: null }],
    },
  ];
  request.value = 1_000_000;
  const result = formatReportedResult(request);
  assert.equal(result.qualitativeLabel, 'Positive');
});

test('a result matching no declared qualitative band yields no label', () => {
  const request = baselineRequest();
  request.formats = [
    {
      ...baselineFormat(),
      qualitativeThresholds: [{ label: 'Positive', minValue: 20, maxValue: null }],
    },
  ];
  request.value = 5;
  const result = formatReportedResult(request);
  assert.equal(result.qualitativeLabel, null);
});

test('a format with no declared qualitative thresholds yields no label', () => {
  const result = formatReportedResult(baselineRequest());
  assert.equal(result.qualitativeLabel, null);
});

test('the qualitative label is matched against the raw value even for a censored result', () => {
  const request = baselineRequest();
  request.formats = [
    {
      ...baselineFormat(),
      qualitativeThresholds: [
        { label: 'Negative', minValue: 0, maxValue: 5 },
        { label: 'Positive', minValue: 5, maxValue: null },
      ],
    },
  ];
  request.value = 0.05; // below the 0.1 detection limit, still within the "Negative" band
  const result = formatReportedResult(request);
  assert.equal(result.censoring, 'below-detection');
  assert.equal(result.qualitativeLabel, 'Negative');
});

test('formatting is pure: it does not mutate the request', () => {
  const request = baselineRequest();
  const before = JSON.stringify(request);
  formatReportedResult(request);
  assert.equal(JSON.stringify(request), before);
});

test('formatting is deterministic across repeated calls', () => {
  const request = baselineRequest();
  const first = formatReportedResult(request);
  const second = formatReportedResult(clone(request));
  assert.deepEqual(first, second);
});

test('the outcome object is frozen', () => {
  const result = formatReportedResult(baselineRequest());
  assert.ok(Object.isFrozen(result));
  const mutationSucceeded = Reflect.set(result, 'reportString', 'tampered');
  assert.equal(mutationSucceeded, false);
});

test('an analyte with no declared reporting format fails closed', () => {
  const request = baselineRequest();
  request.analyteCode = 'ANALYTE-SYNTH-UNKNOWN';
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'unknown-analyte');
    return true;
  });
});

test('NaN fails closed as a non-finite result', () => {
  const request = baselineRequest();
  request.value = Number.NaN;
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'non-finite-result');
    return true;
  });
});

test('positive infinity fails closed as a non-finite result', () => {
  const request = baselineRequest();
  request.value = Number.POSITIVE_INFINITY;
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'non-finite-result');
    return true;
  });
});

test('negative infinity fails closed as a non-finite result', () => {
  const request = baselineRequest();
  request.value = Number.NEGATIVE_INFINITY;
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'non-finite-result');
    return true;
  });
});

test('a declared format with negative decimal places fails closed', () => {
  const request = baselineRequest();
  request.formats = [{ ...baselineFormat(), decimalPlaces: -1 }];
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'negative-decimal-places');
    return true;
  });
});

test('a zero decimal-place format is not treated as negative', () => {
  const request = baselineRequest();
  request.formats = [{ ...baselineFormat(), decimalPlaces: 0 }];
  request.value = 12.6;
  const result = formatReportedResult(request);
  assert.equal(result.reportString, '13 mg/L');
});

test('an unaffected format with negative decimal places for a different analyte does not block this result', () => {
  const request = baselineRequest();
  request.formats = [
    baselineFormat(),
    { ...baselineFormat(), analyteCode: 'ANALYTE-SYNTH-OTHER', decimalPlaces: -3 },
  ];
  const result = formatReportedResult(request);
  assert.equal(result.censoring, null);
});

test('a non-object request throws ReportingFormatError', () => {
  assert.throws(() => formatReportedResult(null as unknown as ReportRequest), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'request-malformed');
    return true;
  });
});

test('a missing analyte code throws ReportingFormatError', () => {
  const request = baselineRequest();
  delete (request as unknown as { analyteCode?: string }).analyteCode;
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'request-malformed');
    return true;
  });
});

test('a non-numeric value throws ReportingFormatError instead of coercing', () => {
  const request = baselineRequest();
  (request as unknown as { value: unknown }).value = '12.3';
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'request-malformed');
    return true;
  });
});

test('formats that are not an array throws ReportingFormatError', () => {
  const request = baselineRequest();
  (request as unknown as { formats: unknown }).formats = 'not-an-array';
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'formats-malformed');
    return true;
  });
});

test('a format entry missing a required field throws ReportingFormatError', () => {
  const request = baselineRequest();
  const malformed = baselineFormat() as unknown as Record<string, unknown>;
  delete malformed.unit;
  request.formats = [malformed as unknown as ReportingFormat];
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'formats-malformed');
    return true;
  });
});

test('a format with a non-integer decimal-places value throws ReportingFormatError', () => {
  const request = baselineRequest();
  request.formats = [{ ...baselineFormat(), decimalPlaces: 1.5 }];
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'formats-malformed');
    return true;
  });
});

test('a qualitative threshold with an inverted range throws ReportingFormatError', () => {
  const request = baselineRequest();
  request.formats = [
    {
      ...baselineFormat(),
      qualitativeThresholds: [{ label: 'Broken', minValue: 10, maxValue: 5 }],
    },
  ];
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'formats-malformed');
    return true;
  });
});

test('a qualitative threshold missing a label throws ReportingFormatError', () => {
  const request = baselineRequest();
  request.formats = [
    {
      ...baselineFormat(),
      qualitativeThresholds: [{ minValue: 0, maxValue: 5 } as unknown as { label: string; minValue: number; maxValue: number | null }],
    },
  ];
  assert.throws(() => formatReportedResult(request), (error: unknown) => {
    assert.ok(error instanceof ReportingFormatError);
    assert.equal((error as ReportingFormatError).code, 'formats-malformed');
    return true;
  });
});

test('every error code has a non-empty explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainReportingFormatError(code);
    assert.ok(message.length > 0);
  }
});
