-- Blank, versioned worksheets only. No applicant or personnel data.
CREATE TABLE "PersonnelPackPdfArtifact" (
    "key" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonnelPackPdfArtifact_pkey" PRIMARY KEY ("key")
);
