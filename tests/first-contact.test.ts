// Shared first-contact rules (spec rev 3), ported unchanged from
// trashalert-web tests/first-contact.test.ts so both repos prove the same logic.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  classifySendResult,
  decideFirstContact,
  decideForConfiguredScope,
  emailHmac,
  firstContactDryRun,
  nextRetryAction,
  readFirstContactConfig,
  type FirstContactFacts,
} from '../lib/first-contact'

const none: FirstContactFacts = {
  alreadyLogged: false, notable: false, knownOwnProduct: false,
  knownOtherProduct: false, knownCorrespondent: false, coveredByTransactional: false,
}
const NOW = new Date('2026-09-26T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString()

test('config: off by default, and this build can never send', () => {
  assert.deepEqual(readFirstContactConfig({}).mode, 'off')
  assert.ok(readFirstContactConfig({}).blockers.includes('FLAG_OFF'))
  for (const flag of ['', 'false', '0', 'off']) {
    assert.equal(readFirstContactConfig({ FIRST_CONTACT_EMAIL_ENABLED: flag }).mode, 'off')
  }
  const full = readFirstContactConfig({ FIRST_CONTACT_EMAIL_ENABLED: 'true', FIRST_CONTACT_SCOPE: 'per-product', FIRST_CONTACT_HMAC_KEY: 'k' })
  assert.equal(full.mode, 'dry-run', 'even with every setting present there is no send mode')
  assert.deepEqual(full.blockers, ['SEND_NOT_BUILT'])
})

test('config: scope is required and never defaulted', () => {
  const unset = readFirstContactConfig({ FIRST_CONTACT_EMAIL_ENABLED: 'true', FIRST_CONTACT_HMAC_KEY: 'k' })
  assert.equal(unset.scope, null)
  assert.ok(unset.blockers.includes('SCOPE_UNSET'))
  assert.equal(readFirstContactConfig({ FIRST_CONTACT_SCOPE: 'per_product' }).scope, null, 'only the exact values count')
  assert.equal(readFirstContactConfig({ FIRST_CONTACT_SCOPE: 'cross-product' }).scope, 'cross-product')
  assert.ok(readFirstContactConfig({ FIRST_CONTACT_EMAIL_ENABLED: 'true' }).blockers.includes('HMAC_KEY_MISSING'))
})

test('decision order: already logged, notable, known, transactional, then send', () => {
  assert.equal(decideFirstContact({ ...none, alreadyLogged: true, notable: true }, 'per-product'), 'already_logged')
  assert.equal(decideFirstContact({ ...none, notable: true, knownOwnProduct: true }, 'per-product'), 'draft_for_hudson')
  assert.equal(decideFirstContact({ ...none, knownOwnProduct: true }, 'per-product'), 'skipped_known')
  assert.equal(decideFirstContact({ ...none, knownCorrespondent: true }, 'per-product'), 'skipped_known')
  assert.equal(decideFirstContact({ ...none, coveredByTransactional: true }, 'per-product'), 'covered_by_transactional')
  assert.equal(decideFirstContact(none, 'per-product'), 'would_send')
})

test('only cross-product scope counts another product\'s first contact', () => {
  const other = { ...none, knownOtherProduct: true }
  assert.equal(decideFirstContact(other, 'per-product'), 'would_send')
  assert.equal(decideFirstContact(other, 'cross-product'), 'skipped_known')
  assert.deepEqual(decideForConfiguredScope(other, null),
    { scope: 'unset', perProduct: 'would_send', crossProduct: 'skipped_known' })
  assert.deepEqual(decideForConfiguredScope(other, 'cross-product'), { scope: 'cross-product', decision: 'skipped_known' })
})

test('HMAC: keyed, normalized, and not a plain SHA-256', () => {
  assert.equal(emailHmac('a@example.com', null), null)
  const h = emailHmac(' A@Example.com ', 'key-1')
  assert.equal(h, emailHmac('a@example.com', 'key-1'))
  assert.notEqual(h, emailHmac('a@example.com', 'key-2'))
  assert.notEqual(h, createHash('sha256').update('a@example.com').digest('hex'))
  assert.match(h ?? '', /^[0-9a-f]{64}$/)
})

test('send results: definite rejections vs unclear outcomes', () => {
  assert.equal(classifySendResult({ messageId: 'm1', status: 200 }), 'sent')
  assert.equal(classifySendResult({ status: 429, errorName: 'daily_quota_exceeded' }), 'failed')
  assert.equal(classifySendResult({ status: 422, errorName: 'validation_error' }), 'failed')
  assert.equal(classifySendResult({ status: 422, errorName: 'invalid_to_address' }), 'permanent')
  assert.equal(classifySendResult({ status: 408 }), 'unresolved', 'request timeout: may have been accepted')
  assert.equal(classifySendResult({ status: 409, errorName: 'concurrent_idempotent_requests' }), 'unresolved', 'idempotency conflict')
  assert.equal(classifySendResult({ status: 500 }), 'unresolved')
  assert.equal(classifySendResult({ status: 503 }), 'unresolved')
  assert.equal(classifySendResult({ transportError: true }), 'unresolved', 'timeout or network error')
  assert.equal(classifySendResult({}), 'unresolved', 'no response')
})

test('retries: only definite rejections are resent, and only past the window', () => {
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

test('dry run with the flag off does nothing, not even a lookup', async () => {
  let looked = false
  const lines: string[] = []
  await firstContactDryRun({ product: 'p', endpoint: 'e', email: 'a@example.com', env: {},
    lookupFacts: async () => { looked = true; return {} }, log: (l) => lines.push(l) })
  assert.equal(looked, false)
  assert.deepEqual(lines, [])
})

test('dry run logs one hashed decision line and never the address', async () => {
  const lines: string[] = []
  await firstContactDryRun({
    product: 'trashalert', endpoint: 'city-waitlist', email: 'Person@Example.com',
    env: { FIRST_CONTACT_EMAIL_ENABLED: 'true', FIRST_CONTACT_HMAC_KEY: 'test-key' },
    lookupFacts: async () => ({ knownOwnProduct: false }), log: (l) => lines.push(l),
  })
  assert.equal(lines.length, 1)
  assert.ok(!lines[0].toLowerCase().includes('person@example.com'))
  const entry = JSON.parse(lines[0])
  assert.equal(entry.email_hmac, emailHmac('person@example.com', 'test-key'))
  assert.equal(entry.scope, 'unset')
  assert.equal(entry.perProduct, 'would_send')
  assert.ok(entry.blockers.includes('SEND_NOT_BUILT'))
  assert.ok(entry.blockers.includes('SCOPE_UNSET'))
})

test('dry run swallows lookup errors so the signup still succeeds', async () => {
  const lines: string[] = []
  await firstContactDryRun({ product: 'p', endpoint: 'e', email: 'a@example.com', env: { FIRST_CONTACT_EMAIL_ENABLED: '1' },
    lookupFacts: async () => { throw new Error('db down a@example.com') }, log: (l) => lines.push(l) })
  assert.deepEqual(JSON.parse(lines[0]), { event: 'first_contact_dry_run_error', product: 'p', endpoint: 'e' })
})
