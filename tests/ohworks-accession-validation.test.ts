import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateOHWorksAccessionRequest,
  explainAccessionFieldError,
  explainAccessionFieldNextAction,
  AccessionValidationInputError,
  type AccessionValidationRequest,
} from '../lib/ohworks/accession-validation';

/**
 * All fabricated: synthetic accession, tenant, specimen, order, and
 * reference identifiers. No real patient, sample, or customer data, no
 * network call, and no SENAITE instance is ever touched by this test.
 */
function baselineRequest(): AccessionValidationRequest {
  return {
    accessionRequestId: 'accession-synthetic-0001',
    tenantId: 'tenant-synthetic-a',
    specimen: {
      specimenId: 'specimen-synthetic-0001',
      specimenType: 'urine',
    },
    order: {
      orderId: 'order-synthetic-0001',
      orderedAt: '2026-01-01T08:00:00.000Z',
    },
    collection: {
      collectedAt: '2026-01-01T09:00:00.000Z',
      receivedAt: '2026-01-01T11:00:00.000Z',
    },
    patientReference: {
      referenceId: 'ref-synthetic-0001',
    },
  };
}

function findError(errors: readonly { field: string; code: string }[], field: string) {
  return errors.find((error) => error.field === field);
}

test('accepts a well-formed baseline request and normalizes dates to canonical UTC', () => {
  const result = validateOHWorksAccessionRequest(baselineRequest());
  assert.equal(result.valid, true);
  if (!result.valid) {
    throw new Error('expected valid result');
  }
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.accessionRequestId, 'accession-synthetic-0001');
  assert.equal(result.normalized.order.orderedAt, '2026-01-01T08:00:00.000Z');
  assert.equal(result.normalized.collection.collectedAt, '2026-01-01T09:00:00.000Z');
  assert.equal(result.normalized.collection.receivedAt, '2026-01-01T11:00:00.000Z');
});

test('normalizes safe surrounding and internal whitespace in identifiers and non-Z date offsets', () => {
  const request = baselineRequest();
  request.accessionRequestId = '  accession-synthetic-0001  ';
  request.specimen.specimenId = 'specimen-synthetic-0001';
  request.order.orderedAt = '2026-01-01T03:00:00.000-05:00';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, true);
  if (!result.valid) {
    throw new Error('expected valid result');
  }
  assert.equal(result.normalized.accessionRequestId, 'accession-synthetic-0001');
  assert.equal(result.normalized.order.orderedAt, '2026-01-01T08:00:00.000Z');
});

test('reports field-missing for every required field when given an empty object', () => {
  const result = validateOHWorksAccessionRequest({});
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  const requiredFields = [
    'accessionRequestId',
    'tenantId',
    'specimen.specimenId',
    'specimen.specimenType',
    'order.orderId',
    'order.orderedAt',
    'collection.collectedAt',
    'collection.receivedAt',
    'patientReference.referenceId',
  ];
  for (const field of requiredFields) {
    const error = findError(result.errors, field);
    assert.ok(error, `expected a field error for ${field}`);
    assert.equal(error!.code, 'field-missing');
  }
});

test('reports field-not-string and field-empty distinctly from field-missing', () => {
  const request = baselineRequest();
  (request as unknown as Record<string, unknown>).accessionRequestId = 42;
  request.tenantId = '   ';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'accessionRequestId')?.code, 'field-not-string');
  assert.equal(findError(result.errors, 'tenantId')?.code, 'field-empty');
});

test('rejects an identifier containing internal whitespace as ambiguous even after normalization', () => {
  const request = baselineRequest();
  request.specimen.specimenId = 'specimen synthetic 0001';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'specimen.specimenId')?.code, 'identifier-ambiguous');
});

test('rejects an identifier bundling multiple candidate values with a delimiter', () => {
  const request = baselineRequest();
  request.order.orderId = 'order-synthetic-0001,order-synthetic-0002';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'order.orderId')?.code, 'identifier-ambiguous');
});

test('rejects a patient reference identifier shaped like an SSN without echoing the value', () => {
  const request = baselineRequest();
  request.patientReference.referenceId = '123-45-6789';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  const error = findError(result.errors, 'patientReference.referenceId');
  assert.equal(error?.code, 'identifier-suspected-phi');
  assert.equal(JSON.stringify(result.errors).includes('123-45-6789'), false);
});

test('rejects a patient reference identifier carrying a name-like keyword', () => {
  const request = baselineRequest();
  request.patientReference.referenceId = 'patientname-jane-doe';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'patientReference.referenceId')?.code, 'identifier-suspected-phi');
});

test('rejects an unparseable date as date-invalid', () => {
  const request = baselineRequest();
  request.collection.collectedAt = 'not-a-real-timestamp';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'collection.collectedAt')?.code, 'date-invalid');
});

test('rejects impossible chronology: specimen received before it was collected', () => {
  const request = baselineRequest();
  request.collection.collectedAt = '2026-01-01T11:00:00.000Z';
  request.collection.receivedAt = '2026-01-01T09:00:00.000Z';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'collection.receivedAt')?.code, 'date-chronology-impossible');
});

test('rejects impossible chronology: specimen collected before the order was placed', () => {
  const request = baselineRequest();
  request.order.orderedAt = '2026-01-01T10:00:00.000Z';
  request.collection.collectedAt = '2026-01-01T09:00:00.000Z';

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'collection.collectedAt')?.code, 'date-chronology-impossible');
});

test('allows equal timestamps across order, collection, and receipt', () => {
  const request = baselineRequest();
  const sameInstant = '2026-01-01T09:00:00.000Z';
  request.order.orderedAt = sameInstant;
  request.collection.collectedAt = sameInstant;
  request.collection.receivedAt = sameInstant;

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, true);
});

