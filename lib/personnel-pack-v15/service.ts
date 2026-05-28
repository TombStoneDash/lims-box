import {
  PersonnelPackDocumentKind,
  PersonnelPackReviewOutcome,
  PersonnelPackReviewType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type CreateDocumentVersionInput = {
  documentId: string;
  versionNumber: string;
  effectiveDate: Date;
  revisionSummary: string;
  approvedBy: string;
  approvedAt?: Date;
  documentContentUrl?: string | null;
};

export type CreateReviewEventInput = {
  competencyRecordId: string;
  reviewerName: string;
  reviewerRole: string;
  reviewType: PersonnelPackReviewType;
  reviewOutcome: PersonnelPackReviewOutcome;
  notes?: string | null;
  correctiveActionRequired?: boolean;
  correctiveActionSummary?: string | null;
  nextReviewDue?: Date | null;
  reviewedAt?: Date;
};

export type GrantAuthorizationInput = {
  personId: string;
  documentId: string;
  authorizedAt: Date;
  authorizedBy: string;
  scope?: string | null;
};

export type RevokeAuthorizationInput = {
  authorizationId: string;
  revokedAt: Date;
  revokedBy: string;
  revocationReason: string;
};

function requireText(value: string | null | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`${field} required`);
  return text;
}

function requireValidDate(value: Date, field: string): Date {
  if (Number.isNaN(value.getTime())) throw new Error(`${field} invalid`);
  return value;
}

export function calculateNextReviewDue(reviewType: PersonnelPackReviewType, reviewedAt: Date): Date | null {
  const due = new Date(reviewedAt);
  if (reviewType === "six_month") {
    due.setUTCMonth(due.getUTCMonth() + 6);
    return due;
  }
  if (reviewType === "annual") {
    due.setUTCFullYear(due.getUTCFullYear() + 1);
    return due;
  }
  return null;
}

export async function createDocumentVersion(prisma: PrismaClient, input: CreateDocumentVersionInput) {
  const versionNumber = requireText(input.versionNumber, "versionNumber");
  const revisionSummary = requireText(input.revisionSummary, "revisionSummary");
  const approvedBy = requireText(input.approvedBy, "approvedBy");
  const effectiveDate = requireValidDate(input.effectiveDate, "effectiveDate");

  return prisma.$transaction(async (tx) => {
    const document = await tx.personnelPackDocument.findUnique({
      where: { id: input.documentId },
    });
    if (!document) throw new Error("document not found");

    await tx.personnelPackDocumentVersion.updateMany({
      where: {
        documentId: input.documentId,
        supersededDate: null,
      },
      data: {
        supersededDate: effectiveDate,
      },
    });

    return tx.personnelPackDocumentVersion.create({
      data: {
        documentId: input.documentId,
        versionNumber,
        effectiveDate,
        revisionSummary,
        approvedBy,
        approvedAt: input.approvedAt ?? new Date(),
        documentContentUrl: input.documentContentUrl ?? null,
      },
    });
  });
}

