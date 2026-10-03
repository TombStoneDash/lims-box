import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { recentSignOffWindow } from "../lib/admin-signoff-stats";

const NOW = new Date("2026-10-02T12:00:00Z");

test("recentSignOffWindow includes today and the preceding 30 days", () => {
  const window = recentSignOffWindow(NOW);

  const expectedStart = new Date(NOW);
  expectedStart.setDate(expectedStart.getDate() - 30);

  assert.equal(window.gte.getTime(), expectedStart.getTime());
  assert.equal(window.lte.getTime(), NOW.getTime());
});

test("recentSignOffWindow excludes a signedAt value in the future", () => {
  const window = recentSignOffWindow(NOW);
  const future = new Date(NOW);
  future.setDate(future.getDate() + 1);

  assert.ok(
    future.getTime() > window.lte.getTime(),
    "a signedAt timestamp after now must fall outside the window's upper bound",
  );
});

test("recentSignOffWindow excludes a signedAt value older than the 30-day window", () => {
  const window = recentSignOffWindow(NOW);
  const tooOld = new Date(window.gte);
  tooOld.setDate(tooOld.getDate() - 1);

  assert.ok(
    tooOld.getTime() < window.gte.getTime(),
    "a signedAt timestamp before the window start must fall outside the window's lower bound",
  );
});

test("app/admin/page.tsx counts sign-offs with prisma.signOff.count({ where: { signedAt: recentSignOffWindow(now) } })", () => {
  const filePath = join(__dirname, "..", "app", "admin", "page.tsx");
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let found = false;

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === "prisma.signOff.count") {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const whereProp = arg.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === "where",
        );
        if (whereProp && ts.isObjectLiteralExpression(whereProp.initializer)) {
          const signedAtProp = whereProp.initializer.properties.find(
            (p): p is ts.PropertyAssignment =>
              ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === "signedAt",
          );
          if (
            signedAtProp &&
            ts.isCallExpression(signedAtProp.initializer) &&
            signedAtProp.initializer.expression.getText(sourceFile) === "recentSignOffWindow"
          ) {
            found = true;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  assert.ok(
    found,
    "expected prisma.signOff.count({ where: { signedAt: recentSignOffWindow(now) } }) in app/admin/page.tsx",
  );
});
