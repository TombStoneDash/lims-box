import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  pagedResponse,
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
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return pagedResponse(events, limit);
}

/** POST /api/competencies/:id/reviews — log a review event */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const comp = await prisma.competency.findUnique({ where: { id } });
  if (!comp) return apiError("NOT_FOUND", "Competency record not found", { competency_id: id }, 404);

  let body: {
    review_type?: string;
    review_outcome?: string;
    reviewer_name?: string;
    reviewer_role?: string;
    notes?: string;
    next_review_due?: string;
    reviewed_at?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON");
  }

  const reviewType = (body.review_type ?? "").trim();
  const reviewOutcome = (body.review_outcome ?? "").trim();
  const reviewerName = (body.reviewer_name ?? "").trim();
  const reviewerRole = (body.reviewer_role ?? "").trim();

  if (!reviewType) return apiError("MISSING_FIELD", "review_type is required");
  if (!REVIEW_TYPES.includes(reviewType as ReviewType))
    return apiError("INVALID_VALUE", `review_type must be one of: ${REVIEW_TYPES.join(", ")}`);
  if (!reviewOutcome) return apiError("MISSING_FIELD", "review_outcome is required");
  if (!REVIEW_OUTCOMES.includes(reviewOutcome as (typeof REVIEW_OUTCOMES)[number]))
    return apiError("INVALID_VALUE", `review_outcome must be one of: ${REVIEW_OUTCOMES.join(", ")}`);
  if (!reviewerName) return apiError("MISSING_FIELD", "reviewer_name is required");
  if (!reviewerRole) return apiError("MISSING_FIELD", "reviewer_role is required");

  const reviewedAt = body.reviewed_at ? new Date(body.reviewed_at) : new Date();
  if (isNaN(reviewedAt.getTime()))
    return apiError("INVALID_VALUE", "reviewed_at must be a valid ISO date string");

  // Calculate next_review_due from reviewedAt if not explicitly provided
  let nextReviewDue: Date | null = null;
  if (body.next_review_due) {
    nextReviewDue = new Date(body.next_review_due);
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
      notes: body.notes?.trim() || null,
      nextReviewDue,
      reviewedAt,
    },
  });

  return NextResponse.json(
    {
      data: event,
      meta: {
        next_review_due_calculated: !body.next_review_due,
        next_review_due: nextReviewDue,
      },
    },
    { status: 201 }
  );
}
