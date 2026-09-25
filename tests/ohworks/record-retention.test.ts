import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRecordPurgeManifest,
  evaluateRecordRetention,
  explainRecordRetentionError,
  RecordRetentionError,
  type RecordPurgeEntry,
  type RecordRetentionErrorCode,
  type RecordRetentionProfile,
} from '../../lib/ohworks-record-retention';

/**
 * All fabricated: synthetic record classes, record identifiers, and made-up
 * creation/current timestamps. None of this represents a real patient,
 * specimen, or laboratory record.
 */
function baselineProfile(overrides: Partial<RecordRetentionProfile> = {}): RecordRetentionProfile {
  return {
    recordClass: 'QC_LOG',
    retentionPeriodMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    litigationHold: false,
    ...overrides,
  };
}

const CREATION_DATE = '2026-01-01T00:00:00.000Z';

function currentAfter(ms: number): string {
  return new Date(Date.parse(CREATION_DATE) + ms).toISOString();
}

function baselineEntry(overrides: Partial<RecordPurgeEntry> = {}): RecordPurgeEntry {
  return {
    recordId: 'REC-0001',
    profile: baselineProfile(),
    creationDate: CREATION_DATE,
    ...overrides,
  };
}

const RECORD_CLASSES = ['QC_LOG', 'INSTRUMENT_MAINTENANCE', 'PERSONNEL_COMPETENCY', 'REPORT', 'AUDIT_TRAIL'] as const;

test('reports retain well before the retention period elapses', () => {
  const result = evaluateRecordRetention(baselineProfile(), CREATION_DATE, currentAfter(10 * 24 * 60 * 60 * 1000));
  assert.equal(result.status, 'retain');
  assert.equal(result.ruleCode, 'retention-period-not-elapsed');
  assert.equal(result.elapsedMs, 10 * 24 * 60 * 60 * 1000);
  if (result.status === 'retain') {
    assert.equal(result.remainingMs, 20 * 24 * 60 * 60 * 1000);
  }
  assert.equal(result.retentionEndDate, currentAfter(30 * 24 * 60 * 60 * 1000));
});

test('reports eligible_for_purge exactly at the retention end date with zero overdue', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const result = evaluateRecordRetention(baselineProfile(), CREATION_DATE, currentAfter(retentionPeriodMs));
  assert.equal(result.status, 'eligible_for_purge');
  assert.equal(result.ruleCode, 'retention-period-elapsed');
  if (result.status === 'eligible_for_purge') {
    assert.equal(result.overdueMs, 0);
  }
});

test('reports the exact overdue duration well past the retention end date', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const overdueBy = 5 * 24 * 60 * 60 * 1000;
  const result = evaluateRecordRetention(baselineProfile(), CREATION_DATE, currentAfter(retentionPeriodMs + overdueBy));
  assert.equal(result.status, 'eligible_for_purge');
  if (result.status === 'eligible_for_purge') {
    assert.equal(result.overdueMs, overdueBy);
    assert.equal(result.elapsedMs, retentionPeriodMs + overdueBy);
  }
});

test('reports held under litigation hold even before the retention period elapses', () => {
  const result = evaluateRecordRetention(
    baselineProfile({ litigationHold: true }),
    CREATION_DATE,
    currentAfter(5 * 24 * 60 * 60 * 1000),
  );
  assert.equal(result.status, 'held');
  assert.equal(result.ruleCode, 'litigation-hold-active');
});

test('reports held under litigation hold even well past the retention end date', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const result = evaluateRecordRetention(
    baselineProfile({ litigationHold: true }),
    CREATION_DATE,
    currentAfter(retentionPeriodMs + 100 * 24 * 60 * 60 * 1000),
  );
  assert.equal(result.status, 'held');
  assert.equal(result.ruleCode, 'litigation-hold-active');
});

test('allows a current timestamp exactly equal to the creation date', () => {
  const result = evaluateRecordRetention(baselineProfile(), CREATION_DATE, CREATION_DATE);
  assert.equal(result.status, 'retain');
  assert.equal(result.elapsedMs, 0);
});

