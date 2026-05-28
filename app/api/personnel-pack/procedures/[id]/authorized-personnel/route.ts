import { prisma } from "@/lib/prisma";
import { listAuthorizedPersonnel } from "@/lib/personnel-pack-v15/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authorizations = await listAuthorizedPersonnel(prisma, id);
  return Response.json({ authorizations });
}
