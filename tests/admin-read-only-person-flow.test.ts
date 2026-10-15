import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
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

describe("document detail read-only flow", () => {
  const documentDetailSource = readFileSync(
    path.join(repoRoot, "app/admin/documents/[id]/page.tsx"),
    "utf8",
  );

  test("does not offer a version or approval POST form while mutations are disabled", () => {
    assert.equal(adminMutationsEnabled(), false);
    assert.match(documentDetailSource, CALL_EXPRESSION);
    assert.doesNotMatch(documentDetailSource, /createDocumentVersion|<form\b|Save version/);
    assert.match(documentDetailSource, /!mutationsEnabled\s*\?/);
    assert.match(documentDetailSource, /href="\/demo\/operator"/);
  });

  test("empty state does not invite adding a version", () => {
    assert.match(documentDetailSource, /No versions on record for this document\./);
    assert.doesNotMatch(documentDetailSource, /add (?:the first |a )?version below/i);
  });

  test("keeps current document links and version history visible", () => {
    assert.match(documentDetailSource, /currentVersion\s*\?/);
    assert.match(documentDetailSource, /Current version:/);
    assert.match(documentDetailSource, /href=\{currentVersion\.documentContentUrl\}/);
    assert.match(documentDetailSource, /View document/);
    assert.match(documentDetailSource, /Version history/);
    assert.match(documentDetailSource, /doc\.versions\.map\(/);
    assert.match(documentDetailSource, /href="\/admin\/documents"/);
  });
});

describe("competency detail read-only view", () => {
  const competencySource = readFileSync(
    path.join(repoRoot, "app/admin/competencies/[id]/page.tsx"),
    "utf8",
  );

  test("withholds the review POST form when admin mutations are disabled", () => {
    assert.equal(adminMutationsEnabled(), false);
    assert.match(competencySource, CALL_EXPRESSION);
    assert.equal((competencySource.match(/<form\b/g) ?? []).length, 1);
    assert.match(
      competencySource,
      /{mutationsEnabled\s*\?\s*\(\s*<form action={createReviewEvent}[\s\S]*?<\/form>\s*\)\s*:\s*\(/,
      "review form must render only when admin mutations are enabled",
    );
    assert.match(competencySource, /Review logging is disabled in this read-only view/);
    assert.match(competencySource, /<Link href="\/demo\/operator"/);
  });

  test("retains latest review, history, back navigation, and GET export", () => {
    assert.match(competencySource, /Last review:/);
    assert.match(competencySource, /Review history/);
    assert.match(competencySource, /competency\.reviewEvents\.map/);
    assert.match(competencySource, /href={`\/admin\/people\/\$\{competency\.personId\}`}/);
    assert.match(competencySource, /href={`\/api\/competencies\/\$\{competency\.id\}\/reviews\/export`}/);
    assert.match(competencySource, /Export PDF/);
    assert.match(
      competencySource,
      /<\/form>\s*\)\s*:\s*\([\s\S]*?\)\}\s*<a\s+href={`\/api\/competencies\//,
      "export must remain outside the gated review form",
    );
  });
});
