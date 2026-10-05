import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createPersonnelPackPostHandler } from '../lib/personnelPackFulfillment';
import {
  configuredDownloadClaimService, createDownloadClaimService, createPersonnelPackClaimPostHandler,
  createPersonnelPackGetHandler, createPrismaDownloadClaimStore,
  type DownloadClaimPayload, type DownloadClaimService,
} from '../lib/personnelPackDownloadClaims';
import { automaticPdfEnabled, personnelPackEmailEnabled, createAutomaticPersonnelPackResolver, loadGeneratedPersonnelPack } from '../lib/personnel-pack/fulfillment';
import { GENERATED_PACK_FILENAME, GENERATED_PACK_KEY, PDF_SOURCE_SHA256, generatePersonnelPackPdf } from '../lib/personnel-pack/pdf';
import { WORKSHEETS } from '../lib/personnel-pack/template';
import { createPrismaPersonnelPackPdfStore, ensurePersonnelPackPdf, verifyPersonnelPackPdf, type PersonnelPackPdfArtifact, type PersonnelPackPdfStore } from '../lib/personnel-pack/storage';
import { extractPdfText } from './helpers/pdf';

const generated = generatePersonnelPackPdf();
const fixtureSecret = 'synthetic-test-only-signing-key';

function artifact(bytes: Buffer): PersonnelPackPdfArtifact {
  return { key: GENERATED_PACK_KEY, sourceSha256: PDF_SOURCE_SHA256, sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
}

function fixture() {
  const rows = new Map<string, PersonnelPackPdfArtifact>();
  const used = new Set<string>();
  let insertCount = 0;
  const store: PersonnelPackPdfStore = {
    async read(key) { return rows.get(key) ?? null; },
    async putIfAbsent(row) {
      if (!rows.has(row.key)) { rows.set(row.key, row); insertCount++; }
    },
  };
  function claims() {
    return createDownloadClaimService({ secret: fixtureSecret, store: {
      async consume(payload) {
        if (used.has(payload.jti)) return false;
        used.add(payload.jti);
        return true;
      },
    } });
  }
  const resolve = createAutomaticPersonnelPackResolver({ enabled: () => true, store, resolveClaims: claims, generate: () => generated });
  return { rows, used, store, claims, resolve, insertCount: () => insertCount };
}

function request(body: unknown) {
  return new NextRequest('https://lims.bot/api/personnel-pack-download', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function redeem(url: string) {
  const link = new URL(url);
  return new NextRequest('https://lims.bot/api/personnel-pack-download/claim', {
    method: 'POST', body: new URLSearchParams({ asset: link.searchParams.get('asset')!, claim: link.searchParams.get('claim')! }),
  });
}

test('generated PDF contains every reviewed worksheet, blank fields, and boundaries, deterministically', async () => {
  const bytes = await generated;
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.subarray(-32).toString().includes('%%EOF'));
  const text = extractPdfText(bytes).join(' ');
  for (const worksheet of WORKSHEETS) {
    assert.ok(text.includes(worksheet.title), worksheet.title);
    for (const field of worksheet.fields ?? []) assert.ok(text.includes(field), field);
    for (const column of worksheet.columns ?? []) assert.ok(text.includes(column), column);
  }
  assert.match(text, /does not certify conformity or accreditation/);
  assert.match(text, /licensed copy of ISO 15189:2022/);
  assert.doesNotMatch(text, /applicant@example\.test|canary-secret|undefined|NaN/);
  assert.deepEqual(await generatePersonnelPackPdf(), bytes);
  const pages = bytes.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
  assert.ok(pages >= 14 && pages <= 24, `Expected printable, paginated worksheets, got ${pages}`);
});

test('fresh and repeated requests persist one version and return independently usable claims with no sends', async () => {
  const f = fixture();
  const leads: unknown[] = [];
  const handler = createPersonnelPackPostHandler({ createLead: async row => { leads.push(row); }, resolveAsset: f.resolve });
  const links: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await handler(request({ email: 'applicant@example.test', accredType: ' ISO15189 ' }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.equal(body.saved, true);
    assert.equal(body.delivery.emailed, false);
    const link = new URL(body.delivery.assetUrl);
    assert.equal(link.pathname, '/api/personnel-pack-download');
    assert.equal(link.searchParams.get('asset'), GENERATED_PACK_KEY);
    assert.ok(link.searchParams.get('claim'));
    assert.doesNotMatch(body.delivery.assetUrl, /applicant|example\.test|storage|supabase/);
    links.push(body.delivery.assetUrl);
  }
  assert.equal(f.insertCount(), 1);
  assert.equal(leads.length, 2);
  assert.notEqual(links[0], links[1]);
  const get = createPersonnelPackGetHandler(f.claims, key => loadGeneratedPersonnelPack(f.store, key));
  const post = createPersonnelPackClaimPostHandler(f.claims, key => loadGeneratedPersonnelPack(f.store, key));
  for (const link of links) {
    // Scanners/repeated GETs must not consume, and another service instance can redeem.
    for (let i = 0; i < 2; i++) {
      const response = await get(new NextRequest(link));
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type')!, /text\/html/);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.match(await response.text(), /method="post" action="\/api\/personnel-pack-download\/claim"/);
    }
    const response = await post(redeem(link));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('content-disposition'), `attachment; filename="${GENERATED_PACK_FILENAME}"`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await generated);
    const replay = await post(redeem(link));
    assert.equal(replay.status, 401);
    assert.equal((await replay.json()).code, 'download_claim_replayed');
  }
});

test('concurrent generation uses first-writer-wins and reuses durable bytes across resolver instances', async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 6 }, () => ensurePersonnelPackPdf(f.store, () => generated)));
  assert.equal(f.insertCount(), 1);
  for (const result of results) assert.deepEqual(result, await generated);
  const restarted = createAutomaticPersonnelPackResolver({ enabled: () => true, store: f.store, resolveClaims: f.claims,
    generate: async () => { throw new Error('Must reuse persisted artifact'); } });
  assert.ok(await restarted('iso15189', 'https://lims.bot'));
});

