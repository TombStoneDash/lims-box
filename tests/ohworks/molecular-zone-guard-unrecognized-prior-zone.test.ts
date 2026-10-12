import assert from 'node:assert/strict';
import test from 'node:test';

import { validateZoneTransition } from '../../lib/ohworks-molecular-zone-guard';

/** All fabricated: synthetic technologist identifiers and zone histories. */

test('rejects a misspelled prior visited zone instead of silently ignoring it', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-unrecognized-1',
    priorZonesVisitedThisShift: ['post-amplification'],
    proposedZone: 'reagent_prep',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.violationType, 'invalid_zone');
  assert.match(result.reason, /post-amplification/);
  assert.doesNotMatch(result.reason, /undefined/);
});

test('rejects a differently-cased prior visited zone instead of silently ignoring it', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-unrecognized-2',
    priorZonesVisitedThisShift: ['Post_Amplification'],
    proposedZone: 'reagent_prep',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.violationType, 'invalid_zone');
  assert.match(result.reason, /Post_Amplification/);
  assert.doesNotMatch(result.reason, /undefined/);
});

test('rejects an empty-string prior visited zone instead of silently ignoring it', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-unrecognized-3',
    priorZonesVisitedThisShift: [''],
    proposedZone: 'reagent_prep',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.violationType, 'invalid_zone');
  assert.doesNotMatch(result.reason, /undefined/);
});

test('still rejects backward movement for a valid, recognized history', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-valid-1',
    priorZonesVisitedThisShift: ['reagent_prep', 'post_amplification'],
    proposedZone: 'reagent_prep',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.violationType, 'backward_movement');
});

test('still allows forward movement for a valid, recognized history', () => {
  const result = validateZoneTransition({
    technologistId: 'tech-synthetic-valid-2',
    priorZonesVisitedThisShift: ['reagent_prep'],
    proposedZone: 'post_amplification',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.violationType, null);
});
