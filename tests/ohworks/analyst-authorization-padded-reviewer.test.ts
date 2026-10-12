import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeAnalystRelease,
  type AnalystRecord,
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
    flag: 'CRITICAL',
    timestamp: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

test('refuses the second reviewer as the releasing analyst with or without padding on either side', () => {
  for (const [analystId, secondReviewerId] of [
    ['analyst-synthetic-a', 'analyst-synthetic-a'],
    [' analyst-synthetic-a ', ' analyst-synthetic-a '],
    [' analyst-synthetic-a ', 'analyst-synthetic-a'],
    ['analyst-synthetic-a', ' analyst-synthetic-a '],
    ['analyst-synthetic-a', 'analyst-synthetic-a '],
    ['analyst-synthetic-a', ' analyst-synthetic-a'],
  ]) {
    const summary = authorizeAnalystRelease(
      baselineAnalyst({ analystId }),
      baselineCandidate({ secondReviewerId }),
    );
    assert.deepEqual(
      summary,
      { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'second-reviewer-same-as-analyst' },
      `analystId=${JSON.stringify(analystId)}, secondReviewerId=${JSON.stringify(secondReviewerId)}`,
    );
  }
});

test('authorizes a genuinely distinct second reviewer even when the analyst id is padded', () => {
  const summary = authorizeAnalystRelease(
    baselineAnalyst({ analystId: ' analyst-synthetic-a ' }),
    baselineCandidate({ secondReviewerId: ' analyst-synthetic-b ' }),
  );
  assert.deepEqual(summary, {
    resultId: 'result-synthetic-1',
    decision: 'AUTHORIZED',
    rule: 'critical-authorized-with-second-reviewer',
  });
});

test('still requires a second reviewer when one is blank, even with a padded analyst id', () => {
  const summary = authorizeAnalystRelease(
    baselineAnalyst({ analystId: ' analyst-synthetic-a ' }),
    baselineCandidate({ secondReviewerId: '   ' }),
  );
  assert.deepEqual(summary, { resultId: 'result-synthetic-1', decision: 'REFUSED', rule: 'second-reviewer-required' });
});
