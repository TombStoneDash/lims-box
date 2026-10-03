import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { adminMutationsEnabled } from "../lib/admin-capabilities";

const repoRoot = path.resolve(__dirname, "..");
const peopleListSource = readFileSync(
  path.join(repoRoot, "app/admin/people/page.tsx"),
  "utf8",
);
const newPersonSource = readFileSync(
  path.join(repoRoot, "app/admin/people/new/page.tsx"),
  "utf8",
);

const CALL_EXPRESSION = /adminMutationsEnabled\s*\(\s*\)/;

test("the admin mutation capability is disabled", () => {
  assert.equal(adminMutationsEnabled(), false);
});

test("new-person page does not render a createPerson form while mutations are disabled", () => {
  assert.equal(adminMutationsEnabled(), false);
  assert.doesNotMatch(newPersonSource, /createPerson/);
  assert.doesNotMatch(newPersonSource, /<form\b/);
  assert.match(
    newPersonSource,
    CALL_EXPRESSION,
    "new-person page must call adminMutationsEnabled(), not just import it",
  );
  assert.match(newPersonSource, /\/demo\/operator/);
});

test("people list page does not render an Add person action while mutations are disabled", () => {
  assert.equal(adminMutationsEnabled(), false);
  assert.match(
    peopleListSource,
    CALL_EXPRESSION,
    "people list page must call adminMutationsEnabled(), not just import it",
  );
  assert.doesNotMatch(peopleListSource, />\s*Add person\s*<\/Link>/);
  assert.match(peopleListSource, /\/demo\/operator/);
});
