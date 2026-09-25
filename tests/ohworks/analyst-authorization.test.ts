import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AnalystAuthorizationInputError,
  authorizeAnalystRelease,
  explainAuthorizationRule,
  type AnalystRecord,
  type AuthorizationRuleCode,
  type ReleaseCandidate,
} from '../../lib/ohworks-analyst-authorization';

/**
 * All fabricated: synthetic analyst identifiers, methods, and reviewer
 * identifiers. None of this represents a real analyst, patient, or lab
 * record.
 */
function baselineAnalyst(overrides: Partial<AnalystRecord> = {}): AnalystRecord {
  return {
    analystId: 'analyst-synthetic-a',
    role: 'ANALYST',
    competencies: [
      {
        method: 'EPA-200.8',
        assessedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function baselineCandidate(overrides: Partial<ReleaseCandidate> = {}): ReleaseCandidate {
  return {
    resultId: 'result-synthetic-1',
    method: 'EPA-200.8',
    flag: 'ROUTINE',
    timestamp: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

test('authorizes a routine result with current competency and no suspension', () => {
  const summary = authorizeAnalystRelease(baselineAnalyst(), baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'AUTHORIZED', rule: 'routine-authorized' });
});

test('authorizes a critical result with a distinct second reviewer', () => {
  const summary = authorizeAnalystRelease(
    baselineAnalyst(),
    baselineCandidate({ flag: 'CRITICAL', secondReviewerId: 'analyst-synthetic-b' }),
  );
  assert.deepEqual(summary, {
    resultId: 'result-synthetic-1',
    decision: 'AUTHORIZED',
    rule: 'critical-authorized-with-second-reviewer',
  });
});

test('refuses when the evaluation timestamp cannot be parsed', () => {
  const summary = authorizeAnalystRelease(baselineAnalyst(), baselineCandidate({ timestamp: 'not-a-timestamp' }));
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'timestamp-invalid' });
});

test('refuses for a method with no competency entry on file', () => {
  const summary = authorizeAnalystRelease(baselineAnalyst(), baselineCandidate({ method: 'EPA-999.9' }));
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'method-unknown' });
});

test('refuses when the only competency entry for the method has expired', () => {
  const analyst = baselineAnalyst({
    competencies: [
      {
        method: 'EPA-200.8',
        assessedAt: '2024-01-01T00:00:00.000Z',
        expiresAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'competency-expired' });
});

test('refuses when the only competency entry for the method is not yet effective', () => {
  const analyst = baselineAnalyst({
    competencies: [
      {
        method: 'EPA-200.8',
        assessedAt: '2027-01-01T00:00:00.000Z',
        expiresAt: '2028-01-01T00:00:00.000Z',
      },
    ],
  });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'competency-expired' });
});

test('authorizes when one of several competency entries for the method is current', () => {
  const analyst = baselineAnalyst({
    competencies: [
      { method: 'EPA-200.8', assessedAt: '2024-01-01T00:00:00.000Z', expiresAt: '2025-01-01T00:00:00.000Z' },
      { method: 'EPA-200.8', assessedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z' },
    ],
  });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.equal(summary.decision, 'AUTHORIZED');
});

test('refuses when a suspension window with no end is active as of the timestamp', () => {
  const analyst = baselineAnalyst({ suspension: { startsAt: '2026-05-01T00:00:00.000Z' } });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'analyst-suspended' });
});

test('refuses when a bounded suspension window covers the timestamp', () => {
  const analyst = baselineAnalyst({
    suspension: { startsAt: '2026-05-01T00:00:00.000Z', endsAt: '2026-07-01T00:00:00.000Z' },
  });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'analyst-suspended' });
});

test('authorizes when a bounded suspension window has already ended', () => {
  const analyst = baselineAnalyst({
    suspension: { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-02-01T00:00:00.000Z' },
  });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.equal(summary.decision, 'AUTHORIZED');
});

test('authorizes when a suspension window has not started yet', () => {
  const analyst = baselineAnalyst({ suspension: { startsAt: '2026-12-01T00:00:00.000Z' } });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.equal(summary.decision, 'AUTHORIZED');
});

test('refuses fail-closed when a suspension start timestamp cannot be parsed', () => {
  const analyst = baselineAnalyst({ suspension: { startsAt: 'not-a-timestamp' } });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'analyst-suspended' });
});

