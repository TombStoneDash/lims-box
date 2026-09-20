import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { isProtectedDemoPath } from "../../lib/demo-access";

// Exact paths only: additions to the pilot must receive an explicit decision.
export const KNOWN_UNPROTECTED_PENDING_OWNER_DECISION: readonly string[] = [
  "/pilot/ohworks",
  "/pilot/ohworks/accessions",
  "/pilot/ohworks/audit",
  "/pilot/ohworks/audit/export",
  "/pilot/ohworks/bot",
  "/pilot/ohworks/bot/api",
  "/pilot/ohworks/instrument",
  "/pilot/ohworks/personnel",
  "/pilot/ohworks/samples",
];

// All entries are exact, including marketing pages; no implicit subtree approval.
const PUBLIC_BY_DESIGN: readonly { path: string; reason: string }[] = [
  { path: "/", reason: "Public product landing page." },
  { path: "/about", reason: "Public company introduction." },
  { path: "/api/bot", reason: "Public prototype questions; GET returns usage instructions and no personal data." },
  { path: "/api/checkout/personnel-pack", reason: "Public early-adopter redirect; GET returns no personal data." },
  { path: "/api/contact", reason: "Public contact-form submission." },
  { path: "/api/demo", reason: "Hardcoded synthetic integration examples; no personal data." },
  { path: "/api/demo/assistant", reason: "Public synthetic assistant; GET returns usage instructions and no personal data." },
  { path: "/api/early-access", reason: "Public early-access application submission." },
  { path: "/api/health", reason: "Stateless service health and timestamp; no personal data." },
  { path: "/api/newsletter", reason: "Public newsletter signup submission." },
  { path: "/api/personnel-pack-download", reason: "Public pack request; GET serves a fixed reviewed documentation PDF, no personal data." },
  { path: "/api/prospects", reason: "Public lab-interest intake submission." },
  { path: "/api/unsubscribe", reason: "Public opt-out; GET changes suppression state but returns a generic confirmation with no personal data." },
  { path: "/api/waitlist", reason: "Public waitlist signup submission." },
  { path: "/blog", reason: "Public article index." },
  { path: "/blog/x", reason: "Public published article." },
  { path: "/bot", reason: "Public prototype assistant interface." },
  { path: "/case-study", reason: "Public product case study." },
  { path: "/clia", reason: "Public CLIA product information." },
  { path: "/clia-tracker", reason: "Public personnel-tracker product information." },
  { path: "/clinical", reason: "Public clinical-lab product information." },
  { path: "/clinical/intake", reason: "Public clinical-lab interest form." },
  { path: "/cola", reason: "Public COLA product information." },
  { path: "/commercial", reason: "Public commercial offering information." },
  { path: "/compare", reason: "Public product comparison." },
  { path: "/compliance", reason: "Public compliance product information." },
  { path: "/contact", reason: "Public contact form." },
  { path: "/demo", reason: "Public browser-local walkthrough." },
  { path: "/demo/assistant", reason: "Public assistant using fabricated records." },
  { path: "/demo/record", reason: "Public staged demo recording screens." },
  { path: "/demo/walkthrough", reason: "Public staged product walkthrough." },
  { path: "/early-adopter", reason: "Public early-adopter application." },
  { path: "/environmental", reason: "Public environmental-lab product information." },
  { path: "/environmental/intake", reason: "Public environmental-lab interest form." },
  { path: "/evidence", reason: "Public capability and evidence matrix." },
  { path: "/faq", reason: "Public product questions and answers." },
  { path: "/field-scout", reason: "Public field-workflow examples and interest form." },
  { path: "/for/cannabis-labs", reason: "Public cannabis-lab product information." },
  { path: "/for/environmental-labs", reason: "Public environmental-lab product information." },
  { path: "/partners", reason: "Public partnership information." },
  { path: "/personnel-pack", reason: "Public documentation-pack request form." },
  { path: "/press", reason: "Public press information." },
  { path: "/pricing", reason: "Public plan information." },
  { path: "/roi-calculator", reason: "Public savings estimator." },
  { path: "/start", reason: "Public lab-type selection." },
  { path: "/survey-ready-export", reason: "Public survey-export product information." },
  { path: "/unsubscribe", reason: "Public opt-out form." },
  { path: "/webinar", reason: "Public webinar information." },
];

type Route = { path: string; file: string; handler: boolean };

