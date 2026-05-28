import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

/** GET /api/documents — list all non-archived documents */
export async function GET() {
  const docs = await prisma.document.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      versions: {
        where: { isCurrent: true },
        take: 1,
      },
    },
  });
  return NextResponse.json({ data: docs });
}

/** POST /api/documents — create a new controlled document */
export async function POST(req: NextRequest) {
  let body: { title?: string; docType?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON");
  }

  const title = (body.title ?? "").trim();
  const docType = (body.docType ?? "").trim();

  if (!title) return apiError("MISSING_FIELD", "title is required");
  if (!docType) return apiError("MISSING_FIELD", "docType is required");

  const validDocTypes = ["SOP", "procedure_manual", "policy", "form"];
  if (!validDocTypes.includes(docType)) {
    return apiError("INVALID_VALUE", `docType must be one of: ${validDocTypes.join(", ")}`);
  }

  const doc = await prisma.document.create({ data: { title, docType } });
  return NextResponse.json({ data: doc }, { status: 201 });
}
