import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '../../app/api/admin/conversion-report/route';
import {
  MIN_REPORTABLE_CELL_SIZE,
  buildProspectSourceReport,
} from '../../lib/admin/conversionReport';
import { prisma } from '../../lib/prisma';
import { middleware } from '../../middleware';

type SourceGroup = {
  source: string | null;
  _count: { _all: number };
};

type GroupBy = () => Promise<SourceGroup[]>;

const prospectDelegate = prisma.prospect as unknown as { groupBy: GroupBy };

async function withMockedGroups<T>(
  groupBy: GroupBy,
  operation: () => Promise<T>,
): Promise<T> {
  const original = prospectDelegate.groupBy;
  prospectDelegate.groupBy = groupBy;
  try {
    return await operation();
  } finally {
    prospectDelegate.groupBy = original;
  }
}

test('aggregates allowlisted campaign dimensions above the privacy threshold', () => {
  const result = buildProspectSourceReport([
    {
      source: 'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026',
      prospectRecords: 3,
    },
    {
      source: 'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026',
      prospectRecords: 2,
    },
    { source: 'contact_form', prospectRecords: 4 },
  ]);

  assert.deepEqual(result, {
    hasSuppressedCells: false,
    attribution: [
      {
        source: 'cola2026',
        campaign: 'cola_forum_2026',
        medium: 'qr',
        content: null,
        prospectRecords: 5,
      },
      {
        source: 'contact_form',
        campaign: null,
        medium: null,
        content: null,
        prospectRecords: 4,
      },
    ],
  });
});

test('coarsens arbitrary UTM dimensions and omits cells below the minimum', () => {
  const result = buildProspectSourceReport([
    {
      source: 'lims.bot/early-adopter;utm_source=jane_smith;utm_campaign=private_lab_2026;utm_content=customer_48391',
      prospectRecords: 10,
    },
    { source: 'webinar:private-session-id', prospectRecords: 1 },
    { source: null, prospectRecords: 2 },
    { source: 'contact_form', prospectRecords: MIN_REPORTABLE_CELL_SIZE },
  ]);

  assert.deepEqual(result, {
    hasSuppressedCells: true,
    attribution: [
      {
        source: 'lims.bot/early-adopter',
        campaign: null,
        medium: null,
        content: null,
        prospectRecords: 10,
      },
      {
        source: 'contact_form',
        campaign: null,
        medium: null,
        content: null,
        prospectRecords: MIN_REPORTABLE_CELL_SIZE,
      },
    ],
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('jane_smith'), false);
  assert.equal(serialized.includes('private_lab_2026'), false);
  assert.equal(serialized.includes('customer_48391'), false);
  assert.equal(serialized.includes('private-session-id'), false);
});

test('ignores invalid counts instead of corrupting aggregate proof', () => {
  const result = buildProspectSourceReport([
    { source: 'contact_form', prospectRecords: -1 },
    { source: 'contact_form', prospectRecords: Number.NaN },
    { source: 'contact_form', prospectRecords: 3 },
  ]);

  assert.equal(result.attribution[0]?.prospectRecords, 3);
});

test('admin middleware fails closed for missing and invalid credentials', () => {
  const previousUser = process.env.ADMIN_BASIC_USER;
  const previousPass = process.env.ADMIN_BASIC_PASS;

  try {
    delete process.env.ADMIN_BASIC_USER;
    delete process.env.ADMIN_BASIC_PASS;
    const missing = middleware(
      new NextRequest('https://lims.bot/api/admin/conversion-report'),
    );
    assert.equal(missing.status, 503);
    assert.equal(missing.headers.get('x-middleware-next'), null);

    process.env.ADMIN_BASIC_USER = 'test-admin';
    process.env.ADMIN_BASIC_PASS = 'test-password';
    const invalid = middleware(
      new NextRequest('https://lims.bot/api/admin/conversion-report', {
        headers: { authorization: 'Basic invalid' },
      }),
    );
    assert.equal(invalid.status, 401);

    const valid = middleware(
      new NextRequest('https://lims.bot/api/admin/conversion-report', {
        headers: {
          authorization: `Basic ${Buffer.from('test-admin:test-password').toString('base64')}`,
        },
      }),
    );
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get('x-middleware-next'), '1');
  } finally {
    if (previousUser === undefined) delete process.env.ADMIN_BASIC_USER;
    else process.env.ADMIN_BASIC_USER = previousUser;
    if (previousPass === undefined) delete process.env.ADMIN_BASIC_PASS;
    else process.env.ADMIN_BASIC_PASS = previousPass;
  }
});