test('generated asset cannot be retrieved through a bare URL or an arbitrary version key', async () => {
  const f = fixture();
  const get = createPersonnelPackGetHandler(f.claims, async () => { assert.fail('private storage must not be read'); });
  for (const key of [GENERATED_PACK_KEY, 'iso15189-generated-arbitrary']) {
    assert.equal((await get(new NextRequest(`https://lims.bot/api/personnel-pack-download?asset=${key}`))).status, 404);
  }
});

test('signature, expiry, asset binding, and missing secret fail closed before storage or consumption', async () => {
  const f = fixture();
  const service = f.claims();
  const token = service.issue(GENERATED_PACK_KEY);
  const get = createPersonnelPackGetHandler(() => service);
  const post = createPersonnelPackClaimPostHandler(() => service, async () => { assert.fail('unauthorized storage read'); });
  const cases = [
    [GENERATED_PACK_KEY, token + 'tampered', 'download_claim_malformed'],
    [GENERATED_PACK_KEY, service.issue(GENERATED_PACK_KEY, Date.now() - 16 * 60_000), 'download_claim_expired'],
    ['iso15189', token, 'download_claim_mismatched'],
    [GENERATED_PACK_KEY, '', 'download_claim_malformed'],
  ];
  for (const [asset, claim, code] of cases) {
    const url = `https://lims.bot/api/personnel-pack-download?${new URLSearchParams({ asset, claim })}`;
    for (const response of [await get(new NextRequest(url)), await post(redeem(url))]) {
      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, code);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  }
  const url = `https://lims.bot/api/personnel-pack-download?${new URLSearchParams({ asset: GENERATED_PACK_KEY, claim: token })}`;
  assert.equal((await createPersonnelPackClaimPostHandler(() => null)(redeem(url))).status, 503);
  assert.equal(f.used.size, 0);
});

