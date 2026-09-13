import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPersonnelPackFulfillmentKey,
  createPersonnelPackFulfillmentStateStore,
} from '../lib/personnelPackFulfillment';

// Canary values that must never survive into a stored failure reason.
const CANARY_SECRET = 'canary-secret-9f3a1c-do-not-log';
const CANARY_ERROR = new Error(`relation "personnel_pack_leads" does not exist: ${CANARY_SECRET}`);
const CANARY_CONTROL_CHARS = `lead_store_failed${String.fromCharCode(0, 7)}${CANARY_SECRET}`;
const CANARY_LONG_STRING = `lead_store_failed-${'x'.repeat(5000)}`;

function createClock(start: string) {
  let current = start;
  return {
    now: () => current,
    advance: (next: string) => {
      current = next;
    },
  };
}

test('a fresh key starts pending and a duplicate in-flight request is not allowed to start a second attempt', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');
  const key = buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189');

  const first = store.beginAttempt(key);
  assert.equal(first.allowed, true);
  assert.deepEqual(first.record, { state: 'pending', attempts: 1, reason: null, updatedAt: '2026-09-12T00:00:00.000Z' });

  const duplicate = store.beginAttempt(key);
  assert.equal(duplicate.allowed, false);
  assert.deepEqual(duplicate.record, first.record);
  assert.equal(store.get(key)?.attempts, 1);
});

test('fulfillment is idempotent: repeated confirmations and duplicate requests never re-trigger it', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');
  const key = buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189');

  store.beginAttempt(key);
  const fulfilled = store.markFulfilled(key);
  assert.deepEqual(fulfilled, { state: 'fulfilled', attempts: 1, reason: null, updatedAt: '2026-09-12T00:00:00.000Z' });

  const repeatedConfirmation = store.markFulfilled(key);
  assert.deepEqual(repeatedConfirmation, fulfilled);

  const duplicateRequest = store.beginAttempt(key);
  assert.equal(duplicateRequest.allowed, false);
  assert.deepEqual(duplicateRequest.record, fulfilled);
  assert.equal(store.get(key)?.state, 'fulfilled');
});

test('a retryable failure allows exactly one subsequent attempt, incrementing the attempt count', () => {
  const clock = createClock('2026-09-12T00:00:00.000Z');
  const store = createPersonnelPackFulfillmentStateStore(clock.now);
  const key = buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189');

  store.beginAttempt(key);
  clock.advance('2026-09-12T00:01:00.000Z');
  const failed = store.markRetryableFailure(key, 'lead_store_failed');
  assert.deepEqual(failed, {
    state: 'retryable-failure',
    attempts: 1,
    reason: 'lead_store_failed',
    updatedAt: '2026-09-12T00:01:00.000Z',
  });

  clock.advance('2026-09-12T00:02:00.000Z');
  const retry = store.beginAttempt(key);
  assert.equal(retry.allowed, true);
  assert.deepEqual(retry.record, {
    state: 'pending',
    attempts: 2,
    reason: null,
    updatedAt: '2026-09-12T00:02:00.000Z',
  });

  clock.advance('2026-09-12T00:03:00.000Z');
  const fulfilled = store.markFulfilled(key);
  assert.deepEqual(fulfilled, {
    state: 'fulfilled',
    attempts: 2,
    reason: null,
    updatedAt: '2026-09-12T00:03:00.000Z',
  });
});

test('a terminal failure blocks every later attempt and is itself idempotent', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');
  const key = buildPersonnelPackFulfillmentKey('user@example.com', 'clia');

  store.beginAttempt(key);
  const terminal = store.markTerminalFailure(key, 'unsupported_pack_selection');
  assert.deepEqual(terminal, {
    state: 'terminal-failure',
    attempts: 1,
    reason: 'unsupported_pack_selection',
    updatedAt: '2026-09-12T00:00:00.000Z',
  });

  const blockedRetry = store.beginAttempt(key);
  assert.equal(blockedRetry.allowed, false);
  assert.deepEqual(blockedRetry.record, terminal);

  const repeatedTerminal = store.markTerminalFailure(key, 'unsupported_pack_selection');
  assert.deepEqual(repeatedTerminal, terminal);
  assert.equal(store.get(key)?.attempts, 1);
});

