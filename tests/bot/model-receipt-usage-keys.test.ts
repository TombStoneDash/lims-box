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

test('a valid receipt with ordinary usage keys is accepted', () => {
  const withTokenUsage = recordModelReceipt(validReceipt({ usage: { input_tokens: 12, output_tokens: 34 } }));
  assert.equal(withTokenUsage.ok, true);
  assert.deepEqual(withTokenUsage.receipt?.usage, { input_tokens: 12, output_tokens: 34 });

  const withNotExposed = recordModelReceipt(validReceipt({ usage: 'not-exposed' }));
  assert.equal(withNotExposed.ok, true);
  assert.equal(withNotExposed.receipt?.usage, 'not-exposed');
});

test('a usage key shaped like a secret is rejected even though it matches the source-id pattern', () => {
  const secretShapedKey = 'sk-' + 'a'.repeat(16);
  const result = recordModelReceipt(validReceipt({ usage: { [secretShapedKey]: 1 } }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'secret_shaped_value_rejected');
});

test('a usage key shaped like a patient/sample record identifier is rejected', () => {
  const result = recordModelReceipt(validReceipt({ usage: { 'MRN-1234567': 1 } }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'private_or_prompt_content_rejected');
});

test('a sourceIdsCited array with any hole is rejected instead of silently copying undefined', () => {
  const withHole = ['s1', , 's2'];
  assert.equal(withHole.length, 3);
  const result = recordModelReceipt(validReceipt({ sourceIdsCited: withHole as unknown as string[] }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_source_ids_cited');
});

test('createReceiptStore().add throws for secret-shaped usage keys, private-content usage keys, and holey sourceIdsCited', () => {
  const store = createReceiptStore();
  const secretShapedKey = 'sk-' + 'a'.repeat(16);

  assert.throws(
    () => store.add(validReceipt({ usage: { [secretShapedKey]: 1 } })),
    /invalid_model_receipt:secret_shaped_value_rejected/,
  );
  assert.throws(
    () => store.add(validReceipt({ usage: { 'MRN-1234567': 1 } })),
    /invalid_model_receipt:private_or_prompt_content_rejected/,
  );

  const withHole = ['s1', , 's2'];
  assert.throws(
    () => store.add(validReceipt({ sourceIdsCited: withHole as unknown as string[] })),
    /invalid_model_receipt:invalid_source_ids_cited/,
  );

  assert.equal(store.all().length, 0);
});
