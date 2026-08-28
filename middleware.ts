import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DEMO_OPERATOR_PASS_ENV,
  DEMO_OPERATOR_USER_ENV,
  evaluateDemoAccess,
} from "@/lib/demo-access";

/**
 * Fail-closed supervised-demo protection via HTTP Basic Auth.
 *
 * Protected paths include the operator sandbox, admin/read APIs, and mockups.
 * Public /demo remains a browser-local, non-persistent walkthrough.
 *
 * Required env vars (set in Vercel dashboard or .env.local):
 *   ADMIN_BASIC_USER  — username for Basic auth
 *   ADMIN_BASIC_PASS  — password for Basic auth
 *
 * Missing credentials fail closed with 503. Authenticated non-GET requests to
 * protected demo/admin paths fail with 405. The only mutable rehearsal is the
 * browser-local /demo/operator state, which performs no HTTP writes.
 */

export function middleware(request: NextRequest) {
  const decision = evaluateDemoAccess({
    pathname: request.nextUrl.pathname,
    method: request.method,
    authorization: request.headers.get("authorization"),
    configuredUser: process.env[DEMO_OPERATOR_USER_ENV],
    configuredPass: process.env[DEMO_OPERATOR_PASS_ENV],
  });

  if (decision.kind === "allow") return NextResponse.next();

  const commonHeaders = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };

  if (decision.kind === "unavailable") {
    return new NextResponse("Demo operator access is not configured.", {
      status: decision.status,
      headers: commonHeaders,
    });
  }

  if (decision.kind === "read_only") {
    return new NextResponse(
      "Database-backed demo mutations are disabled. Use the synthetic operator sandbox.",
      { status: decision.status, headers: { ...commonHeaders, Allow: "GET, HEAD, OPTIONS" } },
    );
  }

  return new NextResponse("Authentication required", {
    status: decision.status,
    headers: {
      ...commonHeaders,
      "WWW-Authenticate": 'Basic realm="LIMS BOX Synthetic Demo"',
    },
  });
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/senaite-demo/:path*",
    "/demo/operator/:path*",
    "/api/admin/:path*",
    "/api/authorizations/:path*",
    "/api/competencies/:path*",
    "/api/documents/:path*",
    "/api/people/:path*",
    "/api/procedures/:path*",
    "/api/reviews/:path*",
  ],
};