test('a missing or corrupt stored PDF never consumes a claim and a storage retry succeeds', async () => {
  const f = fixture();
  const delivery = (await f.resolve('iso15189', 'https://lims.bot'))!;
  const saved = f.rows.get(GENERATED_PACK_KEY)!;
  const post = createPersonnelPackClaimPostHandler(f.claims, key => loadGeneratedPersonnelPack(f.store, key));
  for (const corrupt of [null, { ...saved, sha256: 'wrong' }]) {
    if (corrupt) f.rows.set(GENERATED_PACK_KEY, corrupt); else f.rows.delete(GENERATED_PACK_KEY);
    assert.equal((await post(redeem(delivery.assetUrl))).status, 503);
    assert.equal(f.used.size, 0);
  }
  f.rows.set(GENERATED_PACK_KEY, saved);
  assert.equal((await post(redeem(delivery.assetUrl))).status, 200);
  assert.equal(f.used.size, 1);
});

test('two concurrent redemptions across instances return the PDF exactly once', async () => {
  const f = fixture();
  const delivery = (await f.resolve('iso15189', 'https://lims.bot'))!;
  const responses = await Promise.all([1, 2].map(() => createPersonnelPackClaimPostHandler(f.claims, key => loadGeneratedPersonnelPack(f.store, key))(redeem(delivery.assetUrl))));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
  assert.equal(f.used.size, 1);
});

test('claim database failure does not return PDF bytes or leak caught errors', async () => {
  const service = createDownloadClaimService({ secret: fixtureSecret, store: { consume: async () => { throw new Error('canary-secret applicant@example.test'); } } });
  const token = service.issue(GENERATED_PACK_KEY);
  const url = `https://lims.bot/api/personnel-pack-download?${new URLSearchParams({ asset: GENERATED_PACK_KEY, claim: token })}`;
  const post = createPersonnelPackClaimPostHandler(() => service, async () => ({ asset: { downloadFilename: GENERATED_PACK_FILENAME }, bytes: await generated }));
  const response = await post(redeem(url));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'download_claim_unavailable');
});

test('all generation, storage and readback failures return no delivery URL, lead or outbound notice', async () => {
  for (const stage of ['read', 'generate', 'write', 'readback', 'integrity']) {
    const f = fixture();
    const diagnostics: unknown[] = [];
    if (stage === 'integrity') f.rows.set(GENERATED_PACK_KEY, { ...artifact(await generated), sourceSha256: 'wrong' });
    const store: PersonnelPackPdfStore = {
      read: async key => {
        if (stage === 'read') throw new Error('canary-secret applicant@example.test');
        if (stage === 'readback') return null;
        return f.store.read(key);
      },
      putIfAbsent: async row => {
        if (stage === 'write') throw new Error('canary-secret applicant@example.test');
        await f.store.putIfAbsent(row);
      },
    };
    const resolve = createAutomaticPersonnelPackResolver({ enabled: () => true, store, resolveClaims: f.claims,
      generate: async () => { if (stage === 'generate') throw new Error('canary-secret applicant@example.test'); return generated; } });
    const handler = createPersonnelPackPostHandler({ createLead: async () => assert.fail('must not save a lead'), resolveAsset: resolve,
      sendSubmissionNotice: async () => assert.fail('must not send'), sendApplicantDelivery: async () => assert.fail('must not send'),
      logDiagnostic: (code, meta) => diagnostics.push({ code, meta }) });
    const response = await handler(request({ email: 'applicant@example.test', accredType: 'iso15189' }));
    assert.equal(response.status, 503, stage);
    assert.equal((await response.json()).code, 'asset_unavailable');
    assert.doesNotMatch(JSON.stringify(diagnostics), /canary-secret|applicant@example/);
  }
});

test('unsupported choices and absent claim configuration cannot generate or store', async () => {
  const f = fixture();
  const resolve = createAutomaticPersonnelPackResolver({ enabled: () => true,
    store: { read: async () => assert.fail('must not read'), putIfAbsent: async () => assert.fail('must not write') },
    resolveClaims: () => null });
  for (const choice of [null, '', 'cap', '__proto__', 'unknown']) assert.equal(await resolve(choice, 'https://lims.bot'), null);
  await assert.rejects(resolve('iso15189', 'https://lims.bot'), /claim_unavailable/);
  assert.equal(f.rows.size, 0);
});

