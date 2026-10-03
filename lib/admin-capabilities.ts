// Mirrors the enforced policy in lib/demo-access.ts: SAFE_METHODS never includes POST/PUT/DELETE
// for protected prefixes, so admin mutations are unreachable regardless of configuration.
export function adminMutationsEnabled(): boolean {
  return false;
}
