import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, pagedResponse, parsePagination } from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/people/:id/authorizations — list all (active + revoked), supports ?active_only=true */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return apiError("NOT_FOUND", "Person not found", { person_id: id }, 404);

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active_only") === "true";
  const { limit, cursor } = parsePagination(url);

  const authorizations = await prisma.authorization.findMany({
    where: { personId: id, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { procedure: { select: { id: true, name: true, procedureCode: true } } },
  });

  return pagedResponse(authorizations, limit);
}

/** POST /api/people/:id/authorizations — grant authorization for a procedure */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return apiError("NOT_FOUND", "Person not found", { person_id: id }, 404);

  let body: {
    procedure_id?: string;
    authorized_at?: string;
    authorized_by?: string;
    scope?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON");
  }

  const procedureId = (body.procedure_id ?? "").trim();
  const authorizedBy = (body.authorized_by ?? "").trim();
  const authorizedAtStr = (body.authorized_at ?? "").trim();

  if (!procedureId) return apiError("MISSING_FIELD", "procedure_id is required");
  if (!authorizedBy) return apiError("MISSING_FIELD", "authorized_by is required (typed lab director name)");
  if (!authorizedAtStr) return apiError("MISSING_FIELD", "authorized_at is required");

  const procedure = await prisma.procedure.findUnique({ where: { id: procedureId } });
  if (!procedure) return apiError("NOT_FOUND", "Procedure not found", { procedure_id: procedureId }, 404);

  const authorizedAt = new Date(authorizedAtStr);
  if (isNaN(authorizedAt.getTime()))
    return apiError("INVALID_VALUE", "authorized_at must be a valid ISO date string");

  // Check for duplicate active authorization (partial unique index guard)
  const existing = await prisma.authorization.findFirst({
    where: { personId: id, procedureId, isActive: true },
  });
  if (existing) {
    return apiError(
      "DUPLICATE_AUTHORIZATION",
      "An active authorization already exists for this person and procedure.",
      { personnel_id: id, procedure_id: procedureId, existing_auth_id: existing.id },
      409
    );
  }

  const auth = await prisma.authorization.create({
    data: {
      personId: id,
      procedureId,
      authorizedAt,
      authorizedBy,
      scope: body.scope?.trim() || null,
      isActive: true,
    },
    include: { procedure: { select: { id: true, name: true, procedureCode: true } } },
  });

  return NextResponse.json({ data: auth }, { status: 201 });
}
