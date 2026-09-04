import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TenantPrincipal, TenantRole } from './model';
import { TEST_TENANT_ID } from './model';

export interface SessionPayload extends TenantPrincipal {
  tenantId: typeof TEST_TENANT_ID;
  expiresAt: number;
}

const ROLES = new Set<TenantRole>(['laboratory_manager', 'receiving', 'scientist', 'reviewer', 'approver', 'auditor']);

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(principal: TenantPrincipal, secret: string, now = Date.now()): string {
  if (secret.length < 32) throw new Error('OHWORKS_SESSION_SECRET must contain at least 32 characters');
  const payload: SessionPayload = { ...principal, tenantId: TEST_TENANT_ID, expiresAt: now + 8 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string | undefined, now = Date.now()): SessionPayload | null {
  if (!token || !secret || secret.length < 32) return null;
  const [payloadPart, suppliedSignature, extra] = token.split('.');
  if (!payloadPart || !suppliedSignature || extra) return null;
  const expected = signature(payloadPart, secret);
  const a = Buffer.from(suppliedSignature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as SessionPayload;
    if (
      payload.tenantId !== TEST_TENANT_ID ||
      !payload.accountId ||
      !payload.username ||
      !payload.displayName ||
      !ROLES.has(payload.role) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= now
    ) return null;
    return payload;
  } catch {
    return null;
  }
}
