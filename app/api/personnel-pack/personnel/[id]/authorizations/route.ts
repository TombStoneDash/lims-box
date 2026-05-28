import { prisma } from "@/lib/prisma";
import { asJsonError, grantAuthorization, listPersonAuthorizations } from "@/lib/personnel-pack-v15/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authorizations = await listPersonAuthorizations(prisma, id);
  return Response.json({ authorizations });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const authorization = await grantAuthorization(prisma, {
      personId: id,
      documentId: body.documentId,
      authorizedAt: new Date(body.authorizedAt),
      authorizedBy: body.authorizedBy,
      scope: body.scope ?? null,
    });
    return Response.json({ authorization }, { status: 201 });
  } catch (error) {
    return asJsonError(error);
  }
}
