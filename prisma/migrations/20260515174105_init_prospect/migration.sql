-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "track" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "labName" TEXT NOT NULL,
    "labSize" TEXT NOT NULL,
    "accreditations" TEXT NOT NULL,
    "painPoint" TEXT,
    "source" TEXT,
    "fieldBenchSplit" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
