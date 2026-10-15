import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/reviews/upcoming/route";
import { prisma } from "../../lib/prisma";

test("GET /api/reviews/upcoming validates days and reviewer_name params", async (t) => {
  const reviewEventDelegate = prisma.reviewEvent as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
  const originalFindMany = reviewEventDelegate.findMany;

  t.after(async () => {
    reviewEventDelegate.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  let captured: { where: unknown } | undefined;
  reviewEventDelegate.findMany = async (args: { where: unknown }) => {
    captured = args;
    return [];
  };

  const call = async (query: string) => {
    captured = undefined;
    const request = new NextRequest(`http://localhost/api/reviews/upcoming${query}`);
    const response = await GET(request);
    const body = await response.json();
    return { response, body, where: captured!.where as { reviewerName?: unknown } };
  };

  // Non-numeric days falls back to the default window (30), not parseInt's "7abc" -> 7.
  {
    const { response, body } = await call("?days=7abc");
    assert.equal(response.status, 200);
    assert.equal(body.meta.days_window, 30);
  }

  // Scientific-notation style strings must not be coerced by parseInt ("1e3" -> 1).
  {
    const { response, body } = await call("?days=1e3");
    assert.equal(response.status, 200);
    assert.equal(body.meta.days_window, 30);
  }

  // A valid in-range integer is honored as-is.
  {
    const { response, body } = await call("?days=45");
    assert.equal(response.status, 200);
    assert.equal(body.meta.days_window, 45);
  }

  // Out-of-range values are clamped to the max of 90.
  {
    const { response, body } = await call("?days=500");
    assert.equal(response.status, 200);
    assert.equal(body.meta.days_window, 90);
  }

  // reviewer_name is trimmed and matched case-insensitively via Prisma's `mode`.
  {
    const { where } = await call("?reviewer_name=smith");
    assert.deepEqual(where.reviewerName, { contains: "smith", mode: "insensitive" });
  }

  // Blank/whitespace-only reviewer_name is ignored entirely rather than sent as a filter.
  {
    const { where } = await call("?reviewer_name=%20%20");
    assert.equal(where.reviewerName, undefined);
  }
});