test('GET returns a truthful Prospect population and privacy-safe aggregates', async () => {
  await withMockedGroups(
    async () => [
      {
        source: 'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026',
        _count: { _all: 5 },
      },
      {
        source: 'contact_form',
        _count: { _all: 4 },
      },
    ],
    async () => {
      const response = await GET();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');

      const body = await response.json();
      assert.equal(body.report, 'prospect_source_distribution');
      assert.deepEqual(body.population, {
        model: 'Prospect',
        scope: 'all_records',
        note: 'Includes every Prospect record, including intake and waitlist records; this is not a conversion denominator.',
      });
      assert.equal(body.totalProspectRecords, 9);
      assert.equal(body.totalProspectRecordsStatus, 'exact');
      assert.equal('totalApplications' in body, false);
      assert.deepEqual(body.privacy, {
        classification: 'aggregate_counts_only',
        dimensions: 'server_allowlisted',
        minimumReportableCellSize: 3,
        smallCells: 'omitted',
        exactTotal: 'withheld_when_any_cell_is_omitted',
      });
      assert.deepEqual(body.attribution, [
        {
          source: 'cola2026',
          campaign: 'cola_forum_2026',
          medium: 'qr',
          content: null,
          prospectRecords: 5,
        },
        {
          source: 'contact_form',
          campaign: null,
          medium: null,
          content: null,
          prospectRecords: 4,
        },
      ]);
      assert.equal(JSON.stringify(body).includes('applications'), false);
    },
  );
});

test('GET with one or two Prospect records suppresses both cells and exact total', async () => {
  for (const total of [1, 2]) {
    await withMockedGroups(
      async () => [
        { source: 'contact_form', _count: { _all: total } },
      ],
      async () => {
        const response = await GET();
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.totalProspectRecords, null);
        assert.equal(
          body.totalProspectRecordsStatus,
          'withheld_due_to_suppressed_cells',
        );
        assert.deepEqual(body.attribution, []);
      },
    );
  }
});

test('GET with visible and suppressed cells withholds total to prevent subtraction', async () => {
  await withMockedGroups(
    async () => [
      {
        source: 'lims.bot/early-adopter;utm_source=cola2026;utm_medium=qr;utm_campaign=cola_forum_2026',
        _count: { _all: 5 },
      },
      {
        source: 'lims.bot/early-adopter;utm_source=private_lab;utm_content=customer_1',
        _count: { _all: 1 },
      },
    ],
    async () => {
      const response = await GET();
      const body = await response.json();
      assert.equal(body.totalProspectRecords, null);
      assert.equal(
        body.totalProspectRecordsStatus,
        'withheld_due_to_suppressed_cells',
      );
      assert.deepEqual(body.attribution, [
        {
          source: 'cola2026',
          campaign: 'cola_forum_2026',
          medium: 'qr',
          content: null,
          prospectRecords: 5,
        },
      ]);
      assert.equal(JSON.stringify(body).includes('private_lab'), false);
      assert.equal(JSON.stringify(body).includes('customer_1'), false);
    },
  );
});

test('GET returns a generic unavailable response when the database read fails', async () => {
  await withMockedGroups(
    async () => {
      throw new Error('internal database details must not escape');
    },
    async () => {
      const response = await GET();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(await response.json(), {
        error: 'Report temporarily unavailable',
      });
    },
  );
});
