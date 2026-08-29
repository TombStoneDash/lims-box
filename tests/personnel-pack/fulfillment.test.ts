import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  createPersonnelPackPostHandler,
  PERSONNEL_PACK_PUBLIC_ASSETS,
  resolveBundledAsset,
} from '../../lib/personnelPackFulfillment';

function request(body: unknown) {
  return new NextRequest('https://lims.bot/api/personnel-pack-download', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function createHandler(overrides: Partial<Parameters<typeof createPersonnelPackPostHandler>[0]> = {}) {
  const leads: unknown[] = [];
  const notices: unknown[] = [];
  const deliveries: Array<{ email: string; delivery: unknown }> = [];
  const diagnostics: Array<{ code: string; meta: Record<string, unknown> }> = [];

  const handler = createPersonnelPackPostHandler({
    createLead: async (record) => { leads.push(record); },
    sendSubmissionNotice: async (notice) => { notices.push(notice); },
    sendApplicantDelivery: async (email, delivery) => { deliveries.push({ email, delivery }); },
    resolveAsset: async (accredType, origin) => (
      accredType === 'iso15189'
        ? {
            assetUrl: new URL('/personnel-pack-assets/iso-15189-personnel-pack-v1-5-customer-20260827.pdf', origin).toString(),
            emailed: false,
            label: 'ISO 15189 Personnel Pack v1.5',
          }
        : null
    ),
    logDiagnostic: (code, meta) => { diagnostics.push({ code, meta }); },
    now: () => '2026-08-27T20:00:00.000Z',
    requestId: () => 'req-test-1',
    ...overrides,
  });

  return { handler, leads, notices, deliveries, diagnostics };
}

test('successful ISO 15189 fulfillment returns one usable asset and performs each side effect once', async () => {
  const { handler, leads, notices, deliveries, diagnostics } = createHandler();

  const response = await handler(request({
    email: 'USER@EXAMPLE.COM',
    accredType: 'iso15189',
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    saved: true,
    delivery: {
      assetUrl: 'https://lims.bot/personnel-pack-assets/iso-15189-personnel-pack-v1-5-customer-20260827.pdf',
      emailed: true,
      label: 'ISO 15189 Personnel Pack v1.5',
    },
  });
  assert.deepEqual(leads, [{
    email: 'user@example.com',
    accred_type: 'iso15189',
    source: 'personnel-pack-download',
  }]);
  assert.equal(notices.length, 1);
  assert.equal(deliveries.length, 1);
  assert.equal(diagnostics.length, 0);
});

test('default fulfillment exercises the reviewed bundled asset and its real hash pin', async () => {
  const { handler, leads, notices, deliveries, diagnostics } = createHandler({
    resolveAsset: undefined,
  });

  const response = await handler(request({
    email: 'user@example.com',
    accredType: 'iso15189',
  }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.delivery.assetUrl, new URL(
    PERSONNEL_PACK_PUBLIC_ASSETS.iso15189.publicPath,
    'https://lims.bot',
  ).toString());
  assert.equal(leads.length, 1);
  assert.equal(notices.length, 1);
  assert.equal(deliveries.length, 1);
  assert.equal(diagnostics.length, 0);
});

test('bundled asset hash pin rejects modified bytes before fulfillment', async (t) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lims-personnel-pack-hash-'));
  t.after(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  const modifiedAsset = path.join(temporaryRoot, 'modified-pack.pdf');
  await writeFile(modifiedAsset, 'not the reviewed personnel pack');

  await assert.rejects(
    resolveBundledAsset('iso15189', 'https://lims.bot', modifiedAsset),
    /asset hash mismatch/i,
  );
});

test('unsupported selections fail closed and do not perform side effects', async () => {
  const { handler, leads, notices, deliveries, diagnostics } = createHandler();

  const response = await handler(request({
    email: 'user@example.com',
    accredType: 'clia',
  }));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: 'Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.',
    code: 'unsupported_pack_selection',
  });
  assert.equal(leads.length, 0);
  assert.equal(notices.length, 0);
  assert.equal(deliveries.length, 0);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'unsupported_pack_selection');
  assert.doesNotMatch(JSON.stringify(diagnostics[0]), /user@example\.com/i);
});

test('asset-resolution failures fail closed before persistence or delivery', async () => {
  const { handler, leads, notices, deliveries, diagnostics } = createHandler({
    resolveAsset: async () => {
      throw new Error('hash mismatch');
    },
  });

  const response = await handler(request({
    email: 'user@example.com',
    accredType: 'iso15189',
  }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
    code: 'asset_unavailable',
  });
  assert.equal(leads.length, 0);
  assert.equal(notices.length, 0);
  assert.equal(deliveries.length, 0);
  assert.equal(diagnostics[0].code, 'asset_unavailable');
});

test('lead-store failures fail closed and do not promise delivery', async () => {
  const { handler, notices, deliveries, diagnostics } = createHandler({
    createLead: async () => { throw new Error('relation "personnel_pack_leads" does not exist'); },
  });

  const response = await handler(request({
    email: 'user@example.com',
    accredType: 'iso15189',
  }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
    code: 'lead_store_failed',
  });
  assert.equal(notices.length, 0);
  assert.equal(deliveries.length, 0);
  assert.equal(diagnostics[0].code, 'lead_store_failed');
});

test('operator notice failures fail closed and block applicant delivery', async () => {
  const { handler, deliveries, diagnostics } = createHandler({
    sendSubmissionNotice: async () => { throw new Error('domain not verified'); },
  });

  const response = await handler(request({
    email: 'user@example.com',
    accredType: 'iso15189',
  }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
    code: 'operator_notice_failed',
  });
  assert.equal(deliveries.length, 0);
  assert.equal(diagnostics[0].code, 'operator_notice_failed');
});

test('applicant delivery failures return the direct asset without promising email delivery', async () => {
  const { handler, diagnostics } = createHandler({
    sendApplicantDelivery: async () => { throw new Error('Applicant delivery failed (403)'); },
  });

  const response = await handler(request({
    email: 'user@example.com',
    accredType: 'iso15189',
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    saved: true,
    delivery: {
      assetUrl: 'https://lims.bot/personnel-pack-assets/iso-15189-personnel-pack-v1-5-customer-20260827.pdf',
      emailed: false,
      label: 'ISO 15189 Personnel Pack v1.5',
    },
  });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'applicant_delivery_failed');
  assert.doesNotMatch(JSON.stringify(diagnostics[0]), /user@example\.com/i);
});

test('invalid email is rejected before any side effects', async () => {
  const { handler, leads, notices, deliveries } = createHandler();

  const response = await handler(request({
    email: 'not-an-email',
    accredType: 'iso15189',
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Valid email is required',
    code: 'invalid_email',
  });
  assert.equal(leads.length, 0);
  assert.equal(notices.length, 0);
  assert.equal(deliveries.length, 0);
});

test('browser copy offers direct download and removes the inbox-only promise', async () => {
  const source = await readFile('app/personnel-pack/EmailGateForm.tsx', 'utf8');

  assert.match(source, /Your reviewed pack is ready now\./);
  assert.match(source, /this page is your fulfillment path/i);
  assert.match(source, /Automatic fulfillment is currently available only for the reviewed ISO 15189 pack\./);
  assert.doesNotMatch(source, /Check your inbox/i);
  assert.doesNotMatch(source, /within 2(?:\u00a0| )minutes/i);
});

test('public PDF security contract is explicit lead capture, not access control', async () => {
  const [securityIntent, environmentExample] = await Promise.all([
    readFile('docs/personnel-pack-fulfillment-security.md', 'utf8'),
    readFile('.env.example', 'utf8'),
  ]);

  assert.match(securityIntent, /lead-capture workflow, not an access-control boundary/i);
  assert.match(securityIntent, /downloaded without submitting the form/i);
  assert.match(securityIntent, /must not contain customer data, secrets, or private records/i);
  assert.doesNotMatch(environmentExample, /PERSONNEL_PACK_PDF_URL/);
  assert.match(PERSONNEL_PACK_PUBLIC_ASSETS.iso15189.publicPath, /^\/personnel-pack-assets\//);
});
