import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordModelReceipt, createReceiptStore, type ModelRunReceipt } from '../../lib/bot/model-receipt';

function validReceipt(overrides: Partial<ModelRunReceipt> = {}): Partial<ModelRunReceipt> {
  return {
    requestedModel: 'claude-sonnet-5-ultra',
    requestedEffort: 'high',
    effectiveModel: 'claude-sonnet-5',
    providerId: 'anthropic',
    evidenceSource: 'canonical Hermes worker receipt',
    routeId: 'sonnet-5-ultra',
    startedAt: '2026-09-03T05:05:47Z',
    endedAt: '2026-09-03T05:40:00Z',
    usage: 'not-exposed',
    fallbackUsed: false,
    sourceIdsCited: ['src-public-domain-001'],
    outputVerdict: 'pass',
    ...overrides,
  };
}

test('a receipt missing a required field is rejected', () => {
  const withoutRequestedModel = validReceipt();
  delete withoutRequestedModel.requestedModel;
  const result = recordModelReceipt(withoutRequestedModel);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_required_field:requestedModel');
});

test('a receipt containing an obvious secret-shaped string in any field is rejected', () => {
  const withSecretInEvidenceSource = recordModelReceipt(
    validReceipt({ evidenceSource: 'api_key: sk-abcdefghij1234567890' }),
  );
  assert.equal(withSecretInEvidenceSource.ok, false);
  assert.equal(withSecretInEvidenceSource.reason, 'secret_shaped_value_rejected');

  const withBearerToken = recordModelReceipt(
    validReceipt({ providerId: 'Bearer abcdefghij1234567890xyz' }),
  );
  assert.equal(withBearerToken.ok, false);

  const clean = recordModelReceipt(validReceipt());
  assert.equal(clean.ok, true);
});

test('runtime schema rejects unknown fields, wrong types, and invalid timestamps or verdicts', () => {
  assert.deepEqual(
    recordModelReceipt({ ...validReceipt(), customerPrivateText: 'hidden' }),
    { ok: false, reason: 'unknown_field:customerPrivateText' },
  );
  assert.equal(recordModelReceipt({ ...validReceipt(), fallbackUsed: 'false' }).ok, false);
  assert.equal(recordModelReceipt({ ...validReceipt(), startedAt: 'yesterday' }).ok, false);
  assert.equal(recordModelReceipt({ ...validReceipt(), startedAt: '2026-02-31T00:00:00Z' }).ok, false);
  assert.equal(recordModelReceipt({ ...validReceipt(), outputVerdict: 'maybe' }).ok, false);
  assert.equal(recordModelReceipt({ ...validReceipt(), usage: { inputTokens: -1 } }).ok, false);
});

test('receipt store revalidates, clones, and freezes persisted values', () => {
  const store = createReceiptStore();
  assert.throws(
    () => store.add({ ...validReceipt(), evidenceSource: 'patient MRN: 123456' }),
    /invalid_model_receipt:private_or_prompt_content_rejected/,
  );

  const validated = recordModelReceipt(validReceipt());
  assert.ok(validated.receipt);
  const callerReceipt = validated.receipt as ModelRunReceipt;
  store.add(callerReceipt);
  callerReceipt.evidenceSource = 'changed-after-insert';
  callerReceipt.sourceIdsCited.push('changed-after-insert');

  const stored = store.all()[0];
  assert.equal(stored.evidenceSource, 'canonical Hermes worker receipt');
  assert.deepEqual(stored.sourceIdsCited, ['src-public-domain-001']);
  try {
    stored.evidenceSource = 'mutated-through-read';
  } catch {
    // Strict-mode runtimes throw; non-strict runtimes silently ignore the write.
  }
  assert.equal(store.all()[0].evidenceSource, 'canonical Hermes worker receipt');
  assert.throws(() => {
    stored.sourceIdsCited.push('mutated-through-read');
  }, TypeError);
});

test('prompt, PHI-like, and customer-private prose are rejected and output is allowlisted', () => {
  assert.equal(
    recordModelReceipt(validReceipt({ evidenceSource: 'patient MRN: 123456' })).reason,
    'private_or_prompt_content_rejected',
  );
  assert.equal(
    recordModelReceipt(validReceipt({ evidenceSource: 'prompt: include the full user question' })).ok,
    false,
  );
  assert.equal(
    recordModelReceipt(validReceipt({ evidenceSource: 'customer-private clinical narrative' })).ok,
    false,
  );

  const candidate = { ...validReceipt(), requestedModel: 'claude-sonnet-5-ultra' };
  const result = recordModelReceipt(candidate);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.receipt ?? {}).sort(), [
    'effectiveModel', 'endedAt', 'evidenceSource', 'fallbackUsed', 'outputVerdict',
    'providerId', 'requestedEffort', 'requestedModel', 'routeId', 'sourceIdsCited',
    'startedAt', 'usage',
  ].sort());
  assert.notEqual(result.receipt, candidate);
});

test('fallback_used: true and output_verdict are both queryable on a stored receipt', () => {
  const store = createReceiptStore();
  const fallbackResult = recordModelReceipt(
    validReceipt({ fallbackUsed: true, outputVerdict: 'fallback' }),
  );
  assert.equal(fallbackResult.ok, true);
  assert.ok(fallbackResult.receipt);
  store.add(fallbackResult.receipt as ModelRunReceipt);

  const passResult = recordModelReceipt(validReceipt());
  assert.ok(passResult.receipt);
  store.add(passResult.receipt as ModelRunReceipt);

  assert.equal(store.all().length, 2);
  assert.deepEqual(
    store.findByFallbackUsed(true).map((r) => r.outputVerdict),
    ['fallback'],
  );
  assert.deepEqual(
    store.findByOutputVerdict('pass').map((r) => r.fallbackUsed),
    [false],
  );
});
