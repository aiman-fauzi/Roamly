-- Destination Knowledge Database
-- Additive-only migration. Does not modify or remove existing tables.

CREATE TABLE "countries" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(140) NOT NULL,
  "iso2" VARCHAR(2) NOT NULL,
  "iso3" VARCHAR(3),
  "currencyCode" VARCHAR(3),
  "phoneCode" VARCHAR(20),
  "description" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cities" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "region" VARCHAR(160),
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "timezone" VARCHAR(80),
  "description" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attractions" (
  "id" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "address" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "websiteUrl" TEXT,
  "phone" VARCHAR(50),
  "priceLevel" INTEGER,
  "durationMinutes" INTEGER,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attractions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurants" (
  "id" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "address" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "websiteUrl" TEXT,
  "phone" VARCHAR(50),
  "cuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "priceLevel" INTEGER,
  "reservationUrl" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hotels" (
  "id" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "address" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "websiteUrl" TEXT,
  "phone" VARCHAR(50),
  "starRating" DECIMAL(2,1),
  "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "checkInTime" VARCHAR(5),
  "checkOutTime" VARCHAR(5),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activities" (
  "id" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "category" VARCHAR(100),
  "address" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "websiteUrl" TEXT,
  "phone" VARCHAR(50),
  "priceLevel" INTEGER,
  "durationMinutes" INTEGER,
  "minAge" INTEGER,
  "difficulty" VARCHAR(50),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "destination_tags" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "color" VARCHAR(20),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "destination_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "destination_images" (
  "id" TEXT NOT NULL,
  "countryId" TEXT,
  "cityId" TEXT,
  "attractionId" TEXT,
  "restaurantId" TEXT,
  "hotelId" TEXT,
  "activityId" TEXT,
  "url" TEXT NOT NULL,
  "altText" VARCHAR(255),
  "caption" VARCHAR(255),
  "attribution" VARCHAR(255),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "destination_images_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "destination_images_one_parent_chk" CHECK (
    num_nonnulls("countryId", "cityId", "attractionId", "restaurantId", "hotelId", "activityId") = 1
  )
);

CREATE TABLE "opening_hours" (
  "id" TEXT NOT NULL,
  "attractionId" TEXT,
  "restaurantId" TEXT,
  "hotelId" TEXT,
  "activityId" TEXT,
  "dayOfWeek" INTEGER NOT NULL,
  "opensAt" VARCHAR(5),
  "closesAt" VARCHAR(5),
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "note" VARCHAR(255),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "opening_hours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "opening_hours_one_parent_chk" CHECK (
    num_nonnulls("attractionId", "restaurantId", "hotelId", "activityId") = 1
  ),
  CONSTRAINT "opening_hours_dayOfWeek_chk" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  CONSTRAINT "opening_hours_time_presence_chk" CHECK (
    ("isClosed" = true AND "opensAt" IS NULL AND "closesAt" IS NULL)
    OR
    ("isClosed" = false AND "opensAt" IS NOT NULL AND "closesAt" IS NOT NULL)
  )
);

CREATE TABLE "_ActivityDestinationTags" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE TABLE "_AttractionDestinationTags" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE TABLE "_CityDestinationTags" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE TABLE "_CountryDestinationTags" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE TABLE "_HotelDestinationTags" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE TABLE "_RestaurantDestinationTags" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "countries_slug_key" ON "countries"("slug");
CREATE UNIQUE INDEX "countries_iso2_key" ON "countries"("iso2");
CREATE UNIQUE INDEX "countries_iso3_key" ON "countries"("iso3");
CREATE INDEX "countries_name_idx" ON "countries"("name");
CREATE INDEX "countries_deletedAt_idx" ON "countries"("deletedAt");

CREATE UNIQUE INDEX "cities_countryId_slug_key" ON "cities"("countryId", "slug");
CREATE INDEX "cities_countryId_idx" ON "cities"("countryId");
CREATE INDEX "cities_name_idx" ON "cities"("name");
CREATE INDEX "cities_slug_idx" ON "cities"("slug");
CREATE INDEX "cities_deletedAt_idx" ON "cities"("deletedAt");

