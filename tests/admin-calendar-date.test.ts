import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { formatCalendarDate } from "../lib/admin-calendar-date";

test("formatCalendarDate renders UTC-midnight date-only values without a day shift west of UTC", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--eval", `
      import { formatCalendarDate } from "${path.join(__dirname, "../lib/admin-calendar-date")}";
      process.stdout.write(formatCalendarDate(new Date("2026-10-02")));
    `],
    { env: { ...process.env, TZ: "America/Los_Angeles" }, encoding: "utf8" },
  );
  assert.equal(output, "Oct 2, 2026");
});

test("formatCalendarDate renders an em dash for null and invalid inputs", () => {
  assert.equal(formatCalendarDate(null), "—");
  assert.equal(formatCalendarDate(undefined), "—");
  assert.equal(formatCalendarDate("not-a-date"), "—");
  assert.equal(formatCalendarDate(new Date(NaN)), "—");
});

test("formatCalendarDate uses timeZone: UTC in its toLocaleDateString call", () => {
  const filePath = path.join(__dirname, "../lib/admin-calendar-date.ts");
  const text = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

  let found = false;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "toLocaleDateString"
    ) {
      const options = node.arguments[1];
      if (options && ts.isObjectLiteralExpression(options)) {
        for (const prop of options.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            prop.name.getText(source) === "timeZone" &&
            ts.isStringLiteral(prop.initializer) &&
            prop.initializer.text === "UTC"
          ) {
            found = true;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, "formatCalendarDate must call toLocaleDateString with timeZone: \"UTC\"");
});

test("admin StatusBadge formatDate delegates to formatCalendarDate", () => {
  const filePath = path.join(__dirname, "../app/admin/_components/StatusBadge.tsx");
  const text = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let delegates = false;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "formatCalendarDate"
    ) {
      delegates = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(delegates, "StatusBadge's formatDate must call formatCalendarDate(), not just import it");
});
