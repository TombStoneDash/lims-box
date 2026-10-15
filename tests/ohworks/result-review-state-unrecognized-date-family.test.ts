import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyResultReviewEvent,
  runResultReviewWorkflow,
  type ResultReviewBlockCode,
  type ResultReviewContext,
  type ResultReviewEventInput,
} from '../../lib/ohworks-result-review-state';

/**
 * All fabricated: synthetic tenant/result identifiers and made-up event
 * data. None of this represents a real sample, patient, or customer.
 */
function baselineContext(): ResultReviewContext {
  return { tenantId: 'tenant-synthetic-a', resultId: 'result-synthetic-001' };
}

function event(overrides: Partial<ResultReviewEventInput> = {}): ResultReviewEventInput {
  return {
    eventId: 'evt-submit-1',
    resultId: 'result-synthetic-001',
    tenantId: 'tenant-synthetic-a',
    kind: 'submit_for_review',
    actorRole: 'submitter',
    actorId: 'actor-synthetic-submitter-001',
    reasonCode: 'ready-for-review',
    occurredAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Impossible dates in timestamp families `calendarDateParts` does not
// recognize. `Date.parse` still rolls these forward into a valid date (e.g.
// Feb 30 2026 -> Mar 2 2026) instead of rejecting them, so the only backstop
// is failing closed when the literal calendar digits cannot be extracted.
// ---------------------------------------------------------------------------

const UNRECOGNIZED_IMPOSSIBLE_DATES = [
  ['weekday-prefixed text date', 'Mon Feb 30 2026 10:00:00 Z'],
  ['comma-separated text date', 'Feb 30, 2026, 10:00:00 Z'],
  ['two-digit-year slash date', '02/30/26 10:00:00Z'],
  ['hyphenated day-month-year date', '30-Feb-2026 10:00:00 Z'],
] as const;

for (const [label, occurredAt] of UNRECOGNIZED_IMPOSSIBLE_DATES) {
  test(`an impossible date in an unrecognized format (${label}) blocks the workflow`, () => {
    const events = [event({ eventId: 'e1', kind: 'submit_for_review', occurredAt })];
    const result = runResultReviewWorkflow(baselineContext(), events);
    assert.equal(result.blocked, true);
    assert.equal(result.finalState, 'draft');
    assert.deepEqual(result.history, []);
    assert.equal((result.steps.at(-1) as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
  });

  test(`an impossible date in an unrecognized format (${label}) is blocked directly by applyResultReviewEvent`, () => {
    const context = baselineContext();
    const result = applyResultReviewEvent('draft', event({ occurredAt }), [], context);
    assert.equal(result.allowed, false);
    assert.equal(result.nextState, 'draft');
    assert.equal((result as { blockCode: ResultReviewBlockCode }).blockCode, 'timestamp-invalid');
  });
}

test('a valid ISO timestamp still applies normally alongside the unrecognized-format fix', () => {
  const context = baselineContext();
  const result = applyResultReviewEvent(
    'draft',
    event({ eventId: 'valid-iso', occurredAt: '2026-02-28T10:00:00.000Z' }),
    [],
    context,
  );
  assert.equal(result.allowed, true);
  assert.equal(result.nextState, 'ready_for_review');
});
