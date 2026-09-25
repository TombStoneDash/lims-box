/**
 * Fail-closed, privacy-safe role capabilities for the synthetic OHWorks pilot.
 *
 * This pure, dependency-free module maps bounded role names to bounded system
 * actions. It performs no I/O and contains no real personnel or result data.
 * Unknown values are refused without coercion or throwing; names must match
 * exactly. Listing functions return fresh arrays in lexical order.
 *
 * These are role-level defaults, not identity proof or a replacement for
 * per-result competency, suspension, and second-reviewer release checks.
 */

/** Includes the analyst role names established by analyst authorization. */
export type OHWorksRole =
  | 'FRONT_DESK'
  | 'TRAINEE'
  | 'ANALYST'
  | 'SENIOR_ANALYST'
  | 'LAB_DIRECTOR'
  | 'QUALITY_MANAGER'
  | 'IT_ADMIN';

/** Exhaustive system actions recognized by this synthetic policy. */
export type OHWorksCapability =
  | 'VIEW_RESULTS'
  | 'ENTER_RESULTS'
  | 'VERIFY_RESULTS'
  | 'PUBLISH_REPORTS'
  | 'AMEND_PUBLISHED_REPORTS'
  | 'MANAGE_QC_RULES'
  | 'MANAGE_USERS'
  | 'EXPORT_AUDIT_LOG'
  | 'CONFIGURE_INSTRUMENTS';

const KNOWN_ROLES: ReadonlySet<OHWorksRole> = new Set([
  'FRONT_DESK', 'TRAINEE', 'ANALYST', 'SENIOR_ANALYST',
  'LAB_DIRECTOR', 'QUALITY_MANAGER', 'IT_ADMIN',
]);

const KNOWN_CAPABILITIES: ReadonlySet<OHWorksCapability> = new Set([
  'VIEW_RESULTS', 'ENTER_RESULTS', 'VERIFY_RESULTS', 'PUBLISH_REPORTS',
  'AMEND_PUBLISHED_REPORTS', 'MANAGE_QC_RULES', 'MANAGE_USERS',
  'EXPORT_AUDIT_LOG', 'CONFIGURE_INSTRUMENTS',
]);

/** Least-privilege defaults; administrative powers do not imply clinical powers. */
export const ROLE_CAPABILITY_MATRIX: Readonly<Record<OHWorksRole, ReadonlySet<OHWorksCapability>>> = Object.freeze({
  FRONT_DESK: new Set<OHWorksCapability>(['VIEW_RESULTS']),
  TRAINEE: new Set<OHWorksCapability>(['VIEW_RESULTS', 'ENTER_RESULTS']),
  ANALYST: new Set<OHWorksCapability>(['VIEW_RESULTS', 'ENTER_RESULTS', 'VERIFY_RESULTS']),
  SENIOR_ANALYST: new Set<OHWorksCapability>([
    'VIEW_RESULTS', 'ENTER_RESULTS', 'VERIFY_RESULTS', 'PUBLISH_REPORTS',
  ]),
  LAB_DIRECTOR: new Set<OHWorksCapability>([
    'VIEW_RESULTS', 'ENTER_RESULTS', 'VERIFY_RESULTS', 'PUBLISH_REPORTS',
    'AMEND_PUBLISHED_REPORTS', 'MANAGE_QC_RULES', 'EXPORT_AUDIT_LOG',
  ]),
  QUALITY_MANAGER: new Set<OHWorksCapability>([
    'VIEW_RESULTS', 'MANAGE_QC_RULES', 'EXPORT_AUDIT_LOG',
  ]),
  // Separation of duties: user/instrument administration is IT-only. IT may
  // view results, but may not enter, verify, publish, or amend clinical results.
  IT_ADMIN: new Set<OHWorksCapability>([
    'VIEW_RESULTS', 'MANAGE_USERS', 'CONFIGURE_INSTRUMENTS',
  ]),
});

function isRole(value: unknown): value is OHWorksRole {
  return typeof value === 'string' && KNOWN_ROLES.has(value as OHWorksRole);
}

function isCapability(value: unknown): value is OHWorksCapability {
  return typeof value === 'string' && KNOWN_CAPABILITIES.has(value as OHWorksCapability);
}

/** Refuse any unknown role or capability without inspecting or coercing it. */
export function can(role: unknown, capability: unknown): boolean {
  return isRole(role) && isCapability(capability) && ROLE_CAPABILITY_MATRIX[role].has(capability);
}

/** Return sorted capabilities, or an empty array for an unknown role. */
export function capabilitiesFor(role: unknown): OHWorksCapability[] {
  return isRole(role) ? [...ROLE_CAPABILITY_MATRIX[role]].sort() : [];
}

/** Return sorted roles, or an empty array for an unknown capability. */
export function rolesWithCapability(capability: unknown): OHWorksRole[] {
  return isCapability(capability)
    ? [...KNOWN_ROLES].filter((role) => can(role, capability)).sort()
    : [];
}

/** Return a fresh full audit table, sorted by role and then capability name. */
export function describeMatrix(): { role: OHWorksRole; capabilities: OHWorksCapability[] }[] {
  return [...KNOWN_ROLES].sort().map((role) => ({ role, capabilities: capabilitiesFor(role) }));
}
