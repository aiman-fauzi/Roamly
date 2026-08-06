-- Persist only trusted identifiers for the last reviewed mock travel selection.
ALTER TABLE "trip_travel_profiles"
  ADD COLUMN "selectedOutboundFlightId" VARCHAR(220),
  ADD COLUMN "selectedReturnFlightId" VARCHAR(220),
  ADD COLUMN "selectedHotelId" VARCHAR(220),
  ADD COLUMN "selectionFingerprint" VARCHAR(64),
  ADD COLUMN "selectionFingerprintVersion" INTEGER,
  ADD COLUMN "selectionProvider" VARCHAR(40),
  ADD COLUMN "selectionReviewedAt" TIMESTAMP(3),
  ADD COLUMN "selectionVersion" INTEGER NOT NULL DEFAULT 0;
