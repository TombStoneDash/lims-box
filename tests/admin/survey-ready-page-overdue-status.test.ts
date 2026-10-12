import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { competencyDisplayStatus } from "../../lib/competency-display-status";

const sourcePath = path.join(process.cwd(), "app/admin/survey-ready/page.tsx");
const source = readFileSync(sourcePath, "utf8");

async function renderSurveyReadyPage(people: unknown[]): Promise<string> {
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": await import("react/jsx-runtime"),
    "next/link": { default: ({ children, ...props }: any) => React.createElement("a", props, children) },
    "@/lib/prisma": {
      prisma: {
        person: {
          findMany: async () => people,
        },
      },
    },
    "@/lib/competency-display-status": { competencyDisplayStatus },
    "../_components/StatusBadge": {
      StatusBadge: ({ status }: { status: string }) => React.createElement("span", null, status),
      formatDate: (value: Date) => value?.toISOString().slice(0, 10),
    },
  };
  const exports: { default?: () => Promise<React.ReactElement> } = {};
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
  return renderToStaticMarkup(await exports.default!());
}

function syntheticPerson(competencies: unknown[]) {
  return {
    id: "synthetic-person",
    name: "Synthetic Analyst",
    role: "Analyst",
    hireDate: new Date("2024-01-01T00:00:00Z"),
    cliaCertNumber: "SYNTHETIC-CERT",
    competencies,
    trainings: [],
    signOffs: [],
  };
}

test("survey-ready page shows overdue for a current competency past its expiry even though status is still completed", async () => {
  const markup = await renderSurveyReadyPage([
    syntheticPerson([
      {
        id: "c1",
        type: "pipetting",
        status: "completed",
        expiresAt: new Date("2025-01-01T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
    ]),
  ]);
  assert.match(markup, /<li[^>]*><span>pipetting<\/span><span>overdue<\/span><\/li>/);
  assert.doesNotMatch(markup, />completed</);
});

test("survey-ready page keeps a superseded older competency row's own stored status", async () => {
  const markup = await renderSurveyReadyPage([
    syntheticPerson([
      {
        id: "c-old",
        type: "centrifuge",
        status: "due",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        createdAt: new Date("2023-01-01T00:00:00Z"),
      },
      {
        id: "c-new",
        type: "centrifuge",
        status: "completed",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        createdAt: new Date("2024-06-01T00:00:00Z"),
      },
    ]),
  ]);
  assert.match(markup, /<li[^>]*><span>centrifuge<\/span><span>due<\/span><\/li>/);
  assert.match(markup, /<li[^>]*><span>centrifuge<\/span><span>completed<\/span><\/li>/);
});

test("survey-ready page shows completed for an unexpired current competency", async () => {
  const markup = await renderSurveyReadyPage([
    syntheticPerson([
      {
        id: "c1",
        type: "pipetting",
        status: "completed",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
    ]),
  ]);
  assert.match(markup, /<li[^>]*><span>pipetting<\/span><span>completed<\/span><\/li>/);
  assert.doesNotMatch(markup, />overdue</);
});
