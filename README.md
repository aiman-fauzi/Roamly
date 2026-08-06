# Roamly

Roamly is an AI-powered travel planning MVP built with Next.js, TypeScript, Tailwind CSS, Prisma, Supabase, and Google Gemini.

## Gemini Setup

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with a Google account.
3. Create an API key.
4. Copy `.env.example` to `.env.local`.
5. Set the required Gemini values:

```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_REQUEST_TIMEOUT_MS="30000"
GEMINI_MAX_RETRIES="1"
GEMINI_RETRY_BASE_DELAY_MS="750"
GEMINI_MAX_OUTPUT_TOKENS="1800"
GEMINI_THINKING_BUDGET="0"
ITINERARY_MAX_CANDIDATES="6"
ITINERARY_CONTEXT_BUDGET="6000"
AI_FALLBACK_PROVIDER="disabled"
AI_PROVIDER="gemini"
```

Keep `GEMINI_API_KEY` server-side only. Do not expose it with a `NEXT_PUBLIC_` prefix.
Keep `AI_FALLBACK_PROVIDER` disabled unless a real secondary adapter is configured; the `groq` key is a placeholder, not a live provider.

## Required Environment Variables

Roamly also requires Supabase and Prisma connection variables:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
SUPABASE_AVATAR_BUCKET="avatars"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

See `.env.example` for the full template.

## Travel Offer and Budget Foundation

Travel offers are provider-neutral domain objects under `src/services/travel`. The current build uses deterministic mock providers only:

```env
TRAVEL_OFFER_MODE="mock"
FLIGHT_PROVIDER="mock"
HOTEL_PROVIDER="mock"
FLIGHT_OFFER_CACHE_TTL_SECONDS="900"
HOTEL_OFFER_CACHE_TTL_SECONDS="900"
TRAVEL_OFFER_CACHE_MAX_PAYLOAD_BYTES="256000"
MAX_TRAVELERS_PER_TRIP="18"
ALLOW_ROOMS_GREATER_THAN_TRAVELERS="false"
TRIP_BUDGET_CONTINGENCY_PERCENT="10"
DEFAULT_DAILY_FOOD_BUDGET="80.00"
DEFAULT_DAILY_LOCAL_TRANSPORT_BUDGET="30.00"
```

Mock prices are for local development and automated tests. They are not live prices. The app does not scrape airline, OTA, or booking result pages.

Trip-scoped API routes:

```text
GET  /api/trips/:tripId/travel-profile
PUT  /api/trips/:tripId/travel-profile
POST /api/trips/:tripId/flights
POST /api/trips/:tripId/hotels
POST /api/trips/:tripId/flights/select
POST /api/trips/:tripId/hotels/select
GET  /api/trips/:tripId/selections
POST /api/trips/:tripId/offers/refresh
POST /api/trips/:tripId/budget
POST /api/trips/:tripId/plan
```

Trips now have a durable `TripTravelProfile` for logistics such as origin/destination airport codes, travel dates, traveler counts, room count, cabin class, nonstop preference, currency, and offer-selection strategy. Search, budget, refresh, and full planning routes use the saved profile plus optional safe overrides; overrides update the profile first so there is one source of truth.

Selected offers are stored as sanitized snapshots in `TripFlightSelection` and `TripHotelSelection`. Snapshots are auditable records of what was selected, not booking guarantees. Expired offers remain in history, selecting a new offer marks the prior current selection as `REPLACED`, incompatible profile changes mark current selections `INVALIDATED`, and booking must later revalidate against a live provider.

The offer cache is still in-process, provider-aware, keyed by normalized price-sensitive search fields, payload-limited, and supports explicit refresh. It is suitable for mock development but is lost on process restart and is not shared across serverless instances.

Budget previews preserve original offer currencies, convert through the exchange-rate service, distinguish known/estimated/partial/unknown categories, and include assumptions plus missing-data warnings. Persisted planning stores `TripBudgetSnapshot` rows, supersedes previous current snapshots, links to selected offer snapshots when user-selected offers were used, and marks current budgets stale when selections expire or compatible profile fields change.

The full planning route sends Gemini only compact offer summaries, selected offer IDs, the deterministic budget summary, and destination candidate IDs. Unknown destination candidate IDs or travel offer IDs are rejected before persistence.

Standalone itinerary generation uses a compact Gemini contract for production latency: Roamly retrieves/ranks candidates from Supabase, sends at most `ITINERARY_MAX_CANDIDATES` candidates within `ITINERARY_CONTEXT_BUDGET`, asks Gemini for only `{ candidateId, day, startTime, durationMinutes, reason }`, then enriches the validated IDs with database metadata on the server. Gemini cannot browse, query Supabase directly, or invent unsupported destinations.

Completed itineraries support versioned day-by-day editing. Reorder, lock, notes, replacement, and day-regeneration writes use owner-scoped optimistic concurrency. Replacement and regeneration payloads accept IDs only; names, coordinates, categories, images, durations, and known prices are rebuilt from the current active destination candidate set before one atomic itinerary write. See `docs/itinerary-editor.md`.

## Run Locally

```bash
npm install
npm run db:generate
npm run dev
```

Then open `http://localhost:3000`.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Destination Operations

```bash
npm run import:destinations -- --source=wikivoyage --country=Malaysia --city="Kuala Lumpur" --limit=40
npm run destinations:facts:import -- --file=data/verified-kl-facts.json --dry-run
npm run destinations:audit -- --city="Kuala Lumpur"
```

Travel-offer and persisted planning tests:

```bash
npx vitest --run src/services/travel src/lib/validations/__tests__/travelOfferValidation.test.ts "src/app/api/trips/[tripId]/flights/route.test.ts" "src/app/api/trips/[tripId]/plan/route.test.ts" "src/app/api/trips/[tripId]/travel-profile/route.test.ts" "src/app/api/trips/[tripId]/flights/select/route.test.ts" "src/app/api/trips/[tripId]/selections/route.test.ts"
```

Summarize exported production operation logs:

```bash
npm run observability:travel-summary -- --input=travel-production.jsonl
```

Alert thresholds and log-drain guidance are in `docs/travel-observability.md`.

## Prisma Changes

Use normal Prisma migrations for schema changes. Do not use `prisma db push` for the shared Roamly database.