test('refuses fail-closed when a suspension end timestamp cannot be parsed', () => {
  const analyst = baselineAnalyst({
    suspension: { startsAt: '2026-05-01T00:00:00.000Z', endsAt: 'not-a-timestamp' },
  });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'analyst-suspended' });
});

test('refuses a critical result with no second reviewer supplied', () => {
  const summary = authorizeAnalystRelease(baselineAnalyst(), baselineCandidate({ flag: 'CRITICAL' }));
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'second-reviewer-required' });
});

test('refuses a critical result whose second reviewer is the releasing analyst', () => {
  const summary = authorizeAnalystRelease(
    baselineAnalyst(),
    baselineCandidate({ flag: 'CRITICAL', secondReviewerId: 'analyst-synthetic-a' }),
  );
  assert.deepEqual(summary, {
    resultId: 'result-synthetic-1',
    decision: 'REFUSED',
    rule: 'second-reviewer-same-as-analyst',
  });
});

test('checks rules in the documented priority order when several are broken', () => {
  const analyst = baselineAnalyst({ suspension: { startsAt: '2026-05-01T00:00:00.000Z' } });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate({ method: 'EPA-999.9', flag: 'CRITICAL' }));
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'method-unknown' });
});

test('decision summary excludes analyst id, role, and reviewer id', () => {
  const summary = authorizeAnalystRelease(
    baselineAnalyst(),
    baselineCandidate({ flag: 'CRITICAL', secondReviewerId: 'analyst-synthetic-b' }),
  );
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes('analyst-synthetic'));
  assert.deepEqual(Object.keys(summary).sort(), ['decision', 'resultId', 'rule']);
});

test('throws AnalystAuthorizationInputError for an unknown role', () => {
  const malformed = { ...baselineAnalyst(), role: 'MYSTERY_ROLE' };
  assert.throws(
    () => authorizeAnalystRelease(malformed, baselineCandidate()),
    (error: unknown) => error instanceof AnalystAuthorizationInputError && error.code === 'analyst-malformed',
  );
});

test('throws AnalystAuthorizationInputError when competencies is not an array', () => {
  const malformed = { ...baselineAnalyst(), competencies: 'not-an-array' };
  assert.throws(
    () => authorizeAnalystRelease(malformed, baselineCandidate()),
    (error: unknown) => error instanceof AnalystAuthorizationInputError && error.code === 'analyst-malformed',
  );
});

test('throws AnalystAuthorizationInputError for a competency entry missing a field', () => {
  const malformed = { ...baselineAnalyst(), competencies: [{ method: 'EPA-200.8', assessedAt: '2026-01-01T00:00:00.000Z' }] };
  assert.throws(
    () => authorizeAnalystRelease(malformed, baselineCandidate()),
    (error: unknown) => error instanceof AnalystAuthorizationInputError && error.code === 'analyst-malformed',
  );
});

test('throws AnalystAuthorizationInputError for a malformed suspension', () => {
  const malformed = { ...baselineAnalyst(), suspension: { endsAt: '2026-07-01T00:00:00.000Z' } };
  assert.throws(
    () => authorizeAnalystRelease(malformed, baselineCandidate()),
    (error: unknown) => error instanceof AnalystAuthorizationInputError && error.code === 'analyst-malformed',
  );
});

test('throws AnalystAuthorizationInputError for a non-object analyst', () => {
  assert.throws(
    () => authorizeAnalystRelease(null, baselineCandidate()),
    (error: unknown) => error instanceof AnalystAuthorizationInputError && error.code === 'analyst-malformed',
  );
});

test('throws AnalystAuthorizationInputError for an unknown result flag', () => {
  const malformed = { ...baselineCandidate(), flag: 'URGENT' };
  assert.throws(
    () => authorizeAnalystRelease(baselineAnalyst(), malformed),
    (error: unknown) => error instanceof AnalystAuthorizationInputError && error.code === 'candidate-malformed',
  );
});

test('throws AnalystAuthorizationInputError for a candidate missing a required field', () => {
  const malformed = { ...baselineCandidate(), method: undefined };
  assert.throws(
    () => authorizeAnalystRelease(baselineAnalyst(), malformed),
    (error: unknown) => error instanceof AnalystAuthorizationInputError && error.code === 'candidate-malformed',
  );
});

