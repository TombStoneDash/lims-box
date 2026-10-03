import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAutomaticPersonnelPackFulfillment, loadGeneratedPersonnelPack, autoPdfEnabled, type PersonnelPackStorage } from '../lib/personnel-pack/fulfillment';
import { generatePersonnelPackPdf, PDF_FILENAME } from '../lib/personnel-pack/pdf';
import { createPersonnelPackStorage } from '../lib/personnel-pack/storage';
import { createPersonnelPackPostHandler } from '../lib/personnelPackFulfillment';
import { createDownloadClaimService, createPersonnelPackGetHandler, createPersonnelPackClaimPostHandler, type DownloadClaimService } from '../lib/personnelPackDownloadClaims';
import { GET as downloadGet, POST as requestPost } from '../app/api/personnel-pack-download/route';
import { POST as claimPost } from '../app/api/personnel-pack-download/claim/route';
import { getSupabase } from '../lib/supabase';
import { prisma } from '../lib/prisma';
import { extractPdfText } from './helpers/pdf';

function memoryStorage() {
  const objects = new Map<string, Buffer>();
  let writes = 0;
  const storage: PersonnelPackStorage = {
    async read(key) { return objects.get(key) ?? null; },
    async putIfAbsent(key, bytes) {
      if (objects.has(key)) return false;
      writes++;
      objects.set(key, Buffer.from(bytes));
      return true;
    },
  };
  return { storage, objects, writes: () => writes };
}

function claimService() {
  const used = new Set<string>();
  return createDownloadClaimService({ secret: 'synthetic-test-signing-key', store: {
    async consume(payload) {
      if (used.has(payload.jti)) return false;
      used.add(payload.jti);
      return true;
    },
  } });
}

function redemption(url: string) {
  const params = new URL(url).searchParams;
  return new NextRequest('https://lims.bot/api/personnel-pack-download/claim', {
    method: 'POST', body: new URLSearchParams({ asset: params.get('asset')!, claim: params.get('claim')! }),
  });
}

function redeemHandler(storage: PersonnelPackStorage, claims: DownloadClaimService) {
  return createPersonnelPackClaimPostHandler(() => claims, (key) => loadGeneratedPersonnelPack(storage, key));
}

test('real generator produces deterministic, complete blank worksheets with a valid page tree', async () => {
  const first = await generatePersonnelPackPdf();
  assert.deepEqual(await generatePersonnelPackPdf(), first);
  assert.ok(first.toString().startsWith('%PDF-'));
  assert.match(first.toString(), /%%EOF\s*$/);
  assert.equal([...first.toString().matchAll(/\/Type\s*\/Page\b/g)].length, 5);
  const text = extractPdfText(first).join('\n');
  for (const heading of ['Personnel record', 'Training record', 'Competency assessment', 'Procedure authorization', 'Review checklist', 'Reviewer signature and date']) {
    assert.ok(text.includes(heading), heading);
  }
  assert.match(text, /does not certify compliance/);
  assert.doesNotMatch(text, /@/);
});

