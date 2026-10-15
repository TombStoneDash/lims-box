import assert from "node:assert/strict";
import test from "node:test";
import { GET as getPersonnelPdf } from "../../app/admin/survey-ready/pdf/route";
import { prisma } from "../../lib/prisma";
import { extractPdfText } from "../helpers/pdf";

test("GET /admin/survey-ready/pdf prints computed competency status, not the stored status", async (t) => {
  const delegate = prisma.person as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindMany = delegate.findMany;

  t.after(async () => {
    delegate.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  await t.test("current completed competency past expiresAt prints overdue", async () => {
    delegate.findMany = async () => [
      {
        id: "p1",
        name: "Avery Overdue",
        role: "Medical Laboratory Scientist",
        active: true,
        cliaCertNumber: null,
        hireDate: new Date("2024-01-01T00:00:00Z"),
        competencies: [
          {
            type: "pipetting",
            status: "completed",
            expiresAt: new Date("2025-01-01T00:00:00Z"),
            createdAt: new Date("2024-01-01T00:00:00Z"),
          },
        ],
        trainings: [],
        signOffs: [],
      },
    ];

    const response = await getPersonnelPdf();
    assert.equal(response.status, 200);
    const pdf = new Uint8Array(await response.arrayBuffer());
    const lines = extractPdfText(pdf);
    assert.ok(
      lines.some((line) => line === "• pipetting — overdue (expires Jan 1, 2025)"),
      `expected overdue line, got: ${JSON.stringify(lines)}`,
    );
    assert.ok(!lines.some((line) => line.includes("completed (expires Jan 1, 2025)")));
  });

  await t.test("superseded older row of the same type keeps its stored status", async () => {
    delegate.findMany = async () => [
      {
        id: "p2",
        name: "Jordan Superseded",
        role: "Medical Laboratory Scientist",
        active: true,
        cliaCertNumber: null,
        hireDate: new Date("2024-01-01T00:00:00Z"),
        competencies: [
          {
            type: "pipetting",
            status: "completed",
            expiresAt: new Date("2025-01-01T00:00:00Z"),
            createdAt: new Date("2023-01-01T00:00:00Z"),
          },
          {
            type: "pipetting",
            status: "completed",
            expiresAt: new Date("2027-01-01T00:00:00Z"),
            createdAt: new Date("2026-01-01T00:00:00Z"),
          },
        ],
        trainings: [],
        signOffs: [],
      },
    ];

    const response = await getPersonnelPdf();
    assert.equal(response.status, 200);
    const pdf = new Uint8Array(await response.arrayBuffer());
    const lines = extractPdfText(pdf);
    assert.ok(
      lines.some((line) => line === "• pipetting — completed (expires Jan 1, 2025)"),
      `expected superseded row to keep stored status, got: ${JSON.stringify(lines)}`,
    );
    assert.ok(
      lines.some((line) => line === "• pipetting — completed (expires Jan 1, 2027)"),
      `expected current row to print completed, got: ${JSON.stringify(lines)}`,
    );
  });

  await t.test("unexpired completed competency still prints completed", async () => {
    delegate.findMany = async () => [
      {
        id: "p3",
        name: "Riley Current",
        role: "Medical Laboratory Scientist",
        active: true,
        cliaCertNumber: null,
        hireDate: new Date("2024-01-01T00:00:00Z"),
        competencies: [
          {
            type: "centrifugation",
            status: "completed",
            expiresAt: new Date("2099-01-01T00:00:00Z"),
            createdAt: new Date("2024-01-01T00:00:00Z"),
          },
        ],
        trainings: [],
        signOffs: [],
      },
    ];

    const response = await getPersonnelPdf();
    assert.equal(response.status, 200);
    const pdf = new Uint8Array(await response.arrayBuffer());
    const lines = extractPdfText(pdf);
    assert.ok(
      lines.some((line) => line === "• centrifugation — completed (expires Jan 1, 2099)"),
      `expected completed line, got: ${JSON.stringify(lines)}`,
    );
  });
});
