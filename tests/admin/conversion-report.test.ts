import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { prisma } from '../../lib/prisma';
import { GET } from '../../app/api/admin/conversion-report/route';
import { getConversionReport } from '../../lib/admin/conversionReport';

const pii = {
  email: 'private@example.invalid', name: 'Private Person', labName: 'Private Laboratory',
  phone: '+1-555-0100', id: 'private-record-id', source: 'sensitive source',
  painPoint: 'private notes', rows: [{ contact_name: 'Private Contact' }],
};
const zero = { waitlist: 0, early_adopter: 0, prospect: 0 };

// Prisma exposes methods through a proxy; replace the property explicitly.
function mockQuery(t: TestContext, implementation: (...args: any[]) => Promise<any[]>) {
  const original = prisma.$queryRaw;
  const query = t.mock.fn(implementation);
  prisma.$queryRaw = query as typeof prisma.$queryRaw;
  t.after(() => { prisma.$queryRaw = original; });
  return query;
}

function assertPrivate(body: unknown) {
  const json = JSON.stringify(body);
  for (const key of Object.keys(pii)) assert.ok(!json.includes(`"${key}":`), key);
  for (const value of Object.values(pii).filter(v => typeof v === 'string')) {
    assert.ok(!json.includes(value), value);
  }
}

function assertReportShape(body: any) {
  assert.deepEqual(Object.keys(body).sort(), ['byStage', 'byWeek']);
  const assertCounts = (counts: Record<string, unknown>) => {
    assert.deepEqual(Object.keys(counts).sort(), Object.keys(zero).sort());
    for (const count of Object.values(counts)) {
      assert.equal(typeof count, 'number');
      assert.ok(Number.isSafeInteger(count) && (count as number) >= 0);
    }
  };
  assertCounts(body.byStage);
  for (const week of body.byWeek) {
    assert.deepEqual(Object.keys(week).sort(), ['counts', 'weekStart']);
    assert.match(week.weekStart, /^\d{4}-\d{2}-\d{2}$/);
    assertCounts(week.counts);
  }
  assertPrivate(body);
}

test('aggregate totals, chronological weeks, zero stages, and strict privacy projection', async t => {
  const query = mockQuery(t, async () => [
    { stage: 'prospect', week: '2026-01-05', count: BigInt(3), ...pii },
    { stage: 'early_adopter', week: '2025-12-29', count: BigInt(2), ...pii },
    { stage: 'waitlist', week: '2025-12-29', count: BigInt(4), ...pii },
    { stage: 'early_adopter', week: '2026-01-05', count: BigInt(1), ...pii },
  ]);
  const report = await getConversionReport(prisma);
  assert.deepEqual(report, {
    byStage: { waitlist: 4, early_adopter: 3, prospect: 3 },
    byWeek: [
      { weekStart: '2025-12-29', counts: { waitlist: 4, early_adopter: 2, prospect: 0 } },
      { weekStart: '2026-01-05', counts: { waitlist: 0, early_adopter: 1, prospect: 3 } },
    ],
  });
  assertReportShape(report);
  const sql = (query.mock.calls[0].arguments[0] as unknown as string[]).join('');
  assert.match(sql, /COUNT\(\*\)/);
  assert.match(sql, /GROUP BY 1, 2/);
  assert.match(sql, /date_trunc\('week', "createdAt"\)/);
  assert.doesNotMatch(sql, /SELECT\s+\*|"(?:email|name|labName|id|painPoint)"/i);
});

test('empty storage returns zero counts', async t => {
  mockQuery(t, async () => []);
  assert.deepEqual(await getConversionReport(prisma), { byStage: zero, byWeek: [] });
});

test('rejects PII in grouping values and malformed aggregate values', async t => {
  let row: Record<string, unknown>;
  mockQuery(t, async () => [row]);
  for (const override of [
    { stage: pii.email }, { stage: '__proto__' }, { week: pii.name },
    { week: '2026-02-30' }, { week: '2026-01-06' }, { week: null },
    { count: pii.email }, { count: -1 }, { count: 1.5 }, { count: Infinity },
    { count: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1) },
  ]) {
    row = { stage: 'prospect', week: '2026-01-05', count: BigInt(1), ...override };
    await assert.rejects(getConversionReport(prisma), { message: 'Invalid conversion aggregate' });
  }
});

test('route uses admin guard before querying and never exposes PII on any response', async t => {
  const previousUser = process.env.ADMIN_BASIC_USER;
  const previousPass = process.env.ADMIN_BASIC_PASS;
  t.after(() => {
    if (previousUser === undefined) delete process.env.ADMIN_BASIC_USER;
    else process.env.ADMIN_BASIC_USER = previousUser;
    if (previousPass === undefined) delete process.env.ADMIN_BASIC_PASS;
    else process.env.ADMIN_BASIC_PASS = previousPass;
  });
  process.env.ADMIN_BASIC_USER = 'test-admin';
  process.env.ADMIN_BASIC_PASS = 'test-password';
  let fail = false;
  const query = mockQuery(t, async () => {
    if (fail) throw new Error(JSON.stringify(pii));
    return [{ stage: 'prospect', week: '2026-01-05', count: BigInt(2), ...pii }];
  });
  const auth = `Basic ${Buffer.from('test-admin:test-password').toString('base64')}`;
  const request = (authorization?: string) => new Request('http://localhost/api/admin/conversion-report', {
    headers: authorization ? { authorization } : {},
  });
  async function check(response: Response, status: number) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assertPrivate(body);
    return body;
  }
  for (const credential of [undefined, 'Basic !!!', 'Bearer fake', `Basic ${Buffer.from('test-admin:wrong').toString('base64')}`]) {
    const response = await GET(request(credential));
    assert.match(response.headers.get('www-authenticate')!, /^Basic /);
    await check(response, 401);
  }
  delete process.env.ADMIN_BASIC_PASS;
  await check(await GET(request(auth)), 503);
  process.env.ADMIN_BASIC_PASS = 'test-password';
  assert.equal(query.mock.callCount(), 0);
  const body = await check(await GET(request(auth)), 200);
  assertReportShape(body);
  assert.equal(body.byStage.prospect, 2);
  fail = true;
  assert.deepEqual(await check(await GET(request(auth)), 503), { error: 'Conversion report unavailable' });
});
