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
