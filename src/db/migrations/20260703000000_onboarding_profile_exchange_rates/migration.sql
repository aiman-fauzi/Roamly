-- Add profile completion fields
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "country" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "region" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "preferredCurrency" VARCHAR(3),
  ADD COLUMN IF NOT EXISTS "travelInterests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "preferredLanguage" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "profileComplete" BOOLEAN NOT NULL DEFAULT false;

-- Exchange-rate cache for live lookups with cached fallback
CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" TEXT NOT NULL,
  "baseCurrency" VARCHAR(3) NOT NULL,
  "quoteCurrency" VARCHAR(3) NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL,
  "source" VARCHAR(50) NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rates_baseCurrency_quoteCurrency_key"
  ON "exchange_rates"("baseCurrency", "quoteCurrency");

CREATE INDEX IF NOT EXISTS "exchange_rates_baseCurrency_quoteCurrency_fetchedAt_idx"
  ON "exchange_rates"("baseCurrency", "quoteCurrency", "fetchedAt");
