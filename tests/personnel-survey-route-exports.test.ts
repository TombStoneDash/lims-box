import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as surveyExportRoute from "../app/api/admin/personnel-pack/survey-export/route";
import { buildPersonnelFileNames } from "../lib/personnel-survey-file-names";

const ROUTE_RELATIVE_PATH = "app/api/admin/personnel-pack/survey-export/route.ts";

// Next.js App Router route modules may only export request handlers (GET,
// POST, ...) and a small, fixed set of route-segment configuration names.
// Any other export (a helper function, a shared constant, ...) can make
// Next.js reject the route during type checking or production build.
const SUPPORTED_NEXT_ROUTE_CONFIG_EXPORTS = new Set([
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
]);

test("survey export route exports only GET and supported Next.js route configuration names", () => {
  const exportedNames = Object.keys(surveyExportRoute);

  assert.ok(exportedNames.includes("GET"), "route must still export a GET handler");
  for (const name of exportedNames) {
    assert.ok(
      SUPPORTED_NEXT_ROUTE_CONFIG_EXPORTS.has(name),
      `route exports "${name}", which is not a Next.js route handler or configuration name — ` +
        "move any helper logic into lib/ instead",
    );
  }
});

test("survey export route source calls the extracted file-name helper (not just imports it)", () => {
  const source = readFileSync(path.join(process.cwd(), ROUTE_RELATIVE_PATH), "utf8");

  assert.match(
    source,
    /from\s+["']@\/lib\/personnel-survey-file-names["']/,
    "route must import buildPersonnelFileNames from lib/personnel-survey-file-names",
  );

  // A regex on the bare identifier would still pass if the import stayed but the
  // call was deleted (e.g. accidentally hard-coding file names inline). Requiring
  // the call-expression parenthesis catches that case.
  assert.match(
    source,
    /buildPersonnelFileNames\s*\(/,
    "route must actually call buildPersonnelFileNames(...), not just import it",
  );

  // The route module itself must not still define the helper or its private
  // slug/hash helpers — they belong in lib/ now.
  assert.doesNotMatch(source, /function\s+buildPersonnelFileNames\s*\(/);
  assert.doesNotMatch(source, /function\s+slug\s*\(/);
  assert.doesNotMatch(source, /function\s+idTag\s*\(/);
});

test("extracted buildPersonnelFileNames still produces unique, deterministic file names", () => {
  const people = [
    { id: "person-a", name: "Jordan Lee" },
    { id: "person-b", name: "Jordan Lee" },
    { id: "person-c", name: "Taylor Kim" },
  ];

  const first = buildPersonnelFileNames(people);
  const second = buildPersonnelFileNames(people);
  const reversed = buildPersonnelFileNames([...people].reverse());

  assert.equal(first.length, people.length);
  assert.equal(new Set(first).size, people.length, "every person must get a distinct file name");
  assert.deepEqual(second, first, "same input order must produce the same file names every time");
  assert.deepEqual(
    reversed,
    [...first].reverse(),
    "the same people in a different order must map to the same per-person file names",
  );
});
