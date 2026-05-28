-- CreateTable
CREATE TABLE "personnel_pack_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('procedure', 'form')),
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "personnel_pack_document_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "versionNumber" TEXT NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "supersededDate" DATETIME,
    "revisionSummary" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentContentUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personnel_pack_document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "personnel_pack_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personnel_pack_review_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competencyRecordId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerRole" TEXT NOT NULL,
    "reviewType" TEXT NOT NULL CHECK ("reviewType" IN ('initial', 'six_month', 'annual', 'corrective_action', 'ad_hoc')),
    "reviewOutcome" TEXT NOT NULL CHECK ("reviewOutcome" IN ('competent', 'requires_remediation', 'restricted', 'suspended')),
    "notes" TEXT,
    "correctiveActionRequired" BOOLEAN NOT NULL DEFAULT false,
    "correctiveActionSummary" TEXT,
    "nextReviewDue" DATETIME,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personnel_pack_review_events_competencyRecordId_fkey" FOREIGN KEY ("competencyRecordId") REFERENCES "Competency" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personnel_pack_authorizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "authorizedAt" DATETIME NOT NULL,
    "authorizedBy" TEXT NOT NULL,
    "scope" TEXT,
    "revokedAt" DATETIME,
    "revokedBy" TEXT,
    "revocationReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personnel_pack_authorizations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "personnel_pack_authorizations_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "personnel_pack_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "personnel_pack_documents_code_key" ON "personnel_pack_documents"("code");

-- CreateIndex
CREATE INDEX "personnel_pack_document_versions_documentId_effectiveDate_idx" ON "personnel_pack_document_versions"("documentId", "effectiveDate" DESC);

-- CreateIndex
CREATE INDEX "idx_pp_doc_versions_current" ON "personnel_pack_document_versions"("documentId") WHERE "supersededDate" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "personnel_pack_document_versions_documentId_versionNumber_key" ON "personnel_pack_document_versions"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "personnel_pack_review_events_competencyRecordId_reviewedAt_idx" ON "personnel_pack_review_events"("competencyRecordId", "reviewedAt" DESC);

-- CreateIndex
CREATE INDEX "personnel_pack_review_events_nextReviewDue_idx" ON "personnel_pack_review_events"("nextReviewDue");

-- CreateIndex
CREATE INDEX "idx_pp_review_events_due_not_null" ON "personnel_pack_review_events"("nextReviewDue") WHERE "nextReviewDue" IS NOT NULL;

-- CreateIndex
CREATE INDEX "personnel_pack_authorizations_personId_idx" ON "personnel_pack_authorizations"("personId");

-- CreateIndex
CREATE INDEX "personnel_pack_authorizations_documentId_idx" ON "personnel_pack_authorizations"("documentId");

-- CreateIndex
CREATE INDEX "idx_pp_auth_active_person" ON "personnel_pack_authorizations"("personId") WHERE "revokedAt" IS NULL;

-- CreateIndex
CREATE INDEX "idx_pp_auth_active_procedure" ON "personnel_pack_authorizations"("documentId") WHERE "revokedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "personnel_pack_authorizations_personId_documentId_authorizedAt_key" ON "personnel_pack_authorizations"("personId", "documentId", "authorizedAt");
