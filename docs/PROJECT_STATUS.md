# Roamly Project Status

Last updated: 2026-08-05

## Current Health

- Branch: `main`
- Prisma schema validation: passed
- Prisma Client generation: passed
- TypeScript: passed
- Lint: passed with 2 existing console warnings in the audit CLI/test
- Tests: passed, 36 files / 171 tests
- Production build: passed
- Local app smoke test: HTTP 200

## Prisma Migrations

No migration reconciliation was required.

All seven local migrations are recorded as successfully applied in the live Supabase database, and database checksums match the local migration files:

- `20260702124223_add_multiselect_preferences`
- `20260703000000_onboarding_profile_exchange_rates`
- `20260707000000_destination_knowledge_database`
- `20260707010000_destination_import_engine`
- `20260707020000_destination_ai_enrichment`
- `20260804010000_durable_destination_facts`
- `20260805012942_durable_trip_travel_persistence`

Do not run `prisma migrate reset`, `prisma db push`, or `prisma migrate resolve` for the current state.

## Database Connection Strategy

Runtime Prisma Client queries use `DATABASE_URL`.

- Connection type: Supabase Supavisor transaction pooler
- Port: `6543`
- Username shape: `postgres.<project-ref>`
- Query params: `pgbouncer=true`; `connection_limit=1` is recommended for serverless deployments

Prisma CLI schema commands use `DIRECT_URL`.

- Preferred first choice: direct database connection if the direct host is reachable
- Current local choice: Supabase Supavisor session pooler
- Port: `5432`
- Username shape: `postgres.<project-ref>`
- Query params: none

The original `DIRECT_URL` used the direct host `db.<project-ref>.supabase.co:5432` with username `postgres`. That host was unreachable from this machine, causing Prisma schema-engine failures. Switching `DIRECT_URL` to the Supavisor session pooler restored `prisma migrate status` and `prisma db pull --print`.

## Destination Import

Country and City prerequisites are now created by the importer when enough real import context is available.

- The CLI runner supplies `countryName`, deterministic slugs, and known ISO/currency metadata for supported countries.
- The repository first looks for an existing active city.
- If no city exists, it upserts the Country, then upserts the City.
- Existing Country and City descriptions, coordinates, and curated metadata are not overwritten by sparse import data.
- Destination records remain idempotent through unique `(cityId, slug)` constraints.

Each imported entity is persisted in its own Prisma transaction:

- Country/City resolution
- Tags
- Destination upsert
- Images
- Opening hours

Remote downloads and normalization happen before opening the transaction. A failed entity rolls back only that entity, not the whole dataset.

Empty or non-persisting imports now fail at the service layer when:

- The source returns no records.
- Normalization produces no usable records.
- No destination records are created or updated.

The summary reports:

- `fetchedRecords`
- `normalizedRecords`
- `acceptedRecords`
- `reviewRecords`
- `rejectedRecords`
- `createdRecords`
- `updatedRecords`
- `processedRecords`
- `skippedRecords`
- `failedRecords`

## Destination Relevance Pipeline

The importer now applies deterministic relevance validation before persistence:

```text
source records -> normalization -> entity classification -> geographic validation -> relevance scoring -> duplicate detection -> persistence -> enrichment
```

Classification supports the existing destination models only: `ATTRACTION`, `RESTAURANT`, `HOTEL`, and `ACTIVITY`. Unsupported page/content types are rejected with machine-readable reasons such as `CITY_GUIDE`, `REGION_PAGE`, `GENERAL_ARTICLE`, `TRANSPORT_PAGE`, `AIRPORT_PAGE`, `CATEGORY_PAGE`, `DISAMBIGUATION_PAGE`, and `UNKNOWN_ENTITY_TYPE`.

Geographic validation uses a configurable city policy. Kuala Lumpur currently uses:

```text
center: 3.1394, 101.6893
strict radius: 25 km
review radius: 45 km
```

Records inside the strict radius are eligible for automatic acceptance. Records between the strict and review radii receive `BORDERLINE_CITY_DISTANCE` and require review. Records outside the review radius receive `OUTSIDE_REQUESTED_CITY` and are rejected.

The relevance score is a deterministic `0-100` score:

```text
40% entity confidence
35% geographic confidence
15% source confidence
10% required/supporting field confidence
```

Thresholds:

```text
80-100 -> ACCEPT
55-79  -> REVIEW
0-54   -> REJECT
```

Hard rejection reasons override high scores. Duplicate detection is conservative:

- `EXACT_DUPLICATE`: same source ID, or same kind/city/slug within 200 m.
- `POSSIBLE_DUPLICATE`: same kind/city with coordinates within 150 m, or near-matching slugs within 500 m.
- `DISTINCT`: no duplicate signal.

Exact duplicates are not persisted twice. Possible duplicates are held for review rather than merged.

Wikivoyage now prefers structured listing templates from the requested city guide and linked city subpages. It maps:

```text
see   -> ATTRACTION
do    -> ACTIVITY
eat   -> RESTAURANT
sleep -> HOTEL
```

The importer no longer treats whole Wikivoyage city/country/district guide pages as attractions. Gemini enrichment also applies a deterministic quality gate and skips persisted low-quality records before calling Gemini.

## Controlled Import Result

Initial counts:

```text
countries: 0
cities: 0
attractions: 0
destination_import_jobs: 0
```

Original broad-search command:

```bash
npm run import:destinations -- --source=wikivoyage --country=Malaysia --city="Kuala Lumpur" --limit=10
```

Result:

```text
status: COMPLETED
fetched records: 10
normalized records: 9
created records: 9
updated records: 0
persisted records: 9
skipped records: 1
failed records: 0
```

Counts after import:

```text
countries: 1
cities: 1
attractions: 9
destination_import_jobs: 3
```

Re-running the same command skipped the completed import job and did not duplicate Country, City, or Attraction records.

Notes:

- A small OpenStreetMap run with `--limit=5` created 5 restaurant records but no attractions, so the CLI correctly exited with code 1 on the attraction verification guard.
- A later OpenStreetMap run with `--limit=30` failed upstream with HTTP 504 and was recorded as `FAILED`.

Relevance-filtered command:

```bash
npm run import:destinations -- --source=wikivoyage --country=Malaysia --city="Kuala Lumpur" --limit=14
```

Result:

```text
status: COMPLETED
fetched records: 233
normalized records: 8
accepted records: 8
review records: 0
rejected records: 6
created records: 8
updated records: 0
persisted records: 8
skipped records: 6
failed records: 0
```

