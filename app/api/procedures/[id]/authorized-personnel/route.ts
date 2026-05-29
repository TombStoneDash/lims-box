import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/procedures/:id/authorized-personnel — who can perform this procedure right now */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const proc = await prisma.procedure.findUnique({ where: { id } });
  if (!proc) return apiError("NOT_FOUND", "Procedure not found", { procedure_id: id }, 404);

  const authorizations = await prisma.authorization.findMany({
    where: { procedureId: id, isActive: true },
    include: { person: { select: { id: true, name: true, role: true } } },
    orderBy: { authorizedAt: "desc" },
  });

  return NextResponse.json({ data: authorizations });
}