CREATE UNIQUE INDEX "attractions_cityId_slug_key" ON "attractions"("cityId", "slug");
CREATE INDEX "attractions_cityId_idx" ON "attractions"("cityId");
CREATE INDEX "attractions_name_idx" ON "attractions"("name");
CREATE INDEX "attractions_slug_idx" ON "attractions"("slug");
CREATE INDEX "attractions_deletedAt_idx" ON "attractions"("deletedAt");

CREATE UNIQUE INDEX "restaurants_cityId_slug_key" ON "restaurants"("cityId", "slug");
CREATE INDEX "restaurants_cityId_idx" ON "restaurants"("cityId");
CREATE INDEX "restaurants_name_idx" ON "restaurants"("name");
CREATE INDEX "restaurants_slug_idx" ON "restaurants"("slug");
CREATE INDEX "restaurants_deletedAt_idx" ON "restaurants"("deletedAt");

CREATE UNIQUE INDEX "hotels_cityId_slug_key" ON "hotels"("cityId", "slug");
CREATE INDEX "hotels_cityId_idx" ON "hotels"("cityId");
CREATE INDEX "hotels_name_idx" ON "hotels"("name");
CREATE INDEX "hotels_slug_idx" ON "hotels"("slug");
CREATE INDEX "hotels_deletedAt_idx" ON "hotels"("deletedAt");

CREATE UNIQUE INDEX "activities_cityId_slug_key" ON "activities"("cityId", "slug");
CREATE INDEX "activities_cityId_idx" ON "activities"("cityId");
CREATE INDEX "activities_name_idx" ON "activities"("name");
CREATE INDEX "activities_slug_idx" ON "activities"("slug");
CREATE INDEX "activities_category_idx" ON "activities"("category");
CREATE INDEX "activities_deletedAt_idx" ON "activities"("deletedAt");

CREATE UNIQUE INDEX "destination_tags_slug_key" ON "destination_tags"("slug");
CREATE INDEX "destination_tags_name_idx" ON "destination_tags"("name");
CREATE INDEX "destination_tags_deletedAt_idx" ON "destination_tags"("deletedAt");

CREATE INDEX "destination_images_countryId_idx" ON "destination_images"("countryId");
CREATE INDEX "destination_images_cityId_idx" ON "destination_images"("cityId");
CREATE INDEX "destination_images_attractionId_idx" ON "destination_images"("attractionId");
CREATE INDEX "destination_images_restaurantId_idx" ON "destination_images"("restaurantId");
CREATE INDEX "destination_images_hotelId_idx" ON "destination_images"("hotelId");
CREATE INDEX "destination_images_activityId_idx" ON "destination_images"("activityId");
CREATE INDEX "destination_images_isPrimary_idx" ON "destination_images"("isPrimary");
CREATE INDEX "destination_images_deletedAt_idx" ON "destination_images"("deletedAt");
CREATE UNIQUE INDEX "destination_images_country_primary_key" ON "destination_images"("countryId") WHERE "isPrimary" = true AND "deletedAt" IS NULL AND "countryId" IS NOT NULL;
CREATE UNIQUE INDEX "destination_images_city_primary_key" ON "destination_images"("cityId") WHERE "isPrimary" = true AND "deletedAt" IS NULL AND "cityId" IS NOT NULL;
CREATE UNIQUE INDEX "destination_images_attraction_primary_key" ON "destination_images"("attractionId") WHERE "isPrimary" = true AND "deletedAt" IS NULL AND "attractionId" IS NOT NULL;
CREATE UNIQUE INDEX "destination_images_restaurant_primary_key" ON "destination_images"("restaurantId") WHERE "isPrimary" = true AND "deletedAt" IS NULL AND "restaurantId" IS NOT NULL;
CREATE UNIQUE INDEX "destination_images_hotel_primary_key" ON "destination_images"("hotelId") WHERE "isPrimary" = true AND "deletedAt" IS NULL AND "hotelId" IS NOT NULL;
CREATE UNIQUE INDEX "destination_images_activity_primary_key" ON "destination_images"("activityId") WHERE "isPrimary" = true AND "deletedAt" IS NULL AND "activityId" IS NOT NULL;

