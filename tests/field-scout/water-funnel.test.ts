import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FIELD_SCOUT_ATTRIBUTION,
  FIELD_SCOUT_DEMO_ASSETS,
  FIELD_SCOUT_EARLY_ADOPTER_URL,
} from '../../lib/fieldScout';

test('water-lane CTA preserves the approved attribution contract', () => {
  assert.equal(
    FIELD_SCOUT_EARLY_ADOPTER_URL,
    '/early-adopter?utm_source=field_scout&utm_medium=product&utm_campaign=water_lane&utm_content=walkthrough',
  );
  assert.deepEqual(FIELD_SCOUT_ATTRIBUTION, {
    utm_source: 'field_scout',
    utm_medium: 'product',
    utm_campaign: 'water_lane',
    utm_content: 'walkthrough',
  });
});

test('demo registry is synthetic and uses stable non-customer identifiers', () => {
  assert.equal(FIELD_SCOUT_DEMO_ASSETS.length, 3);
  for (const asset of FIELD_SCOUT_DEMO_ASSETS) {
    assert.match(asset.id, /^WATER-DEMO-\d{3}$/);
  }
});

test('route states the safety boundaries and links the attributed CTA', async () => {
  const page = await readFile('app/field-scout/page.tsx', 'utf8');

  assert.match(page, /no PHI and no production data/i);
  assert.match(page, /Human approval is mandatory/i);
  assert.match(page, /does not discover unauthorized equipment/i);
  assert.match(page, /FIELD_SCOUT_EARLY_ADOPTER_URL/);
});

test('early-adopter form renders a water-lane variant without bypassing the shared API', async () => {
  const page = await readFile('app/early-adopter/page.tsx', 'utf8');

  assert.match(page, /utm_campaign/);
  assert.match(page, /water_lane/);
  assert.match(page, /Environmental \/ Water Testing/);
  assert.match(page, /Field Scout Water-Lab Pilot/);
  assert.match(page, /fetch\('\/api\/early-access'/);
});