test('evaluates every declared record class', () => {
  for (const recordClass of RECORD_CLASSES) {
    const result = evaluateRecordRetention(
      baselineProfile({ recordClass }),
      CREATION_DATE,
      currentAfter(10 * 24 * 60 * 60 * 1000),
    );
    assert.equal(result.status, 'retain');
  }
});

test('fails closed on an unknown record class', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile({ recordClass: 'HALLWAY_GOSSIP' }), CREATION_DATE, currentAfter(0)),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'record-class-unknown',
  );
});

test('fails closed on a non-positive retention period', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile({ retentionPeriodMs: 0 }), CREATION_DATE, currentAfter(0)),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'retention-period-invalid',
  );
});

test('fails closed on a non-finite retention period', () => {
  assert.throws(
    () =>
      evaluateRecordRetention(
        baselineProfile({ retentionPeriodMs: Number.POSITIVE_INFINITY }),
        CREATION_DATE,
        currentAfter(0),
      ),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'retention-period-invalid',
  );
});

test('fails closed on a missing creation date', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), '' as string, currentAfter(0)),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-missing',
  );
});

test('fails closed on an unparsable creation date', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), 'not-a-timestamp', currentAfter(0)),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) creation date', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), '2026-01-01T00:00:00.000', currentAfter(0)),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-invalid',
  );
});

test('fails closed on a missing current timestamp', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), CREATION_DATE, '' as string),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'current-timestamp-missing',
  );
});

test('fails closed on an unparsable current timestamp', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), CREATION_DATE, 'not-a-timestamp'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) current timestamp', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), CREATION_DATE, '2026-01-02T00:00:00.000'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'current-timestamp-invalid',
  );
});

test('fails closed on a current timestamp preceding the creation date', () => {
  assert.throws(
    () => evaluateRecordRetention(baselineProfile(), CREATION_DATE, currentAfter(-1)),
    (error: unknown) =>
      error instanceof RecordRetentionError && error.code === 'current-timestamp-precedes-creation-date',
  );
});

test('checks record class before retention period', () => {
  assert.throws(
    () =>
      evaluateRecordRetention(
        baselineProfile({ recordClass: 'HALLWAY_GOSSIP', retentionPeriodMs: -1 }),
        CREATION_DATE,
        currentAfter(0),
      ),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'record-class-unknown',
  );
});

test('never reads the system clock: identical inputs always produce identical output', () => {
  const first = evaluateRecordRetention(baselineProfile(), CREATION_DATE, currentAfter(10 * 24 * 60 * 60 * 1000));
  const second = evaluateRecordRetention(baselineProfile(), CREATION_DATE, currentAfter(10 * 24 * 60 * 60 * 1000));
  assert.deepEqual(first, second);
});

test('explainRecordRetentionError returns deterministic, non-empty text for every error code', () => {
  const codes: RecordRetentionErrorCode[] = [
    'record-class-unknown',
    'retention-period-invalid',
    'creation-date-missing',
    'creation-date-invalid',
    'current-timestamp-missing',
    'current-timestamp-invalid',
    'current-timestamp-precedes-creation-date',
    'record-id-missing',
    'purge-under-litigation-hold',
    'purge-before-retention-elapsed',
    'purge-timestamp-missing',
    'purge-timestamp-invalid',
  ];
  for (const code of codes) {
    const message = explainRecordRetentionError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

// --- createRecordPurgeManifest ---

test('creates a purge manifest listing only record identifiers once the retention period has elapsed', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const purgeTimestamp = currentAfter(retentionPeriodMs);
  const manifest = createRecordPurgeManifest([baselineEntry()], purgeTimestamp);
  assert.deepEqual(manifest, {
    purgeTimestamp,
    recordIds: ['REC-0001'],
  });
});

test('builds a manifest across multiple eligible records of different classes, preserving order', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const purgeTimestamp = currentAfter(retentionPeriodMs);
  const manifest = createRecordPurgeManifest(
    [
      baselineEntry({ recordId: 'REC-0001', profile: baselineProfile({ recordClass: 'QC_LOG' }) }),
      baselineEntry({ recordId: 'REC-0002', profile: baselineProfile({ recordClass: 'INSTRUMENT_MAINTENANCE' }) }),
      baselineEntry({ recordId: 'REC-0003', profile: baselineProfile({ recordClass: 'PERSONNEL_COMPETENCY' }) }),
      baselineEntry({ recordId: 'REC-0004', profile: baselineProfile({ recordClass: 'REPORT' }) }),
      baselineEntry({ recordId: 'REC-0005', profile: baselineProfile({ recordClass: 'AUDIT_TRAIL' }) }),
    ],
    purgeTimestamp,
  );
  assert.deepEqual(manifest.recordIds, ['REC-0001', 'REC-0002', 'REC-0003', 'REC-0004', 'REC-0005']);
});

test('manifest contains no keys beyond purgeTimestamp and recordIds', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const purgeTimestamp = currentAfter(retentionPeriodMs);
  const manifest = createRecordPurgeManifest([baselineEntry()], purgeTimestamp);
  assert.deepEqual(Object.keys(manifest).sort(), ['purgeTimestamp', 'recordIds']);
});

