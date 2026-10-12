import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/reviews/upcoming
 * Query params:
 *   days        - window in days (default 30, max 90)
 *   procedure_id - optional filter (not applicable for SQLite local-first, kept for compat)
 *   reviewer_name - optional filter
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawDaysParam = url.searchParams.get("days") ?? "";
  const rawDays = /^\d+$/.test(rawDaysParam) ? parseInt(rawDaysParam, 10) : 30;
  const days = Math.min(Math.max(rawDays, 1), 90);
  const reviewerName = url.searchParams.get("reviewer_name")?.trim() || null;

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + days);

  const events = await prisma.reviewEvent.findMany({
    where: {
      nextReviewDue: { gte: now, lte: cutoff },
      ...(reviewerName ? { reviewerName: { contains: reviewerName, mode: "insensitive" } } : {}),
    },
    orderBy: { nextReviewDue: "asc" },
    include: {
      competency: {
        include: { person: { select: { id: true, name: true, role: true } } },
      },
    },
  });

  return NextResponse.json({
    data: events,
    meta: { days_window: days, count: events.length },
  });
}
