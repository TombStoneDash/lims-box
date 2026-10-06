import test from 'node:test';
import assert from 'node:assert/strict';
import { emailHmac } from '../lib/first-contact';
import { prisma } from '../lib/prisma';
import { runMaintenance } from '../scripts/first-contact-maintenance';

test('two retry-only runs advance past 100 older drafts and drain bounded retry batches', async (t) => {
  const key = 'synthetic-test-key';
  const env = {
    FIRST_CONTACT_EMAIL_ENABLED: 'true', FIRST_CONTACT_HMAC_KEY: key,
    FIRST_CONTACT_POSTAL_ADDRESS: 'Synthetic address', RESEND_API_KEY: 'mock-key',
    FIRST_CONTACT_KNOWN_HMACS: '[]', FIRST_CONTACT_NOTABLE_HMACS: '[]',
    FIRST_CONTACT_NOTABLE_DOMAINS: '[]', FIRST_CONTACT_SCOPE: 'per-product',
    FIRST_CONTACT_COPY_APPROVED: 'true', FIRST_CONTACT_DOMAIN_VERIFIED: 'true',
    FIRST_CONTACT_QUOTA_APPROVED: 'true', FIRST_CONTACT_SCHEMA_READY: 'true',
    SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
  };
  const previous = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  // In updated_at order: drafts are older than every retry candidate.
  const rows = Array.from({ length: 201 }, (_, i) => ({
    email_hmac: emailHmac(`synthetic${i}@example.test`, key)!,
    source_id: String(i), source_kind: 'newsletter',
    outcome: i < 100 ? 'draft_required' : 'failed', attempts: 1,
  }));
  const selected: number[] = [], resolved: string[] = [], sent: string[] = [];
  let reservations = 0;
  const originalQuery = prisma.$queryRaw, originalExecute = prisma.$executeRaw;
  const originalCount = prisma.prospect.count;
  t.after(() => {
    prisma.$queryRaw = originalQuery; prisma.$executeRaw = originalExecute;
    prisma.prospect.count = originalCount;
  });
  prisma.$queryRaw = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join('?');
    if (sql.includes('SELECT email_hmac')) {
      // Model SQL outcome filtering BEFORE LIMIT, including the original mixed query.
      const outcomes = sql.includes("outcome IN ('failed','draft_required')")
        ? ['failed', 'draft_required']
        : sql.includes("outcome='failed'") ? ['failed']
        : sql.includes("outcome='draft_required'") ? ['draft_required'] : [];
      assert.ok(outcomes.length, `Unexpected selection: ${sql}`);
      assert.match(sql, /ORDER BY updated_at LIMIT 100/);
      const batch = rows.filter(row => outcomes.includes(row.outcome)).slice(0, 100);
      selected.push(batch.length);
      return batch.map(row => ({ ...row }));
    }
    assert.match(sql, /UPDATE first_contact_log SET outcome='pending'/);
    assert.match(sql, /attempts < 3/);
    assert.match(sql, /interval '24 hours'/);
    const row = rows.find(row => row.email_hmac === values[0] && row.source_id === values[1]);
    if (!row || row.outcome !== 'failed' || row.attempts >= 3) return [];
    row.outcome = 'pending'; row.attempts++; reservations++;
    return [{ email_hmac: row.email_hmac }];
  }) as typeof prisma.$queryRaw;
  prisma.$executeRaw = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    if (parts.join('?').includes('provider_message_id=')) {
      const row = rows.find(row => row.email_hmac === values[3]);
      assert.ok(row);
      assert.equal(row.outcome, 'pending');
      row.outcome = String(values[0]);
      return 1;
    }
    // No expired pending or exhausted failures in this fixture.
    return 0;
  }) as typeof prisma.$executeRaw;
  prisma.prospect.count = (async () => 0) as typeof prisma.prospect.count;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://synthetic.example.test/rest/v1/limsbox_early_access')) {
      assert.equal(init?.method, 'HEAD');
      return new Response(null, { headers: { 'content-range': '*/0' } });
    }
    if (url.startsWith('https://api.resend.com/contacts/')) {
      const id = url.split('/').pop()!;
      resolved.push(id);
      return new Response(JSON.stringify({ email: `synthetic${id}@example.test`, unsubscribed: false }));
    }
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init?.method, 'POST');
    sent.push(JSON.parse(String(init?.body)).to[0]);
    return new Response(JSON.stringify({ id: `mock-message-${sent.length}` }));
  });

  await runMaintenance(['--retry-failed']);
  const firstRunAttempts = reservations;
  await runMaintenance(['--retry-failed']);

  assert.equal(firstRunAttempts, 100, 'first run must attempt a full retry batch despite older drafts');
  assert.equal(reservations, 101, 'second run must attempt the remaining retry');
  assert.deepEqual(selected, [100, 1]);
  assert.deepEqual(resolved, rows.slice(100).map(row => row.source_id));
  assert.equal(new Set(sent).size, 101);
  assert.ok(rows.slice(0, 100).every(row => row.outcome === 'draft_required' && row.attempts === 1));
  assert.ok(rows.slice(100).every(row => row.outcome === 'sent' && row.attempts === 2));
});

