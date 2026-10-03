import assert from 'node:assert/strict';
import test from 'node:test';

import {
  requiresFullPpeChangeout,
  validateZoneTransition,
  ZONE_ORDER,
} from '../../lib/ohworks-molecular-zone-guard';

/** All fabricated: synthetic technologist identifiers and zone histories. */

test('rejects a proposed zone that is not on the mandated zone list', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-1',
    priorZonesVisitedThisShift: [],
    proposedZone: 'hallway',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.violationType, 'invalid_zone');
  assert.match(result.reason, /hallway/);
});

test('allows any valid zone as the first zone of the shift, noting an unusual start', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-2',
    priorZonesVisitedThisShift: [],
    proposedZone: 'amplification',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.violationType, null);
  assert.match(result.reason, /unusual/);
});

test('allows a valid forward progression through all four zones', () => {
  const visited: string[] = [];
  for (const zone of ZONE_ORDER) {
    const result = validateZoneTransition({
      technologistId: 'tech-synthetic-3',
      priorZonesVisitedThisShift: [...visited],
      proposedZone: zone,
    });
    assert.equal(result.allowed, true, `expected ${zone} to be allowed after visiting ${JSON.stringify(visited)}`);
    assert.equal(result.violationType, null);
    visited.push(zone);
  }
});

test('allows staying in the same zone as a repeat visit', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-4',
    priorZonesVisitedThisShift: ['reagent_prep', 'specimen_prep'],
    proposedZone: 'specimen_prep',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.violationType, null);
});

test('rejects backward movement from amplification back to specimen_prep', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-5',
    priorZonesVisitedThisShift: ['reagent_prep', 'specimen_prep', 'amplification'],
    proposedZone: 'specimen_prep',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.violationType, 'backward_movement');
  assert.match(result.reason, /amplification/);
  assert.match(result.reason, /specimen_prep/);
});

test('requiresFullPpeChangeout is false for the same zone and true for different zones', () => {
  assert.equal(requiresFullPpeChangeout('reagent_prep', 'reagent_prep'), false);
  assert.equal(requiresFullPpeChangeout('reagent_prep', 'specimen_prep'), true);
  assert.equal(requiresFullPpeChangeout('amplification', 'post_amplification'), true);
});
