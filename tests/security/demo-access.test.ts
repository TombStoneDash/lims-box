import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  basicCredentialsMatch,
  evaluateDemoAccess,
  isProtectedDemoPath,
} from "../../lib/demo-access";

const user = "operator";
const pass = "synthetic-preview-only";
const authorization = `Basic ${btoa(`${user}:${pass}`)}`;

test("public walkthrough remains public", () => {
  assert.deepEqual(
    evaluateDemoAccess({ pathname: "/demo", method: "GET", authorization: null }),
    { kind: "allow" },
  );
});
test("missing credentials fail closed", () => {
  assert.deepEqual(
    evaluateDemoAccess({ pathname: "/admin", method: "GET", authorization: null }),
    { kind: "unavailable", status: 503 },
  );
});

test("anonymous operator access is rejected", () => {
  assert.deepEqual(
    evaluateDemoAccess({
      pathname: "/demo/operator",
      method: "GET",
      authorization: null,
      configuredUser: user,
      configuredPass: pass,
    }),
    { kind: "authentication_required", status: 401 },
  );
});

test("authenticated operator can read the protected sandbox", () => {
  assert.deepEqual(
    evaluateDemoAccess({
      pathname: "/demo/operator",
      method: "GET",
      authorization,
      configuredUser: user,
      configuredPass: pass,
    }),
    { kind: "allow" },
  );
});

test("authenticated operator cannot POST to admin or data APIs", () => {
  for (const pathname of [
    "/admin/people/new",
    "/api/authorizations/demo-id/revoke",
    "/api/competencies/demo-id/reviews",
    "/api/documents",
    "/api/people/demo-id/authorizations",
    "/api/procedures",
  ]) {
    assert.deepEqual(
      evaluateDemoAccess({
        pathname,
        method: "POST",
        authorization,
        configuredUser: user,
        configuredPass: pass,
      }),
      { kind: "read_only", status: 405 },
      pathname,
    );
  }
});

test("all personnel/admin data prefixes are protected", () => {
  for (const pathname of [
    "/admin",
    "/senaite-demo",
    "/demo/operator",
    "/api/admin/personnel-pack/survey-export",
    "/api/authorizations/x/revoke",
    "/api/competencies/x/reviews",
    "/api/documents/x/versions",
    "/api/people/x/authorizations",
    "/api/procedures",
    "/api/reviews/upcoming",
  ]) {
    assert.equal(isProtectedDemoPath(pathname), true, pathname);
  }
});

test("malformed and incorrect Basic credentials fail", () => {
  assert.equal(basicCredentialsMatch("Bearer no", user, pass), false);
  assert.equal(basicCredentialsMatch("Basic not-base64!", user, pass), false);
  assert.equal(basicCredentialsMatch(`Basic ${btoa(`${user}:wrong`)}`, user, pass), false);
  assert.equal(basicCredentialsMatch(authorization, user, pass), true);
});

test("middleware matcher names every protected data prefix", () => {
  const source = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
  for (const prefix of [
    "admin",
    "senaite-demo",
    "demo/operator",
    "api/admin",
    "api/authorizations",
    "api/competencies",
    "api/documents",
    "api/people",
    "api/procedures",
    "api/reviews",
  ]) {
    assert.match(source, new RegExp(prefix.replace("/", "\\/")), prefix);
  }
});
