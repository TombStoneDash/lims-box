import type { SampleAction, SampleState, TenantPermission, TenantPrincipal, TenantRole } from './model';

const ROLE_PERMISSIONS: Record<TenantRole, readonly TenantPermission[]> = {
  laboratory_manager: [
    'sample:read', 'sample:accession', 'sample:queue', 'result:read', 'result:record',
    'result:retest', 'result:quarantine', 'result:reject', 'result:release', 'report:read',
    'personnel:read', 'audit:read',
  ],
  receiving: ['sample:read', 'sample:accession', 'sample:queue'],
  scientist: ['sample:read', 'sample:queue', 'result:read', 'result:record', 'result:retest', 'result:quarantine'],
  reviewer: ['sample:read', 'result:read', 'result:retest', 'result:quarantine', 'result:reject', 'result:review', 'report:read', 'audit:read'],
  approver: ['sample:read', 'result:read', 'result:release', 'report:read', 'audit:read'],
  auditor: ['sample:read', 'result:read', 'report:read', 'personnel:read', 'audit:read'],
};

const ACTION_PERMISSION: Record<SampleAction, TenantPermission> = {
  accession: 'sample:accession',
  queue: 'sample:queue',
  record_result: 'result:record',
  request_retest: 'result:retest',
  quarantine: 'result:quarantine',
  reject: 'result:reject',
  technical_review: 'result:review',
  release: 'result:release',
};

const ACTION_STATES: Record<Exclude<SampleAction, 'accession'>, readonly SampleState[]> = {
  queue: ['Accessioned', 'Retest requested', 'Quarantined'],
  record_result: ['Queued'],
  request_retest: ['Result available', 'Technical review'],
  quarantine: ['Queued', 'Result available', 'Technical review'],
  reject: ['Result available', 'Technical review', 'Quarantined'],
  technical_review: ['Result available'],
  release: ['Technical review'],
};

export function permissionsFor(role: TenantRole): readonly TenantPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(principal: TenantPrincipal, permission: TenantPermission): boolean {
  return permissionsFor(principal.role).includes(permission);
}

export function authorizeAction(principal: TenantPrincipal, action: SampleAction, state?: SampleState): { ok: true } | { ok: false; reason: string } {
  if (!hasPermission(principal, ACTION_PERMISSION[action])) {
    return { ok: false, reason: 'Your account is not permitted to perform this action.' };
  }
  if (action !== 'accession' && (!state || !ACTION_STATES[action].includes(state))) {
    return { ok: false, reason: `The action is not available while the sample is ${state ?? 'missing'}.` };
  }
  return { ok: true };
}

export function roleLabel(role: TenantRole): string {
  return ({
    laboratory_manager: 'Laboratory manager',
    receiving: 'Sample reception',
    scientist: 'Biomedical scientist',
    reviewer: 'Technical reviewer',
    approver: 'Release approver',
    auditor: 'Quality auditor',
  } as const)[role];
}