test('new storage and all sender flags default OFF; bundled delivery still uses single-use claims', async () => {
  for (const value of [undefined, '', 'false', '1', 'TRUE']) {
    assert.equal(automaticPdfEnabled({ PERSONNEL_PACK_AUTO_PDF_ENABLED: value }), false);
    assert.equal(personnelPackEmailEnabled({ PERSONNEL_PACK_EMAIL_ENABLED: value }), false);
  }
  assert.equal(automaticPdfEnabled({ PERSONNEL_PACK_AUTO_PDF_ENABLED: 'true' }), true);
  assert.equal(personnelPackEmailEnabled({ PERSONNEL_PACK_EMAIL_ENABLED: 'true' }), true);
  const f = fixture();
  const resolve = createAutomaticPersonnelPackResolver({ enabled: () => false,
    store: { read: async () => assert.fail('no new storage'), putIfAbsent: async () => assert.fail('no new storage') },
    resolveClaims: f.claims, generate: async () => assert.fail('no generation') });
  const result = await resolve('iso15189', 'https://lims.bot');
  assert.ok(result);
  const url = new URL(result.assetUrl);
  assert.equal(url.searchParams.get('asset'), 'iso15189');
  assert.equal(f.claims().verify(url.searchParams.get('claim')!, 'iso15189').ok, true);
  const post = createPersonnelPackClaimPostHandler(f.claims);
  assert.equal((await post(redeem(result.assetUrl))).status, 200);
  assert.equal((await post(redeem(result.assetUrl))).status, 401);
  assert.equal(result?.emailed, false);
});

test('stored artifact rejects wrong source, version, digest, truncated bytes and non-PDF data', async () => {
  const row = artifact(await generated);
  for (const bad of [
    { ...row, key: 'different' }, { ...row, sourceSha256: 'different' }, { ...row, sha256: 'different' },
    artifact(Buffer.from('not a PDF')), artifact(Buffer.from('%PDF-' + 'x'.repeat(200))),
    artifact(Buffer.from('%PDF-' + 'x'.repeat(2_000_000) + '%%EOF')),
  ]) assert.throws(() => verifyPersonnelPackPdf(bad), /integrity_failed/);
});

test('Prisma artifact adapter reuses storage across instances and binds values instead of SQL interpolation', async () => {
  const rows = new Map<string, PersonnelPackPdfArtifact>();
  const client = {
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      assert.match(strings.join('?'), /ON CONFLICT \("key"\) DO NOTHING/);
      const [key, sourceSha256, sha256, bytes] = values as [string, string, string, Uint8Array];
      if (rows.has(key)) return 0;
      rows.set(key, { key, sourceSha256, sha256, bytes });
      return 1;
    },
    async $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
      assert.match(strings.join('?'), /WHERE "key" = \?/);
      assert.equal(values.length, 1);
      return (rows.has(values[0] as string) ? [rows.get(values[0] as string)] : []) as T;
    },
  };
  await ensurePersonnelPackPdf(createPrismaPersonnelPackPdfStore(client), () => generated);
  const restarted = createPrismaPersonnelPackPdfStore(client);
  assert.deepEqual(await ensurePersonnelPackPdf(restarted, async () => assert.fail('already stored')), await generated);
  assert.equal(rows.size, 1);
});

test('Prisma claim adapter has cross-instance atomic replay protection and database expiry check', async () => {
  const consumed = new Set<string>();
  const client = { async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join('?');
    assert.match(sql, /ON CONFLICT \("jti"\) DO NOTHING/);
    assert.match(sql, /CURRENT_TIMESTAMP/);
    const jti = values[0] as string;
    if (consumed.has(jti)) return 0;
    consumed.add(jti); return 1;
  } };
  const services = [1, 2].map(() => createDownloadClaimService({ secret: fixtureSecret, store: createPrismaDownloadClaimStore(client) }));
  const token = services[0].issue(GENERATED_PACK_KEY);
  const results = await Promise.all(services.map(s => s.verifyAndConsume(token, GENERATED_PACK_KEY)));
  assert.equal(results.filter(r => r.ok).length, 1);
});

