import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function pageText(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

test("demo custody describes a local synthetic signature without persisted audit claims", () => {
  const text = pageText("app/demo/page.tsx");
  assert.match(text, /Demo signature shown\./);
  assert.match(text, /This synthetic custody example updates only this page\./);
  assert.match(text, /No signature or audit record is saved\./);
  assert.doesNotMatch(text, /full transfer chain is locked|COC complete|captured with timestamp and IP|audit trail entry was recorded/i);
});

test("demo footer accurately requires an internet connection", () => {
  const text = pageText("app/demo/page.tsx");
  assert.match(text, /Web Demo/);
  assert.match(text, /Internet connection required/);
  assert.doesNotMatch(text, /Offline-Capable|No internet needed/i);
});

test("recording report is a static synthetic preview without compliance or speed promises", () => {
  const text = pageText("app/demo/record/page.tsx");
  assert.match(text, /Synthetic report preview with example results\./);
  assert.match(text, /static example, not a generated or compliance-validated report/);
  assert.match(text, /overlay: 'Synthetic report preview\.'/);
  assert.doesNotMatch(text, /EPA-compliant|12 seconds|All QC data auto-included|Ready in minutes/i);
});
