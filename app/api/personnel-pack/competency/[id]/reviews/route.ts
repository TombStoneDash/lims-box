import { PersonnelPackReviewOutcome, PersonnelPackReviewType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asJsonError, createReviewEvent } from "@/lib/personnel-pack-v15/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reviews = await prisma.personnelPackReviewEvent.findMany({
    where: { competencyRecordId: id },
    orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
  });
  return Response.json({ reviews });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const review = await createReviewEvent(prisma, {
      competencyRecordId: id,
      reviewerName: body.reviewerName,
      reviewerRole: body.reviewerRole,
      reviewType: body.reviewType as PersonnelPackReviewType,
      reviewOutcome: body.reviewOutcome as PersonnelPackReviewOutcome,
      notes: body.notes ?? null,
      correctiveActionRequired: body.correctiveActionRequired,
      correctiveActionSummary: body.correctiveActionSummary ?? null,
      nextReviewDue: body.nextReviewDue ? new Date(body.nextReviewDue) : undefined,
      reviewedAt: body.reviewedAt ? new Date(body.reviewedAt) : undefined,
    });
    return Response.json({ review }, { status: 201 });
  } catch (error) {
    return asJsonError(error);
  }
}
