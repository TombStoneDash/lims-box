import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/competencies/[id]/reviews/export/route";
import { prisma } from "../../lib/prisma";
import { extractPdfText } from "../helpers/pdf";

function getRequest() {
  return new NextRequest("http://x/api/competencies/c/reviews/export");
}

test("GET /api/competencies/:id/reviews/export lists suspended reviews under CORRECTIVE ACTIONS", async (t) => {
  const competencyDelegate = prisma.competency as unknown as {
    findUnique: (...args: unknown[]) => Promise<unknown>;
  };
  const authorizationDelegate = prisma.authorization as unknown as {
    findFirst: (...args: unknown[]) => Promise<unknown>;
  };
  const originalFindUnique = competencyDelegate.findUnique;
  const originalFindFirst = authorizationDelegate.findFirst;

  t.after(async () => {
    competencyDelegate.findUnique = originalFindUnique;
    authorizationDelegate.findFirst = originalFindFirst;
    await prisma.$disconnect();
  });

  authorizationDelegate.findFirst = async () => null;

  const params = Promise.resolve({ id: "c" });

  await t.test("suspended-only competency shows the review note, not 'None.'", async () => {
    competencyDelegate.findUnique = async () => ({
      id: "c",
      type: "microbiology",
      status: "active",
      person: { id: "p1", name: "Jamie Synthetic", role: "Tech" },
      reviewEvents: [
        {
          reviewType: "ad_hoc",
          reviewOutcome: "suspended",
          notes: "Synthetic suspension note",
          reviewerName: "Dana Reviewer",
          reviewedAt: new Date("2026-01-05T00:00:00Z"),
          nextReviewDue: null,
        },
      ],
    });

    const response = await GET(getRequest(), { params });
    const lines = extractPdfText(new Uint8Array(await response.arrayBuffer()));
    const text = lines.join(" ");

    assert.ok(text.includes("Synthetic suspension note"), "expected suspended review note to be present");
    assert.ok(!text.includes("None."), "expected 'None.' to be absent when a suspended review exists");
  });

  await t.test("competent-only competency still shows 'None.'", async () => {
    competencyDelegate.findUnique = async () => ({
      id: "c",
      type: "microbiology",
      status: "active",
      person: { id: "p1", name: "Jamie Synthetic", role: "Tech" },
      reviewEvents: [
        {
          reviewType: "annual",
          reviewOutcome: "competent",
          notes: "All good",
          reviewerName: "Dana Reviewer",
          reviewedAt: new Date("2026-01-05T00:00:00Z"),
          nextReviewDue: null,
        },
      ],
    });

    const response = await GET(getRequest(), { params });
    const lines = extractPdfText(new Uint8Array(await response.arrayBuffer()));
    const text = lines.join(" ");

    assert.ok(text.includes("None."), "expected 'None.' when no adverse reviews exist");
  });
});