test('POST generates and persists before returning a claim, usable by a fresh handler without email', async () => {
  const { storage, objects } = memoryStorage();
  const claims = claimService();
  let leads = 0;
  const post = createPersonnelPackPostHandler({
    resolveAsset: createAutomaticPersonnelPackFulfillment(storage, claims),
    createLead: async () => { assert.equal(objects.size, 1); leads++; },
    sendSubmissionNotice: async () => {},
    sendApplicantDelivery: async () => { throw new Error('synthetic email unavailable'); },
    logDiagnostic: () => {},
  });
  const response = await post(new NextRequest('https://lims.bot/api/personnel-pack-download', {
    method: 'POST', body: JSON.stringify({ email: 'synthetic@example.com', accredType: 'iso15189' }),
  }));
  assert.equal(response.status, 200);
  const { delivery } = await response.json();
  assert.equal(leads, 1);
  assert.equal(delivery.emailed, false);
  assert.match(delivery.assetUrl, /^https:\/\/lims.bot\/api\/personnel-pack-download\?/);
  assert.doesNotMatch(delivery.assetUrl, /synthetic|example.com/);
  const preview = createPersonnelPackGetHandler(() => claims);
  for (let i = 0; i < 2; i++) {
    const confirmation = await preview(new NextRequest(delivery.assetUrl));
    assert.equal(confirmation.status, 200);
    assert.match(await confirmation.text(), /form method="post" action="\/api\/personnel-pack-download\/claim"/);
  }
  const claim = await redeemHandler(storage, claims)(redemption(delivery.assetUrl));
  assert.equal(claim.status, 200);
  assert.equal(claim.headers.get('content-type'), 'application/pdf');
  assert.equal(claim.headers.get('cache-control'), 'private, no-store');
  assert.equal(claim.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(claim.headers.get('content-disposition')?.includes(PDF_FILENAME));
  assert.deepEqual(Buffer.from(await claim.arrayBuffer()), [...objects.values()][0]);
  const replay = await redeemHandler(storage, claims)(redemption(delivery.assetUrl));
  assert.equal(replay.status, 401);
});

test('duplicate and concurrent requests reuse one durable content-addressed artifact', async () => {
  const { storage, writes } = memoryStorage();
  const claims = claimService();
  const fulfill = createAutomaticPersonnelPackFulfillment(storage, claims);
  const results = await Promise.all(Array.from({ length: 4 }, () => fulfill('iso15189', 'https://lims.bot')));
  const retry = await createAutomaticPersonnelPackFulfillment(storage, claims)('iso15189', 'https://lims.bot');
  assert.equal(writes(), 1);
  assert.ok(results.every((result) => new URL(result!.assetUrl).searchParams.get('asset') === new URL(retry!.assetUrl).searchParams.get('asset')));
  assert.equal(new Set(results.map((result) => result!.assetUrl)).size, 4, 'each request gets a fresh claim');
});

test('unsupported selections never generate or touch storage', async () => {
  const { storage, writes } = memoryStorage();
  const fulfill = createAutomaticPersonnelPackFulfillment(storage, claimService(), async () => { throw new Error('must not generate'); });
  for (const selection of [null, '', 'clia', '../iso15189', 'constructor']) {
    assert.equal(await fulfill(selection, 'https://lims.bot'), null);
  }
  assert.equal(writes(), 0);
});

test('generation, storage and integrity failures do not return success or perform lead/email effects', async () => {
  const goodPdf = await generatePersonnelPackPdf();
  for (const failure of ['generation', 'invalid-pdf', 'read', 'write', 'missing-after-write', 'corrupt'] as const) {
    const storage: PersonnelPackStorage = {
      async read() {
        if (failure === 'read') throw new Error('synthetic-private-provider-error');
        return failure === 'corrupt' ? Buffer.from('corrupt') : null;
      },
      async putIfAbsent() {
        if (failure === 'write') throw new Error('synthetic-private-provider-error');
        return true;
      },
    };
    const diagnostics: unknown[] = [];
    const forbidden = async () => { assert.fail('unexpected side effect'); };
    const handler = createPersonnelPackPostHandler({
      resolveAsset: createAutomaticPersonnelPackFulfillment(storage, claimService(), async () => {
        if (failure === 'generation') throw new Error('synthetic-private-provider-error');
        return failure === 'invalid-pdf' ? Buffer.from('invalid') : goodPdf;
      }),
      createLead: forbidden, sendSubmissionNotice: forbidden, sendApplicantDelivery: forbidden,
      logDiagnostic: (code, meta) => { diagnostics.push({ code, meta }); },
    });
    const response = await handler(new NextRequest('https://lims.bot/api/personnel-pack-download', {
      method: 'POST', body: JSON.stringify({ email: 'synthetic@example.com', accredType: 'iso15189' }),
    }));
    assert.equal(response.status, 503, failure);
    assert.equal((await response.json()).code, 'asset_unavailable');
    assert.doesNotMatch(JSON.stringify(diagnostics), /synthetic|private-provider/);
  }
});

test('a failed storage attempt is retryable without a stuck in-memory claim', async () => {
  const { storage, writes } = memoryStorage();
  let fail = true;
  const fulfill = createAutomaticPersonnelPackFulfillment({
    ...storage,
    async putIfAbsent(key, bytes) {
      if (fail) throw new Error('synthetic outage');
      return storage.putIfAbsent(key, bytes);
    },
  }, claimService());
  await assert.rejects(fulfill('iso15189', 'https://lims.bot'));
  fail = false;
  assert.ok(await fulfill('iso15189', 'https://lims.bot'));
  assert.equal(writes(), 1);
});

test('claims reject tampering before storage; corrupt or missing objects remain retryable without spending the claim', async () => {
  let reads = 0;
  const { storage, objects } = memoryStorage();
  const claims = claimService();
  const claim = redeemHandler({ ...storage, async read(key) { reads++; return storage.read(key); } }, claims);
  const delivery = await createAutomaticPersonnelPackFulfillment(storage, claims)('iso15189', 'https://lims.bot');
  const malformed = new URL(delivery!.assetUrl);
  malformed.searchParams.set('claim', 'malformed');
  assert.equal((await claim(redemption(malformed.toString()))).status, 401);
  const mismatched = new URL(delivery!.assetUrl);
  mismatched.searchParams.set('asset', `iso15189:v1:${'a'.repeat(64)}`);
  assert.equal((await claim(redemption(mismatched.toString()))).status, 401);
  assert.equal(reads, 0);
  const [key, bytes] = [...objects.entries()][0];
  objects.set(key, Buffer.from('tampered'));
  const corrupted = await claim(redemption(delivery!.assetUrl));
  assert.equal(corrupted.status, 503);
  assert.equal(corrupted.headers.get('cache-control'), 'private, no-store');
  objects.delete(key);
  assert.equal((await claim(redemption(delivery!.assetUrl))).status, 503);
  const outage = redeemHandler({ ...storage, async read() { throw new Error('synthetic-secret'); } }, claims);
  const response = await outage(redemption(delivery!.assetUrl));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /synthetic-secret/);
  objects.set(key, bytes);
  assert.equal((await claim(redemption(delivery!.assetUrl))).status, 200);
});

