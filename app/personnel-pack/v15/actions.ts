"use server";

import { PersonnelPackReviewOutcome, PersonnelPackReviewType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createDocumentVersion,
  createReviewEvent,
  grantAuthorization,
  revokeAuthorization,
} from "@/lib/personnel-pack-v15/service";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredDate(value: FormDataEntryValue | null, field: string): Date {
  const text = str(value);
  if (!text) throw new Error(`${field} required`);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} invalid`);
  return parsed;
}

function optionalDate(value: FormDataEntryValue | null): Date | undefined {
  const text = str(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function addDocumentVersion(formData: FormData) {
  const documentId = str(formData.get("documentId"));

  await createDocumentVersion(prisma, {
    documentId,
    versionNumber: str(formData.get("versionNumber")),
    effectiveDate: requiredDate(formData.get("effectiveDate"), "effectiveDate"),
    revisionSummary: str(formData.get("revisionSummary")),
    approvedBy: str(formData.get("approvedBy")),
    approvedAt: optionalDate(formData.get("approvedAt")),
    documentContentUrl: str(formData.get("documentContentUrl")) || null,
  });

  revalidatePath("/personnel-pack/v15");
  revalidatePath(`/personnel-pack/v15/documents/${documentId}`);
  redirect(`/personnel-pack/v15/documents/${documentId}`);
}

export async function logReviewEvent(formData: FormData) {
  const competencyRecordId = str(formData.get("competencyRecordId"));

  await createReviewEvent(prisma, {
    competencyRecordId,
    reviewerName: str(formData.get("reviewerName")),
    reviewerRole: str(formData.get("reviewerRole")),
    reviewType: str(formData.get("reviewType")) as PersonnelPackReviewType,
    reviewOutcome: str(formData.get("reviewOutcome")) as PersonnelPackReviewOutcome,
    notes: str(formData.get("notes")) || null,
    correctiveActionRequired: str(formData.get("correctiveActionRequired")) === "on",
    correctiveActionSummary: str(formData.get("correctiveActionSummary")) || null,
    nextReviewDue: optionalDate(formData.get("nextReviewDue")),
    reviewedAt: optionalDate(formData.get("reviewedAt")),
  });

  revalidatePath("/personnel-pack/v15");
  revalidatePath(`/personnel-pack/v15/competency/${competencyRecordId}`);
  redirect(`/personnel-pack/v15/competency/${competencyRecordId}`);
}

export async function addAuthorization(formData: FormData) {
  const personId = str(formData.get("personId"));

  await grantAuthorization(prisma, {
    personId,
    documentId: str(formData.get("documentId")),
    authorizedAt: requiredDate(formData.get("authorizedAt"), "authorizedAt"),
    authorizedBy: str(formData.get("authorizedBy")),
    scope: str(formData.get("scope")) || null,
  });

  revalidatePath("/personnel-pack/v15");
  revalidatePath(`/personnel-pack/v15/personnel/${personId}`);
  redirect(`/personnel-pack/v15/personnel/${personId}`);
}

export async function revokeAuthorizationAction(formData: FormData) {
  const authorizationId = str(formData.get("authorizationId"));
  const personId = str(formData.get("personId"));
  const procedureId = str(formData.get("procedureId"));

  await revokeAuthorization(prisma, {
    authorizationId,
    revokedAt: requiredDate(formData.get("revokedAt"), "revokedAt"),
    revokedBy: str(formData.get("revokedBy")),
    revocationReason: str(formData.get("revocationReason")),
  });

  revalidatePath("/personnel-pack/v15");
  revalidatePath(`/personnel-pack/v15/personnel/${personId}`);
  if (procedureId) revalidatePath(`/personnel-pack/v15/procedures/${procedureId}`);
  redirect(`/personnel-pack/v15/personnel/${personId}`);
}
