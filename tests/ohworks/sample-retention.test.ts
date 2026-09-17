import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSampleDisposalRecord,
  evaluateSampleRetention,
  explainSampleRetentionError,
  SAMPLE_DISPOSAL_METHOD_CODES,
  SAMPLE_DISPOSAL_WITNESS_ROLES,
  SampleRetentionError,
  type SampleDisposalRequest,
  type SampleRetentionErrorCode,
  type SampleRetentionProfile,
} from '../../lib/ohworks-sample-retention';

/**
 * All fabricated: synthetic analyte classes, specimen identifiers, and
 * made-up report/current timestamps. None of this represents a real
 * patient, specimen, or result.
 */
function baselineProfile(overrides: Partial<SampleRetentionProfile> = {}): SampleRetentionProfile {
  return {
    analyteClass: 'CLINICAL_CHEMISTRY',
    retentionPeriodMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    legalHold: false,
    ...overrides,
  };
}

const REPORT_DATE = '2026-01-01T00:00:00.000Z';

function currentAfter(ms: number): string {
  return new Date(Date.parse(REPORT_DATE) + ms).toISOString();
}

function baselineRequest(overrides: Partial<SampleDisposalRequest> = {}): SampleDisposalRequest {
  return {
    specimenId: 'SPEC-0001',
    methodCode: 'INCINERATION',
    witnessRole: 'LAB_SUPERVISOR',
    ...overrides,
  };
}

test('reports retain well before the retention period elapses', () => {
  const result = evaluateSampleRetention(baselineProfile(), REPORT_DATE, currentAfter(10 * 24 * 60 * 60 * 1000));
  assert.equal(result.status, 'retain');
  assert.equal(result.ruleCode, 'retention-period-not-elapsed');
  assert.equal(result.elapsedMs, 10 * 24 * 60 * 60 * 1000);
  if (result.status === 'retain') {
    assert.equal(result.remainingMs, 20 * 24 * 60 * 60 * 1000);
  }
  assert.equal(result.retentionEndDate, currentAfter(30 * 24 * 60 * 60 * 1000));
});

test('reports eligible_for_disposal exactly at the retention end date with zero overdue', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const result = evaluateSampleRetention(baselineProfile(), REPORT_DATE, currentAfter(retentionPeriodMs));
  assert.equal(result.status, 'eligible_for_disposal');
  assert.equal(result.ruleCode, 'retention-period-elapsed');
  if (result.status === 'eligible_for_disposal') {
    assert.equal(result.overdueMs, 0);
  }
});

test('reports the exact overdue duration well past the retention end date', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const overdueBy = 5 * 24 * 60 * 60 * 1000;
  const result = evaluateSampleRetention(baselineProfile(), REPORT_DATE, currentAfter(retentionPeriodMs + overdueBy));
  assert.equal(result.status, 'eligible_for_disposal');
  if (result.status === 'eligible_for_disposal') {
    assert.equal(result.overdueMs, overdueBy);
    assert.equal(result.elapsedMs, retentionPeriodMs + overdueBy);
  }
});

test('reports held under legal hold even before the retention period elapses', () => {
  const result = evaluateSampleRetention(
    baselineProfile({ legalHold: true }),
    REPORT_DATE,
    currentAfter(5 * 24 * 60 * 60 * 1000),
  );
  assert.equal(result.status, 'held');
  assert.equal(result.ruleCode, 'legal-hold-active');
});

test('reports held under legal hold even well past the retention end date', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const result = evaluateSampleRetention(
    baselineProfile({ legalHold: true }),
    REPORT_DATE,
    currentAfter(retentionPeriodMs + 100 * 24 * 60 * 60 * 1000),
  );
  assert.equal(result.status, 'held');
  assert.equal(result.ruleCode, 'legal-hold-active');
});

test('allows a current timestamp exactly equal to the report date', () => {
  const result = evaluateSampleRetention(baselineProfile(), REPORT_DATE, REPORT_DATE);
  assert.equal(result.status, 'retain');
  assert.equal(result.elapsedMs, 0);
});

test('fails closed on an unknown analyte class', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile({ analyteClass: 'ASTROLOGY' }), REPORT_DATE, currentAfter(0)),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'analyte-class-unknown',
  );
});

test('fails closed on a non-positive retention period', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile({ retentionPeriodMs: 0 }), REPORT_DATE, currentAfter(0)),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'retention-period-invalid',
  );
});

test('fails closed on a non-finite retention period', () => {
  assert.throws(
    () =>
      evaluateSampleRetention(
        baselineProfile({ retentionPeriodMs: Number.POSITIVE_INFINITY }),
        REPORT_DATE,
        currentAfter(0),
      ),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'retention-period-invalid',
  );
});

test('fails closed on a missing report date', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '' as string, currentAfter(0)),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-missing',
  );
});

test('fails closed on an unparsable report date', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), 'not-a-timestamp', currentAfter(0)),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) report date', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), '2026-01-01T00:00:00.000', currentAfter(0)),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-invalid',
  );
});

test('fails closed on a missing current timestamp', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), REPORT_DATE, '' as string),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'current-timestamp-missing',
  );
});

test('fails closed on an unparsable current timestamp', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), REPORT_DATE, 'not-a-timestamp'),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) current timestamp', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), REPORT_DATE, '2026-01-02T00:00:00.000'),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a current timestamp preceding the report date', () => {
  assert.throws(
    () => evaluateSampleRetention(baselineProfile(), REPORT_DATE, currentAfter(-1)),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'current-timestamp-precedes-report-date',
  );
});

