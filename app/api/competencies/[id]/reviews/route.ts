import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  pagedResponseLookahead,
  parsePagination,
  REVIEW_TYPES,
  REVIEW_OUTCOMES,
  calcNextReviewDue,
  type ReviewType,
} from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/competencies/:id/reviews — paginated review history */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const comp = await prisma.competency.findUnique({ where: { id } });
  if (!comp) return apiError("NOT_FOUND", "Competency record not found", { competency_id: id }, 404);

  const { limit, cursor } = parsePagination(new URL(req.url));

  const events = await prisma.reviewEvent.findMany({
    where: { competencyId: id },
    orderBy: { reviewedAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return pagedResponseLookahead(events, limit);
}

/** POST /api/competencies/:id/reviews — log a review event */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const comp = await prisma.competency.findUnique({ where: { id } });
  if (!comp) return apiError("NOT_FOUND", "Competency record not found", { competency_id: id }, 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body))
    return apiError("INVALID_VALUE", "Request body must be a JSON object");

  const payload = body as {
    review_type?: unknown;
    review_outcome?: unknown;
    reviewer_name?: unknown;
    reviewer_role?: unknown;
    notes?: unknown;
    next_review_due?: unknown;
    reviewed_at?: unknown;
  };

  const reviewType = typeof payload.review_type === "string" ? payload.review_type.trim() : "";
  const reviewOutcome = typeof payload.review_outcome === "string" ? payload.review_outcome.trim() : "";
  const reviewerName = typeof payload.reviewer_name === "string" ? payload.reviewer_name.trim() : "";
  const reviewerRole = typeof payload.reviewer_role === "string" ? payload.reviewer_role.trim() : "";

  if (!reviewType) return apiError("MISSING_FIELD", "review_type is required");
  if (!REVIEW_TYPES.includes(reviewType as ReviewType))
    return apiError("INVALID_VALUE", `review_type must be one of: ${REVIEW_TYPES.join(", ")}`);
  if (!reviewOutcome) return apiError("MISSING_FIELD", "review_outcome is required");
  if (!REVIEW_OUTCOMES.includes(reviewOutcome as (typeof REVIEW_OUTCOMES)[number]))
    return apiError("INVALID_VALUE", `review_outcome must be one of: ${REVIEW_OUTCOMES.join(", ")}`);
  if (!reviewerName) return apiError("MISSING_FIELD", "reviewer_name is required");
  if (!reviewerRole) return apiError("MISSING_FIELD", "reviewer_role is required");

  if (payload.notes !== undefined && typeof payload.notes !== "string")
    return apiError("INVALID_VALUE", "notes must be a string");
  if (payload.reviewed_at !== undefined && typeof payload.reviewed_at !== "string")
    return apiError("INVALID_VALUE", "reviewed_at must be a valid ISO date string");
  if (payload.next_review_due !== undefined && typeof payload.next_review_due !== "string")
    return apiError("INVALID_VALUE", "next_review_due must be a valid ISO date string");

  const reviewedAtInput = payload.reviewed_at as string | undefined;
  const nextReviewDueInput = payload.next_review_due as string | undefined;

  const reviewedAt = reviewedAtInput ? new Date(reviewedAtInput) : new Date();
  if (isNaN(reviewedAt.getTime()))
    return apiError("INVALID_VALUE", "reviewed_at must be a valid ISO date string");

  // Calculate next_review_due from reviewedAt if not explicitly provided
  let nextReviewDue: Date | null = null;
  if (nextReviewDueInput) {
    nextReviewDue = new Date(nextReviewDueInput);
    if (isNaN(nextReviewDue.getTime()))
      return apiError("INVALID_VALUE", "next_review_due must be a valid ISO date string");
  } else {
    nextReviewDue = calcNextReviewDue(reviewType as ReviewType, reviewedAt);
  }

  const event = await prisma.reviewEvent.create({
    data: {
      competencyId: id,
      reviewerName,
      reviewerRole,
      reviewType,
      reviewOutcome,
      notes: typeof payload.notes === "string" ? payload.notes.trim() || null : null,
      nextReviewDue,
      reviewedAt,
    },
  });

  return NextResponse.json(
    {
      data: event,
      meta: {
        next_review_due_calculated: !nextReviewDueInput,
        next_review_due: nextReviewDue,
      },
    },
    { status: 201 }
  );
}
