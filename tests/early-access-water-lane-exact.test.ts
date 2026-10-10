import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEarlyAccessApplication } from '../lib/earlyAccessApplication';

const validBody = {
  labName: 'Synthetic Fixture Lab',
  contactName: 'Jamie Fixture',
  email: 'jamie@example.com',
  labType: 'Clinical / Medical',
  monthlyVolume: 'under-100',
  painPoint: 'Synthetic fixture pain point for testing.',
  dataUseAccepted: true,
};

const cases: Array<[string, 'clinical' | 'environmental']> = [
  ['ref=xyz;utm_campaign=water_lane_2026', 'clinical'],
  ['ref=xyz;utm_source=a;utm_campaign=water_lane-old', 'clinical'],
  ['ref=xyz;utm_campaign=water_lane', 'environmental'],
  ['ref=xyz;utm_campaign=water_lane;utm_content=x', 'environmental'],
];

for (const [source, expectedTrack] of cases) {
  test(`source ${JSON.stringify(source)} resolves to ${expectedTrack}`, () => {
    const result = validateEarlyAccessApplication(validBody, source);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.record.track, expectedTrack);
    }
  });
}