test('checks analyte class before retention period', () => {
  assert.throws(
    () =>
      evaluateSampleRetention(
        baselineProfile({ analyteClass: 'ASTROLOGY', retentionPeriodMs: -1 }),
        REPORT_DATE,
        currentAfter(0),
      ),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'analyte-class-unknown',
  );
});

test('never reads the system clock: identical inputs always produce identical output', () => {
  const first = evaluateSampleRetention(baselineProfile(), REPORT_DATE, currentAfter(10 * 24 * 60 * 60 * 1000));
  const second = evaluateSampleRetention(baselineProfile(), REPORT_DATE, currentAfter(10 * 24 * 60 * 60 * 1000));
  assert.deepEqual(first, second);
});

test('explainSampleRetentionError returns deterministic, non-empty text for every error code', () => {
  const codes: SampleRetentionErrorCode[] = [
    'analyte-class-unknown',
    'retention-period-invalid',
    'report-date-missing',
    'report-date-invalid',
    'current-timestamp-missing',
    'current-timestamp-invalid',
    'current-timestamp-precedes-report-date',
    'specimen-id-missing',
    'disposal-under-legal-hold',
    'disposal-before-retention-elapsed',
    'disposal-method-unknown',
    'witness-role-unknown',
  ];
  for (const code of codes) {
    const message = explainSampleRetentionError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

// --- createSampleDisposalRecord ---

test('creates a disposal record once the retention period has elapsed', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const disposalTimestamp = currentAfter(retentionPeriodMs);
  const record = createSampleDisposalRecord(baselineProfile(), REPORT_DATE, disposalTimestamp, baselineRequest());
  assert.equal(record.specimenId, 'SPEC-0001');
  assert.equal(record.methodCode, 'INCINERATION');
  assert.equal(record.witnessRole, 'LAB_SUPERVISOR');
  assert.equal(record.disposalTimestamp, disposalTimestamp);
  assert.equal(record.governingRuleCode, 'retention-period-elapsed');
  assert.equal(record.retentionEndDate, currentAfter(retentionPeriodMs));
});

test('accepts every declared disposal method code and witness role', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const disposalTimestamp = currentAfter(retentionPeriodMs);
  for (const methodCode of SAMPLE_DISPOSAL_METHOD_CODES) {
    for (const witnessRole of SAMPLE_DISPOSAL_WITNESS_ROLES) {
      const record = createSampleDisposalRecord(
        baselineProfile(),
        REPORT_DATE,
        disposalTimestamp,
        baselineRequest({ methodCode, witnessRole }),
      );
      assert.equal(record.methodCode, methodCode);
      assert.equal(record.witnessRole, witnessRole);
    }
  }
});

test('fails closed on a disposal attempt under legal hold, even past the retention end date', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const disposalTimestamp = currentAfter(retentionPeriodMs + 100 * 24 * 60 * 60 * 1000);
  assert.throws(
    () =>
      createSampleDisposalRecord(
        baselineProfile({ legalHold: true }),
        REPORT_DATE,
        disposalTimestamp,
        baselineRequest(),
      ),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'disposal-under-legal-hold',
  );
});

test('fails closed on a disposal attempt before the retention period elapses', () => {
  const disposalTimestamp = currentAfter(5 * 24 * 60 * 60 * 1000);
  assert.throws(
    () => createSampleDisposalRecord(baselineProfile(), REPORT_DATE, disposalTimestamp, baselineRequest()),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'disposal-before-retention-elapsed',
  );
});

test('fails closed on an unknown disposal method code', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const disposalTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () =>
      createSampleDisposalRecord(
        baselineProfile(),
        REPORT_DATE,
        disposalTimestamp,
        baselineRequest({ methodCode: 'DUMP_IN_RIVER' }),
      ),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'disposal-method-unknown',
  );
});

test('fails closed on an unknown witness role', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const disposalTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () =>
      createSampleDisposalRecord(
        baselineProfile(),
        REPORT_DATE,
        disposalTimestamp,
        baselineRequest({ witnessRole: 'RANDOM_INTERN' }),
      ),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'witness-role-unknown',
  );
});

test('fails closed on a missing specimen identifier', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const disposalTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () =>
      createSampleDisposalRecord(
        baselineProfile(),
        REPORT_DATE,
        disposalTimestamp,
        baselineRequest({ specimenId: '' }),
      ),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'specimen-id-missing',
  );
});

test('disposal fails closed on the underlying missing report date before touching method or witness', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const disposalTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () =>
      createSampleDisposalRecord(
        baselineProfile(),
        '' as string,
        disposalTimestamp,
        baselineRequest({ methodCode: 'NOT_A_METHOD', witnessRole: 'NOT_A_ROLE' }),
      ),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'report-date-missing',
  );
});

test('disposal fails closed on an unknown analyte class before touching method or witness', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const disposalTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () =>
      createSampleDisposalRecord(
        baselineProfile({ analyteClass: 'ASTROLOGY' }),
        REPORT_DATE,
        disposalTimestamp,
        baselineRequest({ methodCode: 'NOT_A_METHOD', witnessRole: 'NOT_A_ROLE' }),
      ),
    (error: unknown) => error instanceof SampleRetentionError && error.code === 'analyte-class-unknown',
  );
});
