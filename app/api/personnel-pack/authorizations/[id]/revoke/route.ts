import { prisma } from "@/lib/prisma";
import { asJsonError, revokeAuthorization } from "@/lib/personnel-pack-v15/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const authorization = await revokeAuthorization(prisma, {
      authorizationId: id,
      revokedAt: new Date(body.revokedAt),
      revokedBy: body.revokedBy,
      revocationReason: body.revocationReason,
    });
    return Response.json({ authorization });
  } catch (error) {
    return asJsonError(error);
  }
}
