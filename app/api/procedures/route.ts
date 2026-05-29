import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

/** GET /api/procedures — list all active procedures */
export async function GET() {
  const procedures = await prisma.procedure.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { authorizations: { where: { isActive: true } } } },
    },
  });
  return NextResponse.json({ data: procedures });
}

/** POST /api/procedures — create a new procedure */
export async function POST(req: NextRequest) {
  let body: { name?: string; procedure_code?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON");
  }

  const name = (body.name ?? "").trim();
  if (!name) return apiError("MISSING_FIELD", "name is required");

  const procedureCode = body.procedure_code?.trim() || null;
  const description = body.description?.trim() || null;

  // Check unique procedure code
  if (procedureCode) {
    const existing = await prisma.procedure.findUnique({ where: { procedureCode } });
    if (existing) {
      return apiError(
        "DUPLICATE_PROCEDURE_CODE",
        `A procedure with code "${procedureCode}" already exists.`,
        { existing_id: existing.id },
        409
      );
    }
  }

  const proc = await prisma.procedure.create({
    data: { name, procedureCode, description },
  });
  return NextResponse.json({ data: proc }, { status: 201 });
}