test('automatic storage path defaults OFF and disabled claims make no provider call', async (t) => {
  const old = process.env.PERSONNEL_PACK_AUTO_PDF_ENABLED;
  t.after(() => { if (old === undefined) delete process.env.PERSONNEL_PACK_AUTO_PDF_ENABLED; else process.env.PERSONNEL_PACK_AUTO_PDF_ENABLED = old; });
  delete process.env.PERSONNEL_PACK_AUTO_PDF_ENABLED;
  assert.equal(autoPdfEnabled(), false);
  const response = await downloadGet(new NextRequest(`https://lims.bot/api/personnel-pack-download?asset=iso15189:v1:${'a'.repeat(64)}`));
  assert.equal(response.status, 401);
  process.env.PERSONNEL_PACK_AUTO_PDF_ENABLED = 'false';
  assert.equal(autoPdfEnabled(), false);
  process.env.PERSONNEL_PACK_AUTO_PDF_ENABLED = 'true';
  assert.equal(autoPdfEnabled(), true);
});

test('Supabase adapter uses create-only PDF storage and distinguishes absence, conflict and outage', async () => {
  const calls: unknown[] = [];
  let error: unknown = null;
  const client = {
    storage: { from(name: string) {
      calls.push(name);
      return {
        async download(key: string) { calls.push(key); return { data: new Blob(['stored bytes']), error }; },
        async upload(key: string, bytes: Buffer, options: unknown) { calls.push({ key, bytes: bytes.toString(), options }); return { error }; },
      };
    } },
  } as unknown as SupabaseClient;
  const storage = createPersonnelPackStorage(() => client, 'synthetic-bucket');
  assert.equal((await storage.read('test.pdf'))?.toString(), 'stored bytes');
  assert.equal(await storage.putIfAbsent('test.pdf', Buffer.from('PDF bytes')), true);
  assert.deepEqual(calls[3], { key: 'test.pdf', bytes: 'PDF bytes', options: { contentType: 'application/pdf', upsert: false, cacheControl: '0' } });
  for (error of [{ statusCode: '404' }, { statusCode: 'NoSuchKey' }]) assert.equal(await storage.read('test.pdf'), null);
  for (error of [{ statusCode: '409' }, { statusCode: 'Duplicate' }, { statusCode: 'ResourceAlreadyExists' }]) assert.equal(await storage.putIfAbsent('test.pdf', Buffer.from('PDF')), false);
  error = { statusCode: '403', message: 'synthetic-secret' };
  await assert.rejects(storage.read('test.pdf'), /^Error: pdf_storage_read_failed$/);
  await assert.rejects(storage.putIfAbsent('test.pdf', Buffer.from('PDF')), /^Error: pdf_storage_write_failed$/);
  await assert.rejects(createPersonnelPackStorage(() => null).read('test.pdf'), /pdf_storage_unavailable/);
});

test('production route wiring generates, stores and redeems through #124 with all external I/O stubbed', async (t) => {
  const configuration = {
    SUPABASE_URL: 'https://synthetic.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key',
    PERSONNEL_PACK_AUTO_PDF_ENABLED: 'true',
    PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET: 'synthetic-test-claim-key',
    RESEND_API_KEY: '',
  };
  const previous = Object.fromEntries(Object.keys(configuration).map((key) => [key, process.env[key]]));
  Object.assign(process.env, configuration);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('external I/O is forbidden'); });
  const client = getSupabase()!;
  const objects = new Map<string, Buffer>();
  let saved = 0;
  let consumed = 0;
  t.mock.method(client.storage, 'from', () => ({
    async download(key: string) {
      const bytes = objects.get(key);
      return bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null } : { data: null, error: { statusCode: '404' } };
    },
    async upload(key: string, bytes: Buffer) {
      objects.set(key, bytes);
      return { data: {}, error: null };
    },
  }));
  t.mock.method(client, 'from', (table: string) => {
    assert.equal(table, 'personnel_pack_leads');
    return { async insert() { saved++; return { error: null }; } };
  });
  const originalExecute = prisma.$executeRaw;
  prisma.$executeRaw = (async () => { consumed++; return 1; }) as typeof prisma.$executeRaw;
  t.after(() => { prisma.$executeRaw = originalExecute; });
  const response = await requestPost(new NextRequest('https://lims.bot/api/personnel-pack-download', {
    method: 'POST', body: JSON.stringify({ email: 'synthetic@example.com', accredType: 'iso15189' }),
  }));
  assert.equal(response.status, 200);
  assert.equal(objects.size, 1);
  assert.equal(saved, 1);
  const { delivery } = await response.json();
  assert.equal(delivery.emailed, false);
  assert.equal((await downloadGet(new NextRequest(delivery.assetUrl))).status, 200);
  assert.equal(consumed, 0, 'GET preview never spends a claim');
  const redeemed = await claimPost(redemption(delivery.assetUrl));
  assert.equal(redeemed.status, 200);
  assert.equal(consumed, 1);
  assert.deepEqual(Buffer.from(await redeemed.arrayBuffer()), [...objects.values()][0]);
});