Rejected records in the controlled run:

```text
Restaurant Nak Won - MISSING_COORDINATES
Rama V - MISSING_COORDINATES
Flamingo hotel - MISSING_COORDINATES
De Palma Hotel (Ampang) - MISSING_COORDINATES
Villa Samadhi Kuala Lumpur - MISSING_COORDINATES
Lanson Place Ambassador Row Serviced Residences - MISSING_COORDINATES
```

The first 14 parsed records contained 6 rejected records and 8 accepted records because the raw article had many listings; persistence was capped by `--limit`.

Counts after relevance-filtered import:

```text
countries: 1
cities: 1
attractions: 15
restaurants: 5
hotels: 1
activities: 1
destination_import_jobs: 5
```

Rerunning the same relevance-filtered command skipped the completed job and did not duplicate records.

## Destination Cleanup

Cleanup strategy: use the existing `deletedAt` fields as a reversible quarantine mechanism. No migration was added. The command does not hard-delete destination rows or enrichment rows; enrichment remains attached to quarantined records and active retrieval filters ignore `deletedAt != null`.

Cleanup command:

```bash
npm run destinations:cleanup -- --source=wikivoyage --city="Kuala Lumpur" --dry-run
npm run destinations:cleanup -- --source=wikivoyage --city="Kuala Lumpur" --apply
```

Supported flags:

```text
--dry-run  default, no writes
--apply    required for quarantine writes
--source   wikivoyage, wikipedia, openstreetmap/osm, government_tourism
--city     city name or slug scope
--ids      comma-separated record IDs
```

The command prints before/after active counts, exact record IDs, source URL or fallback source identifier, coordinates, enrichment relationship, trip/itinerary references, safety flag, and reasons. Writes run inside a transaction and are idempotent.

Dry-run result before apply:

```text
inspected records: 16
affected records: 9
active counts before: attractions 15, restaurants 5, hotels 1, activities 1
```

Quarantined records:

```text
attractions/081c8c15-7566-49eb-ada4-47e55ab31c49 - Jerantut - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, REGION_PAGE, OUTSIDE_REQUESTED_CITY - enrichment 5f8d644a-0dd0-4936-80ea-efdeea18f142 - no trip refs
attractions/7031f91d-f332-4b3d-8d0f-6703ccd215de - Kuala Lumpur - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, CITY_GUIDE - enrichment ddb32228-5d2c-4f0a-9e38-290e7bea681a - no trip refs
attractions/e5bd9e2e-5aaf-481a-9957-62d1a14518fb - Kuala Selangor - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, REGION_PAGE, OUTSIDE_REQUESTED_CITY - no enrichment - no trip refs
attractions/0ecf8a63-d857-4e4c-b881-6cc342279489 - Kuala Terengganu - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, OUTSIDE_REQUESTED_CITY - no enrichment - no trip refs
attractions/ceff9a00-1552-4ac8-988e-a011ec991ef7 - Malaysia - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, REGION_PAGE, OUTSIDE_REQUESTED_CITY - no enrichment - no trip refs
attractions/ff5b005f-3d30-45e5-8607-871399938728 - Petaling Jaya - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, REGION_PAGE - no enrichment - no trip refs
attractions/46307bda-3b3a-4e56-9f6f-1b9153e9df90 - Port Dickson - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, OUTSIDE_REQUESTED_CITY - no enrichment - no trip refs
attractions/ae069d95-e6ba-4e72-abf3-5f2856da23a0 - Shah Alam - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, REGION_PAGE - no enrichment - no trip refs
attractions/57dbdcd2-b87b-4e75-b737-34df00c09ae6 - Subang Jaya - WIKIVOYAGE_ARTICLE_PAGE_ENTITY, REGION_PAGE - no enrichment - no trip refs
```

Apply result:

```text
active counts after: attractions 6, restaurants 5, hotels 1, activities 1
quarantined attractions: 9
second dry-run affected records: 0
```

Retained active records include the six current Wikivoyage listing-derived attractions, five OSM restaurants, one hotel, and one activity.

## Destination Retrieval For Itinerary Planning

Itinerary generation now resolves the requested destination to an active `City`, retrieves eligible destination candidates, ranks them deterministically, serializes compact context, sends only that context to Gemini, validates returned candidate IDs, and persists only validated itinerary JSON.

Retrieval service:

```text
src/services/destinations/destinationRetrievalService.ts
```

Eligibility rules:

- Candidate belongs to the resolved city.
- Entity type is one of `ATTRACTION`, `RESTAURANT`, `HOTEL`, or `ACTIVITY`.
- Entity row and parent city/country are active (`deletedAt: null`).
- Coordinates are valid.
- Old Wikivoyage broad article/page entities are excluded.
- Exact duplicate-like rows receive a deterministic ranking penalty.
- Gemini enrichment is not required when structured source data is enough.

Candidate enrichment state:

```text
SOURCE_ONLY
PARTIALLY_ENRICHED
ENRICHED
```

Ranking formula is deterministic and explainable:

```text
15 source confidence
20 factual completeness
20 geographic proximity to city center
15 enrichment availability
15 interest match
10 travel-style match
5 budget/price compatibility
-2 per stale fact marker, capped at -6
-20 possible duplicate penalty
```

The service returns `rankScore` and `rankReasons` for each candidate. It does not use Gemini to rank the database.

Geographic grouping:

- `haversineDistanceKm` calculates distances in kilometres.
- `groupNearbyCandidates` greedily groups candidates within a lightweight radius.
- `buildNearestNeighbors` returns nearest candidate IDs and distances.
- No external maps, routes, or fake travel times are used.

Compact Gemini context:

```text
src/services/destinations/geminiContext.ts
```

The serializer includes stable candidate IDs, type, name, summary, coordinates, address, tags/categories, opening hours, `openingHoursKnown`, ticket/price confidence, estimated visit duration where sourced, source, `lastVerifiedAt`, factual completeness score, stale fact count, rank score, and rank reasons. It enforces candidate-count and serialized-size budgets and excludes raw scraped pages, full source payloads, internal metadata, and secrets.

Gemini itinerary contract:

```json
{
  "candidateId": "ATTRACTION:stable-id",
  "time": "09:00",
  "durationMinutes": 90,
  "reason": "Matches cultural interests",
  "priceConfidence": "PRICE_UNKNOWN"
}
```

