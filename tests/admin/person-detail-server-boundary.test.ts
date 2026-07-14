import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sourcePath = path.join(
  process.cwd(),
  "app/admin/people/[id]/page.tsx",
);
const source = readFileSync(sourcePath, "utf8");

test("person detail server component does not pass browser event handlers", () => {
  assert.doesNotMatch(source, /\bonClick\s*=/);
  assert.match(source, /<form action=\{revokeAuthorization\}>/);
});

test("revoke server action keeps its required hidden fields", () => {
  for (const field of ["authId", "personId", "revokedBy", "revocationReason"]) {
    assert.match(source, new RegExp(`name=["']${field}["']`));
  }

  assert.match(source, /<button\s+[\s\S]*?type=["']submit["'][\s\S]*?>[\s\S]*?Revoke/);
});