test('produces an empty manifest for an empty batch', () => {
  const purgeTimestamp = currentAfter(0);
  const manifest = createRecordPurgeManifest([], purgeTimestamp);
  assert.deepEqual(manifest, { purgeTimestamp, recordIds: [] });
});

test('fails closed on a purge attempt under litigation hold, even past the retention end date', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const purgeTimestamp = currentAfter(retentionPeriodMs + 100 * 24 * 60 * 60 * 1000);
  assert.throws(
    () =>
      createRecordPurgeManifest(
        [baselineEntry({ profile: baselineProfile({ litigationHold: true }) })],
        purgeTimestamp,
      ),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-under-litigation-hold',
  );
});

test('fails the entire batch when any single record is under litigation hold', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const purgeTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () =>
      createRecordPurgeManifest(
        [
          baselineEntry({ recordId: 'REC-0001' }),
          baselineEntry({ recordId: 'REC-0002', profile: baselineProfile({ litigationHold: true }) }),
        ],
        purgeTimestamp,
      ),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-under-litigation-hold',
  );
});

test('fails closed on a purge attempt before the retention period elapses', () => {
  const purgeTimestamp = currentAfter(5 * 24 * 60 * 60 * 1000);
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry()], purgeTimestamp),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-before-retention-elapsed',
  );
});

test('fails closed on a missing record identifier', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const purgeTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry({ recordId: '' })], purgeTimestamp),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'record-id-missing',
  );
});

test('fails closed on a missing purge timestamp', () => {
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry()], '' as string),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-timestamp-missing',
  );
});

test('fails closed on an unparsable purge timestamp', () => {
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry()], 'not-a-timestamp'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-timestamp-invalid',
  );
});

test('fails closed on a non-UTC (no trailing Z) purge timestamp', () => {
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry()], '2026-02-01T00:00:00.000'),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-timestamp-invalid',
  );
});

test('purge timestamp is validated before any entry is evaluated', () => {
  assert.throws(
    () =>
      createRecordPurgeManifest(
        [baselineEntry({ profile: baselineProfile({ recordClass: 'HALLWAY_GOSSIP' }) })],
        '',
      ),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'purge-timestamp-missing',
  );
});

test('purge fails closed on an unknown record class before touching the record identifier', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const purgeTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () =>
      createRecordPurgeManifest(
        [
          baselineEntry({
            recordId: '',
            profile: baselineProfile({ recordClass: 'HALLWAY_GOSSIP' }),
          }),
        ],
        purgeTimestamp,
      ),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'record-class-unknown',
  );
});

test('purge fails closed on the underlying missing creation date before touching the record identifier', () => {
  const retentionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const purgeTimestamp = currentAfter(retentionPeriodMs);
  assert.throws(
    () => createRecordPurgeManifest([baselineEntry({ recordId: '', creationDate: '' })], purgeTimestamp),
    (error: unknown) => error instanceof RecordRetentionError && error.code === 'creation-date-missing',
  );
});
