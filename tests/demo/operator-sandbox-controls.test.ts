import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  createDemoOperatorBaseline,
  demoOperatorReducer,
} from "../../lib/demo-operator-state";

const SOURCE_PATH = path.join(
  process.cwd(),
  "app/demo/operator/demo-operator-sandbox.tsx",
);

test("competency review button is never disabled by status", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  assert.doesNotMatch(
    source,
    /disabled=\{person\.competency\.status === "current"\}/,
  );
});

test("both person controls carry an accessible name that includes the person's name", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  assert.match(
    source,
    /aria-label=\{`Record a synthetic competency review for \$\{person\.name\}`\}/,
  );
  assert.match(
    source,
    /aria-label=\{`\$\{person\.authorization\.active \? "Revoke" : "Grant"\} synthetic authorisation for \$\{person\.name\}`\}/,
  );
});

test("lastReviewedAt is rendered without a bare toLocaleDateString/toLocaleString call", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  assert.match(source, /person\.competency\.lastReviewedAt/);
  assert.doesNotMatch(source, /\.toLocaleDateString\(\)/);
  assert.doesNotMatch(source, /\.toLocaleString\(\)/);
});

test("repeat competency reviews are accepted by the model even when status starts current", () => {
  const baseline = createDemoOperatorBaseline();
  const ben = baseline.people.find((person) => person.id === "demo-person-ben");
  assert.ok(ben);
  assert.equal(ben.competency.status, "current");
  assert.equal(ben.competency.reviewCount, 1);

  const afterFirst = demoOperatorReducer(baseline, {
    type: "record_competency_review",
    personId: ben.id,
    competencyId: ben.competency.id,
  });
  const afterSecond = demoOperatorReducer(afterFirst, {
    type: "record_competency_review",
    personId: ben.id,
    competencyId: ben.competency.id,
  });

  const finalBen = afterSecond.people.find((person) => person.id === "demo-person-ben");
  assert.ok(finalBen);
  assert.equal(finalBen.competency.reviewCount, 3);
  assert.equal(finalBen.competency.status, "current");
});
