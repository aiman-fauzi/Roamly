# Roamly MVP Onboarding, Profile Completion, and Rich Itinerary Design

## Status

Approved root direction: keep the existing Next.js App Router, Prisma, Supabase Auth, PostgreSQL, and AI provider abstraction. Add profile completion, richer profile editing, exchange-rate caching, and richer itinerary JSON without redesigning the architecture.

## Goals

- Redirect first-time or incomplete-profile users to `/profile/setup` before they can use the dashboard or trip flows.
- Let users complete and later edit full profile details: full name, country, region/state, preferred currency, travel interests, preferred language, and avatar.
- Auto-suggest currency from selected country while still allowing manual override.
- Generate richer itineraries with morning/afternoon/evening structure, item-level costs, daily totals, grand total, budget comparison, and a structured roadmap timeline.
- Use live exchange rates when available and cached rates when live lookup fails. Never ask the AI to invent converted values.
- Keep Gemini-specific code inside the Gemini provider layer.

## Non-Goals

- No major route, auth, or data-access redesign.
- No normalized itinerary activity/day tables for this MVP. The generated itinerary remains one structured JSON document stored on `trips.itineraryJson`.
- No paid exchange-rate provider or API key dependency.
- No server-side geocoding. Latitude and longitude stay optional AI-provided fields.

## External Dependency

Use Frankfurter as the default live exchange-rate source.

- Public API base: `https://api.frankfurter.dev`
- Latest pair endpoint: `GET /v2/rate/{base}/{quote}`
- The official documentation says the public API requires no API key and supports pair-rate conversion by fetching a rate and applying it in application code.
- Source docs: https://frankfurter.dev/

The application stores every successful lookup in the database. If the live request fails, the exchange-rate service uses the newest cached rate for the same currency pair. If no cached rate exists, itinerary generation returns a clear 400/500 API error and does not call the AI with missing conversion data.

## Data Model

### Profile

Extend the existing `Profile` model rather than adding a second onboarding table.

New or changed fields:

- `displayName String @db.VarChar(100)` remains the full-name display field.
- `country String? @db.VarChar(100)`
- `region String? @db.VarChar(100)`
- `preferredCurrency String? @db.VarChar(3)`
- `travelInterests String[] @default([])`
- `preferredLanguage String? @db.VarChar(20)`
- `profileComplete Boolean @default(false)`

Completion rule:

```ts
profileComplete =
  displayName.trim().length > 0 &&
  country.trim().length > 0 &&
  region.trim().length > 0 &&
  preferredCurrency.trim().length === 3
```

Existing users keep their existing `displayName` and `avatarUrl`, but `profileComplete` defaults to `false` until they save required fields.

### ExchangeRate

Add a normalized cache table.

Fields:

- `id String @id @default(uuid())`
- `baseCurrency String @db.VarChar(3)`
- `quoteCurrency String @db.VarChar(3)`
- `rate Decimal @db.Decimal(18, 8)`
- `source String @db.VarChar(50)`
- `fetchedAt DateTime`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

Indexes:

- Unique pair cache key: `@@unique([baseCurrency, quoteCurrency])`
- Read fallback index: `@@index([baseCurrency, quoteCurrency, fetchedAt])`

### Trip / Itinerary

Keep `Trip.itineraryJson Json?` as the storage surface.

The JSON format becomes:

```ts
interface Itinerary {
  title: string
  summary: string
  currencyLocal: string
  currencyUser: string
  exchangeRate: {
    baseCurrency: string
    quoteCurrency: string
    rate: number
    source: string
    fetchedAt: string
    fromCache: boolean
  }
  budget: {
    totalBudgetUserCurrency: number
    estimatedTotalLocal: number
    estimatedTotalUserCurrency: number
    remainingBudgetUserCurrency: number
    isBudgetExceeded: boolean
  }
  days: DayPlan[]
  roadmap: RoadmapDay[]
}

interface DayPlan {
  dayNumber: number
  theme: string
  morning: ItineraryItem[]
  afternoon: ItineraryItem[]
  evening: ItineraryItem[]
  dailyTotalLocal: number
  dailyTotalUserCurrency: number
  notes: string[]
}

interface ItineraryItem {
  time: string
  title: string
  description: string
  location: string
  latitude?: number
  longitude?: number
  transport: string
  estimatedDuration: string
  estimatedCostLocal: number
  estimatedCostUserCurrency: number
  currencyLocal: string
  currencyUser: string
  tips: string[]
}

interface RoadmapDay {
  dayNumber: number
  items: Array<{
    label: string
    kind: 'hotel' | 'food' | 'transport' | 'activity' | 'shopping' | 'nightlife' | 'other'
    time?: string
  }>
}
```

