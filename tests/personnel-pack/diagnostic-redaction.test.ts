import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  createPersonnelPackPostHandler,
  resolvePersonnelPackAsset,
  type PersonnelPackDependencies,
} from '../../lib/personnelPackFulfillment';

/**
 * A canary email and a canary secret that must never appear in a diagnostic log
 * or a response body, no matter which dependency throws or what shape the
 * applicant-supplied accreditation token takes. If either literal shows up in
 * `diagnostics` or a response, redaction has regressed.
 */
const CANARY_EMAIL = 'canary-applicant+lims94@example.com';
const CANARY_SECRET = 'sk_canary_DO_NOT_LOG_9f3e7b2c1a';

const SUPPORTED_DELIVERY = {
  assetUrl: 'https://lims.bot/personnel-pack-assets/iso-15189-personnel-pack-v1-5-customer-20260827.pdf',
  emailed: false,
  label: 'ISO 15189 Personnel Pack v1.5',
};

function jsonRequest(body: unknown) {
  return new NextRequest('https://lims.bot/api/personnel-pack-download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawRequest(rawBody: string) {
  return new NextRequest('https://lims.bot/api/personnel-pack-download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  });
}

function createHandler(overrides: Partial<PersonnelPackDependencies> = {}) {
  const leads: unknown[] = [];
  const notices: unknown[] = [];
  const deliveries: Array<{ email: string; delivery: unknown }> = [];
  const diagnostics: Array<{ code: string; meta: Record<string, unknown> }> = [];
  const resolveAssetCalls: Array<string | null> = [];

  const handler = createPersonnelPackPostHandler({
    createLead: async (record) => { leads.push(record); },
    sendSubmissionNotice: async (notice) => { notices.push(notice); },
    sendApplicantDelivery: async (email, delivery) => { deliveries.push({ email, delivery }); },
    resolveAsset: async (accredType) => {
      resolveAssetCalls.push(accredType);
      return accredType === 'iso15189' ? { ...SUPPORTED_DELIVERY } : null;
    },
    logDiagnostic: (code, meta) => { diagnostics.push({ code, meta }); },
    now: () => '2026-09-12T00:00:00.000Z',
    requestId: () => 'req-test-1',
    ...overrides,
  });

  return { handler, leads, notices, deliveries, diagnostics, resolveAssetCalls };
}

function assertNoCanary(haystack: string) {
  assert.doesNotMatch(haystack, new RegExp(CANARY_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(haystack, new RegExp(CANARY_SECRET));
}

test('a long accreditation token is bounded before it ever reaches resolution or diagnostics', async () => {
  const longToken = 'x'.repeat(5000);
  const { handler, diagnostics, resolveAssetCalls } = createHandler();

  const response = await handler(jsonRequest({ email: 'user@example.com', accredType: longToken }));

  assert.equal(response.status, 409);
  assert.deepEqual(resolveAssetCalls, [null]);
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0], {
    code: 'unsupported_pack_selection',
    meta: { requestId: 'req-test-1', accredType: 'none', stage: 'asset-selection' },
  });
  assertNoCanary(JSON.stringify(diagnostics));
  assert.ok(!JSON.stringify(diagnostics).includes(longToken));
  assert.ok(!JSON.stringify(await response.json()).includes(longToken));
});

test('control characters in an accreditation token never reach diagnostics', async () => {
  // Built from char codes (NUL, BEL, ESC, and a C1 control) rather than literal escapes
  // in source, so the test file itself stays plain text with no raw control bytes.
  const controlToken = String.fromCharCode(0, 7, 27, 159) + 'iso15189';
  const { handler, diagnostics } = createHandler();

  const response = await handler(jsonRequest({ email: 'user@example.com', accredType: controlToken }));

  assert.equal(response.status, 409);
  assert.deepEqual(diagnostics[0], {
    code: 'unsupported_pack_selection',
    meta: { requestId: 'req-test-1', accredType: 'unsupported', stage: 'asset-selection' },
  });
  const serialized = JSON.stringify(diagnostics);
  assert.ok(!serialized.includes(controlToken) && !serialized.includes('iso15189' + String.fromCharCode(0)));
});

test('an email-shaped accreditation token is classified, never echoed, in diagnostics', async () => {
  const { handler, diagnostics } = createHandler();

  const response = await handler(jsonRequest({ email: 'user@example.com', accredType: CANARY_EMAIL }));

  assert.equal(response.status, 409);
  assert.deepEqual(diagnostics[0], {
    code: 'unsupported_pack_selection',
    meta: { requestId: 'req-test-1', accredType: 'unsupported', stage: 'asset-selection' },
  });
  assertNoCanary(JSON.stringify(diagnostics));
  assertNoCanary(JSON.stringify(await response.json()));
});

test('a JSON-shaped accreditation token string is treated as an opaque token, never parsed or echoed', async () => {
  // Kept under the accreditation-token length bound so this exercises the "doesn't match a
  // known key" path rather than the length-bound path already covered by the long-token test.
  const jsonShapedToken = JSON.stringify({ accredType: 'iso15189' });
  const { handler, diagnostics } = createHandler();

  const response = await handler(jsonRequest({ email: 'user@example.com', accredType: jsonShapedToken }));

  assert.equal(response.status, 409);
  assert.deepEqual(diagnostics[0], {
    code: 'unsupported_pack_selection',
    meta: { requestId: 'req-test-1', accredType: 'unsupported', stage: 'asset-selection' },
  });
  assertNoCanary(JSON.stringify(diagnostics));
  assert.ok(!JSON.stringify(diagnostics).includes(jsonShapedToken));
});

test('malformed JSON request bodies fail closed with a fixed diagnostic and no echoed content', async () => {
  const { handler, diagnostics, leads, notices, deliveries } = createHandler();

  const response = await handler(rawRequest(`{"email":"user@example.com","note":"${CANARY_SECRET}`));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid request', code: 'invalid_request' });
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0], {
    code: 'invalid_request',
    meta: { requestId: 'req-test-1', stage: 'request-parse' },
  });
  assertNoCanary(JSON.stringify(diagnostics));
  assert.equal(leads.length, 0);
  assert.equal(notices.length, 0);
  assert.equal(deliveries.length, 0);
});