test('marking a key fulfilled without a prior attempt throws instead of fabricating a fulfilled state', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');
  const key = buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189');

  assert.throws(() => store.markFulfilled(key), /before beginAttempt/);
  assert.equal(store.get(key), undefined);
});

test('a key that has already terminally failed can never be overwritten as fulfilled', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');
  const key = buildPersonnelPackFulfillmentKey('user@example.com', 'clia');

  store.beginAttempt(key);
  store.markTerminalFailure(key, 'unsupported_pack_selection');

  assert.throws(() => store.markFulfilled(key), /terminal-failure/);
  assert.equal(store.get(key)?.state, 'terminal-failure');
});

test('a fulfilled key rejects a late retryable-failure transition instead of silently reverting', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');
  const key = buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189');

  store.beginAttempt(key);
  store.markFulfilled(key);

  assert.throws(() => store.markRetryableFailure(key, 'lead_store_failed'), /fulfilled/);
  assert.equal(store.get(key)?.state, 'fulfilled');
});

test('failure reasons are sanitized to a fixed safe code; raw error text, control bytes, and long strings are never stored', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');

  const byErrorObject = buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189');
  store.beginAttempt(byErrorObject);
  const fromError = store.markRetryableFailure(byErrorObject, CANARY_ERROR);
  assert.equal(fromError.reason, 'unknown');
  assert.doesNotMatch(JSON.stringify(fromError), new RegExp(CANARY_SECRET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const byControlChars = buildPersonnelPackFulfillmentKey('user2@example.com', 'iso15189');
  store.beginAttempt(byControlChars);
  const fromControlChars = store.markRetryableFailure(byControlChars, CANARY_CONTROL_CHARS);
  assert.equal(fromControlChars.reason, 'unknown');

  const byLongString = buildPersonnelPackFulfillmentKey('user3@example.com', 'iso15189');
  store.beginAttempt(byLongString);
  const fromLongString = store.markRetryableFailure(byLongString, CANARY_LONG_STRING);
  assert.equal(fromLongString.reason, 'unknown');

  const byCleanCode = buildPersonnelPackFulfillmentKey('user4@example.com', 'iso15189');
  store.beginAttempt(byCleanCode);
  const fromCleanCode = store.markTerminalFailure(byCleanCode, 'unsupported_pack_selection');
  assert.equal(fromCleanCode.reason, 'unsupported_pack_selection');
});

test('independent keys (different applicant or pack selection) never share state', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');
  const keyA = buildPersonnelPackFulfillmentKey('alice@example.com', 'iso15189');
  const keyB = buildPersonnelPackFulfillmentKey('bob@example.com', 'iso15189');
  const keyC = buildPersonnelPackFulfillmentKey('alice@example.com', 'clia');

  store.beginAttempt(keyA);
  store.markFulfilled(keyA);

  assert.equal(store.get(keyA)?.state, 'fulfilled');
  assert.equal(store.get(keyB), undefined);
  assert.equal(store.get(keyC), undefined);

  const beginB = store.beginAttempt(keyB);
  assert.equal(beginB.allowed, true);
  assert.equal(store.get(keyA)?.state, 'fulfilled');
});

test('the fulfillment key normalizes email case and whitespace but keeps distinct pack selections distinct', () => {
  assert.equal(
    buildPersonnelPackFulfillmentKey('  USER@Example.com  ', 'iso15189'),
    buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189'),
  );
  assert.notEqual(
    buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189'),
    buildPersonnelPackFulfillmentKey('user@example.com', 'clia'),
  );
  assert.notEqual(
    buildPersonnelPackFulfillmentKey('user@example.com', null),
    buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189'),
  );
});

test('a non-string failure reason (e.g. an Error instance) never reaches a record as-is', () => {
  const store = createPersonnelPackFulfillmentStateStore(() => '2026-09-12T00:00:00.000Z');
  const key = buildPersonnelPackFulfillmentKey('user@example.com', 'iso15189');

  store.beginAttempt(key);
  const record = store.markRetryableFailure(key, { message: CANARY_SECRET });
  assert.equal(record.reason, 'unknown');
  assert.equal(typeof record.reason, 'string');
});
