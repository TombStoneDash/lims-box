import { prisma } from "@/lib/prisma";
import { getCurrentDocumentVersion } from "@/lib/personnel-pack-v15/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const version = await getCurrentDocumentVersion(prisma, id);
  if (!version) {
    return Response.json({ error: "current version not found" }, { status: 404 });
  }
  return Response.json({ version });
}