test('prototype-inherited property names never resolve to an asset', async () => {
  const prototypeKeys = [
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    'valueOf',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
  ];

  for (const key of prototypeKeys) {
    assert.equal(resolvePersonnelPackAsset(key), null, `expected "${key}" to not resolve to an asset`);
  }
});

test('a prototype-shaped accreditation token fails closed end to end without a raw 500', async () => {
  const { handler, diagnostics, leads, notices, deliveries } = createHandler({
    resolveAsset: undefined,
  });

  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const response = await handler(jsonRequest({ email: 'user@example.com', accredType: key }));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: 'Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.',
      code: 'unsupported_pack_selection',
    });
  }

  assert.equal(leads.length, 0);
  assert.equal(notices.length, 0);
  assert.equal(deliveries.length, 0);
  assert.ok(diagnostics.every((d) => d.meta.accredType === 'unsupported'));
});

test('the supported ISO 15189 selection still succeeds cleanly with no diagnostics at all', async () => {
  const { handler, leads, notices, deliveries, diagnostics } = createHandler();

  const response = await handler(jsonRequest({ email: 'USER@EXAMPLE.COM', accredType: 'iso15189' }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    saved: true,
    delivery: { ...SUPPORTED_DELIVERY, emailed: true },
  });
  assert.equal(leads.length, 1);
  assert.equal(notices.length, 1);
  assert.equal(deliveries.length, 1);
  assert.equal(diagnostics.length, 0);
});

test('an asset-resolution exception echoing canary values never leaks into diagnostics or the response', async () => {
  const { handler, diagnostics, leads, notices, deliveries } = createHandler({
    resolveAsset: async () => {
      throw new Error(`upstream store rejected lookup for ${CANARY_EMAIL} token ${CANARY_SECRET}`);
    },
  });

  const response = await handler(jsonRequest({ email: 'user@example.com', accredType: 'iso15189' }));

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.deepEqual(body, {
    error: 'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
    code: 'asset_unavailable',
  });
  assert.deepEqual(diagnostics[0], {
    code: 'asset_unavailable',
    meta: { requestId: 'req-test-1', accredType: 'iso15189', stage: 'asset-selection' },
  });
  assertNoCanary(JSON.stringify(diagnostics));
  assertNoCanary(JSON.stringify(body));
  assert.equal(leads.length, 0);
  assert.equal(notices.length, 0);
  assert.equal(deliveries.length, 0);
});

test('a lead-store exception echoing canary values never leaks into diagnostics or the response', async () => {
  const { handler, diagnostics, notices, deliveries } = createHandler({
    createLead: async () => {
      throw new Error(`duplicate key value violates constraint for ${CANARY_EMAIL} (${CANARY_SECRET})`);
    },
  });

  const response = await handler(jsonRequest({ email: 'user@example.com', accredType: 'iso15189' }));

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.deepEqual(diagnostics[0], {
    code: 'lead_store_failed',
    meta: { requestId: 'req-test-1', accredType: 'iso15189', stage: 'lead-store' },
  });
  assertNoCanary(JSON.stringify(diagnostics));
  assertNoCanary(JSON.stringify(body));
  assert.equal(notices.length, 0);
  assert.equal(deliveries.length, 0);
});

test('an operator-notice exception echoing canary values never leaks into diagnostics or the response', async () => {
  const { handler, diagnostics, deliveries } = createHandler({
    sendSubmissionNotice: async () => {
      throw new Error(`provider rejected recipient ${CANARY_EMAIL} using key ${CANARY_SECRET}`);
    },
  });

  const response = await handler(jsonRequest({ email: 'user@example.com', accredType: 'iso15189' }));

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.deepEqual(diagnostics[0], {
    code: 'operator_notice_failed',
    meta: { requestId: 'req-test-1', accredType: 'iso15189', stage: 'operator-notice' },
  });
  assertNoCanary(JSON.stringify(diagnostics));
  assertNoCanary(JSON.stringify(body));
  assert.equal(deliveries.length, 0);
});

test('an applicant-delivery exception echoing canary values never leaks, and the direct download still returns', async () => {
  const { handler, diagnostics } = createHandler({
    sendApplicantDelivery: async () => {
      throw new Error(`delivery provider payload rejected ${CANARY_EMAIL} secret ${CANARY_SECRET}`);
    },
  });

  const response = await handler(jsonRequest({ email: 'user@example.com', accredType: 'iso15189' }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    success: true,
    saved: true,
    delivery: SUPPORTED_DELIVERY,
  });
  assert.deepEqual(diagnostics[0], {
    code: 'applicant_delivery_failed',
    meta: { requestId: 'req-test-1', accredType: 'iso15189', stage: 'applicant-delivery' },
  });
  assertNoCanary(JSON.stringify(diagnostics));
  assertNoCanary(JSON.stringify(body));
});