// Exercise the production resolver, terminal persistence, retry CAS and next-run selection.
test('all mixed Resend source orderings isolate failures and persist terminal outcomes', async (t) => {
  const key = 'synthetic-test-key';
  const env = {
    FIRST_CONTACT_EMAIL_ENABLED: 'true', FIRST_CONTACT_HMAC_KEY: key,
    FIRST_CONTACT_POSTAL_ADDRESS: 'Synthetic address', RESEND_API_KEY: 'mock-key',
    FIRST_CONTACT_KNOWN_HMACS: '[]', FIRST_CONTACT_NOTABLE_HMACS: '[]',
    FIRST_CONTACT_NOTABLE_DOMAINS: '[]', FIRST_CONTACT_SCOPE: 'per-product',
    FIRST_CONTACT_COPY_APPROVED: 'true', FIRST_CONTACT_DOMAIN_VERIFIED: 'true',
    FIRST_CONTACT_QUOTA_APPROVED: 'true', FIRST_CONTACT_SCHEMA_READY: 'true',
    SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
  };
  const previous = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const states = ['healthy', 'unsubscribed', 'missing', 'malformed', 'transport', 'invalid-json'] as const;
  let kinds: (typeof states[number])[] = [];
  const rows = Array.from({ length: 3 }, (_, i) => ({
    email_hmac: emailHmac(`synthetic${i}@example.test`, key)!,
    source_id: String(i), source_kind: 'newsletter', outcome: 'failed', attempts: 1,
  }));
  const terminal: string[] = [];
  const selected: number[] = [], resolved: string[] = [], sent: string[] = [];
  let reservations = 0;
  const originalQuery = prisma.$queryRaw, originalExecute = prisma.$executeRaw;
  const originalCount = prisma.prospect.count;
  t.after(() => {
    prisma.$queryRaw = originalQuery; prisma.$executeRaw = originalExecute;
    prisma.prospect.count = originalCount;
  });
  prisma.$queryRaw = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join('?');
    if (sql.includes('SELECT email_hmac')) {
      // Model SQL outcome filtering BEFORE LIMIT, including the original mixed query.
      const outcomes = sql.includes("outcome IN ('failed','draft_required')")
        ? ['failed', 'draft_required']
        : sql.includes("outcome='failed'") ? ['failed']
        : sql.includes("outcome='draft_required'") ? ['draft_required'] : [];
      assert.ok(outcomes.length, `Unexpected selection: ${sql}`);
      assert.match(sql, /ORDER BY updated_at LIMIT 100/);
      const batch = rows.filter(row => outcomes.includes(row.outcome)).slice(0, 100);
      selected.push(batch.length);
      return batch.map(row => ({ ...row }));
    }
    assert.match(sql, /UPDATE first_contact_log SET outcome='pending'/);
    assert.match(sql, /attempts < 3/);
    assert.match(sql, /interval '24 hours'/);
    const row = rows.find(row => row.email_hmac === values[0] && row.source_id === values[1]);
    if (!row || row.outcome !== 'failed' || row.attempts >= 3) return [];
    row.outcome = 'pending'; row.attempts++; reservations++;
    return [{ email_hmac: row.email_hmac }];
  }) as typeof prisma.$queryRaw;
  prisma.$executeRaw = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join('?');
    if (sql.includes('SOURCE_') || sql.includes('unsubscribed_at=CASE')) {
      assert.match(sql, /AND source_id=\?/);
      assert.match(sql, /AND source_kind=\? AND outcome=\?/);
      const [outcome, code, , hmac, sourceId, sourceKind, previousOutcome] = values;
      const row = rows.find(row => row.email_hmac === hmac && row.source_id === sourceId && row.source_kind === sourceKind && row.outcome === previousOutcome);
      assert.ok(row);
      assert.ok(outcome === 'unsubscribed' || outcome === 'unavailable');
      assert.equal(code, outcome === 'unsubscribed' ? 'SOURCE_UNSUBSCRIBED' : 'SOURCE_UNAVAILABLE');
      row.outcome = String(outcome);
      terminal.push(row.source_id);
      return 1;
    }
    if (parts.join('?').includes('provider_message_id=')) {
      const row = rows.find(row => row.email_hmac === values[3]);
      assert.ok(row);
      assert.equal(row.outcome, 'pending');
      row.outcome = String(values[0]);
      return 1;
    }
    // No expired pending or exhausted failures in this fixture.
    return 0;
  }) as typeof prisma.$executeRaw;
  prisma.prospect.count = (async () => 0) as typeof prisma.prospect.count;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://synthetic.example.test/rest/v1/limsbox_early_access')) {
      assert.equal(init?.method, 'HEAD');
      return new Response(null, { headers: { 'content-range': '*/0' } });
    }
    if (url.startsWith('https://api.resend.com/contacts/')) {
      const id = url.split('/').pop()!;
      resolved.push(id);
      const kind = kinds[Number(id)];
      if (kind === 'transport') throw Error('Synthetic private provider error');
      if (kind === 'missing') return new Response('{}', { status: 404 });
      if (kind === 'malformed') return new Response('null');
      if (kind === 'invalid-json') return new Response('not json');
      return new Response(JSON.stringify({ email: `synthetic${id}@example.test`, unsubscribed: kind === 'unsubscribed' }));
    }
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init?.method, 'POST');
    sent.push(JSON.parse(String(init?.body)).to[0]);
    return new Response(JSON.stringify({ id: `mock-message-${sent.length}` }));
  });

  for (let pattern = 0; pattern < states.length ** rows.length; pattern++) {
    kinds = rows.map((_, i) => states[Math.floor(pattern / states.length ** i) % states.length]);
    for (const row of rows) { row.outcome = 'failed'; row.attempts = 1; }
    selected.length = 0; resolved.length = 0; sent.length = 0; terminal.length = 0; reservations = 0;
    await runMaintenance(['--retry-failed']);
    const healthy = rows.filter((_, i) => kinds[i] === 'healthy');
    assert.deepEqual(resolved, rows.map(row => row.source_id), JSON.stringify(kinds));
    assert.deepEqual(sent, healthy.map(row => `synthetic${row.source_id}@example.test`));
    assert.equal(reservations, healthy.length);
    assert.equal(new Set(sent).size, sent.length);
    assert.deepEqual(terminal, rows.filter((_, i) => kinds[i] !== 'healthy').map(row => row.source_id));
    for (const [i, row] of rows.entries()) {
      assert.equal(row.outcome, kinds[i] === 'healthy' ? 'sent' : kinds[i] === 'unsubscribed' ? 'unsubscribed' : 'unavailable');
      assert.equal(row.attempts, kinds[i] === 'healthy' ? 2 : 1);
    }
    await runMaintenance(['--retry-failed']);
    assert.deepEqual(selected, [3, 0], 'terminal rows cannot consume a later batch');
    assert.equal(resolved.length, rows.length);
    assert.equal(sent.length, healthy.length);
  }
});
