import { prisma } from "@/lib/prisma";
import { listUpcomingReviews } from "@/lib/personnel-pack-v15/service";

export async function GET() {
  const reviews = await listUpcomingReviews(prisma);
  return Response.json({ reviews });
}
