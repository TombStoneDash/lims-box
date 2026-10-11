import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { adminMutationsEnabled } from "../../lib/admin-capabilities";

const sourcePath = path.join(process.cwd(), "app/admin/people/[id]/page.tsx");
const source = readFileSync(sourcePath, "utf8");

test("person detail remains a server component without browser event handlers", () => {
  assert.doesNotMatch(source, /["']use client["']/);
  assert.doesNotMatch(source, /\bon[A-Z]\w*\s*=/);
});

test("read-only person detail preserves records and history without mutation controls", async () => {
  const date = new Date("2026-01-10T12:00:00Z");
  const person = {
    id: "synthetic-person", name: "Synthetic Analyst", role: "Analyst",
    hireDate: date, cliaCertNumber: "SYNTHETIC-CERT",
    competencies: [{ id: "competency-1", type: "Synthetic competency", completedAt: date, expiresAt: date, notes: "Competency notes" }],
    trainings: [{ id: "training-1", course: "Synthetic course", provider: "Synthetic provider", completedAt: date, hours: 2, certificate: "TRAINING-CERT" }],
    signOffs: [{ id: "signoff-1", directorName: "Synthetic Director", scope: "Synthetic scope", signedAt: date, notes: "Sign-off notes" }],
    authorizations: [
      { id: "active-auth", procedureId: "active-procedure", isActive: true, procedure: { name: "Active procedure", procedureCode: "ACT" }, authorizedAt: date, authorizedBy: "Active Director", scope: "Active scope" },
      { id: "revoked-auth", procedureId: "revoked-procedure", isActive: false, procedure: { name: "Revoked procedure" }, authorizedAt: date, revokedAt: date, revokedBy: "Revoking Director", revocationReason: "Synthetic revocation reason" },
    ],
  };
  // Evaluate the real page with synthetic data and inert server-action dependencies.
  // No database, Next server, or network is needed for this rendering contract.
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": await import("react/jsx-runtime"),
    "next/link": { default: ({ children, ...props }: any) => React.createElement("a", props, children) },
    "next/navigation": { notFound: () => { throw new Error("Unexpected notFound"); } },
    "@/lib/prisma": { prisma: {
      person: { findUnique: async () => person },
      procedure: { findMany: async () => [{ id: "available-procedure", name: "Available procedure" }] },
    } },
    "@/lib/admin-capabilities": { adminMutationsEnabled },
    "@/lib/competency-display-status": { competencyDisplayStatus: () => "completed" },
    "../../_components/StatusBadge": {
      StatusBadge: ({ status }: { status: string }) => React.createElement("span", null, status),
      formatDate: (value: Date) => value?.toISOString().slice(0, 10),
      formatTimestampDate: (value: Date) => value?.toISOString().slice(0, 10),
    },
    "../../pp-actions": {
      grantAuthorization: () => { throw new Error("Unexpected grant"); },
      revokeAuthorization: () => { throw new Error("Unexpected revoke"); },
    },
  };
  const exports: { default?: (props: any) => Promise<React.ReactElement> } = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  });
  assert.equal(adminMutationsEnabled(), false);
  const markup = renderToStaticMarkup(await exports.default!({ params: Promise.resolve({ id: person.id }) }));
  assert.doesNotMatch(markup, /<form\b|<button\b|<input\b|<select\b/);
  assert.doesNotMatch(markup, /href="[^"]*(?:\/edit|\/new)(?:[?"/])/);
  assert.doesNotMatch(markup, />\s*(?:Edit|Revoke|\+?\s*Grant authorization|\+ Log competency|\+ Log training|\+ Add sign-off)\s*</);
  for (const text of [person.name, person.role, "SYNTHETIC-CERT", "Synthetic competency", "Competency notes", "Synthetic course", "TRAINING-CERT", "Synthetic Director", "Sign-off notes", "Active procedure", "ACT", "Active Director", "Active scope", "Revoked procedure", "Revoking Director", "Synthetic revocation reason", "2026-01-10", "Revoked authorizations (1)"]) {
    assert.ok(markup.includes(text), `Missing record detail: ${text}`);
  }
  assert.match(markup, /read-only/);
  assert.match(markup, /href="\/demo\/operator"/);
  assert.match(markup, /synthetic operator sandbox/);
  assert.match(markup, /href="\/admin\/people"/);
  assert.match(markup, /href="\/admin\/competencies\/competency-1"/);

  // Export links live on the linked review page and the survey-ready page.
  // They must remain GET links, independent of the person mutation capability.
  const reviewSource = readFileSync(path.join(process.cwd(), "app/admin/competencies/[id]/page.tsx"), "utf8");
  assert.match(reviewSource, /href=\{`\/api\/competencies\/\$\{competency.id\}\/reviews\/export`\}/);
  const surveySource = readFileSync(path.join(process.cwd(), "app/admin/survey-ready/page.tsx"), "utf8");
  assert.ok(surveySource.includes('href="/api/admin/personnel-pack/survey-export"'));
});
