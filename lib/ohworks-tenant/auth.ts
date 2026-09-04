import 'server-only';

import { scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionToken, verifySessionToken } from './auth-core';
import type { TenantPrincipal, TenantRole } from './model';

export const SESSION_COOKIE = 'ohworks_test_session';

interface AccountConfig {
  id: string;
  username: string;
  displayName: string;
  role: TenantRole;
  passwordSalt: string;
  passwordHash: string;
}

const ACCOUNT_ROLES = new Set<TenantRole>(['laboratory_manager', 'receiving', 'scientist', 'reviewer', 'approver', 'auditor']);

function accounts(): AccountConfig[] {
  try {
    const parsed = JSON.parse(process.env.OHWORKS_TEST_ACCOUNTS_JSON ?? '[]') as AccountConfig[];
    return parsed.filter((account) =>
      account.id && account.username && account.displayName && ACCOUNT_ROLES.has(account.role) &&
      /^[a-f0-9]{32,}$/i.test(account.passwordSalt) && /^[a-f0-9]{128}$/i.test(account.passwordHash),
    );
  } catch {
    return [];
  }
}

export function authenticationConfigured(): boolean {
  return accounts().length > 0 && (process.env.OHWORKS_SESSION_SECRET?.length ?? 0) >= 32;
}

export function authenticateAccount(username: string, password: string): TenantPrincipal | null {
  if (!username || !password || password.length > 256) return null;
  const account = accounts().find((candidate) => candidate.username.toLowerCase() === username.trim().toLowerCase());
  if (!account) {
    scryptSync(password, '00000000000000000000000000000000', 64);
    return null;
  }
  const supplied = scryptSync(password, Buffer.from(account.passwordSalt, 'hex'), 64);
  const expected = Buffer.from(account.passwordHash, 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return { accountId: account.id, username: account.username, displayName: account.displayName, role: account.role };
}

export function issueSession(principal: TenantPrincipal): string {
  return createSessionToken(principal, process.env.OHWORKS_SESSION_SECRET ?? '');
}

export async function getPrincipal(): Promise<TenantPrincipal | null> {
  const jar = await cookies();
  const payload = verifySessionToken(jar.get(SESSION_COOKIE)?.value, process.env.OHWORKS_SESSION_SECRET);
  if (!payload) return null;
  return { accountId: payload.accountId, username: payload.username, displayName: payload.displayName, role: payload.role };
}

export async function requirePrincipal(): Promise<TenantPrincipal> {
  const principal = await getPrincipal();
  if (!principal) redirect('/pilot/ohworks/login');
  return principal;
}
