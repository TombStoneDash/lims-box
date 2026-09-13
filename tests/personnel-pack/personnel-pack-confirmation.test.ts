import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolvePersonnelPackConfirmation,
  type PersonnelPackAssetLookup,
} from '../../lib/personnelPackConfirmation';

const APPROVED_ASSET = {
  approved: true,
  downloadUrl: 'https://lims.bot/api/personnel-pack-download?asset=iso15189',
  packLabel: 'ISO 15189 Personnel Pack v1.5',
};

function lookupReturning(
  asset: Awaited<ReturnType<PersonnelPackAssetLookup>>,
): PersonnelPackAssetLookup {
  return async () => asset;
}

test('configured, approved asset with a working URL resolves to an automatic-download outcome', async () => {
  const calls: string[] = [];
  const outcome = await resolvePersonnelPackConfirmation('iso15189', async (selection) => {
    calls.push(selection);
    return APPROVED_ASSET;
  });

  assert.deepEqual(outcome, {
    kind: 'automatic-download',
    packLabel: APPROVED_ASSET.packLabel,
    downloadUrl: APPROVED_ASSET.downloadUrl,
  });
  assert.deepEqual(calls, ['iso15189']);
});

test('trims the selection before handing it to the injected lookup', async () => {
  const calls: string[] = [];
  await resolvePersonnelPackConfirmation('  iso15189  ', async (selection) => {
    calls.push(selection);
    return APPROVED_ASSET;
  });

  assert.deepEqual(calls, ['iso15189']);
});

test('null, undefined, and empty selections fail closed without calling the lookup', async () => {
  for (const selection of [null, undefined, '', '   ']) {
    let called = false;
    const outcome = await resolvePersonnelPackConfirmation(selection, async () => {
      called = true;
      return APPROVED_ASSET;
    });

    assert.equal(called, false);
    assert.deepEqual(outcome, { kind: 'manual-fulfillment', reason: 'unknown_selection' });
  }
});

test('an unconfigured selection (lookup returns null) fails closed as unknown_selection', async () => {
  const outcome = await resolvePersonnelPackConfirmation('clia', lookupReturning(null));
  assert.deepEqual(outcome, { kind: 'manual-fulfillment', reason: 'unknown_selection' });
});

test('a configured but non-approved asset fails closed as asset_not_approved', async () => {
  const outcome = await resolvePersonnelPackConfirmation(
    'iso15189',
    lookupReturning({ ...APPROVED_ASSET, approved: false }),
  );
  assert.deepEqual(outcome, { kind: 'manual-fulfillment', reason: 'asset_not_approved' });
});

test('malformed download URLs fail closed as asset_url_invalid without throwing', async () => {
  const malformedUrls = ['not-a-url', '', '   ', 'javascript:alert(1)', '//missing-protocol.example'];

  for (const downloadUrl of malformedUrls) {
    const outcome = await resolvePersonnelPackConfirmation(
      'iso15189',
      lookupReturning({ ...APPROVED_ASSET, downloadUrl }),
    );
    assert.deepEqual(
      outcome,
      { kind: 'manual-fulfillment', reason: 'asset_url_invalid' },
      `expected "${downloadUrl}" to fail closed`,
    );
  }
});

test('http and https download URLs are both accepted as working', async () => {
  for (const downloadUrl of ['https://lims.bot/pack.pdf', 'http://localhost:3000/pack.pdf']) {
    const outcome = await resolvePersonnelPackConfirmation(
      'iso15189',
      lookupReturning({ ...APPROVED_ASSET, downloadUrl }),
    );
    assert.deepEqual(outcome, {
      kind: 'automatic-download',
      packLabel: APPROVED_ASSET.packLabel,
      downloadUrl,
    });
  }
});

test('lookup errors fail closed as asset_lookup_failed without leaking the raw error', async () => {
  const outcome = await resolvePersonnelPackConfirmation('iso15189', async () => {
    throw new Error('relation "personnel_pack_assets" does not exist at db=prod-1234');
  });

  assert.deepEqual(outcome, { kind: 'manual-fulfillment', reason: 'asset_lookup_failed' });
  assert.doesNotMatch(JSON.stringify(outcome), /prod-1234|relation|does not exist/i);
});

test('a rejected lookup promise fails closed the same as a thrown error', async () => {
  const outcome = await resolvePersonnelPackConfirmation(
    'iso15189',
    () => Promise.reject(new Error('network timeout')),
  );

  assert.deepEqual(outcome, { kind: 'manual-fulfillment', reason: 'asset_lookup_failed' });
});

test('outcomes never include applicant PII fields regardless of branch taken', async () => {
  const piiKeys = ['email', 'applicant', 'name', 'firstName', 'lastName', 'phone', 'address'];

  const outcomes = await Promise.all([
    resolvePersonnelPackConfirmation('iso15189', lookupReturning(APPROVED_ASSET)),
    resolvePersonnelPackConfirmation('iso15189', lookupReturning(null)),
    resolvePersonnelPackConfirmation('iso15189', lookupReturning({ ...APPROVED_ASSET, approved: false })),
    resolvePersonnelPackConfirmation('iso15189', lookupReturning({ ...APPROVED_ASSET, downloadUrl: 'bad' })),
    resolvePersonnelPackConfirmation(null, lookupReturning(APPROVED_ASSET)),
    resolvePersonnelPackConfirmation('iso15189', async () => {
      throw new Error('user@example.com lookup failed');
    }),
  ]);

  for (const outcome of outcomes) {
    for (const key of piiKeys) {
      assert.equal(Object.prototype.hasOwnProperty.call(outcome, key), false);
    }
    assert.doesNotMatch(JSON.stringify(outcome), /@/);
  }
});

test('manual-fulfillment outcomes expose only kind and a fixed reason code', async () => {
  const outcome = await resolvePersonnelPackConfirmation('clia', lookupReturning(null));
  assert.deepEqual(Object.keys(outcome).sort(), ['kind', 'reason']);
});

test('automatic-download outcomes expose only kind, packLabel, and downloadUrl', async () => {
  const outcome = await resolvePersonnelPackConfirmation('iso15189', lookupReturning(APPROVED_ASSET));
  assert.deepEqual(Object.keys(outcome).sort(), ['downloadUrl', 'kind', 'packLabel']);
});