Every morning, afternoon, and evening item must reference one supplied `candidateId`. The route rejects unknown IDs before persistence and annotates persisted itinerary items with `sourceEntityType` and `sourceEntityId`.

Validation covers:

- Candidate IDs exist in the supplied context.
- No duplicate candidate appears unexpectedly.
- Day numbers match the requested duration.
- Start times use `HH:mm`.
- Durations are integers between 15 and 720 minutes.
- Required fields, reasons, and price-confidence values exist.

Budget limitations:

- Exact ticket prices can now be stored in `DestinationFact` with source provenance. Missing or ambiguous prices still use `PRICE_UNKNOWN` rather than invented estimates.
- Restaurant, hotel, and flight costs are not sourced from live providers.
- Currency conversion still uses the existing exchange-rate service.
- The prompt instructs Gemini not to invent prices; unknown-price items should use `0` with `PRICE_UNKNOWN`.
- The prompt also instructs Gemini not to claim known opening times when `openingHoursKnown` is false, and to include a verification tip/note when stale fact markers are present.

Controlled retrieval result after quarantine:

```text
eligible candidates: 13
candidates sent to Gemini under 12 KB context budget: 9
omitted candidates: 4
clusters: 7
nearest-neighbor rows: 13
top candidate: ASEAN Sculpture Garden, rankScore 77
```

Controlled retrieval result after the approved OSM limit-10 import:

```text
eligible candidates: 17
small live context sent: 2 candidates
candidate types sent: ATTRACTION 1, RESTAURANT 1, HOTEL 0, ACTIVITY 0
omitted candidates: 15
context size: 2736/12000
known opening-hours count: 0
known-price count: 0
stale-fact count: 0
```

Controlled retrieval/context result after durable facts and controlled KL expansion:

```text
eligible candidates: 27
candidates sent under 12 KB context budget: 4
candidate types sent: ATTRACTION 2, RESTAURANT 1, HOTEL 0, ACTIVITY 1
omitted candidates: 23
context size: 11298/12000
verified opening-hours count: 2
verified-price count: 2
stale-fact count: 0
context selection: seeds attraction, restaurant, and activity when maxCandidates >= 3, then fills by rank
selected: National Museum, Mee Bandung House (Muar), Badminton, National Mosque
```

Controlled mock route test:

```text
eligible candidates: 1
candidates sent to Gemini: 1
items returned: 1
items persisted: 1
unknown candidate items rejected: 1
quarantined/legacy broad pages used: 0
```

## Safe Development Itinerary Generation

The API route now delegates itinerary business orchestration to:

```text
src/services/itinerary/itineraryGenerationService.ts
```

The route remains responsible for Supabase session lookup and current-user scoping. The shared service verifies the trip, preferences, profile, resolved active city, active destination candidates, compact Gemini context, candidate-ID validation, metadata attachment, and optional persistence.

Development-only command:

```bash
npm run itinerary:generate:dev -- --tripId=<trip-id> --maxCandidates=9 --dry-run --print-context-summary
npm run itinerary:generate:dev -- --tripId=<trip-id> --maxCandidates=9 --persist
```

Safety behavior:

- Defaults to dry-run.
- Refuses `--dry-run` and `--persist` together.
- Refuses `NODE_ENV=production`.
- Does not print the full prompt, raw Gemini output, secrets, or API keys.
- Prints candidate IDs, names, ranking summaries, factual marker rollups, validation status, rejected item reasons, and persistence result.
- Persistence is explicit only; successful persistence replaces `trip.itineraryJson` and marks the trip `COMPLETE`.
- Failed schema/candidate-contract validation does not persist.
- Gemini timeouts, 429 rate limits, temporary 5xx failures, and invalid JSON are mapped to sanitized recoverable categories.
- Provider failures include the candidate/context summary when it was already built, so operators can audit what would have been sent without retrying live AI.
- A per-trip in-process generation lock rejects concurrent duplicate generation with `GENERATION_IN_PROGRESS`; the first request wins.

Live Gemini contract validation used dev trip:

```text
tripId: 68bd0b86-062c-4184-9004-f4eea00ee8fa
destination: Kuala Lumpur
duration: 1 day
travelers: 2
user: dev-itinerary@roamly.local
```

Live dry-run results:

```text
maxCandidates=9: timed out, saved nothing
maxCandidates=6: first run exposed a roadmap-kind schema mismatch; schema/prompt were tightened, then a retry timed out
maxCandidates=3: PASSED, 13 eligible, 3 sent, 3 returned, 3 valid, 0 rejected, unknown IDs none, duplicate IDs none, context 3560/12000
maxCandidates=2 after OSM import and factual markers: PASSED, 17 eligible, 2 sent, 2 returned, 2 valid, 0 rejected, unknown IDs none, duplicate IDs none, context 2736/12000
maxCandidates=4 after durable facts and KL expansion on 2026-08-05: RATE_LIMITED, Gemini attempts up to 2 with GEMINI_MAX_RETRIES=1, persisted nothing
mocked-provider context preview after the rate-limit result: 27 eligible, 4 sent, candidate types ATTRACTION 2 / RESTAURANT 1 / ACTIVITY 1, verified opening-hours 2, verified-price 2, stale facts 0, context 11298/12000
```

Live persistence results:

```text
maxCandidates=3: PASSED and persisted
persistence result: REPLACED_TRIP_ITINERARY
saved items: 3
saved duplicate IDs: none
saved quarantined IDs: none
```

Saved candidate IDs:

```text
ATTRACTION:58f258d4-bf8f-4cb1-b349-e4078378c191 - ASEAN Sculpture Garden - active
RESTAURANT:57ba5d1b-0180-43f8-ba59-252a2ff589dc - Mee Bandung House (Muar) - active
RESTAURANT:f7d44900-feea-4fb9-8b5d-cbc57d7e65fc - McDonald's - active
```

Replacement/duplicate behavior was verified by re-running generation:

```text
invalid re-run: rejected duplicate candidate IDs before persistence
later persist retry: Gemini timeout/rate limit, saved nothing
current saved trip status: COMPLETE
current saved item count: 3
current saved IDs: all active, no duplicates
```

## Structured Factual Data And Source Policies

### Storage Audit

Before the durable-fact migration, factual storage was mixed:

