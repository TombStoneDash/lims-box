import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { before } from 'node:test';
import { NextRequest } from 'next/server';
import { PERSONNEL_PACK_PUBLIC_ASSETS } from '../lib/personnelPackFulfillment';

const CLAIM_SECRET = 'test-only-personnel-pack-download-claim-secret';

let GET: (request: NextRequest) => Promise<Response>;

// The route module reads PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET once at import
// time, so the env var must be set before it is first imported.
before(async () => {
  process.env.PERSONNEL_PACK_DOWNLOAD_CLAIM_SECRET = CLAIM_SECRET;
  ({ GET } = await import('../app/api/personnel-pack-download/route'));
});

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
  const response = await GET(downloadRequest('?asset=iso15189'));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename="${PERSONNEL_PACK_PUBLIC_ASSETS.iso15189.downloadFilename}"`,
  );
});

test('a valid, fresh, matching claim preserves current behavior and returns the artifact', async () => {
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
  const response = await GET(downloadRequest('?asset=iso15189&claim=not-a-real-claim'));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('a claim with a tampered signature fails closed', async () => {
  const claim = validClaim();
  const [body] = claim.split('.');
  const tampered = `${body}.not-the-real-signature`;

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(tampered)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('a claim with a tampered payload fails closed even with a syntactically valid signature', async () => {
  const claim = validClaim();
  const [, signature] = claim.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ asset: 'iso15189', exp: Date.now() + 60_000, jti: 'forged' }), 'utf8').toString('base64url');
  const forged = `${forgedBody}.${signature}`;

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(forged)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('a claim whose payload is not valid JSON fails closed as malformed', async () => {
  const body = Buffer.from('not json', 'utf8').toString('base64url');
  const signature = createHmac('sha256', CLAIM_SECRET).update(body).digest('base64url');
  const claim = `${body}.${signature}`;

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('a claim missing a required field fails closed as malformed', async () => {
  const body = Buffer.from(JSON.stringify({ asset: 'iso15189', jti: randomUUID() }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', CLAIM_SECRET).update(body).digest('base64url');
  const claim = `${body}.${signature}`;

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});

test('an expired claim fails closed and never returns the artifact', async () => {
  const claim = validClaim({ exp: Date.now() - 1_000 });

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_expired');
});

test('a claim minted for a different asset fails closed as mismatched', async () => {
  const claim = validClaim({ asset: 'some-other-asset' });

  const response = await GET(downloadRequest(`?asset=iso15189&claim=${encodeURIComponent(claim)}`));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_mismatched');
});

test('a replayed claim succeeds once and fails closed on reuse', async () => {
  const claim = validClaim();
  const query = `?asset=iso15189&claim=${encodeURIComponent(claim)}`;

  const first = await GET(downloadRequest(query));
  assert.equal(first.status, 200);

  const second = await GET(downloadRequest(query));
  assert.equal(second.status, 401);
  assert.equal((await second.json()).code, 'download_claim_replayed');
});

test('an empty claim value fails closed instead of being treated as no claim', async () => {
  const response = await GET(downloadRequest('?asset=iso15189&claim='));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'download_claim_malformed');
});
