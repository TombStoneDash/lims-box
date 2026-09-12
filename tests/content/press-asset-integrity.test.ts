import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Regression coverage: the press page previously linked to placeholder
// `/press/screenshot-*.svg` stand-ins with literal "Replace with actual
// screenshot" text instead of the real seeded-fictional demo captures
// documented in public/screenshots/README.md.

const ROOT = path.join(__dirname, "..", "..");
const PRESS_PAGE = path.join(ROOT, "app/press/page.tsx");

const APPROVED_SCREENSHOTS = [
  "/screenshots/admin-personnel-pack.png",
  "/screenshots/admin-survey-ready.png",
  "/screenshots/admin-personnel-detail.png",
];

function extractScreenshotFiles(source: string): string[] {
  const block = source.match(/const screenshots = \[([\s\S]*?)\];/);
  assert.ok(block, "could not find `screenshots` array in app/press/page.tsx");
  const files: string[] = [];
  const fileRegex = /file:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = fileRegex.exec(block![1])) !== null) {
    files.push(match[1]);
  }
  return files;
}

test("press page registers only the approved seeded-fictional screenshot captures", () => {
  const source = readFileSync(PRESS_PAGE, "utf8");
  const files = extractScreenshotFiles(source);

  assert.deepEqual(
    [...files].sort(),
    [...APPROVED_SCREENSHOTS].sort(),
    "press page screenshots must be exactly the three approved captures",
  );
});

test("every registered press screenshot file exists locally in public/", () => {
  const source = readFileSync(PRESS_PAGE, "utf8");
  const files = extractScreenshotFiles(source);

  for (const file of files) {
    const localPath = path.join(ROOT, "public", file);
    assert.ok(existsSync(localPath), `registered screenshot ${file} is missing from public/`);
  }
});

test("no placeholder screenshot paths or placeholder instruction text remain on the press page", () => {
  const source = readFileSync(PRESS_PAGE, "utf8");

  assert.doesNotMatch(source, /\/press\/screenshot-/);
  assert.doesNotMatch(source, /replace placeholders with actual screenshots/i);
});

test("logo copy does not claim every logo download is SVG when JPG assets are registered", () => {
  const source = readFileSync(PRESS_PAGE, "utf8").replace(/\s+/g, " ");
  const logoBlock = source.match(/const logos = \[([\s\S]*?)\];/);
  assert.ok(logoBlock, "could not find `logos` array in app/press/page.tsx");

  const hasJpgLogo = /\.jpg/i.test(logoBlock![1]);
  assert.ok(hasJpgLogo, "expected at least one registered JPG logo asset");

  const logoSection = source.slice(source.indexOf("Logos"), source.indexOf("Product Screenshots"));
  assert.doesNotMatch(logoSection, /SVG format/i);
});
