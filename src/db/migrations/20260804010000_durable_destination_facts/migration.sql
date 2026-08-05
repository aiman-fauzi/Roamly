-- Add durable structured destination fact storage.

CREATE TYPE "DestinationFactEntityType" AS ENUM (
  'ATTRACTION',
  'RESTAURANT',
  'HOTEL',
  'ACTIVITY'
);

CREATE TYPE "DestinationFactType" AS ENUM (
  'OPENING_HOURS',
  'TICKET_PRICE',
  'ADDRESS',
  'COORDINATES',
  'OFFICIAL_URL',
  'OPERATIONAL_STATUS',
  'VISIT_DURATION',
  'DESCRIPTION_TAGS'
);

CREATE TYPE "DestinationFactSourceTier" AS ENUM (
  'OFFICIAL_SOURCE',
  'GOVERNMENT_OPEN_DATA',
  'OPENSTREETMAP_STRUCTURED',
  'TRUSTED_TRAVEL_LISTING',
  'GEMINI_DERIVED'
);

CREATE TYPE "DestinationFactStatus" AS ENUM (
  'ACTIVE',
  'STALE',
  'INVALID',
  'REJECTED'
);

CREATE TABLE "destination_facts" (
  "id" TEXT NOT NULL,
  "entityType" "DestinationFactEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "factType" "DestinationFactType" NOT NULL,
  "normalizedValue" JSONB NOT NULL,
  "rawValue" JSONB,
  "currency" VARCHAR(3),
  "sourceKey" VARCHAR(100) NOT NULL,
  "sourceUrl" TEXT,
  "sourceRecordId" VARCHAR(255),
  "sourceTier" "DestinationFactSourceTier" NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "retrievedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "parserVersion" VARCHAR(100),
  "status" "DestinationFactStatus" NOT NULL DEFAULT 'ACTIVE',
  "fingerprint" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "destination_facts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "destination_facts_fingerprint_key" ON "destination_facts"("fingerprint");
CREATE INDEX "destination_facts_entityType_entityId_idx" ON "destination_facts"("entityType", "entityId");
CREATE INDEX "destination_facts_entityType_entityId_factType_status_idx" ON "destination_facts"("entityType", "entityId", "factType", "status");
CREATE INDEX "destination_facts_factType_status_idx" ON "destination_facts"("factType", "status");
CREATE INDEX "destination_facts_sourceKey_sourceRecordId_idx" ON "destination_facts"("sourceKey", "sourceRecordId");
CREATE INDEX "destination_facts_sourceTier_verifiedAt_idx" ON "destination_facts"("sourceTier", "verifiedAt");
CREATE INDEX "destination_facts_expiresAt_idx" ON "destination_facts"("expiresAt");
