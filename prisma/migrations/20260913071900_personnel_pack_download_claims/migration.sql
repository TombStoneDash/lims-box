CREATE TABLE "PersonnelPackDownloadClaim" (
    "jti" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonnelPackDownloadClaim_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "PersonnelPackDownloadClaim_expiresAt_idx"
    ON "PersonnelPackDownloadClaim"("expiresAt");