function routePath(segments: string[]): string | null {
  if (segments.some((segment) => segment.startsWith("_"))) return null;
  return "/" + segments
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => /^\[.*\]$/.test(segment) ? "x" : segment)
    .join("/");
}

function discoverRoutes(directory: string, segments: string[] = []): Route[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry): Route[] => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_")) return [];
        return discoverRoutes(file, [...segments, entry.name]);
      }
      if (!entry.isFile() || !/^(page\.tsx|route\.tsx?)$/.test(entry.name)) return [];
      const pathname = routePath(segments);
      return pathname === null ? [] : [{ path: pathname, file, handler: entry.name !== "page.tsx" }];
    });
}

const routes = discoverRoutes(path.join(process.cwd(), "app"));
const discoveredPaths = [...new Set(routes.map((route) => route.path))].sort();
const isPilotPath = (pathname: string) =>
  pathname === "/pilot/ohworks" || pathname.startsWith("/pilot/ohworks/");

test("every discovered route has exactly one conscious exposure classification", () => {
  assert.ok(routes.length > 0, "Expected routable files in app/");
  for (const route of routes) {
    const matches = Number(isProtectedDemoPath(route.path))
      + KNOWN_UNPROTECTED_PENDING_OWNER_DECISION.filter((entry) => entry === route.path).length
      + PUBLIC_BY_DESIGN.filter((entry) => entry.path === route.path).length;
    assert.equal(matches, 1,
      `${route.path} (${path.relative(process.cwd(), route.file)}): found ${matches} classifications; classify this route in exactly one exposure bucket.`);
  }
});

test("exposure inventory has no stale explicit entries", () => {
  for (const entry of PUBLIC_BY_DESIGN) {
    assert.ok(entry.reason.trim(), `${entry.path}: give an honest public-access reason`);
    assert.ok(discoveredPaths.includes(entry.path), `Stale PUBLIC_BY_DESIGN entry: ${entry.path}`);
  }
  for (const pathname of KNOWN_UNPROTECTED_PENDING_OWNER_DECISION) {
    assert.ok(discoveredPaths.includes(pathname), `Stale KNOWN_UNPROTECTED entry: ${pathname}`);
  }
});

test("known unprotected entries equal exactly the still-unprotected OHWorks routes", () => {
  // Filtering protection is intentional: once the owner gates the pilot, the
  // expected list becomes empty and the explicit exceptions must be removed.
  const expected = discoveredPaths.filter((pathname) => isPilotPath(pathname) && !isProtectedDemoPath(pathname));
  assert.deepEqual([...KNOWN_UNPROTECTED_PENDING_OWNER_DECISION].sort(), expected,
    "Reconcile the explicit OHWorks exceptions; empty them when the pilot is protected.");
});

test("middleware matcher text names every discovered protected prefix", () => {
  const source = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
  for (const pathname of discoveredPaths.filter(isProtectedDemoPath)) {
    const segments = pathname.split("/").filter(Boolean);
    const prefix = "/" + segments.slice(0, ["api", "demo"].includes(segments[0]) ? 2 : 1).join("/");
    assert.ok(source.includes(`"${prefix}/:path*"`), `${pathname}: middleware matcher must name ${prefix}`);
  }
});

test("public API GET handlers explicitly justify returning no personal data", () => {
  for (const route of routes) {
    if (!route.handler || !(route.path === "/api" || route.path.startsWith("/api/"))) continue;
    const source = readFileSync(route.file, "utf8");
    if (!/export\s+(?:async\s+)?function\s+GET\s*\(/.test(source)) continue;
    for (const entry of PUBLIC_BY_DESIGN.filter((entry) => entry.path === route.path)) {
      assert.match(entry.reason, /\bno personal data\b/i,
        `${route.path}: public GET requires an honest 'no personal data' reason; otherwise record NEEDS_REVIEW and document the concern.`);
    }
  }
});

test("Next route normalization excludes private folders and normalizes groups and parameters", () => {
  assert.equal(routePath([]), "/");
  assert.equal(routePath(["(synthetic-marketing)", "blog", "[id]"]), "/blog/x");
  assert.equal(routePath(["synthetic-files", "[...slug]"]), "/synthetic-files/x");
  assert.equal(routePath(["synthetic-files", "[[...slug]]"]), "/synthetic-files/x");
  assert.equal(routePath(["_intake", "synthetic-form"]), null);
  assert.equal(routePath(["(synthetic-group)", "_components", "[id]"]), null);
});
