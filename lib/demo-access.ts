export const DEMO_OPERATOR_USER_ENV = "ADMIN_BASIC_USER";
export const DEMO_OPERATOR_PASS_ENV = "ADMIN_BASIC_PASS";

const PROTECTED_PREFIXES = [
  "/admin",
  "/senaite-demo",
  "/demo/operator",
  "/api/admin",
  "/api/authorizations",
  "/api/competencies",
  "/api/documents",
  "/api/people",
  "/api/procedures",
  "/api/reviews",
] as const;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type DemoAccessDecision =
  | { kind: "allow" }
  | { kind: "unavailable"; status: 503 }
  | { kind: "authentication_required"; status: 401 }
  | { kind: "read_only"; status: 405 };

export function isProtectedDemoPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

export function basicCredentialsMatch(
  authorization: string | null,
  expectedUser: string,
  expectedPass: string,
): boolean {
  if (!authorization) return false;
  const [scheme, token, ...extra] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "basic" || !token || extra.length > 0) return false;

  try {
    const decoded = atob(token);
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const suppliedUser = decoded.slice(0, separator);
    const suppliedPass = decoded.slice(separator + 1);
    return (
      constantTimeEqual(suppliedUser, expectedUser) &&
      constantTimeEqual(suppliedPass, expectedPass)
    );
  } catch {
    return false;
  }
}

export function evaluateDemoAccess(input: {
  pathname: string;
  method: string;
  authorization: string | null;
  configuredUser?: string;
  configuredPass?: string;
}): DemoAccessDecision {
  if (!isProtectedDemoPath(input.pathname)) return { kind: "allow" };

  if (!input.configuredUser || !input.configuredPass) {
    return { kind: "unavailable", status: 503 };
  }

  if (
    !basicCredentialsMatch(
      input.authorization,
      input.configuredUser,
      input.configuredPass,
    )
  ) {
    return { kind: "authentication_required", status: 401 };
  }

  if (!SAFE_METHODS.has(input.method.toUpperCase())) {
    return { kind: "read_only", status: 405 };
  }

  return { kind: "allow" };
}
