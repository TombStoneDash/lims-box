import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  createPersonnelPackGetHandler,
  GET as publicGet,
} from '../app/api/personnel-pack-download/route';
import {
  createDownloadClaimService,
  type DownloadClaimPayload,
  type DownloadClaimStore,
} from '../lib/personnelPackDownloadClaims';
import { PERSONNEL_PACK_PUBLIC_ASSETS } from '../lib/personnelPackFulfillment';

const CLAIM_SECRET = 'test-only-personnel-pack-download-claim-secret';

class SyntheticDurableStore implements DownloadClaimStore {
  readonly consumed = new Set<string>();
  available = true;

  async consume(payload: DownloadClaimPayload): Promise<boolean> {
    if (!this.available) throw new Error('synthetic durable store unavailable');
    if (this.consumed.has(payload.jti)) return false;
    this.consumed.add(payload.jti);
    return true;
  }
}

function claimedGet(store = new SyntheticDurableStore()) {
  const service = createDownloadClaimService({ secret: CLAIM_SECRET, store });
  return {
    GET: createPersonnelPackGetHandler(() => service),
    service,
    store,
  };
}

function downloadRequest(query: string): NextRequest {
  return new NextRequest(`https://lims.bot/api/personnel-pack-download${query}`);
}

/** Mirrors the route's own claim format so tests can mint claims without exporting internals. */
function signClaim(payload: { asset: string; exp: number; jti: string }): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', CLAIM_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function validClaim(overrides: Partial<{ asset: string; exp: number; jti: string }> = {}): string {
  return signClaim({
    asset: 'iso15189',
    exp: Date.now() + 15 * 60 * 1000,
    jti: randomUUID(),
    ...overrides,
  });
}

test('a request with no claim preserves current unauthenticated behavior', async () => {
  const response = await publicGet(downloadRequest('?asset=iso15189'));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename="${PERSONNEL_PACK_PUBLIC_ASSETS.iso15189.downloadFilename}"`,
  );
});

test('a valid, fresh, matching claim preserves current behavior and returns the artifact', async () => {
  const { GET } = claimedGet();
  const claim = validClaim();
  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename="${PERSONNEL_PACK_PUBLIC_ASSETS.iso15189.downloadFilename}"`,
  );

  const expectedBytes = await readFile(
    path.join(process.cwd(), 'public', PERSONNEL_PACK_PUBLIC_ASSETS.iso15189.publicPath.replace(/^\//, '')),
  );
  const actualBytes = Buffer.from(await response.arrayBuffer());
  assert.ok(actualBytes.equals(expectedBytes));
});

test('a structurally malformed claim (no signature separator) fails closed', async () => {
  const { GET } = claimedGet();
  const response = await GET(downloadRequest('?asset=iso15189&claim=not-a-real-claim'));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('a claim with a tampered signature fails closed', async () => {
  const { GET } = claimedGet();
  const claim = validClaim();
  const [body] = claim.split('.');
  const tampered = `${body}.not-the-real-signature`;

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(tampered)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('a claim with a tampered payload fails closed even with a syntactically valid signature', async () => {
  const { GET } = claimedGet();
  const claim = validClaim();
  const [, signature] = claim.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ asset: 'iso15189', exp: Date.now() + 60_000, jti: 'forged' }), 'utf8').toString('base64url');
  const forged = `${forgedBody}.${signature}`;

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(forged)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('a claim whose payload is not valid JSON fails closed as malformed', async () => {
  const { GET } = claimedGet();
  const body = Buffer.from('not json', 'utf8').toString('base64url');
  const signature = createHmac('sha256', CLAIM_SECRET).update(body).digest('base64url');
  const claim = `${body}.${signature}`;

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('a claim missing a required field fails closed as malformed', async () => {
  const { GET } = claimedGet();
  const body = Buffer.from(JSON.stringify({ asset: 'iso15189', jti: randomUUID() }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', CLAIM_SECRET).update(body).digest('base64url');
  const claim = `${body}.${signature}`;

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('an expired claim fails closed and never returns the artifact', async () => {
  const { GET } = claimedGet();
  const claim = validClaim({ exp: Date.now() - 1_000 });

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_expired');
});

test('a claim minted for a different asset fails closed as mismatched', async () => {
  const { GET } = claimedGet();
  const claim = validClaim({ asset: 'some-other-asset' });

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_mismatched');
});

test('a replayed claim succeeds once and fails closed on reuse', async () => {
  const { GET } = claimedGet();
  const claim = validClaim();
  const query = `?asset=iso15189&claim=${encodeURIComponent(claim)}`;

  const first = await GET(downloadRequest(query));
  assert.equal(first.status, 200);

  const second = await GET(downloadRequest(query));
  assert.equal(second.status, 401);
  assert.equal((await second.json()).code, 'download_claim_replayed');
});

test('an empty claim value fails closed instead of being treated as no claim', async () => {
  const { GET } = claimedGet();
  const response = await GET(downloadRequest('?asset=iso15189&claim='));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('independent instances sharing durable storage accept a claim at most once after restart', async () => {
  const store = new SyntheticDurableStore();
  const firstInstance = claimedGet(store);
  const restartedInstance = claimedGet(store);
  const claim = firstInstance.service.issue('iso15189', Date.now());
  const query = `?asset=iso15189&claim=${encodeURIComponent(claim)}`;

  const first = await firstInstance.GET(downloadRequest(query));
  const replayAfterRestart = await restartedInstance.GET(downloadRequest(query));

  assert.equal(first.status, 200);
  assert.equal(replayAfterRestart.status, 401);
  assert.equal((await replayAfterRestart.json()).code, 'download_claim_replayed');
});

test('concurrent independent instances produce exactly one successful redemption', async () => {
  const store = new SyntheticDurableStore();
  const firstInstance = claimedGet(store);
  const secondInstance = claimedGet(store);
  const claim = firstInstance.service.issue('iso15189', Date.now());
  const query = `?asset=iso15189&claim=${encodeURIComponent(claim)}`;

  const responses = await Promise.all([
    firstInstance.GET(downloadRequest(query)),
    secondInstance.GET(downloadRequest(query)),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401]);

  const rejected = responses.find((response) => response.status === 401);
  assert.ok(rejected);
  assert.equal((await rejected.json()).code, 'download_claim_replayed');
});

test('missing stable signing configuration fails closed before returning the artifact', async () => {
  const GET = createPersonnelPackGetHandler(() => null);
  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(validClaim())}`));

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'download_claim_unavailable');
});

test('unavailable durable storage fails closed before returning the artifact', async () => {
  const instance = claimedGet();
  instance.store.available = false;
  const claim = instance.service.issue('iso15189', Date.now());
  const response = await instance.GET(
    downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`),
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal((await response.json()).code, 'download_claim_unavailable');
});
