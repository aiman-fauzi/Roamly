-- CreateEnum
CREATE TYPE "TravelCabinClass" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

-- CreateEnum
CREATE TYPE "FlightSelectionStrategy" AS ENUM ('CHEAPEST', 'SHORTEST', 'FEWEST_STOPS', 'BEST_VALUE');

-- CreateEnum
CREATE TYPE "HotelSelectionStrategy" AS ENUM ('CHEAPEST', 'REFUNDABLE', 'NEAREST_TO_ITINERARY', 'BEST_VALUE');

-- CreateEnum
CREATE TYPE "TripOfferSelectionStatus" AS ENUM ('SELECTED', 'EXPIRED', 'REPLACED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "TripOfferSelectionSource" AS ENUM ('USER_SELECTED', 'SYSTEM_RECOMMENDED');

-- CreateEnum
CREATE TYPE "TripBudgetSnapshotStatus" AS ENUM ('CURRENT', 'SUPERSEDED', 'STALE', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "trip_travel_profiles" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "originCity" VARCHAR(160),
    "originCountry" VARCHAR(120),
    "originAirportCode" VARCHAR(3),
    "destinationAirportCode" VARCHAR(3),
    "departureDate" DATE,
    "returnDate" DATE,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "cabinClass" "TravelCabinClass" NOT NULL DEFAULT 'ECONOMY',
    "nonStopOnly" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3),
    "flightSelectionStrategy" "FlightSelectionStrategy" NOT NULL DEFAULT 'BEST_VALUE',
    "hotelSelectionStrategy" "HotelSelectionStrategy" NOT NULL DEFAULT 'BEST_VALUE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_travel_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_flight_selections" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "offerId" VARCHAR(220) NOT NULL,
    "providerKey" VARCHAR(80) NOT NULL,
    "providerOfferId" VARCHAR(220) NOT NULL,
    "searchFingerprint" VARCHAR(64) NOT NULL,
    "originAirportCode" VARCHAR(3) NOT NULL,
    "destinationAirportCode" VARCHAR(3) NOT NULL,
    "departureDate" DATE NOT NULL,
    "returnDate" DATE,
    "itinerarySummary" JSONB NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "originalCurrency" VARCHAR(3) NOT NULL,
    "convertedAmount" DECIMAL(18,2),
    "convertedCurrency" VARCHAR(3),
    "conversionRate" DECIMAL(18,8),
    "conversionTimestamp" TIMESTAMP(3),
    "baggageSummary" JSONB,
    "refundable" BOOLEAN,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "providerExpiresAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TripOfferSelectionStatus" NOT NULL DEFAULT 'SELECTED',
    "selectionSource" "TripOfferSelectionSource" NOT NULL DEFAULT 'USER_SELECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_flight_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_hotel_selections" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "offerId" VARCHAR(220) NOT NULL,
    "providerKey" VARCHAR(80) NOT NULL,
    "providerOfferId" VARCHAR(220) NOT NULL,
    "searchFingerprint" VARCHAR(64) NOT NULL,
    "propertyId" VARCHAR(220) NOT NULL,
    "propertyName" VARCHAR(240) NOT NULL,
    "coordinates" JSONB,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "roomSummary" JSONB,
    "boardType" VARCHAR(80),
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "originalCurrency" VARCHAR(3) NOT NULL,
    "convertedAmount" DECIMAL(18,2),
    "convertedCurrency" VARCHAR(3),
    "conversionRate" DECIMAL(18,8),
    "conversionTimestamp" TIMESTAMP(3),
    "refundable" BOOLEAN,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "providerExpiresAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TripOfferSelectionStatus" NOT NULL DEFAULT 'SELECTED',
    "selectionSource" "TripOfferSelectionSource" NOT NULL DEFAULT 'USER_SELECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_hotel_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_budget_snapshots" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "flight" JSONB NOT NULL,
    "accommodation" JSONB NOT NULL,
    "attractions" JSONB NOT NULL,
    "food" JSONB NOT NULL,
    "localTransport" JSONB NOT NULL,
    "contingency" JSONB NOT NULL,
    "totalAmount" DECIMAL(18,2),
    "perPersonAmount" DECIMAL(18,2),
    "assumptions" JSONB NOT NULL,
    "missingData" JSONB NOT NULL,
    "selectedFlightSnapshotId" TEXT,
    "selectedHotelSnapshotId" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "status" "TripBudgetSnapshotStatus" NOT NULL DEFAULT 'CURRENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_budget_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_travel_profiles_tripId_key" ON "trip_travel_profiles"("tripId");

-- CreateIndex
CREATE INDEX "trip_travel_profiles_originAirportCode_destinationAirportCo_idx" ON "trip_travel_profiles"("originAirportCode", "destinationAirportCode");

-- CreateIndex
CREATE INDEX "trip_travel_profiles_departureDate_returnDate_idx" ON "trip_travel_profiles"("departureDate", "returnDate");

-- CreateIndex
CREATE INDEX "trip_flight_selections_tripId_status_idx" ON "trip_flight_selections"("tripId", "status");

-- CreateIndex
CREATE INDEX "trip_flight_selections_searchFingerprint_idx" ON "trip_flight_selections"("searchFingerprint");

-- CreateIndex
CREATE INDEX "trip_flight_selections_providerKey_providerOfferId_idx" ON "trip_flight_selections"("providerKey", "providerOfferId");

-- CreateIndex
CREATE INDEX "trip_hotel_selections_tripId_status_idx" ON "trip_hotel_selections"("tripId", "status");

-- CreateIndex
CREATE INDEX "trip_hotel_selections_searchFingerprint_idx" ON "trip_hotel_selections"("searchFingerprint");

-- CreateIndex
CREATE INDEX "trip_hotel_selections_providerKey_providerOfferId_idx" ON "trip_hotel_selections"("providerKey", "providerOfferId");

-- CreateIndex
CREATE INDEX "trip_budget_snapshots_tripId_status_idx" ON "trip_budget_snapshots"("tripId", "status");

-- CreateIndex
CREATE INDEX "trip_budget_snapshots_selectedFlightSnapshotId_idx" ON "trip_budget_snapshots"("selectedFlightSnapshotId");

-- CreateIndex
CREATE INDEX "trip_budget_snapshots_selectedHotelSnapshotId_idx" ON "trip_budget_snapshots"("selectedHotelSnapshotId");

-- AddForeignKey
ALTER TABLE "trip_travel_profiles" ADD CONSTRAINT "trip_travel_profiles_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_flight_selections" ADD CONSTRAINT "trip_flight_selections_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_hotel_selections" ADD CONSTRAINT "trip_hotel_selections_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_budget_snapshots" ADD CONSTRAINT "trip_budget_snapshots_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_budget_snapshots" ADD CONSTRAINT "trip_budget_snapshots_selectedFlightSnapshotId_fkey" FOREIGN KEY ("selectedFlightSnapshotId") REFERENCES "trip_flight_selections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_budget_snapshots" ADD CONSTRAINT "trip_budget_snapshots_selectedHotelSnapshotId_fkey" FOREIGN KEY ("selectedHotelSnapshotId") REFERENCES "trip_hotel_selections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
