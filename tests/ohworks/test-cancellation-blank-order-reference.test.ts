import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CancellationInputError,
  decideTestCancellation,
} from '../../lib/ohworks-test-cancellation';

// Fabricated OHWorks requests only; no real order or patient identifiers.
const request = {
  orderReferenceToken: 'order-synthetic-blank-reference',
  stage: 'reported',
  reasonCode: 'lab_processing_error',
  requesterRole: 'lab_director',
};

for (const [label, orderReferenceToken] of [
  ['empty', ''],
  ['spaces', '   '],
  ['tab', '\t'],
  ['newline', '\n'],
  ['mixed whitespace', ' \t\r\n '],
]) {
  test(`${label} order reference throws the typed invalid-token error`, () => {
    assert.throws(
      () => decideTestCancellation({ ...request, orderReferenceToken }),
      (error: unknown) => {
        assert.ok(error instanceof CancellationInputError);
        assert.equal(error.code, 'order-reference-token-invalid');
        return true;
      },
    );
  });
}

for (const orderReferenceToken of [
  'synthetic:opaque/42',
  'synthetic opaque 42',
  ' \tsynthetic opaque 42\n ',
]) {
  test(`nonblank token ${JSON.stringify(orderReferenceToken)} is echoed unchanged`, () => {
    assert.deepEqual(decideTestCancellation({ ...request, orderReferenceToken }), {
      orderReferenceToken,
      outcome: 'allowed',
      governingRule: 'director-full-authority',
      creditNoteDue: true,
      amendedReportRequired: true,
    });
  });
}

test('valid references preserve role authority and stage limits', () => {
  const orderReferenceToken = ' synthetic opaque 42 ';
  for (const [requesterRole, stage, outcome, governingRule] of [
    ['lab_supervisor', 'in_analysis', 'allowed', 'role-authorized-within-stage-limit'],
    ['lab_supervisor', 'reported', 'refused', 'stage-exceeds-role-authority'],
    ['client', 'ordered', 'refused', 'reason-not-authorized-for-role'],
  ]) {
    assert.deepEqual(decideTestCancellation({ ...request, orderReferenceToken, requesterRole, stage }), {
      orderReferenceToken,
      outcome,
      governingRule,
      creditNoteDue: outcome === 'allowed',
      amendedReportRequired: false,
    });
  }
});

test('stage, reason and role values are still validated without trimming', () => {
  for (const [field, value, code] of [
    ['stage', ' reported ', 'stage-unknown'],
    ['reasonCode', ' lab_processing_error ', 'reason-code-unknown'],
    ['requesterRole', ' lab_director ', 'role-unknown'],
  ]) {
    assert.throws(
      () => decideTestCancellation({ ...request, [field]: value }),
      (error: unknown) => {
        assert.ok(error instanceof CancellationInputError);
        assert.equal(error.code, code);
        return true;
      },
    );
  }
});
