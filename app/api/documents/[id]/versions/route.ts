import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, pagedResponse, parsePagination, VERSION_NUMBER_RE } from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/documents/:id/versions — paginated version history */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return apiError("NOT_FOUND", "Document not found", { document_id: id }, 404);

  const { limit, cursor } = parsePagination(new URL(req.url));

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return pagedResponse(versions, limit);
}

/** POST /api/documents/:id/versions — create a new version, superseding the current one */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return apiError("NOT_FOUND", "Document not found", { document_id: id }, 404);

  let body: {
    version_number?: string;
    effective_date?: string;
    revision_summary?: string;
    approved_by?: string;
    document_content_url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON");
  }

  const versionNumber = (body.version_number ?? "").trim();
  const revisionSummary = (body.revision_summary ?? "").trim();
  const approvedBy = (body.approved_by ?? "").trim();
  const effectiveDateStr = (body.effective_date ?? "").trim();

  if (!versionNumber) return apiError("MISSING_FIELD", "version_number is required");
  if (!VERSION_NUMBER_RE.test(versionNumber))
    return apiError("INVALID_VALUE", 'version_number must match pattern "X.Y" (e.g. "1.0", "2.3")');
  if (!effectiveDateStr) return apiError("MISSING_FIELD", "effective_date is required");
  if (!revisionSummary) return apiError("MISSING_FIELD", "revision_summary is required");
  if (!approvedBy) return apiError("MISSING_FIELD", "approved_by is required");

  const effectiveDate = new Date(effectiveDateStr);
  if (isNaN(effectiveDate.getTime()))
    return apiError("INVALID_VALUE", "effective_date must be a valid ISO date string");

  // Check for duplicate version_number on a current version
  const existingCurrent = await prisma.documentVersion.findFirst({
    where: { documentId: id, isCurrent: true, versionNumber },
  });
  if (existingCurrent) {
    return apiError(
      "DUPLICATE_VERSION",
      `A current version with version_number "${versionNumber}" already exists.`,
      { existing_version_id: existingCurrent.id },
      409
    );
  }

  const now = new Date();

  // Transaction: supersede old current version + create new one
  const newVersion = await prisma.$transaction(async (tx) => {
    // Supersede all current versions for this document
    await tx.documentVersion.updateMany({
      where: { documentId: id, isCurrent: true },
      data: { isCurrent: false, supersededDate: now },
    });

    // Create new current version
    return tx.documentVersion.create({
      data: {
        documentId: id,
        versionNumber,
        effectiveDate,
        revisionSummary,
        approvedBy,
        approvedAt: now,
        documentContentUrl: body.document_content_url?.trim() || null,
        isCurrent: true,
      },
    });
  });

  return NextResponse.json({ data: newVersion }, { status: 201 });
}
