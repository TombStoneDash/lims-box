import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROLE_CAPABILITY_MATRIX,
  can,
  capabilitiesFor,
  type OHWorksRole,
  type OHWorksCapability,
} from '../../lib/ohworks-role-capability-matrix';

// Bounded synthetic policy only; no real identities or personnel records.
const ROLES: OHWorksRole[] = [
  'FRONT_DESK', 'TRAINEE', 'ANALYST', 'SENIOR_ANALYST',
  'LAB_DIRECTOR', 'QUALITY_MANAGER', 'IT_ADMIN',
];

test('add on every exported role set throws and leaves can/capabilitiesFor unchanged', () => {
  for (const role of ROLES) {
    const before = capabilitiesFor(role);
    assert.throws(() => {
      (ROLE_CAPABILITY_MATRIX[role] as Set<OHWorksCapability>).add('MANAGE_USERS');
    }, TypeError);
    assert.equal(can(role, 'MANAGE_USERS'), role === 'IT_ADMIN');
    assert.deepEqual(capabilitiesFor(role), before);
  }
});

test('delete on every exported role set throws and leaves can/capabilitiesFor unchanged', () => {
  for (const role of ROLES) {
    const before = capabilitiesFor(role);
    assert.throws(() => {
      (ROLE_CAPABILITY_MATRIX[role] as Set<OHWorksCapability>).delete('VIEW_RESULTS');
    }, TypeError);
    assert.equal(can(role, 'VIEW_RESULTS'), true);
    assert.deepEqual(capabilitiesFor(role), before);
  }
});

test('clear on every exported role set throws and leaves can/capabilitiesFor unchanged', () => {
  for (const role of ROLES) {
    const before = capabilitiesFor(role);
    assert.throws(() => {
      (ROLE_CAPABILITY_MATRIX[role] as Set<OHWorksCapability>).clear();
    }, TypeError);
    assert.deepEqual(capabilitiesFor(role), before);
    assert.ok(before.length > 0);
  }
});

test('read behaviour on exported sets is unchanged: has, size, and iteration', () => {
  for (const role of ROLES) {
    const expected = capabilitiesFor(role);
    const exported = ROLE_CAPABILITY_MATRIX[role];
    assert.equal(exported.size, expected.length);
    for (const capability of expected) {
      assert.ok(exported.has(capability));
    }
    assert.deepEqual([...exported].sort(), expected);
  }
});

test('repeated mutation attempts across roles never alter any permission answer', () => {
  const beforeAll = ROLES.map((role) => capabilitiesFor(role));
  for (const role of ROLES) {
    const target = ROLE_CAPABILITY_MATRIX[role] as Set<OHWorksCapability>;
    assert.throws(() => target.add('MANAGE_USERS'), TypeError);
    assert.throws(() => target.delete('VIEW_RESULTS'), TypeError);
    assert.throws(() => target.clear(), TypeError);
  }
  ROLES.forEach((role, index) => {
    assert.deepEqual(capabilitiesFor(role), beforeAll[index]);
  });
});