export async function listDocumentVersions(prisma: PrismaLike, documentId: string) {
  return prisma.personnelPackDocumentVersion.findMany({
    where: { documentId },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function getCurrentDocumentVersion(prisma: PrismaLike, documentId: string) {
  return prisma.personnelPackDocumentVersion.findFirst({
    where: {
      documentId,
      supersededDate: null,
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function createReviewEvent(prisma: PrismaLike, input: CreateReviewEventInput) {
  const reviewerName = requireText(input.reviewerName, "reviewerName");
  const reviewerRole = requireText(input.reviewerRole, "reviewerRole");
  const reviewedAt = requireValidDate(input.reviewedAt ?? new Date(), "reviewedAt");
  const nextReviewDue = input.nextReviewDue ?? calculateNextReviewDue(input.reviewType, reviewedAt);

  return prisma.personnelPackReviewEvent.create({
    data: {
      competencyRecordId: input.competencyRecordId,
      reviewerName,
      reviewerRole,
      reviewType: input.reviewType,
      reviewOutcome: input.reviewOutcome,
      notes: input.notes?.trim() || null,
      correctiveActionRequired: Boolean(input.correctiveActionRequired),
      correctiveActionSummary: input.correctiveActionSummary?.trim() || null,
      nextReviewDue,
      reviewedAt,
    },
  });
}

export async function listUpcomingReviews(prisma: PrismaLike, now = new Date(), days = 30) {
  const upperBound = new Date(now);
  upperBound.setDate(upperBound.getDate() + days);

  return prisma.personnelPackReviewEvent.findMany({
    where: {
      nextReviewDue: {
        gte: now,
        lte: upperBound,
      },
    },
    include: {
      competencyRecord: {
        include: {
          person: true,
        },
      },
    },
    orderBy: { nextReviewDue: "asc" },
  });
}

export async function grantAuthorization(prisma: PrismaClient, input: GrantAuthorizationInput) {
  const authorizedBy = requireText(input.authorizedBy, "authorizedBy");
  const authorizedAt = requireValidDate(input.authorizedAt, "authorizedAt");

  return prisma.$transaction(async (tx) => {
    const document = await tx.personnelPackDocument.findUnique({
      where: { id: input.documentId },
    });
    if (!document) throw new Error("procedure not found");
    if (document.kind !== PersonnelPackDocumentKind.procedure) {
      throw new Error("authorization requires a procedure document");
    }

    const existing = await tx.personnelPackAuthorization.findFirst({
      where: {
        personId: input.personId,
        documentId: input.documentId,
        revokedAt: null,
      },
    });
    if (existing) {
      throw new Error("active authorization already exists");
    }

    return tx.personnelPackAuthorization.create({
      data: {
        personId: input.personId,
        documentId: input.documentId,
        authorizedAt,
        authorizedBy,
        scope: input.scope?.trim() || null,
      },
    });
  });
}

export async function revokeAuthorization(prisma: PrismaLike, input: RevokeAuthorizationInput) {
  const revokedBy = requireText(input.revokedBy, "revokedBy");
  const revocationReason = requireText(input.revocationReason, "revocationReason");
  const revokedAt = requireValidDate(input.revokedAt, "revokedAt");

  const existing = await prisma.personnelPackAuthorization.findUnique({
    where: { id: input.authorizationId },
  });
  if (!existing) throw new Error("authorization not found");
  if (existing.revokedAt) throw new Error("authorization already revoked");

  return prisma.personnelPackAuthorization.update({
    where: { id: input.authorizationId },
    data: {
      revokedAt,
      revokedBy,
      revocationReason,
    },
  });
}

export async function listPersonAuthorizations(prisma: PrismaLike, personId: string) {
  return prisma.personnelPackAuthorization.findMany({
    where: { personId },
    include: {
      document: {
        include: {
          versions: {
            where: { supersededDate: null },
            orderBy: { effectiveDate: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ revokedAt: "asc" }, { authorizedAt: "desc" }],
  });
}

export async function listAuthorizedPersonnel(prisma: PrismaLike, documentId: string) {
  return prisma.personnelPackAuthorization.findMany({
    where: { documentId },
    include: {
      person: true,
      document: true,
    },
    orderBy: [{ revokedAt: "asc" }, { authorizedAt: "desc" }],
  });
}

export function isAuthorizationActive<T extends { revokedAt: Date | null }>(authorization: T): boolean {
  return authorization.revokedAt === null;
}

export function isCurrentDocumentVersion<T extends { supersededDate: Date | null }>(version: T): boolean {
  return version.supersededDate === null;
}

export function normalizeDocumentKind(kind: string): PersonnelPackDocumentKind {
  return kind === "form" ? PersonnelPackDocumentKind.form : PersonnelPackDocumentKind.procedure;
}

export function asJsonError(error: unknown, fallback = "Request failed") {
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status: 400 });
}