test('throws AnalystAuthorizationInputError for a non-object candidate', () => {
  assert.throws(
    () => authorizeAnalystRelease(baselineAnalyst(), 'not-an-object'),
    (error: unknown) => error instanceof AnalystAuthorizationInputError && error.code === 'candidate-malformed',
  );
});

test('explainAuthorizationRule covers every rule code', () => {
  const codes: AuthorizationRuleCode[] = [
    'timestamp-invalid',
    'method-unknown',
    'competency-expired',
    'analyst-suspended',
    'second-reviewer-required',
    'second-reviewer-same-as-analyst',
    'routine-authorized',
    'critical-authorized-with-second-reviewer',
  ];
  for (const code of codes) {
    const explanation = explainAuthorizationRule(code);
    assert.equal(typeof explanation, 'string');
    assert.ok(explanation.length > 0);
  }
});

// --- Regressions for three independently reproduced fail-open defects ---

// Defect 1: a whitespace-only secondReviewerId was treated as "supplied"
// instead of "missing" on a critical result.
test('refuses a critical result whose second reviewer id is whitespace-only', () => {
  const summary = authorizeAnalystRelease(
    baselineAnalyst(),
    baselineCandidate({ flag: 'CRITICAL', secondReviewerId: '   ' }),
  );
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'second-reviewer-required' });
});

// Defect 2: bare Date.parse accepted timezone-naive strings (ambient-timezone
// dependent) and could silently normalize an invalid calendar date instead
// of rejecting it. Every caller-supplied timestamp must carry an explicit
// zone and denote a real calendar instant.
test('refuses fail-closed when the evaluation timestamp has no explicit UTC offset', () => {
  const summary = authorizeAnalystRelease(baselineAnalyst(), baselineCandidate({ timestamp: '2026-06-01T00:00:00' }));
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'timestamp-invalid' });
});

test('refuses fail-closed when the evaluation timestamp is a calendar date that does not exist', () => {
  const summary = authorizeAnalystRelease(baselineAnalyst(), baselineCandidate({ timestamp: '2026-02-30T00:00:00Z' }));
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'timestamp-invalid' });
});

test('refuses fail-closed when a competency assessedAt has no explicit UTC offset', () => {
  const analyst = baselineAnalyst({
    competencies: [{ method: 'EPA-200.8', assessedAt: '2026-01-01T00:00:00', expiresAt: '2027-01-01T00:00:00.000Z' }],
  });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'competency-expired' });
});

test('produces the identical decision for the same instant written with different explicit offsets', () => {
  const utc = authorizeAnalystRelease(baselineAnalyst(), baselineCandidate({ timestamp: '2026-06-01T00:00:00Z' }));
  const offset = authorizeAnalystRelease(
    baselineAnalyst(),
    baselineCandidate({ timestamp: '2026-06-01T05:00:00+05:00' }),
  );
  assert.deepEqual(utc, offset);
});

// Defect 3: a suspension window whose evaluation instant fell before startsAt
// short-circuited to "not active" without ever validating endsAt, so a
// corrupted window (endsAt before startsAt) with a future startsAt silently
// authorized release. The whole window must be proven internally consistent
// before deciding it does not cover the evaluation instant.
test('refuses fail-closed when a future-dated suspension window ends before it starts', () => {
  const analyst = baselineAnalyst({
    suspension: { startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-01-01T00:00:00.000Z' },
  });
  const summary = authorizeAnalystRelease(analyst, baselineCandidate());
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'analyst-suspended' });
});

test('suspension window inconsistency is judged identically regardless of explicit offset used', () => {
  const zulu = authorizeAnalystRelease(
    baselineAnalyst({ suspension: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-01-01T00:00:00Z' } }),
    baselineCandidate(),
  );
  const offset = authorizeAnalystRelease(
    baselineAnalyst({ suspension: { startsAt: '2026-12-01T05:00:00+05:00', endsAt: '2026-01-01T05:00:00+05:00' } }),
    baselineCandidate(),
  );
  assert.deepEqual(zulu, offset);
  assert.deepEqual(zulu, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'analyst-suspended' });
});
