import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DEMO_DATASET_ID,
  DEMO_REVIEWED_AT,
  createDemoOperatorBaseline,
  demoOperatorReducer,
  isSyntheticDemoState,
} from "../../lib/demo-operator-state";

test("baseline contains only deterministic synthetic IDs", () => {
  const baseline = createDemoOperatorBaseline();
  assert.equal(baseline.datasetId, DEMO_DATASET_ID);
  assert.equal(isSyntheticDemoState(baseline), true);
  assert.equal(JSON.stringify(baseline).includes("@"), false);
});

test("competency action is scoped to an existing synthetic person and record", () => {
  const baseline = createDemoOperatorBaseline();
  const alice = baseline.people[0];
  const changed = demoOperatorReducer(baseline, {
    type: "record_competency_review",
    personId: alice.id,
    competencyId: alice.competency.id,
  });
  assert.equal(changed.people[0].competency.status, "current");
  assert.equal(changed.people[0].competency.reviewCount, 1);
  assert.equal(changed.people[0].competency.lastReviewedAt, DEMO_REVIEWED_AT);
  assert.deepEqual(changed.people[1], baseline.people[1]);
});

test("authorization action is scoped to an existing synthetic authorization", () => {
  const baseline = createDemoOperatorBaseline();
  const alice = baseline.people[0];
  const changed = demoOperatorReducer(baseline, {
    type: "set_authorization",
    personId: alice.id,
    authorizationId: alice.authorization.id,
    active: true,
  });
  assert.equal(changed.people[0].authorization.active, true);
  assert.deepEqual(changed.people[1], baseline.people[1]);
});

test("unknown IDs cannot mutate the sandbox", () => {
  const baseline = createDemoOperatorBaseline();
  const changed = demoOperatorReducer(baseline, {
    type: "record_competency_review",
    personId: "customer-person",
    competencyId: "customer-competency",
  });
  assert.equal(changed, baseline);
});

test("reset restores the exact deterministic baseline", () => {
  const baseline = createDemoOperatorBaseline();
  const alice = baseline.people[0];
  const changed = demoOperatorReducer(baseline, {
    type: "set_authorization",
    personId: alice.id,
    authorizationId: alice.authorization.id,
    active: true,
  });
  const reset = demoOperatorReducer(changed, { type: "reset" });
  assert.deepEqual(reset, createDemoOperatorBaseline());
  assert.notEqual(reset, baseline);
});

test("corrupt or non-synthetic state fails closed to baseline", () => {
  const corrupt = createDemoOperatorBaseline();
  corrupt.people[0].id = "customer-record";
  const reset = demoOperatorReducer(corrupt, { type: "reset" });
  assert.deepEqual(reset, createDemoOperatorBaseline());
});

test("operator UI has no database, API, storage, or customer-data path", () => {
  const source = readFileSync(
    path.join(process.cwd(), "app/demo/operator/demo-operator-sandbox.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bprisma\b/i);
  assert.doesNotMatch(source, /\/api\//);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.match(source, /Synthetic · Non-production · Browser-local · Resettable/);
});
