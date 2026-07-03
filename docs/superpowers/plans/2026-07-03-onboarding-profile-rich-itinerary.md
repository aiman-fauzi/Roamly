# Onboarding Profile Rich Itinerary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-time profile completion, richer profile editing, cached live exchange-rate conversion, and rich structured itinerary generation/rendering for the Roamly MVP.

**Architecture:** Keep the current App Router/API/service layering. Extend the existing `Profile` table for onboarding state, add a normalized `ExchangeRate` cache table, keep generated itinerary details in `Trip.itineraryJson`, and keep Gemini-specific JSON validation inside the provider.

**Tech Stack:** Next.js App Router, TypeScript, TailwindCSS, Prisma, Supabase Auth, PostgreSQL, Vitest, Google Gemini provider abstraction, Frankfurter exchange-rate API.

---

## File Structure

- Modify `src/db/schema.prisma`: add profile fields and `ExchangeRate`.
- Create `src/db/migrations/20260703000000_onboarding_profile_exchange_rates/migration.sql`: SQL migration.
- Create `docs/supabase/2026-07-03-onboarding-profile-rich-itinerary.sql`: equivalent Supabase SQL.
- Create `docs/supabase/2026-07-03-onboarding-profile-rich-itinerary-guide.md`: manual guide.
- Modify `src/types/profile.ts`: richer profile/account stats response.
- Modify `src/lib/validations/profileValidation.ts`: full profile validation and completion helpers.
- Create `src/lib/validations/__tests__/profileValidation.test.ts`: red/green tests for profile validation.
- Create `src/constants/countries.ts`: MVP country/currency/language/interests constants.
- Create `src/services/profileCompletion.ts`: server completion guard helpers.
- Modify `src/services/profileService.ts`: profile updates, stats, completion.
- Create `src/services/__tests__/profileService.test.ts`: service-unit tests using mocked Prisma.
- Modify `src/proxy.ts`: route-level profile setup redirects.
- Create or modify page tests for dashboard/setup guard where practical.
- Modify `src/app/api/profile/route.ts`: richer GET/PATCH.
- Create `src/app/(protected)/profile/setup/page.tsx`: setup route.
- Create `src/components/features/profile/ProfileForm.tsx`: shared setup/profile form.
- Modify `src/components/features/profile/ProfileCard.tsx`: profile page layout.
- Modify `src/hooks/useProfile.ts`: update full profile.
- Modify `src/constants/routes.ts`: add setup route.
- Create `src/services/exchangeRateService.ts`: Frankfurter live lookup and cached fallback.
- Create `src/services/__tests__/exchangeRateService.test.ts`: exchange-rate behavior tests.
- Modify `src/types/itinerary.ts`: rich itinerary types.
- Modify `src/ai/types.ts`: rich request/response contract.
- Modify `src/ai/prompts/itineraryPrompt.ts`: JSON prompt with costs/timeline/budget.
- Modify `src/ai/prompts/__tests__/itineraryPrompt.test.ts`: prompt coverage.
- Modify `src/ai/providers/GeminiProvider.ts`: Zod schema for rich JSON.
- Modify `src/ai/providers/__tests__/GeminiProvider.test.ts`: rich JSON parse/reject tests.
- Modify `src/app/api/trips/[tripId]/generate/route.ts`: profile/currency/rate lookup before AI.
- Modify `src/components/features/itinerary/*`: header, day cards, timeline, budget UI.
- Create `src/components/features/itinerary/ItineraryTimeline.tsx`: vertical roadmap.
- Create itinerary rendering tests.

---

## Task 1: Database Schema and Migration

**Files:**
- Modify: `src/db/schema.prisma`
- Create: `src/db/migrations/20260703000000_onboarding_profile_exchange_rates/migration.sql`
- Create: `docs/supabase/2026-07-03-onboarding-profile-rich-itinerary.sql`
- Create: `docs/supabase/2026-07-03-onboarding-profile-rich-itinerary-guide.md`

- [ ] **Step 1: Update Prisma schema**

Add these fields to `Profile`:

```prisma
  country           String?  @db.VarChar(100)
  region            String?  @db.VarChar(100)
  preferredCurrency String?  @db.VarChar(3)
  travelInterests   String[] @default([])
  preferredLanguage String?  @db.VarChar(20)
  profileComplete   Boolean  @default(false)
```

Add:

