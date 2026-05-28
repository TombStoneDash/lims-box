-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "versionNumber" TEXT NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "supersededDate" DATETIME,
    "revisionSummary" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentContentUrl" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competencyId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerRole" TEXT NOT NULL,
    "reviewType" TEXT NOT NULL,
    "reviewOutcome" TEXT NOT NULL,
    "notes" TEXT,
    "nextReviewDue" DATETIME,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewEvent_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Procedure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "procedureCode" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Authorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "authorizedAt" DATETIME NOT NULL,
    "authorizedBy" TEXT NOT NULL,
    "scope" TEXT,
    "revokedAt" DATETIME,
    "revokedBy" TEXT,
    "revocationReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Authorization_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Authorization_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE INDEX "ReviewEvent_competencyId_idx" ON "ReviewEvent"("competencyId");

-- CreateIndex
CREATE INDEX "ReviewEvent_nextReviewDue_idx" ON "ReviewEvent"("nextReviewDue");

-- CreateIndex
CREATE UNIQUE INDEX "Procedure_procedureCode_key" ON "Procedure"("procedureCode");

-- CreateIndex
CREATE INDEX "Authorization_personId_idx" ON "Authorization"("personId");

-- CreateIndex
CREATE INDEX "Authorization_procedureId_idx" ON "Authorization"("procedureId");

-- Partial unique index: only ONE active authorization per (person, procedure).
-- Revoked records (isActive=0) are excluded, allowing historical rows to coexist.
-- NOTE: Prisma schema DSL does not support partial indexes; this index is managed
-- outside Prisma's schema tracking but is part of the canonical migration.
CREATE UNIQUE INDEX "Authorization_active_person_procedure_key"
  ON "Authorization"("personId", "procedureId")
  WHERE "isActive" = 1;
