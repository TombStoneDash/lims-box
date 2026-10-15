import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/competencies/[id]/reviews/route";
import { prisma } from "../../lib/prisma";

function postRequest(body: unknown) {
  return new NextRequest("http://x/api/competencies/c/reviews", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

test("POST /api/competencies/:id/reviews rejects non-string body fields with 400 instead of throwing", async (t) => {
  const competencyDelegate = prisma.competency as unknown as {
    findUnique: (...args: unknown[]) => Promise<unknown>;
  };
  const reviewEventDelegate = prisma.reviewEvent as unknown as {
    create: (...args: unknown[]) => Promise<unknown>;
  };
  const originalFindUnique = competencyDelegate.findUnique;
  const originalCreate = reviewEventDelegate.create;

  let createCalls = 0;
  competencyDelegate.findUnique = async () => ({ id: "c" });
  reviewEventDelegate.create = async (args: { data: Record<string, unknown> }) => {
    createCalls++;
    return { id: "review-1", ...args.data };
  };

  t.after(async () => {
    competencyDelegate.findUnique = originalFindUnique;
    reviewEventDelegate.create = originalCreate;
    await prisma.$disconnect();
  });

  const params = Promise.resolve({ id: "c" });

  await t.test("non-string review_type returns 400 without creating a review event", async () => {
    createCalls = 0;
    const response = await POST(postRequest({ review_type: 5 }), { params });
    assert.equal(response.status, 400);
    const bodyJson = await response.json();
    assert.ok(["MISSING_FIELD", "INVALID_VALUE"].includes(bodyJson.error.code));
    assert.equal(createCalls, 0);
  });

  await t.test("null body returns 400 without creating a review event", async () => {
    createCalls = 0;
    const response = await POST(postRequest(null), { params });
    assert.equal(response.status, 400);
    const bodyJson = await response.json();
    assert.ok(["MISSING_FIELD", "INVALID_VALUE"].includes(bodyJson.error.code));
    assert.equal(createCalls, 0);
  });

  await t.test("otherwise-valid body with non-string notes returns 400 without creating a review event", async () => {
    createCalls = 0;
    const response = await POST(
      postRequest({
        review_type: "annual",
        review_outcome: "competent",
        reviewer_name: "Alex Reviewer",
        reviewer_role: "Supervisor",
        notes: 5,
      }),
      { params }
    );
    assert.equal(response.status, 400);
    const bodyJson = await response.json();
    assert.equal(bodyJson.error.code, "INVALID_VALUE");
    assert.equal(createCalls, 0);
  });

  await t.test("non-string reviewed_at returns 400 INVALID_VALUE without creating a review event", async () => {
    createCalls = 0;
    const response = await POST(
      postRequest({
        review_type: "annual",
        review_outcome: "competent",
        reviewer_name: "Alex Reviewer",
        reviewer_role: "Supervisor",
        reviewed_at: 5,
      }),
      { params }
    );
    assert.equal(response.status, 400);
    const bodyJson = await response.json();
    assert.equal(bodyJson.error.code, "INVALID_VALUE");
    assert.equal(createCalls, 0);
  });

  await t.test("non-string next_review_due returns 400 INVALID_VALUE without creating a review event", async () => {
    createCalls = 0;
    const response = await POST(
      postRequest({
        review_type: "annual",
        review_outcome: "competent",
        reviewer_name: "Alex Reviewer",
        reviewer_role: "Supervisor",
        next_review_due: 5,
      }),
      { params }
    );
    assert.equal(response.status, 400);
    const bodyJson = await response.json();
    assert.equal(bodyJson.error.code, "INVALID_VALUE");
    assert.equal(createCalls, 0);
  });

  await t.test("valid body with string notes returns 201 with trimmed notes", async () => {
    createCalls = 0;
    const response = await POST(
      postRequest({
        review_type: "annual",
        review_outcome: "competent",
        reviewer_name: "Alex Reviewer",
        reviewer_role: "Supervisor",
        notes: "  looks good  ",
      }),
      { params }
    );
    assert.equal(response.status, 201);
    const bodyJson = await response.json();
    assert.equal(bodyJson.data.notes, "looks good");
    assert.equal(createCalls, 1);
  });
});