- Opening hours were persisted in the polymorphic `OpeningHour` table for attractions, restaurants, hotels, and activities. They retained normalized day/open/close/closed/note fields, but not source URL, source tier, raw value, parser version, retrieved timestamp, or verified timestamp.
- Ticket prices were not durably modeled. Attractions, restaurants, and activities had only `priceLevel`; hotels did not have a matching price-level field.
- Currency was persisted at `Country.currencyCode`; exact per-fact currency did not exist.
- Official URL and imported source URL were conflated into each destination model's `websiteUrl`; import often preserved the public source page there when no official site was available.
- Source confidence, relevance decisions, parser details, retrieved timestamps, raw source values, and normalized rich facts existed only in parser/import memory, logs, or job summaries and were lost after process exit.
- `DestinationEnrichment` stored generated metadata JSON, but Gemini-derived facts were not separated from source-verified facts.

### Durable Fact Architecture

Structured fact support now lives in:

```text
src/services/destinations/facts/types.ts
src/services/destinations/facts/destinationFactService.ts
src/services/destinations/facts/manualFactImportRunner.ts
```

Migration added:

```text
src/db/migrations/20260804010000_durable_destination_facts/migration.sql
```

The migration adds one generic `DestinationFact` table instead of source-specific columns on every destination model. It supports attractions, restaurants, hotels, and activities consistently through `entityType` and `entityId`.

Model shape:

```text
DestinationFact
- id
- entityType
- entityId
- factType
- normalizedValue Json
- rawValue Json?
- currency?
- sourceKey
- sourceUrl?
- sourceRecordId?
- sourceTier
- confidence
- retrievedAt
- verifiedAt?
- expiresAt?
- parserVersion?
- status
- fingerprint
- createdAt
- updatedAt
```

Enums:

```text
DestinationFactEntityType: ATTRACTION, RESTAURANT, HOTEL, ACTIVITY
DestinationFactType: OPENING_HOURS, TICKET_PRICE, ADDRESS, COORDINATES, OFFICIAL_URL, OPERATIONAL_STATUS, VISIT_DURATION, DESCRIPTION_TAGS
DestinationFactSourceTier: OFFICIAL_SOURCE, GOVERNMENT_OPEN_DATA, OPENSTREETMAP_STRUCTURED, TRUSTED_TRAVEL_LISTING, GEMINI_DERIVED
DestinationFactStatus: ACTIVE, STALE, INVALID, REJECTED
```

Indexes and constraints:

- Unique `fingerprint` for idempotent exact re-imports.
- Lookup indexes on `[entityType, entityId]`, `[entityType, entityId, factType, status]`, `[factType, status]`, `[sourceKey, sourceRecordId]`, `[sourceTier, verifiedAt]`, and `[expiresAt]`.

Backfill/coexistence:

- No destructive backfill was run. Existing `OpeningHour`, `priceLevel`, `websiteUrl`, and enrichment data remain in place.
- Retrieval uses durable facts where available and falls back to existing destination fields where facts are missing.
- Rollback is additive: drop `destination_facts` and new enums only if no code path depends on the table. No existing destination fields are overwritten by the migration.
- Data-loss risk is low because the migration is additive and previous source facts are preserved instead of overwritten.

Current structured shapes:

- `StructuredOpeningHours`: timezone, weekly day intervals, notes, source URL, verified timestamp, provenance.
- `StructuredPrice`: amount/min/max, currency, price type, audience, source URL, verified timestamp, provenance.
- `DestinationFactProvenance`: source name, source URL, source record ID, retrieved/verified timestamps, raw value, normalized value, parser version, source tier.

Effective fact selection:

```text
official source
government/open data
OpenStreetMap structured tags
trusted travel listing source
Gemini-derived metadata
```

Rules:

- Invalid and rejected facts are never returned as effective facts.
- A stale official fact may still outrank a lower-tier fact, but it is marked `STALE`.
- Newer verified timestamps win within the same source tier; retrieval timestamp and confidence break remaining ties.
- Conflicting facts remain queryable through `auditFactHistory`.
- Gemini-derived ticket prices and opening hours are never authoritative.
- Deleted/quarantined destination entities are rejected before source facts are upserted.
- Gemini may produce summaries, suggested tags, visit duration, and audience-suitability metadata.
- Gemini is not authoritative for ticket price, opening hours, address, coordinates, availability, or operational status unless those facts are separately verified.

Fact service behavior:

```text
upsertSourceFact
listEntityFacts
resolveEffectiveFact
resolveEffectiveFactsForEntities
resolveEffectiveFactsForEntity
markFactStale
invalidateFact
auditFactHistory
```

Bulk resolution is used by destination retrieval to avoid N+1 fact lookups when building itinerary candidates.

Source role strategy:

```text
OpenStreetMap:
  entity discovery, coordinates, address, categories, tagged opening hours
Official attraction websites:
  ticket prices, opening hours, closures, official booking URLs
Government/open data:
  official descriptions, trusted listings, destination categorization
Wikivoyage:
  travel-oriented discovery, listing descriptions, section classification
Commercial booking platforms:
  not allowed
```

Source policy registry:

```text
src/services/destinations/facts/sourcePolicy.ts
```

Registered policies:

```text
openstreetmap: OPEN_DATA, allowed domains www.openstreetmap.org and overpass-api.de
wikivoyage: OPEN_DATA, allowed domain en.wikivoyage.org
wikipedia: OPEN_DATA, allowed domain en.wikipedia.org
government-tourism: OPEN_DATA, allowed domain data.gov.my
fixture-official-attraction: SCRAPER_ALLOWED, deterministic fixture domain only
trusted-manual-travel-listing: MANUAL_IMPORT, allowlisted travel listing domains
trusted-manual-official-site: MANUAL_IMPORT, allowlisted official public attraction sites
commercial-booking-platforms: NOT_ALLOWED
```

The destination import runner now checks its generated source URL against this registry before importing. Government imports using an unapproved dataset host are refused before any import starts.

Robots enforcement:

```text
src/services/destinations/facts/robots.ts
```

Behavior:

- Resolves `/robots.txt` from the target origin.
- Parses `User-agent`, `Allow`, and `Disallow`.
- Uses longest matching rule precedence.
- Evaluates the configured Roamly crawler user agent.
- Caches robots rules for 10 minutes.
- Treats fetch failures conservatively as denied.
- Does not treat robots.txt as a legal license.

Approved official adapter status:

```text
src/services/destinations/facts/adapters.ts
```