## Currency Decisions

### Profile Currency Suggestion

Create `src/constants/countries.ts` with an MVP country list and default currencies:

- Malaysia -> MYR
- Japan -> JPY
- United States -> USD
- United Kingdom -> GBP
- Australia -> AUD

The setup/profile forms select a country, auto-fill the currency only when the user has not manually changed it in the current editing session, and let users override the currency field.

### Destination Currency

MVP destination currency is inferred from the destination text using a small deterministic helper:

- Contains `malaysia`, `kuala lumpur`, `penang`, `langkawi` -> MYR
- Contains `japan`, `tokyo`, `kyoto`, `osaka` -> JPY
- Contains `united states`, `usa`, `new york`, `los angeles`, `san francisco` -> USD
- Contains `united kingdom`, `uk`, `london`, `manchester`, `edinburgh` -> GBP
- Contains `australia`, `sydney`, `melbourne`, `brisbane` -> AUD

If no mapping matches, use the user's preferred currency as both local and user currency and mark the exchange rate as `1`, source `same_currency`. This keeps MVP generation usable without pretending to know an unknown destination currency.

## Auth and Routing Flow

### Middleware / Server Guard

Update the protected route handling so:

- Unauthenticated users still redirect to `/login`.
- Authenticated users with incomplete profiles redirect to `/profile/setup`.
- `/profile/setup`, `/api/profile`, `/api/avatar`, and auth routes are allowed while incomplete.
- Completed users visiting `/profile/setup` redirect to `/dashboard`.

Use a server helper, for example `requireCompleteProfile(userId)`, rather than duplicating profile logic in many route files.

### Signup and Login Redirects

Email/password login currently pushes to `/dashboard`. Keep that client behavior; the server guard will redirect incomplete users to `/profile/setup`.

OAuth callback should still ensure the user/profile exists, then redirect to `/dashboard`; the guard handles setup routing.

## API Design

### `GET /api/profile`

Return:

- Profile fields
- Email
- Account created date
- Trip stats:
  - `tripCount`
  - `completedTripCount`

### `PATCH /api/profile`

Accept:

```ts
{
  displayName: string
  country: string
  region: string
  preferredCurrency: string
  travelInterests?: string[]
  preferredLanguage?: string | null
}
```

Validation:

- `displayName`, `country`, `region`, `preferredCurrency` required.
- Currency must be three uppercase letters.
- Travel interests must be an array of strings.
- Preferred language may be empty/null.

The service recomputes `profileComplete` from saved values.

### Avatar

Keep the existing `/api/avatar` route. It updates only `avatarUrl` and does not affect profile completion.

### `POST /api/trips/[tripId]/generate`

Add profile and exchange-rate lookup before calling `generateItinerary()`:

1. Authenticate.
2. Ensure app user exists.
3. Verify trip ownership.
4. Load preferences.
5. Load completed profile.
6. Infer destination currency.
7. Resolve exchange rate.
8. Build provider-agnostic request with both currencies and the resolved exchange rate.
9. Call AI service.
10. Save structured itinerary JSON on the trip.

No Gemini-specific logic belongs in this route.

## AI Provider Contract

Extend `GenerateItineraryRequest` with:

- `userCurrency`
- `destinationCurrency`
- `exchangeRate`
- `exchangeRateSource`
- `exchangeRateFetchedAt`
- `exchangeRateFromCache`
- `travelInterests`
- `preferredLanguage`

Update `GenerateItineraryResponse` to the richer itinerary interface.

Gemini prompt rules:

