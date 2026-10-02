import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { formatCalendarDate, formatTimestampDate } from "../lib/admin-calendar-date";

function parsedSource(relativePath: string, kind = ts.ScriptKind.TS): ts.SourceFile {
  const filePath = path.join(__dirname, "..", relativePath);
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
}

function hasCall(source: ts.SourceFile, callee: string): boolean {
  let found = false;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callee) {
      found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function hasCallWithPropertyArgument(source: ts.SourceFile, callee: string, property: string): boolean {
  let found = false;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === callee &&
      node.arguments.some((argument) => ts.isPropertyAccessExpression(argument) && argument.name.text === property)
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

test("formatCalendarDate renders UTC-midnight date-only values without a day shift west of UTC", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--eval", `
      import calendarDate from "${path.join(__dirname, "../lib/admin-calendar-date.ts")}";
      process.stdout.write(calendarDate.formatCalendarDate(new Date("2026-10-02")));
    `],
    { env: { ...process.env, TZ: "America/Los_Angeles" }, encoding: "utf8", timeout: 10_000 },
  );
  assert.equal(output, "Oct 2, 2026");
});

test("formatCalendarDate renders an em dash for null and invalid inputs", () => {
  assert.equal(formatCalendarDate(null), "—");
  assert.equal(formatCalendarDate(undefined), "—");
  assert.equal(formatCalendarDate("not-a-date"), "—");
  assert.equal(formatCalendarDate(new Date(NaN)), "—");
});

test("formatTimestampDate preserves local calendar semantics for real timestamps", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--eval", `
      import calendarDate from "${path.join(__dirname, "../lib/admin-calendar-date.ts")}";
      process.stdout.write(calendarDate.formatTimestampDate(new Date("2026-10-02T01:00:00Z")));
    `],
    { env: { ...process.env, TZ: "America/Los_Angeles" }, encoding: "utf8", timeout: 10_000 },
  );
  assert.equal(output, "Oct 1, 2026");
  assert.equal(formatTimestampDate(null), "—");
  assert.equal(formatTimestampDate("not-a-date"), "—");
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
  const source = parsedSource("app/admin/_components/StatusBadge.tsx", ts.ScriptKind.TSX);
  assert.ok(hasCall(source, "formatCalendarDate"), "formatDate must call formatCalendarDate(), not just import it");
  assert.ok(hasCall(source, "formatLocalTimestampDate"), "formatTimestampDate must call the local timestamp formatter");
});

test("remaining date-only paths use the calendar formatter", () => {
  const paths = [
    "app/admin/page.tsx",
    "app/admin/survey-ready/pdf/route.ts",
  ];
  for (const relativePath of paths) {
    const source = parsedSource(relativePath, ts.ScriptKind.TSX);
    assert.ok(hasCall(source, "formatCalendarDate"), `${relativePath} must call formatCalendarDate()`);
  }
});

test("wall-clock timestamp displays use the local timestamp formatter", () => {
  const paths = [
    "app/admin/procedures/page.tsx",
    "app/admin/documents/page.tsx",
    "app/admin/documents/[id]/page.tsx",
    "app/admin/competencies/[id]/page.tsx",
  ];
  for (const relativePath of paths) {
    const source = parsedSource(relativePath, ts.ScriptKind.TSX);
    assert.ok(hasCall(source, "formatTimestampDate"), `${relativePath} must call formatTimestampDate()`);
  }
});

test("audit-trail timestamps use the local timestamp formatter", () => {
  const paths = [
    ["app/admin/documents/[id]/page.tsx", "supersededDate"],
    ["app/admin/people/[id]/page.tsx", "revokedAt"],
    ["app/admin/procedures/[id]/page.tsx", "revokedAt"],
  ] as const;
  for (const [relativePath, property] of paths) {
    const source = parsedSource(relativePath, ts.ScriptKind.TSX);
    assert.ok(
      hasCallWithPropertyArgument(source, "formatTimestampDate", property),
      `${relativePath} must pass ${property} to formatTimestampDate()`,
    );
  }
});
