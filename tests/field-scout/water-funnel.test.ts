import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  FIELD_SCOUT_ATTRIBUTION,
  FIELD_SCOUT_DEMO_ASSETS,
  FIELD_SCOUT_EARLY_ADOPTER_URL,
} from '../../lib/fieldScout';
import { createEarlyAccessPostHandler } from '../../lib/earlyAccessHandler';

const validApplication = {
  labName: 'Riverside Water Testing',
  labType: 'Environmental / Water Testing',
  contactName: 'Jane Smith',
  email: 'JANE@EXAMPLE.COM',
  monthlyVolume: '100-500',
  painPoint: 'Need bounded chain-of-custody handoffs.',
  dataUseAccepted: true,
  source: 'lims.bot/early-adopter',
};

function createHandler() {
  const records: unknown[] = [];
  const notices: unknown[] = [];
  const confirmations: Array<[string, string]> = [];
  const handler = createEarlyAccessPostHandler({
    createProspect: async record => { records.push(record); },
    sendSubmissionNotice: async notice => { notices.push(notice); },
    sendApplicantConfirmation: async (email, name) => { confirmations.push([email, name]); },
    now: () => '2026-07-28T00:00:00.000Z',
  });
  return { handler, records, notices, confirmations };
}

function request(body: unknown, referer = 'https://lims.bot/early-adopter') {
  return new NextRequest('https://lims.bot/api/early-access', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      referer,
    },
    body: JSON.stringify(body),
  });
}

test('water-lane CTA preserves the approved attribution contract', () => {
  assert.equal(
    FIELD_SCOUT_EARLY_ADOPTER_URL,
    '/early-adopter?utm_source=field_scout&utm_medium=product&utm_campaign=water_lane&utm_content=walkthrough',
  );
  assert.deepEqual(FIELD_SCOUT_ATTRIBUTION, {
    utm_source: 'field_scout',
    utm_medium: 'product',
    utm_campaign: 'water_lane',
    utm_content: 'walkthrough',
  });
});

test('demo registry is synthetic and uses stable non-customer identifiers', () => {
  assert.equal(FIELD_SCOUT_DEMO_ASSETS.length, 3);
  for (const asset of FIELD_SCOUT_DEMO_ASSETS) {
    assert.match(asset.id, /^WATER-DEMO-\d{3}$/);
  }
});

test('route states the safety boundaries and links the attributed CTA', async () => {
  const page = await readFile('app/field-scout/page.tsx', 'utf8');

  assert.match(page, /no PHI and no production data/i);
  assert.match(page, /Human approval is mandatory/i);
  assert.match(page, /does not discover unauthorized equipment/i);
  assert.match(page, /FIELD_SCOUT_EARLY_ADOPTER_URL/);
});

test('early-adopter form renders a water-lane variant without bypassing the shared API', async () => {
  const page = await readFile('app/early-adopter/page.tsx', 'utf8');

  assert.match(page, /utm_campaign/);
  assert.match(page, /water_lane/);
  assert.match(page, /Environmental \/ Water Testing/);
  assert.match(page, /Field Scout Water-Lab Pilot/);
  assert.match(page, /fetch\('\/api\/early-access'/);
  assert.match(page, /application data-use notice/i);
  assert.match(page, /application privacy and data-use notice/i);
  assert.match(page, /href="#application-data-use"/);
  assert.match(page, /Do not include patient identifiers, PHI, sample results/i);
  assert.match(page, /dataUseAccepted/);
  assert.doesNotMatch(page, /Never increases/);
  assert.doesNotMatch(page, /Same-day response/);
});

test('water-lane handler persists a bounded environmental record through the real request boundary', async () => {
  const { handler, records, notices, confirmations } = createHandler();
  const response = await handler(request(
    validApplication,
    'https://lims.bot/early-adopter?utm_source=field_scout&utm_medium=product&utm_campaign=water_lane&utm_content=walkthrough',
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, saved: true });
  assert.equal(records.length, 1);
  const record = records[0] as Record<string, unknown>;
  assert.equal(record.track, 'environmental');
  assert.equal(record.email, 'jane@example.com');
  assert.match(String(record.source), /utm_campaign=water_lane/);
  assert.equal(notices.length, 1);
  assert.deepEqual(confirmations, [['jane@example.com', 'Jane Smith']]);
});

test('ordinary clinical handler input remains clinical', async () => {
  const { handler, records } = createHandler();
  const response = await handler(request({
    ...validApplication,
    labType: 'Clinical / Medical',
    source: 'lims.bot/early-adopter',
  }));

  assert.equal(response.status, 200);
  assert.equal((records[0] as Record<string, unknown>).track, 'clinical');
});

test('handler fails closed and does not confirm when neither persistence nor notice delivery succeeds', async () => {
  const confirmations: Array<[string, string]> = [];
  const handler = createEarlyAccessPostHandler({
    createProspect: async () => { throw new Error('database unavailable'); },
    sendSubmissionNotice: async () => { throw new Error('notice unavailable'); },
    sendApplicantConfirmation: async (email, name) => { confirmations.push([email, name]); },
  });

  const response = await handler(request(validApplication));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Failed to process application' });
  assert.deepEqual(confirmations, []);
});

test('handler confirms only after one durable processing path succeeds', async () => {
  const cases = [
    {
      name: 'database',
      createProspect: async () => undefined,
      sendSubmissionNotice: async () => { throw new Error('notice unavailable'); },
      expectedSaved: true,
    },
    {
      name: 'operator notice',
      createProspect: async () => { throw new Error('database unavailable'); },
      sendSubmissionNotice: async () => undefined,
      expectedSaved: false,
    },
  ];

  for (const scenario of cases) {
    const confirmations: Array<[string, string]> = [];
    const handler = createEarlyAccessPostHandler({
      createProspect: scenario.createProspect,
      sendSubmissionNotice: scenario.sendSubmissionNotice,
      sendApplicantConfirmation: async (email, name) => { confirmations.push([email, name]); },
    });

    const response = await handler(request(validApplication));

    assert.equal(response.status, 200, scenario.name);
    assert.deepEqual(
      await response.json(),
      { success: true, saved: scenario.expectedSaved },
      scenario.name,
    );
    assert.deepEqual(confirmations, [['jane@example.com', 'Jane Smith']], scenario.name);
  }
});

test('handler rejects missing required fields, invalid enums, non-strings, oversized text, and missing acknowledgement', async () => {
  const invalidBodies = [
    { ...validApplication, painPoint: '' },
    { ...validApplication, labType: 'Unbounded lab type' },
    { ...validApplication, monthlyVolume: 'millions' },
    { ...validApplication, contactName: { nested: true } },
    { ...validApplication, painPoint: 'x'.repeat(1_001) },
    { ...validApplication, dataUseAccepted: false },
  ];

  for (const body of invalidBodies) {
    const { handler, records, notices, confirmations } = createHandler();
    const response = await handler(request(body));
    assert.equal(response.status, 400);
    assert.equal(records.length, 0);
    assert.equal(notices.length, 0);
    assert.equal(confirmations.length, 0);
  }
});

test('applicant confirmation copy makes no unproven response-time promise', async () => {
  const notifySource = await readFile('lib/notify.ts', 'utf8');

  assert.doesNotMatch(notifySource, /within 2 business days/i);
  assert.doesNotMatch(notifySource, /usually same business day/i);
});
