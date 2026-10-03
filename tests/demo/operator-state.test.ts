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
  assert.deepEqual(baseline.activity, []);
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
  assert.deepEqual(changed.activity, ["Recorded a synthetic competency review for Alice Morgan (review 1)."]);
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
  assert.deepEqual(changed.activity, ["Granted synthetic authorisation: Synthetic immunisation workflow for Alice Morgan."]);
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

test("reset restores the deterministic baseline with exactly one activity entry", () => {
  const baseline = createDemoOperatorBaseline();
  const alice = baseline.people[0];
  const changed = demoOperatorReducer(baseline, {
    type: "set_authorization",
    personId: alice.id,
    authorizationId: alice.authorization.id,
    active: true,
  });
  const reset = demoOperatorReducer(changed, { type: "reset" });
  assert.deepEqual(reset, { ...createDemoOperatorBaseline(), activity: ["Reset to the synthetic baseline."] });
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
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Recent activity/);
  assert.match(source, /No changes yet in this tab\./);
  assert.match(source, /Synthetic · Non-production · Browser-local · Resettable/);
});


test("activity is newest first and a sixth action drops the oldest", () => {
  let state = createDemoOperatorBaseline();
  const alice = state.people[0];
  for (let review = 1; review <= 6; review++) {
    const before = structuredClone(state);
    const previous = state;
    state = demoOperatorReducer(state, {
      type: "record_competency_review",
      personId: alice.id,
      competencyId: alice.competency.id,
    });
    assert.deepEqual(previous, before);
    assert.notEqual(state, previous);
    assert.deepEqual(state.activity, Array.from(
      { length: Math.min(review, 5) },
      (_, index) => `Recorded a synthetic competency review for Alice Morgan (review ${review - index}).`,
    ));
  }
});

test("grant, revoke, and reset leave their input states untouched", () => {
  let state = createDemoOperatorBaseline();
  const alice = state.people[0];
  for (const active of [true, false]) {
    const previous = state;
    const snapshot = structuredClone(previous);
    state = demoOperatorReducer(previous, {
      type: "set_authorization",
      personId: alice.id,
      authorizationId: alice.authorization.id,
      active,
    });
    assert.deepEqual(previous, snapshot);
    assert.deepEqual(state.activity, [
      `${active ? "Granted" : "Revoked"} synthetic authorisation: Synthetic immunisation workflow for Alice Morgan.`,
      ...previous.activity,
    ]);
  }
  const snapshot = structuredClone(state);
  const reset = demoOperatorReducer(state, { type: "reset" });
  assert.deepEqual(state, snapshot);
  assert.deepEqual(reset.activity, ["Reset to the synthetic baseline."]);
  assert.deepEqual(createDemoOperatorBaseline().activity, []);
});

test("rejected and unchanged actions preserve existing activity and state", () => {
  const baseline = createDemoOperatorBaseline();
  const alice = baseline.people[0];
  const state = demoOperatorReducer(baseline, {
    type: "record_competency_review", personId: alice.id, competencyId: alice.competency.id,
  });
  const snapshot = structuredClone(state);
  const actions = [
    { type: "record_competency_review", personId: "unknown", competencyId: alice.competency.id },
    { type: "record_competency_review", personId: alice.id, competencyId: "unknown" },
    { type: "set_authorization", personId: "unknown", authorizationId: alice.authorization.id, active: true },
    { type: "set_authorization", personId: alice.id, authorizationId: "unknown", active: true },
    { type: "set_authorization", personId: alice.id, authorizationId: alice.authorization.id, active: false },
  ] as const;
  for (const action of actions) {
    assert.equal(demoOperatorReducer(state, action), state);
    assert.deepEqual(state, snapshot);
  }
});
