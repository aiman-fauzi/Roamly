-- Destination AI Enrichment Service
-- Additive-only migration. Does not modify itinerary generation tables or logic.

CREATE TYPE "DestinationEnrichmentStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "DestinationBudgetLevel" AS ENUM (
  'FREE',
  'BUDGET',
  'MODERATE',
  'PREMIUM',
  'LUXURY'
);

CREATE TYPE "DestinationSetting" AS ENUM (
  'INDOOR',
  'OUTDOOR',
  'MIXED'
);

CREATE TABLE "destination_enrichments" (
  "id" TEXT NOT NULL,
  "attractionId" TEXT,
  "restaurantId" TEXT,
  "hotelId" TEXT,
  "activityId" TEXT,
  "shortSummary" VARCHAR(600) NOT NULL,
  "bestFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "hiddenGemScore" INTEGER NOT NULL,
  "photographyScore" INTEGER NOT NULL,
  "familyFriendly" BOOLEAN NOT NULL,
  "coupleFriendly" BOOLEAN NOT NULL,
  "kidsFriendly" BOOLEAN NOT NULL,
  "budgetLevel" "DestinationBudgetLevel" NOT NULL,
  "estimatedVisitDurationMinutes" INTEGER NOT NULL,
  "bestVisitingHours" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "indoorOutdoor" "DestinationSetting" NOT NULL,
  "rainFriendly" BOOLEAN NOT NULL,
  "searchTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "provider" VARCHAR(50) NOT NULL,
  "model" VARCHAR(100) NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "destination_enrichments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "destination_enrichments_one_parent_chk" CHECK (
    num_nonnulls("attractionId", "restaurantId", "hotelId", "activityId") = 1
  ),
  CONSTRAINT "destination_enrichments_hiddenGemScore_chk" CHECK ("hiddenGemScore" BETWEEN 0 AND 100),
  CONSTRAINT "destination_enrichments_photographyScore_chk" CHECK ("photographyScore" BETWEEN 0 AND 100),
  CONSTRAINT "destination_enrichments_duration_chk" CHECK ("estimatedVisitDurationMinutes" > 0)
);

CREATE TABLE "destination_enrichment_jobs" (
  "id" TEXT NOT NULL,
  "sourceKey" VARCHAR(255) NOT NULL,
  "status" "DestinationEnrichmentStatus" NOT NULL DEFAULT 'PENDING',
  "batchSize" INTEGER NOT NULL DEFAULT 25,
  "processedRecords" INTEGER NOT NULL DEFAULT 0,
  "skippedRecords" INTEGER NOT NULL DEFAULT 0,
  "failedRecords" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "destination_enrichment_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "destination_enrichments_attractionId_key" ON "destination_enrichments"("attractionId");
CREATE UNIQUE INDEX "destination_enrichments_restaurantId_key" ON "destination_enrichments"("restaurantId");
CREATE UNIQUE INDEX "destination_enrichments_hotelId_key" ON "destination_enrichments"("hotelId");
CREATE UNIQUE INDEX "destination_enrichments_activityId_key" ON "destination_enrichments"("activityId");
CREATE INDEX "destination_enrichments_hiddenGemScore_idx" ON "destination_enrichments"("hiddenGemScore");
CREATE INDEX "destination_enrichments_photographyScore_idx" ON "destination_enrichments"("photographyScore");
CREATE INDEX "destination_enrichments_familyFriendly_idx" ON "destination_enrichments"("familyFriendly");
CREATE INDEX "destination_enrichments_coupleFriendly_idx" ON "destination_enrichments"("coupleFriendly");
CREATE INDEX "destination_enrichments_kidsFriendly_idx" ON "destination_enrichments"("kidsFriendly");
CREATE INDEX "destination_enrichments_budgetLevel_idx" ON "destination_enrichments"("budgetLevel");
CREATE INDEX "destination_enrichments_indoorOutdoor_idx" ON "destination_enrichments"("indoorOutdoor");
CREATE INDEX "destination_enrichments_rainFriendly_idx" ON "destination_enrichments"("rainFriendly");
CREATE INDEX "destination_enrichments_generatedAt_idx" ON "destination_enrichments"("generatedAt");

CREATE UNIQUE INDEX "destination_enrichment_jobs_sourceKey_key" ON "destination_enrichment_jobs"("sourceKey");
CREATE INDEX "destination_enrichment_jobs_status_idx" ON "destination_enrichment_jobs"("status");
CREATE INDEX "destination_enrichment_jobs_updatedAt_idx" ON "destination_enrichment_jobs"("updatedAt");

ALTER TABLE "destination_enrichments" ADD CONSTRAINT "destination_enrichments_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "attractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_enrichments" ADD CONSTRAINT "destination_enrichments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_enrichments" ADD CONSTRAINT "destination_enrichments_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_enrichments" ADD CONSTRAINT "destination_enrichments_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
