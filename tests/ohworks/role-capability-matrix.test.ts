import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROLE_CAPABILITY_MATRIX,
  can,
  capabilitiesFor,
  rolesWithCapability,
  describeMatrix,
  type OHWorksRole,
  type OHWorksCapability,
} from '../../lib/ohworks-role-capability-matrix';

// Bounded synthetic policy only; no real identities or personnel records.
const ROLES: OHWorksRole[] = [
  'FRONT_DESK', 'TRAINEE', 'ANALYST', 'SENIOR_ANALYST',
  'LAB_DIRECTOR', 'QUALITY_MANAGER', 'IT_ADMIN',
];
const CAPABILITIES: OHWorksCapability[] = [
  'VIEW_RESULTS', 'ENTER_RESULTS', 'VERIFY_RESULTS', 'PUBLISH_REPORTS',
  'AMEND_PUBLISHED_REPORTS', 'MANAGE_QC_RULES', 'MANAGE_USERS',
  'EXPORT_AUDIT_LOG', 'CONFIGURE_INSTRUMENTS',
];

test('the matrix covers exactly the known roles and every role can view results', () => {
  assert.deepEqual(Object.keys(ROLE_CAPABILITY_MATRIX).sort(), [...ROLES].sort());
  for (const role of ROLES) {
    assert.ok(ROLE_CAPABILITY_MATRIX[role].has('VIEW_RESULTS'));
    assert.equal(can(role, 'VIEW_RESULTS'), true);
    for (const capability of ROLE_CAPABILITY_MATRIX[role]) {
      assert.ok(CAPABILITIES.includes(capability));
    }
  }
});

test('IT administration grants no clinical entry, verification, publishing, or amendment', () => {
  for (const capability of ['ENTER_RESULTS', 'VERIFY_RESULTS', 'PUBLISH_REPORTS', 'AMEND_PUBLISHED_REPORTS']) {
    assert.equal(can('IT_ADMIN', capability), false);
  }
});

test('user and instrument administration follow the stricter IT-only default', () => {
  // Clinical oversight does not grant user or instrument administration.
  assert.deepEqual(rolesWithCapability('MANAGE_USERS'), ['IT_ADMIN']);
  assert.deepEqual(rolesWithCapability('CONFIGURE_INSTRUMENTS'), ['IT_ADMIN']);
});

test('clinical progression and quality oversight have exact least-privilege defaults', () => {
  const expected: Record<OHWorksRole, OHWorksCapability[]> = {
    FRONT_DESK: ['VIEW_RESULTS'],
    TRAINEE: ['VIEW_RESULTS', 'ENTER_RESULTS'],
    ANALYST: ['VIEW_RESULTS', 'ENTER_RESULTS', 'VERIFY_RESULTS'],
    SENIOR_ANALYST: ['VIEW_RESULTS', 'ENTER_RESULTS', 'VERIFY_RESULTS', 'PUBLISH_REPORTS'],
    LAB_DIRECTOR: ['VIEW_RESULTS', 'ENTER_RESULTS', 'VERIFY_RESULTS', 'PUBLISH_REPORTS',
      'AMEND_PUBLISHED_REPORTS', 'MANAGE_QC_RULES', 'EXPORT_AUDIT_LOG'],
    QUALITY_MANAGER: ['VIEW_RESULTS', 'MANAGE_QC_RULES', 'EXPORT_AUDIT_LOG'],
    IT_ADMIN: ['VIEW_RESULTS', 'MANAGE_USERS', 'CONFIGURE_INSTRUMENTS'],
  };
  for (const role of ROLES) {
    assert.deepEqual(capabilitiesFor(role), expected[role].sort());
  }
});

test('unknown values fail closed without throwing or coercion', () => {
  const invalid: unknown[] = [
    'garbage', '', 'analyst', ' ANALYST', 'VIEW_RESULTS ', '__proto__', 'constructor',
    null, undefined, 42, NaN, true, Symbol('unknown'), [], {},
    { toString() { throw new Error('must not coerce'); } },
  ];
  for (const value of invalid) {
    assert.doesNotThrow(() => {
      assert.equal(can(value, 'VIEW_RESULTS'), false);
      assert.equal(can('LAB_DIRECTOR', value), false);
      assert.equal(can(value, value), false);
      assert.deepEqual(capabilitiesFor(value), []);
      assert.deepEqual(rolesWithCapability(value), []);
    });
  }
});

test('both sorted listing helpers round-trip with can for every role and capability', () => {
  for (const role of ROLES) {
    const capabilities = capabilitiesFor(role);
    assert.deepEqual(capabilities, [...capabilities].sort());
    for (const capability of CAPABILITIES) {
      const roles = rolesWithCapability(capability);
      assert.deepEqual(roles, [...roles].sort());
      assert.equal(capabilities.includes(capability), can(role, capability));
      assert.equal(roles.includes(role), can(role, capability));
      assert.equal(can(role, capability), ROLE_CAPABILITY_MATRIX[role].has(capability));
    }
  }
});

test('the sorted audit table covers every role exactly once with its capabilities', () => {
  const rows = describeMatrix();
  assert.deepEqual(rows.map(({ role }) => role), [...ROLES].sort());
  assert.equal(new Set(rows.map(({ role }) => role)).size, ROLES.length);
  for (const row of rows) {
    assert.deepEqual(row.capabilities, capabilitiesFor(row.role));
  }
});

test('mutating returned arrays cannot change policy or subsequent audit tables', () => {
  const before = describeMatrix();
  capabilitiesFor('FRONT_DESK').push('MANAGE_USERS');
  rolesWithCapability('MANAGE_USERS').push('FRONT_DESK');
  const rows = describeMatrix();
  rows[0].capabilities.length = 0;
  rows.pop();
  assert.deepEqual(describeMatrix(), before);
  assert.equal(can('FRONT_DESK', 'MANAGE_USERS'), false);
});
