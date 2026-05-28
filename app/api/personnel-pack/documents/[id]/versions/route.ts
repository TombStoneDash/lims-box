import { prisma } from "@/lib/prisma";
import { asJsonError, createDocumentVersion, listDocumentVersions } from "@/lib/personnel-pack-v15/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const versions = await listDocumentVersions(prisma, id);
  return Response.json({ versions });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const version = await createDocumentVersion(prisma, {
      documentId: id,
      versionNumber: body.versionNumber,
      effectiveDate: new Date(body.effectiveDate),
      revisionSummary: body.revisionSummary,
      approvedBy: body.approvedBy,
      approvedAt: body.approvedAt ? new Date(body.approvedAt) : undefined,
      documentContentUrl: body.documentContentUrl ?? null,
    });
    return Response.json({ version }, { status: 201 });
  } catch (error) {
    return asJsonError(error);
  }
}
