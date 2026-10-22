/**
 * F2 sandbox end-to-end proof for the Personnel Pack money path, run against a
 * Vercel PREVIEW deployment only (never production):
 *   email gate POST -> claim link minted -> GET confirm page -> POST claim -> PDF
 *   -> same claim again refused (download_claim_replayed) -> bogus claim refused
 *   (download_claim_malformed).
 *
 * The request address is Resend's sink (delivered@resend.dev): no mailbox, no
 * customer. Skipped unless PP_SANDBOX_PREVIEW_URL is set AND
 * PP_SANDBOX_E2E_CONFIRM=preview, so `npm run test:all` never touches a network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const SINK_ADDRESS = 'delivered@resend.dev';
const previewUrl = process.env.PP_SANDBOX_PREVIEW_URL ?? '';
const confirmed = process.env.PP_SANDBOX_E2E_CONFIRM === 'preview';
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export function assertPreviewTarget(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('preview_url must be https');
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('.vercel.app') || /^(www\.)?lims(-?box)?\.(bot|com)$/.test(host)) {
    throw new Error(`refusing non-preview target ${host}`);
  }
  return url;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return bypass ? { 'x-vercel-protection-bypass': bypass, ...extra } : extra;
}

async function redeem(base: URL, asset: string, claim: string) {
  const form = new FormData();
  form.set('asset', asset);
  form.set('claim', claim);
  return fetch(new URL('/api/personnel-pack-download/claim', base), {
    method: 'POST', body: form, headers: headers({ accept: 'application/json' }), redirect: 'manual',
  });
}

test('preview guard refuses production and non-https hosts', () => {
  assert.throws(() => assertPreviewTarget('https://lims.bot'));
  assert.throws(() => assertPreviewTarget('https://limsbox.com'));
  assert.throws(() => assertPreviewTarget('http://lims-box-git-x.vercel.app'));
  assert.equal(assertPreviewTarget('https://lims-box-git-feat-x-tombstonedash.vercel.app').hostname,
    'lims-box-git-feat-x-tombstonedash.vercel.app');
});

test('personnel pack sandbox e2e: gate -> claim -> download -> replay refused',
  { skip: !(previewUrl && confirmed) && 'set PP_SANDBOX_PREVIEW_URL and PP_SANDBOX_E2E_CONFIRM=preview' },
  async () => {
    const base = assertPreviewTarget(previewUrl);
    const gate = await fetch(new URL('/api/personnel-pack-download', base), {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ email: SINK_ADDRESS, accredType: 'iso15189' }),
    });
    assert.equal(gate.status, 200, `gate POST ${gate.status}`);
    const { delivery } = await gate.json() as { delivery: { assetUrl: string } };
    const link = new URL(delivery.assetUrl);
    const asset = link.searchParams.get('asset');
    const claim = link.searchParams.get('claim');
    assert.ok(asset && claim, 'delivery link carries asset + claim');

    const confirm = await fetch(new URL(`${link.pathname}${link.search}`, base), { headers: headers() });
    assert.equal(confirm.status, 200, 'GET with claim shows confirm page without consuming');

    const download = await redeem(base, asset, claim);
    assert.equal(download.status, 200, `first redeem ${download.status}`);
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');

    const replay = await redeem(base, asset, claim);
    assert.equal(replay.status, 401);
    assert.equal((await replay.json() as { code: string }).code, 'download_claim_replayed');

    const bogus = await redeem(base, asset, 'not-a-real-claim');
    assert.equal(bogus.status, 401);
    assert.equal((await bogus.json() as { code: string }).code, 'download_claim_malformed');
  });