CREATE INDEX "opening_hours_attractionId_idx" ON "opening_hours"("attractionId");
CREATE INDEX "opening_hours_restaurantId_idx" ON "opening_hours"("restaurantId");
CREATE INDEX "opening_hours_hotelId_idx" ON "opening_hours"("hotelId");
CREATE INDEX "opening_hours_activityId_idx" ON "opening_hours"("activityId");
CREATE INDEX "opening_hours_dayOfWeek_idx" ON "opening_hours"("dayOfWeek");
CREATE INDEX "opening_hours_deletedAt_idx" ON "opening_hours"("deletedAt");

CREATE UNIQUE INDEX "_ActivityDestinationTags_AB_unique" ON "_ActivityDestinationTags"("A", "B");
CREATE INDEX "_ActivityDestinationTags_B_index" ON "_ActivityDestinationTags"("B");
CREATE UNIQUE INDEX "_AttractionDestinationTags_AB_unique" ON "_AttractionDestinationTags"("A", "B");
CREATE INDEX "_AttractionDestinationTags_B_index" ON "_AttractionDestinationTags"("B");
CREATE UNIQUE INDEX "_CityDestinationTags_AB_unique" ON "_CityDestinationTags"("A", "B");
CREATE INDEX "_CityDestinationTags_B_index" ON "_CityDestinationTags"("B");
CREATE UNIQUE INDEX "_CountryDestinationTags_AB_unique" ON "_CountryDestinationTags"("A", "B");
CREATE INDEX "_CountryDestinationTags_B_index" ON "_CountryDestinationTags"("B");
CREATE UNIQUE INDEX "_HotelDestinationTags_AB_unique" ON "_HotelDestinationTags"("A", "B");
CREATE INDEX "_HotelDestinationTags_B_index" ON "_HotelDestinationTags"("B");
CREATE UNIQUE INDEX "_RestaurantDestinationTags_AB_unique" ON "_RestaurantDestinationTags"("A", "B");
CREATE INDEX "_RestaurantDestinationTags_B_index" ON "_RestaurantDestinationTags"("B");

ALTER TABLE "cities" ADD CONSTRAINT "cities_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attractions" ADD CONSTRAINT "attractions_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "destination_images" ADD CONSTRAINT "destination_images_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_images" ADD CONSTRAINT "destination_images_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_images" ADD CONSTRAINT "destination_images_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "attractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_images" ADD CONSTRAINT "destination_images_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_images" ADD CONSTRAINT "destination_images_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "destination_images" ADD CONSTRAINT "destination_images_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "attractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_ActivityDestinationTags" ADD CONSTRAINT "_ActivityDestinationTags_A_fkey" FOREIGN KEY ("A") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ActivityDestinationTags" ADD CONSTRAINT "_ActivityDestinationTags_B_fkey" FOREIGN KEY ("B") REFERENCES "destination_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_AttractionDestinationTags" ADD CONSTRAINT "_AttractionDestinationTags_A_fkey" FOREIGN KEY ("A") REFERENCES "attractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_AttractionDestinationTags" ADD CONSTRAINT "_AttractionDestinationTags_B_fkey" FOREIGN KEY ("B") REFERENCES "destination_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CityDestinationTags" ADD CONSTRAINT "_CityDestinationTags_A_fkey" FOREIGN KEY ("A") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CityDestinationTags" ADD CONSTRAINT "_CityDestinationTags_B_fkey" FOREIGN KEY ("B") REFERENCES "destination_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CountryDestinationTags" ADD CONSTRAINT "_CountryDestinationTags_A_fkey" FOREIGN KEY ("A") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CountryDestinationTags" ADD CONSTRAINT "_CountryDestinationTags_B_fkey" FOREIGN KEY ("B") REFERENCES "destination_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_HotelDestinationTags" ADD CONSTRAINT "_HotelDestinationTags_A_fkey" FOREIGN KEY ("A") REFERENCES "destination_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_HotelDestinationTags" ADD CONSTRAINT "_HotelDestinationTags_B_fkey" FOREIGN KEY ("B") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_RestaurantDestinationTags" ADD CONSTRAINT "_RestaurantDestinationTags_A_fkey" FOREIGN KEY ("A") REFERENCES "destination_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_RestaurantDestinationTags" ADD CONSTRAINT "_RestaurantDestinationTags_B_fkey" FOREIGN KEY ("B") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