test('hostile claims and storage errors do not expose PII, secret values or token contents in diagnostics', async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args));
  const service = fixture().claims();
  const key = 'canary-secret applicant@example.test';
  const token = service.issue(key);
  const url = `https://lims.bot/api/personnel-pack-download?${new URLSearchParams({ asset: key, claim: token })}`;
  const post = createPersonnelPackClaimPostHandler(() => service, async () => { throw new Error(key); });
  assert.equal((await post(redeem(url))).status, 503);
  const bad = new URL(url); bad.searchParams.set('claim', 'invalid');
  assert.equal((await post(redeem(bad.toString()))).status, 401);
  assert.doesNotMatch(JSON.stringify(logs), /canary-secret|applicant@example/);
  assert.ok(!JSON.stringify(logs).includes(token));
});

test('claim loader checks expiry again after a slow download before consuming', async () => {
  const f = fixture();
  const service = f.claims();
  let expired = false;
  const guarded: DownloadClaimService = { ...service,
    async verifyAndConsume() { assert.equal(expired, true); return { ok: false, code: 'download_claim_expired' }; } };
  const token = guarded.issue(GENERATED_PACK_KEY);
  const url = `https://lims.bot/api/personnel-pack-download?${new URLSearchParams({ asset: GENERATED_PACK_KEY, claim: token })}`;
  const post = createPersonnelPackClaimPostHandler(() => guarded, async () => {
    expired = true;
    return { asset: { downloadFilename: GENERATED_PACK_FILENAME }, bytes: await generated };
  });
  assert.equal((await post(redeem(url))).status, 401);
  assert.equal(f.used.size, 0);
});

test('claim service expires exactly at the deadline and carries no recipient identity', () => {
  const service = createDownloadClaimService({ secret: fixtureSecret, ttlMs: 15 * 60_000, createJti: randomUUID,
    store: { consume: async (_payload: DownloadClaimPayload) => true } });
  const token = service.issue(GENERATED_PACK_KEY, 1000);
  assert.equal(service.verify(token, GENERATED_PACK_KEY, 900999).ok, true);
  assert.deepEqual(service.verify(token, GENERATED_PACK_KEY, 901000), { ok: false, code: 'download_claim_expired' });
  assert.deepEqual(Object.keys(JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())).sort(), ['asset', 'exp', 'jti']);
});

test('CI explicitly runs the named fulfillment regression and live route wires gated generation and sends', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(pkg.scripts['test:personnel-pack'], /tests\/personnel-pack-fulfillment\.test\.ts/);
  const route = await readFile('app/api/personnel-pack-download/route.ts', 'utf8');
  assert.match(route, /resolveAsset: resolveAutomaticPersonnelPack/);
  assert.match(route, /personnelPackEmailEnabled\(\) \? \{/);
  assert.match(route, /createPersonnelPackGetHandler\(configuredDownloadClaimService, loadPersonnelPackDownload\)/);
  const claim = await readFile('app/api/personnel-pack-download/claim/route.ts', 'utf8');
  assert.match(claim, /createPersonnelPackClaimPostHandler\(configuredDownloadClaimService, loadPersonnelPackDownload\)/);
});


test('both fulfillment modes fail closed when the shared claim secret is absent', async () => {
  for (const enabled of [false, true]) {
    const resolve = createAutomaticPersonnelPackResolver({ enabled: () => enabled,
      store: { read: async () => assert.fail('no storage'), putIfAbsent: async () => assert.fail('no storage') },
      resolveClaims: () => null });
    assert.equal(await resolve('unsupported', 'https://lims.bot'), null);
    await assert.rejects(resolve('iso15189', 'https://lims.bot'), /claim_unavailable/);
  }
});

test('bundled and generated fulfillment use the configured #124 signing secret', async t => {
  const previous = process.env.PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET;
  t.after(() => {
    if (previous === undefined) delete process.env.PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET;
    else process.env.PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET = previous;
  });
  process.env.PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET = fixtureSecret;
  const f = fixture();
  for (const enabled of [false, true]) {
    const resolve = createAutomaticPersonnelPackResolver({ enabled: () => enabled, store: f.store,
      resolveClaims: configuredDownloadClaimService, generate: () => generated });
    const delivery = await resolve('iso15189', 'https://lims.bot');
    assert.ok(delivery);
    const url = new URL(delivery.assetUrl);
    assert.equal(f.claims().verify(url.searchParams.get('claim')!, url.searchParams.get('asset')!).ok, true);
  }
});