test('reports every broken field at once instead of stopping at the first error', () => {
  const result = validateOHWorksAccessionRequest({
    accessionRequestId: 'accession-synthetic-0002',
    tenantId: 'tenant-synthetic-a',
    specimen: { specimenId: '', specimenType: 'urine' },
    order: { orderId: 'order-synthetic-0002', orderedAt: 'garbage' },
    collection: { collectedAt: '2026-01-01T09:00:00.000Z', receivedAt: '2026-01-01T08:00:00.000Z' },
    patientReference: { referenceId: '999-99-9999' },
  });

  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'specimen.specimenId')?.code, 'field-empty');
  assert.equal(findError(result.errors, 'order.orderedAt')?.code, 'date-invalid');
  assert.equal(findError(result.errors, 'collection.receivedAt')?.code, 'date-chronology-impossible');
  assert.equal(findError(result.errors, 'patientReference.referenceId')?.code, 'identifier-suspected-phi');
});

test('throws AccessionValidationInputError for non-object input instead of guessing at field errors', () => {
  assert.throws(() => validateOHWorksAccessionRequest(null), AccessionValidationInputError);
  assert.throws(() => validateOHWorksAccessionRequest('not-an-object'), AccessionValidationInputError);
  assert.throws(() => validateOHWorksAccessionRequest(['array', 'input']), AccessionValidationInputError);
});

test('treats a missing section as field-missing for each of its leaf fields', () => {
  const request = baselineRequest();
  delete (request as unknown as Record<string, unknown>).order;

  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  assert.equal(findError(result.errors, 'order.orderId')?.code, 'field-missing');
  assert.equal(findError(result.errors, 'order.orderedAt')?.code, 'field-missing');
});

test('explainAccessionFieldError returns deterministic, value-free text for every code', () => {
  const codes = [
    'field-missing',
    'field-not-string',
    'field-empty',
    'identifier-ambiguous',
    'identifier-suspected-phi',
    'date-invalid',
    'date-chronology-impossible',
  ] as const;
  for (const code of codes) {
    const message = explainAccessionFieldError({ field: 'accessionRequestId', code });
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('explainAccessionFieldNextAction returns deterministic, value-free text distinct from the explanation for every code', () => {
  const codes = [
    'field-missing',
    'field-not-string',
    'field-empty',
    'identifier-ambiguous',
    'identifier-suspected-phi',
    'date-invalid',
    'date-chronology-impossible',
  ] as const;
  for (const code of codes) {
    const error = { field: 'accessionRequestId', code } as const;
    const explanation = explainAccessionFieldError(error);
    const nextAction = explainAccessionFieldNextAction(error);
    assert.equal(typeof nextAction, 'string');
    assert.ok(nextAction.length > 0);
    assert.notEqual(nextAction, explanation);
  }
});

test('a rejected accession request never has its raw field values echoed in the field errors or next actions', () => {
  const result = validateOHWorksAccessionRequest({
    accessionRequestId: 'accession-synthetic-0003',
    tenantId: 'tenant-synthetic-a',
    specimen: { specimenId: 'specimen-synthetic-0003', specimenType: 'urine' },
    order: { orderId: 'order-synthetic-0003', orderedAt: '2026-01-01T08:00:00.000Z' },
    collection: { collectedAt: '2026-01-01T09:00:00.000Z', receivedAt: '2026-01-01T11:00:00.000Z' },
    patientReference: { referenceId: 'jane.synthetic@example.com' },
  });
  assert.equal(result.valid, false);
  if (result.valid) {
    throw new Error('expected invalid result');
  }
  const serialized = JSON.stringify(
    result.errors.map((error) => ({ ...error, next: explainAccessionFieldNextAction(error) })),
  );
  assert.doesNotMatch(serialized, /jane\.synthetic@example\.com/);
});

test('rejects a date-only timestamp as date-invalid', () => {
  const request = baselineRequest();
  request.order.orderedAt = '2026-01-01';
  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) throw new Error('expected invalid result');
  assert.equal(findError(result.errors, 'order.orderedAt')?.code, 'date-invalid');
});

test('rejects a locale-style date as date-invalid', () => {
  const request = baselineRequest();
  request.collection.receivedAt = '01/02/2026';
  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) throw new Error('expected invalid result');
  assert.equal(findError(result.errors, 'collection.receivedAt')?.code, 'date-invalid');
});

test('rejects a space-separated timestamp as date-invalid', () => {
  const request = baselineRequest();
  request.collection.collectedAt = '2026-01-01 08:00:00Z';
  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) throw new Error('expected invalid result');
  assert.equal(findError(result.errors, 'collection.collectedAt')?.code, 'date-invalid');
});

test('rejects a calendar date that Date.parse would normalize into the next month', () => {
  const request = baselineRequest();
  request.order.orderedAt = '2026-02-30T08:00:00Z';
  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, false);
  if (result.valid) throw new Error('expected invalid result');
  assert.equal(findError(result.errors, 'order.orderedAt')?.code, 'date-invalid');
});

test('accepts explicit Z and numeric-offset timestamps and normalizes to UTC', () => {
  const request = baselineRequest();
  request.order.orderedAt = '2026-01-01T08:00:00.000Z';
  request.collection.collectedAt = '2026-01-01T03:00:00.000-05:00';
  const result = validateOHWorksAccessionRequest(request);
  assert.equal(result.valid, true);
  if (!result.valid) throw new Error('expected valid result');
  assert.equal(result.normalized.order.orderedAt, '2026-01-01T08:00:00.000Z');
  assert.equal(result.normalized.collection.collectedAt, '2026-01-01T08:00:00.000Z');
});
