// LIMS BOX first-contact dry run (spec rev 3). No sender; all sources are fakes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { emailHmac } from '../lib/first-contact';
import {
  LIMS_SENDING_BLOCKER,
  limsFirstContactDryRun,
  limsPriorContact,
  prismaProspectCounter,
  supabaseEarlyAccessCounter,
  type LimsHistorySources,
} from '../lib/first-contact-lims';
import { createEarlyAccessPostHandler } from '../lib/earlyAccessHandler';
import { createWaitlistPostHandler } from '../lib/waitlistHandler';

const ON = { FIRST_CONTACT_EMAIL_ENABLED: 'true', FIRST_CONTACT_HMAC_KEY: 'test-key' };
const START = new Date('2026-09-26T12:00:00.000Z');

function sources(prior: { prospects?: number; earlyAccess?: number | null } = {}): LimsHistorySources & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    countProspectsBefore: async (email, before) => { calls.push(`prospect ${email} ${before.toISOString()}`); return prior.prospects ?? 0; },
    countEarlyAccessBefore: prior.earlyAccess === null ? null
      : async (email, before) => { calls.push(`early ${email} ${before.toISOString()}`); return prior.earlyAccess ?? 0; },
  };
}

async function run(args: Partial<Parameters<typeof limsFirstContactDryRun>[0]> & { src?: LimsHistorySources }) {
  const lines: string[] = [];
  await limsFirstContactDryRun({
    endpoint: 'contact',
    email: 'Person@Example.com',
    sources: () => args.src ?? sources(),
    requestStartedAt: START,
    coveredByTransactional: false,
    env: ON,
    log: (line) => lines.push(line),
    ...args,
  });
  return lines;
}

test('flag off: no lookup, no log line', async () => {
  const src = sources();
  const lines = await run({ env: {}, src });
  assert.deepEqual(lines, []);
  assert.deepEqual(src.calls, []);
});

test('contact form, new person: would_send under either scope, blocked by the unverified domain', async () => {
  const [line] = await run({});
  const entry = JSON.parse(line);
  assert.equal(entry.product, 'lims');
  assert.equal(entry.endpoint, 'contact');
  assert.equal(entry.perProduct, 'would_send');
  assert.equal(entry.crossProduct, 'would_send');
  assert.ok(entry.blockers.includes('SEND_NOT_BUILT'));
  assert.ok(entry.blockers.includes(LIMS_SENDING_BLOCKER));
  assert.equal(entry.email_hmac, emailHmac('person@example.com', 'test-key'));
});

test('an earlier prospect or early-access row makes the person known', async () => {
  for (const prior of [{ prospects: 1 }, { earlyAccess: 2 }]) {
    const entry = JSON.parse((await run({ src: sources(prior) }))[0]);
    assert.equal(entry.perProduct, 'skipped_known');
    assert.equal(entry.crossProduct, 'skipped_known');
  }
});

test('early access: the applicant confirmation is the first contact', async () => {
  const entry = JSON.parse((await run({ endpoint: 'early-access', coveredByTransactional: true }))[0]);
  assert.equal(entry.perProduct, 'covered_by_transactional');
});

test('history counts only rows created before the request, with the normalized address', async () => {
  const src = sources();
  await limsPriorContact(src, ' Person@Example.com ', START);
  assert.deepEqual(src.calls, [`prospect person@example.com ${START.toISOString()}`, `early person@example.com ${START.toISOString()}`]);
  const noSupabase = sources({ earlyAccess: null });
  assert.equal(await limsPriorContact(noSupabase, 'a@example.com', START), false);
  assert.equal(noSupabase.calls.length, 1, 'without Supabase only the prospect table is read');
});

test('Prisma counter: case-insensitive email and a createdAt cutoff, read-only count', async () => {
  const seen: unknown[] = [];
  const count = prismaProspectCounter({ prospect: { count: async (args) => { seen.push(args); return 3; } } });
  assert.equal(await count('a@example.com', START), 3);
  assert.deepEqual(seen, [{ where: { email: { equals: 'a@example.com', mode: 'insensitive' }, createdAt: { lt: START } } }]);
});

