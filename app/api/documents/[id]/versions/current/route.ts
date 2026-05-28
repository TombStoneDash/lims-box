import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/documents/:id/versions/current — get the current version only */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return apiError("NOT_FOUND", "Document not found", { document_id: id }, 404);

  const current = await prisma.documentVersion.findFirst({
    where: { documentId: id, isCurrent: true },
  });

  if (!current) {
    return apiError("NOT_FOUND", "No current version found for this document", { document_id: id }, 404);
  }

  return Response.json({ data: current });
}