```prisma
model ExchangeRate {
  id            String   @id @default(uuid())
  baseCurrency  String   @db.VarChar(3)
  quoteCurrency String   @db.VarChar(3)
  rate          Decimal  @db.Decimal(18, 8)
  source        String   @db.VarChar(50)
  fetchedAt     DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([baseCurrency, quoteCurrency])
  @@index([baseCurrency, quoteCurrency, fetchedAt])
  @@map("exchange_rates")
}
```

- [ ] **Step 2: Add SQL migration**

Use this SQL in both migration and Supabase SQL file:

```sql
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "country" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "region" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "preferredCurrency" VARCHAR(3),
  ADD COLUMN IF NOT EXISTS "travelInterests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "preferredLanguage" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "profileComplete" BOOLEAN NOT NULL DEFAULT false;

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
```

- [ ] **Step 3: Add manual guide**

Guide must include: open Supabase project, SQL Editor, paste SQL, run, run `npm run db:generate`, verify new profile columns and `exchange_rates`.

- [ ] **Step 4: Run Prisma generate**

Run: `npm run db:generate`

Expected: Prisma Client generated successfully.

---

## Task 2: Profile Validation and Constants

**Files:**
- Create: `src/constants/countries.ts`
- Modify: `src/lib/validations/profileValidation.ts`
- Create: `src/lib/validations/__tests__/profileValidation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Tests:

```ts
it('rejects incomplete profile setup fields', () => {
  const result = profileSetupSchema.safeParse({
    displayName: '',
    country: '',
    region: '',
    preferredCurrency: '',
    travelInterests: [],
    preferredLanguage: null,
  })
  expect(result.success).toBe(false)
})

it('normalizes currency and computes completion', () => {
  const parsed = profileSetupSchema.parse({
    displayName: ' Aiman ',
    country: 'Malaysia',
    region: 'Selangor',
    preferredCurrency: 'myr',
    travelInterests: ['food'],
    preferredLanguage: '',
  })
  expect(parsed.preferredCurrency).toBe('MYR')
  expect(isProfileComplete(parsed)).toBe(true)
})

it('suggests a currency from country unless manually overridden', () => {
  expect(getSuggestedCurrency('Japan')).toBe('JPY')
  expect(getSuggestedCurrency('Atlantis')).toBeNull()
})
```

- [ ] **Step 2: Run red test**

Run: `npm run test -- src/lib/validations/__tests__/profileValidation.test.ts`

Expected: FAIL because schema/helper exports do not exist.

- [ ] **Step 3: Implement constants**

Export `COUNTRY_OPTIONS`, `TRAVEL_INTEREST_OPTIONS`, `LANGUAGE_OPTIONS`, and `getSuggestedCurrency(country)`.

- [ ] **Step 4: Implement validation**

Add `profileSetupSchema`, `profileUpdateSchema`, `isProfileComplete`, and keep `validateDisplayName` compatible.

- [ ] **Step 5: Run green test**

Run: `npm run test -- src/lib/validations/__tests__/profileValidation.test.ts`

Expected: PASS.

---

## Task 3: Profile Service, API, and Stats

**Files:**
- Modify: `src/types/profile.ts`
- Modify: `src/services/profileService.ts`
- Modify: `src/app/api/profile/route.ts`
- Modify: `src/hooks/useProfile.ts`
- Create: `src/services/__tests__/profileService.test.ts`

- [ ] **Step 1: Write failing service tests**

Test `toProfileCompletion`, `updateProfile`, and `getProfileSummary` with mocked `prisma.profile`/`prisma.trip`.

- [ ] **Step 2: Run red test**

Run: `npm run test -- src/services/__tests__/profileService.test.ts`

Expected: FAIL because service functions do not exist.

- [ ] **Step 3: Extend profile types**

Add:

```ts
export interface ProfileDetails extends Profile {
  country: string | null
  region: string | null
  preferredCurrency: string | null
  travelInterests: string[]
  preferredLanguage: string | null
  profileComplete: boolean
}