Only a deterministic `fixture-official-attraction` adapter was implemented in this pass. No live official attraction site was scraped. The fixture adapter enforces source policy, robots decisions, an identifiable user agent, timeouts, no arbitrary JavaScript execution, no login/CAPTCHA/paywall bypass, no unrelated link crawling, and no raw HTML sent to Gemini. It extracts JSON-LD address, opening hours, ticket prices, official URL, operational status, and provenance.

Manual verified-fact workflow:

```bash
npm run destinations:facts:import -- --file=data/verified-kl-facts.json --dry-run
npm run destinations:facts:import -- --file=data/verified-kl-facts.json --apply
```

Validation includes entity IDs, active/non-quarantined entity state, fact type enums, source policy, URL host allowlists, ISO timestamps, currency codes, opening-hour shape, price shape, coordinate bounds, operational status, and visit-duration ranges.

Manual import result for `data/verified-kl-facts.json`:

```text
dry-run: proposed 9, applied 0, skipped 9, failed 0, conflicts 0
first apply: proposed 9, applied 9, failed 0, conflicts 0
second apply: proposed 9, applied 9 via upsert, failed 0, conflicts 9
destination_facts total after second apply: 9
duplicate fingerprints: 0
```

Manual sources used:

- National Museum official visiting-info and ticket pages for hours, prices, official URL, and operational status.
- Aquaria KLCC official homepage for hours, official URL, and operational status.
- MalaysiaLife trusted travel listing for National Mosque visitor windows and free admission.

Opening-hours format:

```text
timezone: Asia/Kuala_Lumpur
weekly: MONDAY-SUNDAY entries
intervals: one or more { opens: HH:mm, closes: HH:mm }
closed: true for closed days
notes: public-holiday, prayer-time, last-entry, seasonal, or manual verification notes
```

Parsing returns `PARSED`, `PARTIAL`, `AMBIGUOUS`, or `UNSUPPORTED`. Ambiguous values such as seasonal, varies, public-holiday-dependent, prayer-time-dependent, or call-ahead text are not silently converted into false schedules.

Price format:

```text
FREE
FIXED
FROM
RANGE
UNKNOWN
```

Audience-specific prices are preserved as separate rows in the normalized JSON. Adult, child, senior, student, Malaysian/non-Malaysian notes, tax notes, booking-fee notes, and temporarily unavailable values are not collapsed into fake averages.

Fact merge precedence:

```text
official source
government/open data
OpenStreetMap structured tags
trusted travel listing source
Gemini-derived metadata
```

Rules implemented in `src/services/destinations/facts/merge.ts`:

- Higher-confidence source tier wins.
- Newer verified timestamp wins within the same tier.
- Lower-confidence or older conflicting facts are preserved in the merge result for review.
- Gemini-derived facts cannot overwrite sourced prices or opening hours.

Stale-data rules live in `src/services/destinations/facts/staleness.ts` and are configurable:

```text
ticket prices: 30 days
opening hours: 60 days
addresses/coordinates: 180 days
descriptions/tags: 365 days
```

Stale data is not deleted. Candidates with stale markers may still be ranked and sent to Gemini, with a moderate ranking penalty and prompt instructions to mark current facts for traveler verification.

### Kuala Lumpur Quality Audit

Read-only quality audit service:

```text
src/services/destinations/destinationQualityAudit.ts
```

Command:

```bash
npm run destinations:audit -- --city="Kuala Lumpur"
npm run destinations:audit -- --city="Kuala Lumpur" --json
```

Controlled KL expansion after the durable-facts migration:

```text
openstreetmap limit=20: completed, fetched 20, accepted 16, review 4, rejected 0, created 7, updated 9, skipped 4, failed 0
wikivoyage limit=20: completed, fetched 233, accepted 10, review 4, rejected 6, created 2, updated 8, skipped 10, failed 0
wikipedia limit=15: failed safely with 0 accepted, 15 rejected, no writes; broad/region/transport pages were filtered out
openstreetmap limit=25: completed, fetched 25, accepted 21, review 4, rejected 0, created 5, updated 16, skipped 4, failed 0
wikivoyage limit=30: completed, fetched 233, accepted 16, review 8, rejected 6, created 6, updated 10, skipped 14, failed 0
wikivoyage limit=40: completed, fetched 233, accepted 25, review 9, rejected 6, created 9, updated 16, skipped 15, failed 0
openstreetmap limit=35: completed, fetched 35, accepted 30, review 5, rejected 0, created 9, updated 21, skipped 5, failed 0
```

Final active coverage:

```text
ATTRACTION: 20
RESTAURANT: 20
HOTEL: 12
ACTIVITY: 3
total active: 55
quarantined: ATTRACTION 9, RESTAURANT 0, HOTEL 0, ACTIVITY 0
```

Audit result:

```text
verified opening-hours coverage: 3/55 (5%)
verified price coverage: 2/55 (4%)
stale facts: 0
conflicting facts: 0
missing coordinates: 0
missing source URLs: 24
possible duplicates: 1
Gemini-enriched coverage: 2/55 (4%)
```

Post-expansion active record inventory:

```text
ATTRACTION examples: National Museum, National Mosque, Aquaria KLCC, Thean Hou Temple, Butterfly Park, National Planetarium
RESTAURANT examples: Mee Bandung House (Muar), Laman Selera MADANI Tanglin, Rebung, The Hornbill Restaurant & Cafe, Old Town
HOTEL examples: Somerset Kuala Lumpur, Hilton Kuala Lumpur, The Majestic Hotel, Renaissance Kuala Lumpur Hotel
ACTIVITY: Badminton, Cycle or hike on SWBC, Kompleks Sukan Tasik Titiwangsa
```

## Destination Enrichment

Gemini environment variables are configured locally.

Command:

```bash
npm run enrich:destinations -- --batchSize=1 --sourceKey=controlled-kuala-lumpur-batch-1
```

Initial counts:

```text
destination_enrichments: 0
destination_enrichment_jobs: 0
```

After first run:

```text
destination_enrichments: 1
destination_enrichment_jobs: 1
```

After rerun:

```text
destination_enrichments: 2
distinct_enriched_parents: 2
destination_enrichment_jobs: 1
```

The rerun enriched another pending destination and did not duplicate an already enriched parent record.

After the relevance quality gate, a live enrichment run with:

```bash
npm run enrich:destinations -- --batchSize=1 --sourceKey=relevance-quality-gate-kl-1
```

