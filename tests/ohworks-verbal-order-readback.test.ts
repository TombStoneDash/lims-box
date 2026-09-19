import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateVerbalOrderReadback,
  type VerbalOrderReadbackInput,
} from '../lib/ohworks-verbal-order-readback';

/**
 * All fabricated: synthetic staff, originator, and order text. No real
 * patient, clinician, or customer data, and no network or database call is
 * ever made by this test.
 */
function baselineInput(): VerbalOrderReadbackInput {
  return {
    orderReceivedVerbally: true,
    readBackPerformed: true,
    readBackConfirmedByOriginator: true,
    receivingStaffId: 'staff-synthetic-0001',
    originatorName: 'Dr. Synthetic Example',
    originatorRole: 'physician',
    orderText: 'STAT troponin, synthetic order text',
    timestampReceived: '2026-01-01T08:00:00.000Z',
  };
}

test('a non-verbal order is not_applicable and compliant regardless of other fields', () => {
  const input = baselineInput();
  input.orderReceivedVerbally = false;
  input.readBackPerformed = false;
  input.readBackConfirmedByOriginator = false;
  input.receivingStaffId = null;
  input.originatorName = null;
  input.orderText = '';

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, true);
  assert.equal(result.status, 'not_applicable');
  assert.deepEqual(result.issues, []);
});

test('reports missing_required_fields when receivingStaffId is missing', () => {
  const input = baselineInput();
  input.receivingStaffId = null;

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, false);
  assert.equal(result.status, 'missing_required_fields');
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /receivingStaffId/);
});

test('reports missing_required_fields when originatorName is missing', () => {
  const input = baselineInput();
  input.originatorName = null;

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, false);
  assert.equal(result.status, 'missing_required_fields');
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /originatorName/);
});

test('reports missing_required_fields when orderText is empty', () => {
  const input = baselineInput();
  input.orderText = '';

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, false);
  assert.equal(result.status, 'missing_required_fields');
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /orderText/);
});

test('reports missing_required_fields when orderText is only whitespace', () => {
  const input = baselineInput();
  input.orderText = '   ';

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, false);
  assert.equal(result.status, 'missing_required_fields');
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /orderText/);
});

test('reports one issue per missing required field when several are missing at once', () => {
  const input = baselineInput();
  input.receivingStaffId = null;
  input.originatorName = null;
  input.orderText = '';

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, false);
  assert.equal(result.status, 'missing_required_fields');
  assert.equal(result.issues.length, 3);
});

test('reports missing_readback when no read-back was performed', () => {
  const input = baselineInput();
  input.readBackPerformed = false;
  input.readBackConfirmedByOriginator = false;

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, false);
  assert.equal(result.status, 'missing_readback');
  assert.ok(result.issues.some((issue) => /read-back/i.test(issue)));
});

test('reports readback_not_confirmed when a read-back was performed but not confirmed', () => {
  const input = baselineInput();
  input.readBackPerformed = true;
  input.readBackConfirmedByOriginator = false;

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, false);
  assert.equal(result.status, 'readback_not_confirmed');
  assert.ok(result.issues.some((issue) => /did not confirm/i.test(issue)));
});

test('reports compliant when the order is verbal, all fields present, and read-back confirmed', () => {
  const result = evaluateVerbalOrderReadback(baselineInput());
  assert.equal(result.compliant, true);
  assert.equal(result.status, 'compliant');
  assert.deepEqual(result.issues, []);
});

test('an unspecified originatorRole never blocks compliance but adds a non-blocking issue', () => {
  const input = baselineInput();
  input.originatorRole = 'unspecified';

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, true);
  assert.equal(result.status, 'compliant');
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /originatorRole/);
});

test('an unspecified originatorRole is appended as a non-blocking issue alongside a blocking missing_readback status', () => {
  const input = baselineInput();
  input.originatorRole = 'unspecified';
  input.readBackPerformed = false;
  input.readBackConfirmedByOriginator = false;

  const result = evaluateVerbalOrderReadback(input);
  assert.equal(result.compliant, false);
  assert.equal(result.status, 'missing_readback');
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.some((issue) => /originatorRole/.test(issue)));
});

test('every non-unspecified originatorRole never adds a role-recommendation issue on an otherwise compliant order', () => {
  const roles: VerbalOrderReadbackInput['originatorRole'][] = [
    'physician',
    'nurse_practitioner',
    'physician_assistant',
    'nurse',
    'other',
  ];
  for (const role of roles) {
    const input = baselineInput();
    input.originatorRole = role;
    const result = evaluateVerbalOrderReadback(input);
    assert.equal(result.compliant, true, role);
    assert.equal(result.status, 'compliant', role);
    assert.deepEqual(result.issues, [], role);
  }
});
