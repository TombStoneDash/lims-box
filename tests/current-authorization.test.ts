import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { CURRENT_AUTHORIZATION_WHERE, isCurrentAuthorization } from "../lib/current-authorization";

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

function calleeChainText(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    return `${calleeChainText(expr.expression)}.${expr.name.text}`;
  }
  return "";
}

function callExpressionsFor(source: ts.SourceFile, calleeChain: string): ts.CallExpression[] {
  const matches: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && calleeChainText(node.expression) === calleeChain) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return matches;
}

function hasIdentifierAtObjectPath(
  call: ts.CallExpression,
  propertyPath: string[],
  identifierName: string,
): boolean {
  let current: ts.Expression | undefined = call.arguments[0];

  for (const propertyName of propertyPath) {
    if (!current || !ts.isObjectLiteralExpression(current)) return false;
    const property = current.properties.find(
      (candidate): candidate is ts.PropertyAssignment =>
        ts.isPropertyAssignment(candidate) &&
        ts.isIdentifier(candidate.name) &&
        candidate.name.text === propertyName,
    );
    current = property?.initializer;
  }

  return !!current && ts.isIdentifier(current) && current.text === identifierName;
}

test("active authorization for an inactive person is excluded; active authorization for an active person counts", () => {
  const authorizations = [
    { id: "active-person", isActive: true, person: { active: true } },
    { id: "inactive-person", isActive: true, person: { active: false } },
    { id: "revoked-active-person", isActive: false, person: { active: true } },
  ];
  const current = authorizations.filter(isCurrentAuthorization);
  assert.deepEqual(current.map((a) => a.id), ["active-person"]);
});

test("CURRENT_AUTHORIZATION_WHERE requires isActive and the person.active relation constraint", () => {
  const source = parsedSource("lib/current-authorization.ts");
  let foundIsActive = false;
  let foundPersonActive = false;

  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "CURRENT_AUTHORIZATION_WHERE" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
        if (prop.name.text === "isActive" && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
          foundIsActive = true;
        }
        if (prop.name.text === "person" && ts.isObjectLiteralExpression(prop.initializer)) {
          for (const personProp of prop.initializer.properties) {
            if (
              ts.isPropertyAssignment(personProp) &&
              ts.isIdentifier(personProp.name) &&
              personProp.name.text === "active" &&
              personProp.initializer.kind === ts.SyntaxKind.TrueKeyword
            ) {
              foundPersonActive = true;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);

  assert.ok(foundIsActive, "CURRENT_AUTHORIZATION_WHERE must require isActive: true");
  assert.ok(
    foundPersonActive,
    "CURRENT_AUTHORIZATION_WHERE must require the person.active relation constraint",
  );
});

test("app/admin/page.tsx counts authorizations using the centralized current-authorization where clause", () => {
  const source = parsedSource("app/admin/page.tsx", ts.ScriptKind.TSX);
  const calls = callExpressionsFor(source, "prisma.authorization.count");
  assert.ok(calls.length > 0, "expected a prisma.authorization.count( call expression");
  assert.ok(
    calls.some((call) =>
      hasIdentifierAtObjectPath(call, ["where"], "CURRENT_AUTHORIZATION_WHERE"),
    ),
    "prisma.authorization.count must be called with where: CURRENT_AUTHORIZATION_WHERE",
  );
});

test("app/admin/procedures/page.tsx counts per-procedure authorizations using the centralized current-authorization where clause", () => {
  const source = parsedSource("app/admin/procedures/page.tsx", ts.ScriptKind.TSX);
  const calls = callExpressionsFor(source, "prisma.procedure.findMany");
  assert.ok(calls.length > 0, "expected a prisma.procedure.findMany( call expression");
  assert.ok(
    calls.some((call) =>
      hasIdentifierAtObjectPath(
        call,
        ["include", "_count", "select", "authorizations", "where"],
        "CURRENT_AUTHORIZATION_WHERE",
      ),
    ),
    "the authorizations _count must be scoped with where: CURRENT_AUTHORIZATION_WHERE",
  );
});