skipped the old low-quality `Kuala Selangor` record before Gemini and processed one eligible record. Rerunning the same command produced no duplicate parent enrichment:

```text
destination_enrichments: 4
distinct_enriched_parents: 4
destination_enrichment_jobs: 2
```

Invalid provider responses are covered by mock-based tests. If every destination in a batch fails validation or provider generation, the enrichment job is marked `FAILED`.

## Durable Trip Travel Planning

The travel-offer layer is provider-neutral and currently runs in deterministic mock mode only. No live provider credentials were added, and no airline, OTA, or commercial booking result pages are scraped. This pass added durable trip travel inputs, selected-offer snapshots, and budget snapshots while keeping live provider offers short-lived.

Core modules:

```text
src/services/travel/offers/types.ts
src/services/travel/offers/mockProviders.ts
src/services/travel/offers/offerCache.ts
src/services/travel/offers/travelOfferService.ts
src/services/travel/offers/selection.ts
src/services/travel/offers/money.ts
src/services/travel/budget/tripBudgetService.ts
src/services/travel/profile/tripTravelProfileService.ts
src/services/travel/profile/tripTravelSearchRequestService.ts
src/services/travel/persistence/tripOfferSelectionService.ts
src/services/travel/persistence/tripBudgetSnapshotService.ts
src/services/travel/planning/tripTravelPlanningService.ts
```

Persistence audit summary:

- `Trip` previously persisted only ownership, title, status, and `itineraryJson`.
- `PreferenceSet` persisted questionnaire destination, rough budget, group size, duration, style, food, lodging, transport, and activity preferences.
- Profile-level preferred currency existed, but travel logistics were not trip-specific.
- Origin airport, destination airport, dates, traveler breakdown, room count, cabin class, nonstop preference, selected offers, offer search timestamps, and budget results were request-only or in memory and would be lost after restart.
- Existing trips are left valid; unknown logistics remain nullable and read as `ACTION_REQUIRED`.

Additive migration:

```text
20260805012942_durable_trip_travel_persistence
```

New models and enums:

- `TripTravelProfile`: one row per trip for origin/destination airport codes, dates, adults, children, infants, rooms, cabin class, nonstop preference, currency, and flight/hotel selection strategies.
- `TripFlightSelection` and `TripHotelSelection`: sanitized durable snapshots of user-selected offers, with price, conversion, fetched/expiry timestamps, search fingerprint, summary JSON, and status.
- `TripBudgetSnapshot`: persisted budget category JSON, totals, assumptions, missing-data warnings, current/superseded/stale/incomplete status, and optional links to selected offer snapshots.
- Enums: `TravelCabinClass`, `FlightSelectionStrategy`, `HotelSelectionStrategy`, `TripOfferSelectionStatus`, `TripOfferSelectionSource`, and `TripBudgetSnapshotStatus`.

Migration and backfill behavior:

- Additive only; no existing trip, questionnaire, destination, or itinerary rows are rewritten.
- Existing trip profiles are created only when users or APIs provide explicit inputs.
- Preferred currency falls back from `Profile.preferredCurrency` at read/build time unless a trip-specific currency has been saved.
- Airport codes, dates, and traveler breakdowns are never invented from ambiguous questionnaire answers.
- Rollback is standard additive rollback by dropping the new tables/enums after ensuring no code path depends on them. Data-loss risk for existing rows is low because no existing columns were changed.

Provider contracts:

- Flight and hotel providers implement `providerKey` plus `searchFlights` or `searchHotels`.
- Results distinguish `SUCCESS`, `NO_RESULTS`, `RATE_LIMITED`, `TEMPORARY_FAILURE`, `INVALID_REQUEST`, and `PROVIDER_UNAVAILABLE`.
- Application domain offer types keep provider IDs and normalized prices, but provider-specific raw payloads are not passed into Gemini.
- Mock providers have no network access and return reproducible direct/connecting flight offers, refundable/non-refundable hotel offers, taxes, totals, expiration timestamps, empty-result mode, rate-limit simulation, and temporary-failure simulation.

Validation rules:

- Date-only strings use `YYYY-MM-DD` calendar validation and UTC-midnight serialization to avoid timezone drift.
- `adults >= 1`, `children >= 0`, `infants >= 0`, `rooms >= 1`.
- `infants <= adults`.
- Total travelers are capped by `MAX_TRAVELERS_PER_TRIP` (default `18`).
- Rooms cannot exceed total travelers unless `ALLOW_ROOMS_GREATER_THAN_TRAVELERS=true`.
- Persisted travel profiles require return date after departure date when both are present.
- Provider adapters can add stricter provider-specific limits later, but the core domain validation avoids provider-specific assumptions.

Offer cache:

- Interface-backed in-process implementation; no durable offer-cache migration was added in this pass.
- Provider-aware deterministic SHA-256 fingerprint.
- Flight keys include origin, destination, dates, travelers, cabin class, currency, nonstop flag, provider, and simulation mode.
- Hotel keys include city, dates, travelers, rooms, currency, provider, itinerary center when supplied, and simulation mode.
- Cache entries include `fetchedAt`, `expiresAt`, and `cacheStatus`.
- Expired entries are not returned as current. Explicit refresh bypasses the current entry.
- Concurrent identical searches share one pending load.
- Payloads are size-limited by `TRAVEL_OFFER_CACHE_MAX_PAYLOAD_BYTES` (default `256000`).
- Limitation: memory cache is lost on process restart and not shared across serverless instances. A future database or external cache can implement the same store interface.

Selected-offer snapshot semantics:

- A selection snapshot records what the user selected at a point in time; it does not guarantee current availability.
- Snapshots do not store booking tokens, provider credentials, private deep-link parameters, or raw provider payloads.
- `SELECTED` is the only current user-selected status. `EXPIRED`, `REPLACED`, and `INVALIDATED` rows remain auditable history.
- Re-selecting the same current offer is idempotent.
- Selecting a new flight or hotel marks the prior current selection as `REPLACED` in a transaction.
- Updating incompatible travel-profile fields marks current selections `INVALIDATED` and current budget snapshots `STALE`.
- Reading selections marks expired current snapshots `EXPIRED` and stales the current budget snapshot.
- Booking must later require live provider revalidation.

Budget engine:

