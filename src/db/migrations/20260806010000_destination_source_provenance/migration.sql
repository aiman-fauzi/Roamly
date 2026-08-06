-- Add durable source provenance for destination imports without changing the
-- existing destination table identity model.

ALTER TABLE "destination_images"
  ADD COLUMN "sourceProvider" VARCHAR(80),
  ADD COLUMN "sourceRecordId" VARCHAR(255),
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "pageUrl" TEXT,
  ADD COLUMN "author" VARCHAR(255),
  ADD COLUMN "licenseName" VARCHAR(120),
  ADD COLUMN "licenseUrl" TEXT;

CREATE TABLE "destination_source_provenance" (
  "id" TEXT NOT NULL,
  "entityType" "DestinationFactEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "sourceProvider" VARCHAR(80) NOT NULL,
  "sourceRecordId" VARCHAR(255) NOT NULL,
  "sourceUrl" TEXT,
  "sourceLicenseName" VARCHAR(120),
  "sourceLicenseUrl" TEXT,
  "attribution" TEXT,
  "externalIds" JSONB,
  "rawPayload" JSONB,
  "importConfidence" INTEGER,
  "duplicateStatus" VARCHAR(40),
  "manuallyCurated" BOOLEAN NOT NULL DEFAULT false,
  "lastSourceSyncAt" TIMESTAMP(3),
  "sourceContentHash" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "destination_source_provenance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "destination_source_provenance_sourceProvider_sourceRecordId_key"
  ON "destination_source_provenance"("sourceProvider", "sourceRecordId");

CREATE INDEX "destination_source_provenance_entityType_entityId_idx"
  ON "destination_source_provenance"("entityType", "entityId");

CREATE INDEX "destination_source_provenance_sourceProvider_idx"
  ON "destination_source_provenance"("sourceProvider");

CREATE INDEX "destination_source_provenance_lastSourceSyncAt_idx"
  ON "destination_source_provenance"("lastSourceSyncAt");
