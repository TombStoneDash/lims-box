import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function hrefsIn(relativePath: string): string[] {
  const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
  return [...source.matchAll(/href=["']([^"']+)["']/g)].map((match) => match[1]);
}

const dashboardHrefs = hrefsIn("app/senaite-demo/page.tsx");
const sampleDetailHrefs = hrefsIn("app/senaite-demo/samples/[id]/page.tsx");

test("senaite-demo dashboard has no /demo hrefs", () => {
  for (const href of dashboardHrefs) {
    assert.doesNotMatch(href, /^\/demo(\/|$)/, href);
  }
});

test("senaite-demo dashboard targets all expected /senaite-demo routes", () => {
  assert.deepEqual(dashboardHrefs, [
    "/senaite-demo/qc",
    "/senaite-demo/equipment",
    "/senaite-demo/training",
    "/senaite-demo/samples/SA-2026-0847",
    "/senaite-demo/equipment",
  ]);
});

test("senaite-demo sample detail breadcrumb has no /demo hrefs", () => {
  for (const href of sampleDetailHrefs) {
    assert.doesNotMatch(href, /^\/demo(\/|$)/, href);
  }
});

test("senaite-demo sample detail breadcrumb targets /senaite-demo", () => {
  assert.deepEqual(sampleDetailHrefs, ["/senaite-demo"]);
});