- Flight and hotel categories are `KNOWN` only when a selected offer is supplied.
- Attraction costs use verified exact or free ticket-price facts from selected destination candidates.
- Unknown or non-exact attraction prices are reported in `missingData` and do not silently become known zero-cost rows.
- Food, local transport, and contingency are deterministic estimates from configuration.
- Money arithmetic uses integer minor units and preserves original provider currency plus the exchange rate used for conversion.
- Whole-trip and per-person totals are returned with assumptions and missing-data warnings.
- Persisted planning creates a `TripBudgetSnapshot` and marks the prior current snapshot `SUPERSEDED`.
- Current budget snapshots become `STALE` when selected offers expire, are replaced, or are invalidated by travel-profile changes.

Offer selection:

```text
flights: CHEAPEST, SHORTEST, FEWEST_STOPS, BEST_VALUE
hotels: CHEAPEST, REFUNDABLE, NEAREST_TO_ITINERARY, BEST_VALUE
```

Hotel proximity uses the existing Haversine helper. No road travel time is calculated without a routing provider.

Planning state behavior:

```text
ACTION_REQUIRED -> missing required profile fields
READY_FOR_SEARCH -> profile has search fields but no current selected flight+hotel
OFFERS_SELECTED -> current flight and hotel snapshots are selected
COMPLETE -> existing completed itinerary is present
```

`TripStatus` remains `DRAFT`/`COMPLETE`; no database enum expansion was needed. Planning responses also distinguish `flightSelectionSource` and `hotelSelectionSource` as `USER_SELECTED`, `SYSTEM_RECOMMENDED`, or `NOT_SELECTED`. System-ranked offers can be used for budget previews or itinerary context, but they are not persisted as user selections.

Gemini contract:

- Gemini receives compact `flightOffers`, `hotelOffers`, selected offer IDs, destination candidates, and a deterministic budget summary.
- Gemini may reference only supplied selected/system offer IDs and destination `candidateId` values.
- Unknown destination candidate IDs or offer IDs are rejected before persistence.
- The prior itinerary is preserved on provider failures, Gemini failures, contract violations, or selection errors.

Trip-scoped API routes:

```text
GET  /api/trips/[tripId]/travel-profile
PUT  /api/trips/[tripId]/travel-profile
POST /api/trips/[tripId]/flights
POST /api/trips/[tripId]/hotels
POST /api/trips/[tripId]/flights/select
POST /api/trips/[tripId]/hotels/select
GET  /api/trips/[tripId]/selections
POST /api/trips/[tripId]/offers/refresh
POST /api/trips/[tripId]/budget
POST /api/trips/[tripId]/plan
```

All routes require authentication and trip ownership. They validate input with Zod, return sanitized errors, categorize provider failures, and avoid raw provider payload or secret leakage.

Request/response contract:

- Search, budget, refresh, and plan routes use the saved `TripTravelProfile` plus optional safe overrides.
- Overrides update the travel profile first, then downstream services build requests from the persisted profile to avoid multiple sources of truth.
- Travel-profile responses include `currencySource`, `planningStatus`, `missingRequiredFields`, `canSearchOffers`, `canSelectOffers`, and `canGenerateItinerary`.
- Offer result responses include `expiresAt`, `cacheStatus`, `requestFingerprint`, and provider-neutral offer summaries.
- Selection responses include selected snapshot IDs, `selectionSource`, `isExpired`, and `requiresRefresh`.
- Budget responses preserve category statuses and missing-data warnings; persisted planning can include a `budgetSnapshot`.

Frontend response boundary:

- Flight offer cards can use `offers`, `cacheStatus`, `fetchedAt`, `expiresAt`, `totalPrice`, `baggage`, `refundable`, and itinerary segment summaries.
- Hotel offer cards can use `propertyName`, `roomName`, `boardType`, `refundable`, `totalPrice`, `distanceFromItineraryCenterKm`, `fetchedAt`, and `expiresAt`.
- Budget UI can use `budgetSummary` categories, `assumptions`, `missingData`, `remainingBudget`, and `isBudgetExceeded`.
- Travel-profile UI can use readiness flags and missing-field names directly.
- Selection UI can use `requiresRefresh` and `isExpired` for expiry badges and refresh prompts.
- Refresh UI can call `/offers/refresh` and use `cacheStatus: REFRESHED`.
- Retry UI can inspect route error codes such as `FLIGHT_RATE_LIMITED`, `HOTEL_TEMPORARY_FAILURE`, `TRAVEL_PLANNING_IN_PROGRESS`, and `AI_TRAVEL_OFFER_CONTRACT_VIOLATION`.

Controlled persisted mock-flow result:

```text
travel profile saved: KUL -> KIX, 2026-09-01 to 2026-09-05, 2 adults, 1 room, economy, MYR
flight offers returned: 2
hotel offers returned: 2
flight selection snapshot: direct mock flight, USER_SELECTED, current
hotel selection snapshot: Mock Flexible Suites, USER_SELECTED, current
flight total: 840.00 MYR
hotel total: 520.00 MYR
known attraction cost: 20.00 MYR
estimated categories: food, localTransport, contingency
unknown categories: none
contingency: 182.00 MYR
whole-trip total: 2002.00 MYR
per-person total: 1001.00 MYR
budget snapshot: CURRENT after calculation, prior current snapshots SUPERSEDED
candidates sent to Gemini: 1
valid itinerary items: 1
historical selections: retained after replacement/expiry/invalidation
superseded budget snapshots: retained for audit
```

Remaining work before live provider integration:

- Select official flight and hotel APIs and review their terms.
- Add provider-specific adapters behind the existing interfaces.
- Add server-side credential configuration and rotation guidance.
- Decide whether offer caching should remain in-process or move to an additive durable/edge cache before serverless production use.
- Add live-provider contract tests with recorded/sanitized fixtures.
- Add UI offer cards, expiry indicators, refresh action, and budget breakdown screens.
- Add booking revalidation and handoff flows; current selections are auditable snapshots only.

