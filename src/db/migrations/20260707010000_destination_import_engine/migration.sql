-- Destination Import Engine resumability state
-- Additive-only migration. Does not modify or remove existing business tables.

CREATE TYPE "DestinationImportSource" AS ENUM (
  'OPENSTREETMAP',
  'WIKIVOYAGE',
  'WIKIPEDIA',
  'GOVERNMENT_TOURISM'
);

CREATE TYPE "DestinationImportStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "destination_import_jobs" (
  "id" TEXT NOT NULL,
  "source" "DestinationImportSource" NOT NULL,
  "sourceKey" VARCHAR(255) NOT NULL,
  "status" "DestinationImportStatus" NOT NULL DEFAULT 'PENDING',
  "cursor" INTEGER NOT NULL DEFAULT 0,
  "totalRecords" INTEGER NOT NULL DEFAULT 0,
  "processedRecords" INTEGER NOT NULL DEFAULT 0,
  "skippedRecords" INTEGER NOT NULL DEFAULT 0,
  "failedRecords" INTEGER NOT NULL DEFAULT 0,
  "config" JSONB,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "destination_import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "destination_import_jobs_source_sourceKey_key"
  ON "destination_import_jobs"("source", "sourceKey");

CREATE INDEX "destination_import_jobs_source_idx"
  ON "destination_import_jobs"("source");

CREATE INDEX "destination_import_jobs_status_idx"
  ON "destination_import_jobs"("status");

CREATE INDEX "destination_import_jobs_updatedAt_idx"
  ON "destination_import_jobs"("updatedAt");
