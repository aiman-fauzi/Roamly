CREATE TABLE "itinerary_revisions" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "editVersion" INTEGER NOT NULL,
    "actionType" VARCHAR(40) NOT NULL,
    "actionSummary" VARCHAR(240) NOT NULL,
    "itineraryJson" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itinerary_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "itinerary_revisions_tripId_revisionNumber_key"
ON "itinerary_revisions"("tripId", "revisionNumber");

CREATE INDEX "itinerary_revisions_tripId_createdAt_idx"
ON "itinerary_revisions"("tripId", "createdAt");

ALTER TABLE "itinerary_revisions"
ADD CONSTRAINT "itinerary_revisions_tripId_fkey"
FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
