import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "app/senaite-demo/layout.tsx"),
  "utf8",
);

const hrefs = [...source.matchAll(/href:\s*'([^']+)'/g)].map((match) => match[1]);

test("senaite-demo shell nav has no /demo hrefs", () => {
  for (const href of hrefs) {
    assert.doesNotMatch(href, /^\/demo(\/|$)/, href);
  }
});

test("senaite-demo shell nav targets all expected /senaite-demo routes", () => {
  assert.deepEqual(hrefs, [
    "/senaite-demo",
    "/senaite-demo/samples/SA-2026-0847",
    "/senaite-demo/qc",
    "/senaite-demo/equipment",
    "/senaite-demo/training",
  ]);
});