## Required Environment Variables

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_AVATAR_BUCKET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_REQUEST_TIMEOUT_MS`
- `GEMINI_MAX_RETRIES`
- `GEMINI_RETRY_BASE_DELAY_MS`
- `GEMINI_MAX_OUTPUT_TOKENS`
- `GEMINI_THINKING_BUDGET`
- `ITINERARY_MAX_CANDIDATES`
- `ITINERARY_CONTEXT_BUDGET`
- `AI_FALLBACK_PROVIDER`
- `AI_PROVIDER`
- `TRAVEL_OFFER_MODE`
- `FLIGHT_PROVIDER`
- `HOTEL_PROVIDER`
- `FLIGHT_OFFER_CACHE_TTL_SECONDS`
- `HOTEL_OFFER_CACHE_TTL_SECONDS`
- `TRAVEL_OFFER_CACHE_MAX_PAYLOAD_BYTES`
- `MAX_TRAVELERS_PER_TRIP`
- `ALLOW_ROOMS_GREATER_THAN_TRAVELERS`
- `TRIP_BUDGET_CONTINGENCY_PERCENT`
- `DEFAULT_DAILY_FOOD_BUDGET`
- `DEFAULT_DAILY_LOCAL_TRANSPORT_BUDGET`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`
- `GOVERNMENT_TOURISM_DATASET_URL`
- `DESTINATION_GOVERNMENT_DATASET_URL` - deprecated compatibility alias

## Repeat Commands

```bash
npx prisma migrate status --schema=src/db/schema.prisma
npx prisma db pull --schema=src/db/schema.prisma --print
npm run import:destinations -- --source=wikivoyage --country=Malaysia --city="Kuala Lumpur" --limit=14
npm run import:destinations -- --source=openstreetmap --country=Malaysia --city="Kuala Lumpur" --limit=10
npm run import:destinations -- --source=wikivoyage --country=Malaysia --city="Kuala Lumpur" --limit=40
npm run import:destinations -- --source=openstreetmap --country=Malaysia --city="Kuala Lumpur" --limit=35
npm run destinations:cleanup -- --source=wikivoyage --city="Kuala Lumpur" --dry-run
npm run destinations:facts:import -- --file=data/verified-kl-facts.json --dry-run
npm run destinations:facts:import -- --file=data/verified-kl-facts.json --apply
npm run destinations:audit -- --city="Kuala Lumpur"
npm run enrich:destinations -- --batchSize=1 --sourceKey=controlled-kuala-lumpur-batch-1
npm run itinerary:generate:dev -- --tripId=<trip-id> --maxCandidates=4 --dry-run --print-context-summary
npm run itinerary:generate:dev -- --tripId=<trip-id> --maxCandidates=6 --persist
npx vitest --run src/services/travel src/lib/validations/__tests__/travelOfferValidation.test.ts "src/app/api/trips/[tripId]/flights/route.test.ts" "src/app/api/trips/[tripId]/plan/route.test.ts" "src/app/api/trips/[tripId]/travel-profile/route.test.ts" "src/app/api/trips/[tripId]/flights/select/route.test.ts" "src/app/api/trips/[tripId]/selections/route.test.ts"
npx prisma validate --schema=src/db/schema.prisma
npx prisma generate --schema=src/db/schema.prisma
npm run typecheck
npm run lint
npm test
npm run build
```

## Remaining Blockers

- Vercel and any other developer machines should update `DIRECT_URL` to a direct reachable host or the Supavisor session pooler.
- Wikivoyage listing coverage depends on source pages having coordinates. Missing-coordinate listings are rejected for now.
- Destination entities still lack durable source ID/source URL/relevance-review columns outside `DestinationFact`; rejected/review counts are still reported in import job summaries and structured logs.
- Active Kuala Lumpur activities remain below the 5-10 development target. Further expansion should stay source-policy approved and review-controlled.
- Opening-hours and exact ticket-price coverage improved from 0%, but remain sparse at 3/55 and 2/55.
- No broad production import has been run.

## Itinerary Latency Optimization - 2026-08-05

Production timeout reduction is implemented for the destination-grounded itinerary path.

Previous generation shape:

- Model default depended on `GEMINI_MODEL`; the documented value was `gemini-2.5-flash`.
- Provider timeout was documented as 60000ms.
- Gemini received up to 24 candidates and a 12000-character destination context budget.
- Prompt context included larger destination records with source/provenance, ranking notes, descriptions, opening-hour arrays, and fact summaries.
- Gemini returned the full enriched itinerary JSON, including titles, descriptions, coordinates, budget, costs, exchange rate, and roadmap.

Current generation shape:

- Default model is `gemini-2.5-flash`.
- Provider timeout is 30000ms.
- Retry budget is still one bounded retry for timeout, 429 with Retry-After, and transient 5xx only.
- Temperature is 0.2.
- Thinking is disabled/minimized with `GEMINI_THINKING_BUDGET=0` and `includeThoughts=false`.
- Output is capped with `GEMINI_MAX_OUTPUT_TOKENS=1800`.
- Default candidate limit is `ITINERARY_MAX_CANDIDATES=6`.
- Default prompt context budget is `ITINERARY_CONTEXT_BUDGET=6000`.
- Gemini receives only compact candidate fields: candidate ID, entity type, name, coordinates, short tags, opening-hour status, price status/value where verified, suggested duration, and cluster ID.
- Gemini returns only `{ candidateId, day, startTime, durationMinutes, reason }`.
- The backend enriches valid candidate IDs from Supabase metadata, calculates cost/budget fields, builds roadmap data, rejects unknown or duplicate IDs, and preserves the previous itinerary on provider or contract failure.
- The API route exports `maxDuration = 60` and returns compact context size plus generation latency in response metadata.
- Optional fallback architecture exists behind `AI_FALLBACK_PROVIDER`, disabled by default. `groq` remains a placeholder until a real adapter is installed.

Validation completed before release:

```text
npm install: passed
npx prisma validate --schema=src/db/schema.prisma: passed
npx prisma generate --schema=src/db/schema.prisma: passed
npx prisma migrate status --schema=src/db/schema.prisma: passed, 7 migrations, schema up to date
npm run typecheck: passed
npm run lint: passed with 2 existing destination-audit console warnings
npm test: passed, 37 files, 175 tests
npm run build: passed
local production smoke: HTTP 200 on http://localhost:3210/
```

Controlled live Gemini dry-run:

```text
tripId: 68bd0b86-062c-4184-9004-f4eea00ee8fa
destination: Kuala Lumpur
model: gemini-2.5-flash
maxCandidates: 4
eligible candidates: 27
candidates sent: 4
candidate types: ATTRACTION=2, RESTAURANT=1, HOTEL=0, ACTIVITY=1
known opening-hours count: 2
known-price count: 2
raw context size: 3804
compact context size: 1634/6000
provider response time: 2806ms
service request latency: 2822ms
items returned: 4
valid items: 4
rejected items: 0
unknown candidate IDs: none
duplicate candidate IDs: none
persistence: DRY_RUN
```