export interface ProfileSummary {
  profile: ProfileDetails
  email: string
  accountCreatedAt: Date
  tripCount: number
  completedTripCount: number
}
```

- [ ] **Step 4: Implement service functions**

Add `updateProfileDetails(userId, input)`, `getProfileSummary(userId)`, and update `ensureProfile` to create incomplete profiles with available metadata.

- [ ] **Step 5: Update API**

`GET /api/profile` returns `ProfileSummary`. `PATCH /api/profile` validates full profile payload and returns updated `ProfileSummary`.

- [ ] **Step 6: Update hook**

`useProfile` exposes `summary`, `profile`, `updateProfile`, `updateAvatar`, and `refetch`.

- [ ] **Step 7: Run green tests**

Run: `npm run test -- src/services/__tests__/profileService.test.ts`

Expected: PASS.

---

## Task 4: Onboarding Guard and Setup UI

**Files:**
- Modify: `src/constants/routes.ts`
- Create: `src/services/profileCompletion.ts`
- Modify: `src/proxy.ts`
- Create: `src/app/(protected)/profile/setup/page.tsx`
- Create: `src/components/features/profile/ProfileForm.tsx`
- Modify: `src/components/features/profile/ProfileCard.tsx`
- Modify: `src/app/(protected)/profile/page.tsx`

- [ ] **Step 1: Write failing route/helper tests**

Test helper behavior:

```ts
expect(isProfileSetupAllowed('/profile/setup')).toBe(true)
expect(shouldRedirectIncompleteProfile('/dashboard')).toBe(true)
expect(shouldRedirectIncompleteProfile('/api/profile')).toBe(false)
```

- [ ] **Step 2: Run red test**

Run focused helper test. Expected: FAIL because helper does not exist.

- [ ] **Step 3: Add route constants**

Add `PROFILE_SETUP: '/profile/setup'`.

- [ ] **Step 4: Implement profile completion helper**

Export route predicates and server lookup helpers that the proxy can call with Supabase session user ID.

- [ ] **Step 5: Update proxy**

After authenticated session, query profile completion and redirect incomplete users to `/profile/setup` unless route is allowed.

- [ ] **Step 6: Implement shared profile form**

Fields: full name, country select, region, preferred currency, travel interests chips, preferred language, avatar section optional.

- [ ] **Step 7: Implement setup page**

Render `ProfileForm mode="setup"` and redirect to dashboard after successful save.

- [ ] **Step 8: Implement profile page**

Render account stats, avatar, and `ProfileForm mode="edit"`.

- [ ] **Step 9: Run UI/helper tests**

Run focused profile component/helper tests, then `npm run test`.

Expected: PASS.

---

## Task 5: Exchange-Rate Service

**Files:**
- Create: `src/services/exchangeRateService.ts`
- Create: `src/services/__tests__/exchangeRateService.test.ts`

- [ ] **Step 1: Write failing exchange tests**

Cases:

```ts
it('returns same-currency rate without fetch', async () => {
  const rate = await resolveExchangeRate({ baseCurrency: 'MYR', quoteCurrency: 'MYR', fetcher })
  expect(rate.rate).toBe(1)
  expect(rate.source).toBe('same_currency')
})

it('caches a successful live rate', async () => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ rate: 0.21 }) })
  const rate = await resolveExchangeRate({ baseCurrency: 'MYR', quoteCurrency: 'USD', fetcher })
  expect(rate.rate).toBe(0.21)
  expect(prisma.exchangeRate.upsert).toHaveBeenCalled()
})

it('uses cached rate when live lookup fails', async () => {
  fetcher.mockResolvedValue({ ok: false })
  prisma.exchangeRate.findUnique.mockResolvedValue({ rate: new Prisma.Decimal('0.2') })
  const rate = await resolveExchangeRate({ baseCurrency: 'MYR', quoteCurrency: 'USD', fetcher })
  expect(rate.fromCache).toBe(true)
})
```

- [ ] **Step 2: Run red test**

Run: `npm run test -- src/services/__tests__/exchangeRateService.test.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service**

Use Frankfurter pair endpoint. Normalize currencies uppercase. Upsert successful rates. Fallback to cached pair. Throw `ExchangeRateError` if neither live nor cache is available.

- [ ] **Step 4: Run green test**

Run focused test. Expected: PASS.

---

## Task 6: Rich Itinerary Types, Prompt, and Gemini Validation

**Files:**
- Modify: `src/types/itinerary.ts`
- Modify: `src/ai/types.ts`
- Modify: `src/ai/prompts/itineraryPrompt.ts`
- Modify: `src/ai/prompts/__tests__/itineraryPrompt.test.ts`
- Modify: `src/ai/providers/GeminiProvider.ts`
- Modify: `src/ai/providers/__tests__/GeminiProvider.test.ts`

