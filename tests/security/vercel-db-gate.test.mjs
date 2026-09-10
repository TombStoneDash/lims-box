import assert from "node:assert/strict";
import test from "node:test";
import {
  runDatabaseGate,
  shouldPushDatabase,
} from "../../scripts/vercel-db-push-gate.mjs";

test("preview, development, and local builds cannot run database push", () => {
  for (const environment of [undefined, "preview", "development"]) {
    assert.equal(shouldPushDatabase(environment), false);
    let called = false;
    const result = runDatabaseGate({
      vercelEnv: environment,
      exec: () => {
        called = true;
      },
    });
    assert.equal(result, "skipped");
    assert.equal(called, false);
  }
});
test("only an explicit production build may retain the existing database push", () => {
  assert.equal(shouldPushDatabase("production"), true);
  let call;
  const result = runDatabaseGate({
    vercelEnv: "production",
    exec: (command, args) => {
      call = { command, args };
    },
  });
  assert.equal(result, "pushed");
  assert.deepEqual(call, {
    command: "npx",
    args: ["prisma", "db", "push", "--skip-generate"],
  });
});