- Return only valid JSON.
- Use the provided exchange rate for conversion.
- Do not invent exchange rates.
- Every itinerary item must include local and user-currency costs.
- Daily totals and grand total must equal the sum of item costs.
- Include roadmap structured data.
- Include morning, afternoon, and evening arrays for every day.

Gemini provider validates the JSON with Zod before returning it.

## UI Design

### `/profile/setup`

Purpose: a focused first-run setup form.

Layout:

- Single-column responsive form in the existing protected shell.
- Title: `Complete your travel profile`.
- Fields:
  - Full name
  - Country select
  - Region/state
  - Preferred currency
  - Travel interests chips/multiselect
  - Preferred language select/input
  - Optional avatar upload
- Primary action: `Save and continue`

Behavior:

- Country selection suggests currency.
- Manual currency edits are preserved.
- Successful save redirects to `/dashboard`.

### `/profile`

Purpose: settings and account summary.

Layout:

- Profile form section.
- Avatar section.
- Account details/stat section showing email, account created, trips, completed trips.

Use existing `Button`, `Input`, `AvatarUpload`, card styling, and restrained dashboard visual language.

### Itinerary Page

Add three parts:

- Header with destination, budget status, total estimate, and exchange-rate source/date.
- Day cards with morning/afternoon/evening groups and item-level time, transport, duration, local cost, converted cost, location, and tips.
- Roadmap vertical timeline generated from `itinerary.roadmap`.

The timeline is structured data rendered by the frontend, not model prose.

## Error Handling

- Incomplete profile on protected pages redirects to `/profile/setup`.
- Incomplete profile on itinerary generation returns a clear API error.
- Missing exchange rate and no cache returns a clear API error before AI generation.
- AI malformed JSON returns existing provider-friendly generation error.
- Profile validation returns 400 with field details.

## Database Migration Deliverables

Implementation must include:

1. Updated `src/db/schema.prisma`.
2. New migration folder under `src/db/migrations`.
3. A standalone Supabase SQL file, for example `docs/supabase/2026-07-03-onboarding-profile-rich-itinerary.sql`.
4. Manual Supabase guide, for example `docs/supabase/2026-07-03-onboarding-profile-rich-itinerary-guide.md`.

Manual guide must explain:

- Open Supabase project.
- Go to SQL Editor.
- Paste and run the SQL.
- Run `npm run db:generate` locally afterward.
- Verify `profiles` columns and `exchange_rates` table exist.

## Testing Plan

Automated tests:

- Profile validation:
  - required fields fail
  - valid profile passes
  - currency uppercase normalization
  - country auto-select suggests currency
  - manual currency override is preserved
- Profile service:
  - computes `profileComplete`
  - returns trip stats
- Guard behavior:
  - incomplete profile redirects to `/profile/setup`
  - completed profile can access dashboard
  - setup route is allowed while incomplete
- Exchange-rate service:
  - live rate success caches rate
  - live failure uses cached rate
  - live failure with no cache errors
  - same-currency returns rate `1`
- AI prompt:
  - includes user and destination currencies
  - includes exchange-rate metadata
  - requires item costs, daily totals, grand total, budget comparison, and roadmap JSON
- Gemini provider:
  - accepts valid rich JSON
  - rejects missing required itinerary fields
- Itinerary rendering:
  - renders daily totals
  - renders local and user costs
  - renders budget remaining/exceeded
  - renders vertical timeline

Manual/browser tests:

- New user onboarding.
- Existing incomplete user redirect.
- Existing completed user dashboard access.
- Profile completion.
- Currency auto-selection and override.
- Itinerary generation with cached/live rate.
- Timeline rendering.
- Budget calculation display.

Final verification:

- `npm run db:generate`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

## Rollout Notes

- Existing users will be redirected to setup because required fields are new.
- Existing trips with old `itineraryJson` may not render in the new rich itinerary UI. The frontend should detect legacy itinerary shape and show a friendly message to regenerate rather than crashing.
- Frankfurter is a public no-key dependency. The cache table keeps generation resilient, but first-ever generation for a currency pair still requires a successful live lookup unless the pair is preseeded manually.
