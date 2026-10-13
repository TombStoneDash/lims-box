// Shared first-contact rules (spec rev 3), ported unchanged from
// trashalert-web tests/first-contact.test.ts so both repos prove the same logic.
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRetryAction } from '../lib/first-contact'

const NOW = new Date('2026-10-12T00:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString()

test('retries: an invalid attempts count on a failed row is capped out, never retried', () => {
  assert.equal(
    nextRetryAction({ outcome: 'failed', attempts: NaN, updatedAt: '2026-10-01T00:00:00Z' }, NOW),
    'draft_for_hudson',
  )
  assert.equal(
    nextRetryAction({ outcome: 'failed', attempts: -1, updatedAt: '2026-10-01T00:00:00Z' }, NOW),
    'draft_for_hudson',
  )
  assert.equal(
    nextRetryAction({ outcome: 'failed', attempts: 1.5, updatedAt: '2026-10-01T00:00:00Z' }, NOW),
    'draft_for_hudson',
  )
})

test('retries: an unparseable updatedAt or now on a failed row is capped out, never waits forever', () => {
  assert.equal(
    nextRetryAction({ outcome: 'failed', attempts: 1, updatedAt: 'not-a-date' }, NOW),
    'draft_for_hudson',
  )
  assert.equal(
    nextRetryAction({ outcome: 'failed', attempts: 1, updatedAt: hoursAgo(25) }, new Date('x')),
    'draft_for_hudson',
  )
})

test('retries: an unparseable updatedAt or now on a pending row resolves delivery, never auto-resends', () => {
  assert.equal(
    nextRetryAction({ outcome: 'pending', attempts: 0, updatedAt: '' }, NOW),
    'resolve_delivery',
  )
  assert.equal(
    nextRetryAction({ outcome: 'pending', attempts: 0, updatedAt: hoursAgo(2) }, new Date('x')),
    'resolve_delivery',
  )
})

test('retries: unresolved, permanent, sent and unknown outcomes are unaffected by invalid attempts or dates', () => {
  assert.equal(
    nextRetryAction({ outcome: 'unresolved', attempts: NaN, updatedAt: 'not-a-date' }, NOW),
    'resolve_delivery',
  )
  assert.equal(
    nextRetryAction({ outcome: 'permanent', attempts: NaN, updatedAt: 'not-a-date' }, NOW),
    'draft_for_hudson',
  )
  assert.equal(
    nextRetryAction({ outcome: 'sent', attempts: NaN, updatedAt: 'not-a-date' }, NOW),
    'none',
  )
  assert.equal(
    nextRetryAction({ outcome: 'weird-unknown-outcome', attempts: NaN, updatedAt: 'not-a-date' }, NOW),
    'none',
  )
})

test('retries: only definite rejections are resent, and only past the window (valid-row behaviour unchanged)', () => {
  assert.equal(nextRetryAction({ outcome: 'failed', attempts: 1, updatedAt: hoursAgo(2) }, NOW), 'wait')
  assert.equal(nextRetryAction({ outcome: 'failed', attempts: 1, updatedAt: hoursAgo(25) }, NOW), 'retry')
  assert.equal(nextRetryAction({ outcome: 'failed', attempts: 3, updatedAt: hoursAgo(48) }, NOW), 'draft_for_hudson')
  assert.equal(nextRetryAction({ outcome: 'pending', attempts: 0, updatedAt: hoursAgo(2) }, NOW), 'wait')
  assert.equal(nextRetryAction({ outcome: 'pending', attempts: 0, updatedAt: hoursAgo(25) }, NOW), 'resolve_delivery')
  for (const h of [1, 25, 500]) {
    assert.equal(nextRetryAction({ outcome: 'unresolved', attempts: 1, updatedAt: hoursAgo(h) }, NOW), 'resolve_delivery',
      'an unclear outcome is never retried automatically')
  }
  assert.equal(nextRetryAction({ outcome: 'permanent', attempts: 1, updatedAt: hoursAgo(1) }, NOW), 'draft_for_hudson')
  assert.equal(nextRetryAction({ outcome: 'sent', attempts: 1, updatedAt: hoursAgo(1) }, NOW), 'none')
})