- [ ] **Step 1: Update tests first**

Prompt tests must assert presence of:

- `currencyLocal`
- `currencyUser`
- `estimatedCostLocal`
- `estimatedCostUserCurrency`
- `dailyTotalLocal`
- `dailyTotalUserCurrency`
- `Grand Total`
- `roadmap`
- exchange-rate metadata

Provider tests must use rich JSON and assert missing `estimatedCostLocal` is rejected.

- [ ] **Step 2: Run red tests**

Run: `npm run test -- src/ai/prompts/__tests__/itineraryPrompt.test.ts src/ai/providers/__tests__/GeminiProvider.test.ts`

Expected: FAIL because current prompt/schema are legacy.

- [ ] **Step 3: Implement rich types**

Replace old activity/day interfaces with rich `ItineraryItem`, `DayPlan`, `RoadmapDay`, and `Itinerary`.

- [ ] **Step 4: Implement prompt**

Require exact JSON shape and instruct model to use provided exchange rate only.

- [ ] **Step 5: Implement provider schema**

Zod-validate the full rich JSON response.

- [ ] **Step 6: Run green tests**

Run focused AI tests. Expected: PASS.

---

## Task 7: Generate Route Integration

**Files:**
- Modify: `src/app/api/trips/[tripId]/generate/route.ts`
- Modify or create tests for generate behavior if route test setup remains practical.

- [ ] **Step 1: Write failing test or route-level script**

Assert generate route calls `generateItinerary` with profile currency, destination currency, and resolved exchange rate before updating trip.

- [ ] **Step 2: Run red check**

Expected: FAIL because route does not load profile/rate.

- [ ] **Step 3: Implement route changes**

Load profile summary, reject incomplete profile, infer destination currency, resolve exchange rate, call provider-agnostic `generateItinerary`.

- [ ] **Step 4: Run green check**

Expected: PASS.

---

## Task 8: Rich Itinerary UI

**Files:**
- Modify: `src/components/features/itinerary/ItineraryView.tsx`
- Modify: `src/components/features/itinerary/ItineraryHeader.tsx`
- Modify: `src/components/features/itinerary/DayCard.tsx`
- Modify: `src/components/features/itinerary/ActivityItem.tsx`
- Create: `src/components/features/itinerary/ItineraryTimeline.tsx`
- Create: `src/components/features/itinerary/__tests__/ItineraryView.test.tsx`

- [ ] **Step 1: Write failing render tests**

Render a rich itinerary and assert:

- Daily total appears.
- Local and user costs appear.
- Budget remaining/exceeded appears.
- Roadmap labels appear in order.

- [ ] **Step 2: Run red test**

Run focused itinerary component test. Expected: FAIL with legacy renderer.

- [ ] **Step 3: Implement UI**

Add budget summary, exchange-rate note, day sections, activity costs, and vertical timeline. Keep styling consistent with existing dashboard cards.

- [ ] **Step 4: Add legacy guard**

If old itinerary shape is detected, show `This itinerary was generated with an older format. Regenerate it to see the rich timeline and cost breakdown.`

- [ ] **Step 5: Run green test**

Run focused itinerary component test. Expected: PASS.

---

## Task 9: Documentation and Verification

**Files:**
- Update docs from Task 1 if implementation details changed.

- [ ] **Step 1: Verify migration docs match schema**

Compare Prisma schema, migration SQL, and Supabase SQL manually.

- [ ] **Step 2: Run full automated checks**

Run:

```bash
npm run db:generate
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected:

- Prisma client generated.
- Typecheck exits 0.
- ESLint exits 0.
- Vitest exits 0.
- Next build exits 0.

- [ ] **Step 3: Manual browser regression**

Verify:

- New user/incomplete profile redirects to `/profile/setup`.
- Profile completion redirects to dashboard.
- Completed user can access dashboard.
- Country auto-select suggests currency.
- Manual currency override persists.
- Generate itinerary shows daily totals, grand total, budget status, conversion, and timeline.

- [ ] **Step 4: Final response**

Return deliverables:

1. Root design decisions
2. Modified files
3. New files
4. Database changes
5. Prisma migration
6. Equivalent Supabase SQL
7. Manual Supabase guide
8. Testing results
