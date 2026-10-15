import assert from "node:assert/strict";
import test from "node:test";
import {
  basicCredentialsMatch,
  evaluateDemoAccess,
} from "../../lib/demo-access";

function encodeUtf8Basic(user: string, pass: string): string {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `Basic ${btoa(binary)}`;
}

test("accented UTF-8 credentials match", () => {
  const user = "ádmin";
  const pass = "pässword";
  assert.equal(
    basicCredentialsMatch(encodeUtf8Basic(user, pass), user, pass),
    true,
  );
});

test("CJK UTF-8 credentials match", () => {
  const user = "操作员";
  const pass = "密码测试";
  assert.equal(
    basicCredentialsMatch(encodeUtf8Basic(user, pass), user, pass),
    true,
  );
});

test("emoji UTF-8 credentials match", () => {
  const user = "demo🔥user";
  const pass = "pass🔐word";
  assert.equal(
    basicCredentialsMatch(encodeUtf8Basic(user, pass), user, pass),
    true,
  );
});

test("wrong non-ASCII password is rejected", () => {
  const user = "ádmin";
  const pass = "pässword";
  assert.equal(
    basicCredentialsMatch(encodeUtf8Basic(user, "wrong-pässword"), user, pass),
    false,
  );
});

test("raw invalid UTF-8 bytes fail closed", () => {
  const binary = String.fromCharCode(0xff, 0xff, 0x3a, 0xff);
  const authorization = `Basic ${btoa(binary)}`;
  assert.equal(basicCredentialsMatch(authorization, "ádmin", "pässword"), false);
});

test("ASCII credentials still match", () => {
  const user = "operator";
  const pass = "synthetic-preview-only";
  assert.equal(
    basicCredentialsMatch(encodeUtf8Basic(user, pass), user, pass),
    true,
  );
});

test("evaluateDemoAccess allows GET with a UTF-8 Basic header", () => {
  const user = "ádmin";
  const pass = "pässword";
  assert.deepEqual(
    evaluateDemoAccess({
      pathname: "/demo/operator",
      method: "GET",
      authorization: encodeUtf8Basic(user, pass),
      configuredUser: user,
      configuredPass: pass,
    }),
    { kind: "allow" },
  );
});
