"use server";
/**
 * Server actions for Personnel Pack v1.5 (ISO 15189 features).
 * Documents, Procedures, ReviewEvents, Authorizations.
 */
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VERSION_NUMBER_RE, REVIEW_TYPES, REVIEW_OUTCOMES, calcNextReviewDue } from "@/lib/personnel-pack-utils";
import type { ReviewType } from "@/lib/personnel-pack-utils";

// ─── Documents ────────────────────────────────────────────────────────────────

export async function createDocument(formData: FormData) {
  const title = (formData.get("title") as string ?? "").trim();
  const docType = (formData.get("docType") as string ?? "").trim();
  if (!title || !docType) throw new Error("title and docType are required");
  await prisma.document.create({ data: { title, docType } });
  redirect("/admin/documents");
}

export async function createDocumentVersion(formData: FormData) {
  const documentId = (formData.get("documentId") as string ?? "").trim();
  const versionNumber = (formData.get("versionNumber") as string ?? "").trim();
  const effectiveDateStr = (formData.get("effectiveDate") as string ?? "").trim();
  const revisionSummary = (formData.get("revisionSummary") as string ?? "").trim();
  const approvedBy = (formData.get("approvedBy") as string ?? "").trim();
  const documentContentUrl = (formData.get("documentContentUrl") as string ?? "").trim() || null;

  if (!documentId || !versionNumber || !effectiveDateStr || !revisionSummary || !approvedBy)
    throw new Error("Missing required fields");
  if (!VERSION_NUMBER_RE.test(versionNumber))
    throw new Error('version_number must match "X.Y" (e.g. "1.0", "2.3")');

  const effectiveDate = new Date(effectiveDateStr);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.documentVersion.updateMany({
      where: { documentId, isCurrent: true },
      data: { isCurrent: false, supersededDate: now },
    });
    await tx.documentVersion.create({
      data: {
        documentId,
        versionNumber,
        effectiveDate,
        revisionSummary,
        approvedBy,
        approvedAt: now,
        documentContentUrl,
        isCurrent: true,
      },
    });
  });

  redirect(`/admin/documents/${documentId}`);
}

// ─── Procedures ───────────────────────────────────────────────────────────────

export async function createProcedure(formData: FormData) {
  const name = (formData.get("name") as string ?? "").trim();
  const procedureCode = (formData.get("procedureCode") as string ?? "").trim() || null;
  const description = (formData.get("description") as string ?? "").trim() || null;
  if (!name) throw new Error("name is required");
  await prisma.procedure.create({ data: { name, procedureCode, description } });
  redirect("/admin/procedures");
}

// ─── Review Events ────────────────────────────────────────────────────────────

export async function createReviewEvent(formData: FormData) {
  const competencyId = (formData.get("competencyId") as string ?? "").trim();
  const reviewerName = (formData.get("reviewerName") as string ?? "").trim();
  const reviewerRole = (formData.get("reviewerRole") as string ?? "").trim();
  const reviewType = (formData.get("reviewType") as string ?? "").trim() as ReviewType;
  const reviewOutcome = (formData.get("reviewOutcome") as string ?? "").trim();
  const notes = (formData.get("notes") as string ?? "").trim() || null;
  const nextReviewDueStr = (formData.get("nextReviewDue") as string ?? "").trim();

  if (!competencyId || !reviewerName || !reviewerRole || !reviewType || !reviewOutcome)
    throw new Error("Missing required fields");
  if (!REVIEW_TYPES.includes(reviewType))
    throw new Error(`Invalid reviewType: ${reviewType}`);
  if (!REVIEW_OUTCOMES.includes(reviewOutcome as never))
    throw new Error(`Invalid reviewOutcome: ${reviewOutcome}`);

  const reviewedAt = new Date();
  let nextReviewDue: Date | null = nextReviewDueStr ? new Date(nextReviewDueStr) : calcNextReviewDue(reviewType, reviewedAt);

  await prisma.reviewEvent.create({
    data: { competencyId, reviewerName, reviewerRole, reviewType, reviewOutcome, notes, nextReviewDue, reviewedAt },
  });

  redirect(`/admin/competencies/${competencyId}`);
}

// ─── Authorizations ───────────────────────────────────────────────────────────

export async function grantAuthorization(formData: FormData) {
  const personId = (formData.get("personId") as string ?? "").trim();
  const procedureId = (formData.get("procedureId") as string ?? "").trim();
  const authorizedBy = (formData.get("authorizedBy") as string ?? "").trim();
  const authorizedAtStr = (formData.get("authorizedAt") as string ?? "").trim();
  const scope = (formData.get("scope") as string ?? "").trim() || null;

  if (!personId || !procedureId || !authorizedBy || !authorizedAtStr)
    throw new Error("Missing required fields");

  // Check for existing active authorization
  const existing = await prisma.authorization.findFirst({
    where: { personId, procedureId, isActive: true },
  });
  if (existing) throw new Error(`Active authorization already exists (id: ${existing.id}). Revoke it first.`);

  const authorizedAt = new Date(authorizedAtStr);
  await prisma.authorization.create({
    data: { personId, procedureId, authorizedBy, authorizedAt, scope, isActive: true },
  });

  redirect(`/admin/people/${personId}`);
}

export async function revokeAuthorization(formData: FormData) {
  const authId = (formData.get("authId") as string ?? "").trim();
  const personId = (formData.get("personId") as string ?? "").trim();
  const revokedBy = (formData.get("revokedBy") as string ?? "").trim();
  const revocationReason = (formData.get("revocationReason") as string ?? "").trim() || null;

  if (!authId || !revokedBy) throw new Error("authId and revokedBy are required");

  await prisma.authorization.update({
    where: { id: authId },
    data: { isActive: false, revokedAt: new Date(), revokedBy, revocationReason },
  });

  redirect(`/admin/people/${personId}`);
}
