import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

// Regression coverage for issue #72 (water-lane funnel discoverability): PR #75
// merged app/field-scout/page.tsx (the water-lab pilot funnel entry) into main,
// but the route was an orphan — absent from app/sitemap.ts and unlinked from
// every other page. These assertions exist so /field-scout stays reachable via
// the sitemap and via internal links, and keeps its own link back to
// /environmental, so it doesn't silently drop out of the site again.
//
// Intentionally NOT wired into package.json to avoid overlap with the sitemap/
// route work tracked in open PR #76. Run directly:
//   node --import tsx --test tests/ops/route-discoverability.test.ts

const ROOT = path.join(__dirname, "..", "..");

function read(relPath: string): Promise<string> {
  return readFile(path.join(ROOT, relPath), "utf8");
}

test("app/sitemap.ts declares a /field-scout entry", async () => {
  const source = await read("app/sitemap.ts");
  assert.match(source, /['"]\/field-scout['"]/);
});

test("app/environmental/page.tsx links to /field-scout", async () => {
  const source = await read("app/environmental/page.tsx");
  assert.match(source, /href="\/field-scout"/);
});

test("app/for/environmental-labs/page.tsx links to /field-scout", async () => {
  const source = await read("app/for/environmental-labs/page.tsx");
  assert.match(source, /href="\/field-scout"/);
});

test("app/field-scout/page.tsx exists and still links back to /environmental", async () => {
  const source = await read("app/field-scout/page.tsx");
  assert.match(source, /href="\/environmental"/);
});