test('Supabase counter: head count, wildcards escaped, created_at cutoff', async () => {
  const seen: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => ({
      select: (columns: string, options: { count: 'exact'; head: true }) => ({
        ilike: (column: string, pattern: string) => ({
          lt: (cutoff: string, value: string) => {
            seen.push({ table, columns, options, column, pattern, cutoff, value });
            return Promise.resolve({ count: 1, error: null });
          },
        }),
      }),
    }),
  };
  assert.equal(await supabaseEarlyAccessCounter(client)('a_b%c@example.com', START), 1);
  assert.deepEqual(seen, [{
    table: 'limsbox_early_access', columns: 'id', options: { count: 'exact', head: true },
    column: 'email', pattern: 'a\\_b\\%c@example.com', cutoff: 'created_at', value: START.toISOString(),
  }]);
});

test('lookup errors and slow lookups never leak the address and never throw', async () => {
  const failing: LimsHistorySources = {
    countProspectsBefore: async () => { throw new Error('db down person@example.com'); },
    countEarlyAccessBefore: null,
  };
  const [line] = await run({ src: failing });
  assert.deepEqual(JSON.parse(line), { event: 'first_contact_dry_run_error', product: 'lims', endpoint: 'contact' });
  assert.ok(!line.toLowerCase().includes('person@example.com'));
});

// ---- Route hooks: existing behaviour is unchanged ------------------------

const application = {
  labName: 'Synthetic Water Lab', labType: 'Environmental / Water Testing', contactName: 'Synthetic Person',
  email: 'NEW@example.test', monthlyVolume: '100-500', painPoint: 'x', dataUseAccepted: true, source: 'lims.bot/early-adopter',
};
const post = (url: string, body: unknown) => new NextRequest(url, {
  method: 'POST', headers: { 'content-type': 'application/json', referer: 'https://lims.bot/early-adopter' }, body: JSON.stringify(body),
});

test('early-access handler: hook runs after the save and confirmation, and a failing hook changes nothing', async () => {
  const order: string[] = [];
  let hookInput: { email: string; requestStartedAt: Date; coveredByTransactional: boolean } | undefined;
  const handler = createEarlyAccessPostHandler({
    createProspect: async () => { order.push('save'); },
    sendSubmissionNotice: async () => { order.push('notice'); },
    sendApplicantConfirmation: async () => { order.push('confirmation'); },
    firstContactDryRun: async (input) => { order.push('dry-run'); hookInput = input; throw new Error('boom'); },
  });
  const before = Date.now();
  const res = await handler(post('https://lims.bot/api/early-access', application));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, saved: true });
  assert.deepEqual(order, ['save', 'notice', 'confirmation', 'dry-run']);
  assert.equal(hookInput?.email, 'new@example.test');
  assert.equal(hookInput?.coveredByTransactional, true);
  assert.ok((hookInput?.requestStartedAt.getTime() ?? 0) <= before + 5);
});

test('early-access handler without the hook behaves as before', async () => {
  const handler = createEarlyAccessPostHandler({
    createProspect: async () => {}, sendSubmissionNotice: async () => {}, sendApplicantConfirmation: async () => {},
  });
  assert.equal((await handler(post('https://lims.bot/api/early-access', application))).status, 200);
});

test('waitlist handler: covered only when the confirmation was attempted for a new, saved signup', async () => {
  for (const [existing, saveFails, expected] of [[false, false, true], [true, false, false], [false, true, false]] as const) {
    let covered: boolean | undefined;
    const handler = createWaitlistPostHandler({
      hasExistingSignup: async () => existing,
      createProspect: async () => { if (saveFails) throw new Error('synthetic save outage'); },
      sendSubmissionNotice: async () => {},
      sendApplicantConfirmation: async () => {},
      firstContactDryRun: async (input) => { covered = input.coveredByTransactional; },
    });
    const res = await handler(post('https://lims.bot/api/waitlist', { email: 'w@example.test' }));
    assert.equal(res.status, 200);
    assert.equal(covered, expected, `existing=${existing} saveFails=${saveFails}`);
  }
});

test('failed signups never reach the dry run', async () => {
  let called = false;
  const handler = createEarlyAccessPostHandler({
    createProspect: async () => { throw new Error('db down'); },
    sendSubmissionNotice: async () => { throw new Error('mail down'); },
    sendApplicantConfirmation: async () => {},
    firstContactDryRun: async () => { called = true; },
  });
  assert.equal((await handler(post('https://lims.bot/api/early-access', application))).status, 500);
  assert.equal(called, false);
});
