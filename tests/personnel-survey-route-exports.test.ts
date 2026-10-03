import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as routeModule from "../app/api/admin/personnel-pack/survey-export/route";
import { buildPersonnelFileNames } from "../lib/personnel-survey-file-names";

const ROUTE_PATH = path.join(
  __dirname,
  "..",
  "app",
  "api",
  "admin",
  "personnel-pack",
  "survey-export",
  "route.ts",
);

// This route only ever serves GET, so its handler allow-list is exactly GET —
// not every HTTP verb Next.js supports — so an unintended new handler export
// is caught the same way an unsupported helper export is. The config names
// are every route segment config option Next.js's App Router recognizes.
const ALLOWED_HANDLER_EXPORTS = new Set(["GET"]);
const ALLOWED_CONFIG_EXPORTS = new Set([
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
]);

test("survey-export route module exports only GET and supported route segment config", () => {
  const exportNames = Object.keys(routeModule).sort();
  for (const name of exportNames) {
    assert.ok(
      ALLOWED_HANDLER_EXPORTS.has(name) || ALLOWED_CONFIG_EXPORTS.has(name),
      `unexpected export "${name}" — Next.js App Router route modules may only export ` +
        "request handlers or route segment config, not arbitrary helper functions",
    );
  }
  assert.ok(exportNames.includes("GET"), "route must export GET");
});

test("survey-export route source imports and calls the extracted file-name helper, not a local redefinition", () => {
  const source = readFileSync(ROUTE_PATH, "utf8");

  assert.ok(
    /from\s+["']@\/lib\/personnel-survey-file-names["']/.test(source),
    "route must import buildPersonnelFileNames from lib/personnel-survey-file-names",
  );

  // Assert the call expression itself, not merely the identifier: a route that
  // imports buildPersonnelFileNames but never calls it would still pass an
  // identifier-only check while silently dropping the behavior it names.
  assert.ok(
    /buildPersonnelFileNames\s*\(/.test(source),
    "route must call buildPersonnelFileNames(...), not just import it",
  );

  assert.ok(
    !/export\s+function\s+buildPersonnelFileNames/.test(source),
    "route must not redefine buildPersonnelFileNames locally",
  );
});

test("extracted buildPersonnelFileNames still produces unique, deterministic file names", () => {
  const people = [
    { id: "synthetic-001", name: "Jamie Rivera" },
    { id: "synthetic-002", name: "Jamie Rivera" },
    { id: "synthetic-003", name: "Riley Chen" },
  ];

  const names = buildPersonnelFileNames(people);
  assert.equal(names.length, people.length);
  assert.equal(new Set(names).size, people.length, "every person gets a distinct file name");
  assert.ok(
    names.every((n) => /^personnel\/[a-z0-9-]+\.pdf$/.test(n)),
    "every file name stays within the personnel/ directory",
  );

  assert.deepEqual(
    buildPersonnelFileNames([...people].reverse()),
    [...names].reverse(),
    "file names are assigned deterministically regardless of input order",
  );
});
