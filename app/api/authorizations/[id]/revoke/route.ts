import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/authorizations/:id/revoke — revoke an active authorization */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await prisma.authorization.findUnique({ where: { id } });
  if (!auth) return apiError("NOT_FOUND", "Authorization not found", { authorization_id: id }, 404);

  if (!auth.isActive) {
    return apiError(
      "ALREADY_REVOKED",
      "This authorization has already been revoked.",
      { authorization_id: id, revoked_at: auth.revokedAt },
      409
    );
  }

  let body: { revoked_by?: string; revocation_reason?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON");
  }

  const revokedBy = (body.revoked_by ?? "").trim();
  const revocationReason = (body.revocation_reason ?? "").trim();

  if (!revokedBy) return apiError("MISSING_FIELD", "revoked_by is required");
  if (!revocationReason) return apiError("MISSING_FIELD", "revocation_reason is required");

  const updated = await prisma.authorization.update({
    where: { id },
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      revocationReason,
    },
    include: { procedure: { select: { id: true, name: true } }, person: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ data: updated });
}
