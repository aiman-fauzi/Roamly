# Implementation Plan: Roamly MVP

## Overview

Incremental implementation across 7 phases: Foundation → Authentication → Profile → Trip & Questionnaire → AI Generation → Dashboard & Trip History → Polish & QA. Each phase builds on the previous, ending with all components wired together. TypeScript strict mode, Next.js 14 App Router, Supabase, Prisma, and Google Gemini throughout.

## Tasks

- [ ] 1. Phase 0 — Foundation: Repository setup, folder structure, tooling
  - [ ] 1.1 Initialise the Next.js 14 App Router project with TypeScript strict mode
    - Run `create-next-app` with TypeScript, ESLint, Tailwind CSS, and `src/` directory options
    - Set `"strict": true` in `tsconfig.json`; add `@typescript-eslint/no-explicit-any` ESLint rule
    - _Requirements: 2.1, 2.5_
  - [ ] 1.2 Create the full `src/` folder architecture
    - Create all subdirectories: `app/`, `components/ui/`, `components/layout/`, `components/features/`, `services/`, `lib/supabase/`, `lib/validations/`, `ai/adapters/`, `ai/prompts/`, `db/`, `hooks/`, `types/`, `utils/`, `constants/`
    - Add placeholder `index.ts` files where needed to satisfy TypeScript module resolution
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  - [ ] 1.3 Install and configure all dependencies
    - Install: `@supabase/supabase-js`, `@supabase/ssr`, `prisma`, `@prisma/client`, `zod`, `fast-check`, `vitest`, `@vitest/ui`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `playwright`, `clsx`, `tailwind-merge`, `shadcn/ui`
    - Pin exact versions; configure `vitest.config.ts` with `environment: 'jsdom'`, `globals: true`, `setupFiles`
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ] 1.4 Configure Tailwind CSS and shadcn/ui design tokens
    - Add `colors`, `fontFamily`, `fontSize`, `spacing`, `boxShadow`, `borderRadius`, `transitionDuration` tokens to `tailwind.config.ts` exactly as specified in the design
    - Initialise shadcn/ui (`npx shadcn-ui@latest init`) and configure `components.json`
    - _Requirements: 11.2, 11.3, 11.5_
  - [ ]* 1.5 Write property test for color contrast ratios
    - **Property 16: Color contrast ratios meet WCAG AA**
    - **Validates: Requirements 11.4**
    - Test file: `src/__tests__/designTokens.test.ts`
  - [ ] 1.6 Write the Prisma schema and generate the Prisma client
    - Create `src/db/schema.prisma` with `User`, `Profile`, `Trip`, `PreferenceSet` models and `TripStatus` enum exactly as specified in the design
    - Implement cascade-delete relations (`onDelete: Cascade`) for `Profile→User`, `Trip→User`, `PreferenceSet→Trip`
    - Run `prisma generate` and `prisma migrate dev --name init`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [ ] 1.7 Create Prisma client singleton and Supabase browser/server clients
    - `src/db/client.ts` — export singleton `PrismaClient` guarded by `globalThis` in dev
    - `src/lib/supabase/client.ts` — browser Supabase client using `createBrowserClient`
    - `src/lib/supabase/server.ts` — server Supabase client using `createServerClient` with `cookies()`
    - _Requirements: 2.2, 2.3_
  - [ ] 1.8 Define shared TypeScript types and constants
    - `src/types/trip.ts`, `profile.ts`, `itinerary.ts`, `api.ts` — all interfaces from design
    - `src/constants/routes.ts`, `api.ts`, `questionnaire.ts` — route paths, API endpoint strings, questionnaire step metadata
    - `src/utils/cn.ts` — `clsx` + `tailwind-merge` helper; `formatDate.ts`; `formatCurrency.ts`
    - _Requirements: 1.7, 1.8, 2.6, 2.7_
  - [ ] 1.9 Set up environment variables and Vercel project
    - Document all required env vars in `.env.example`: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY, GEMINI_MODEL`, `AI_PROVIDER`
    - Configure Vercel project and add env vars via Vercel dashboard
    - _Requirements: 2.4, 12.1_

- [ ] 2. Checkpoint — Phase 0 complete
  - Verify `prisma generate` and `prisma migrate dev` succeed, `tsc --noEmit` passes, ESLint passes, and Vitest runs without errors. Ask the user if questions arise.

- [ ] 3. Phase 1 — Authentication: Supabase Auth, forms, middleware, protected routes
  - [ ] 3.1 Implement auth layout and shared UI primitives
    - Create `src/app/(auth)/layout.tsx` with centred card layout
    - Scaffold `Button.tsx`, `Input.tsx`, `Card.tsx` shadcn/ui wrappers under `src/components/ui/`
    - _Requirements: 2.1, 11.1, 11.2_
  - [ ] 3.2 Implement client-side password and email validation utilities
    - `src/lib/validations/passwordValidation.ts` — accept iff length ∈ [8, 128]
    - Email format helper used by forms (RFC 5322 check via Zod `.email()`)
    - _Requirements: 4.7_
  - [ ]* 3.3 Write property test for password length validation
    - **Property 1: Password length validation**
    - **Validates: Requirements 4.7**
    - Test file: `src/lib/validations/__tests__/passwordValidation.test.ts`
  - [ ] 3.4 Implement email prefix extraction utility
    - `src/utils/emailUtils.ts` — extract portion before `@` for profile default display name
    - _Requirements: 5.5_
  - [ ]* 3.5 Write property test for email prefix extraction
    - **Property 2: Email prefix extraction always produces non-empty result**
    - **Validates: Requirements 5.5**
    - Test file: `src/utils/__tests__/emailUtils.test.ts`
  - [ ] 3.6 Build `RegisterForm` component and `/register` page
    - `src/components/features/auth/RegisterForm.tsx` — email + password fields, Zod validation, calls `supabase.auth.signUp`
    - Client-side guard: block submit if password outside [8, 128] chars before any fetch
    - Display Supabase error codes as user-friendly messages (email in use, etc.)
    - `src/app/(auth)/register/page.tsx`
    - _Requirements: 4.1, 4.2, 4.7_
  - [ ] 3.7 Build `LoginForm` component and `/login` page
    - `src/components/features/auth/LoginForm.tsx` — email + password, calls `signInWithPassword`
    - Map Supabase error codes: unverified email → specific message; wrong password → generic message
    - `src/app/(auth)/login/page.tsx`
    - _Requirements: 4.3, 4.4, 4.5_
  - [ ] 3.8 Implement Google OAuth button and `/api/auth/callback` route
    - Add "Continue with Google" button in `LoginForm` calling `signInWithOAuth({ provider: 'google' })`
    - `src/app/api/auth/callback/route.ts` — exchange code, redirect to `/dashboard`; on cancel return to `/login` silently; on error show message
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ] 3.9 Create first-login profile seeding in OAuth callback
    - After successful OAuth callback, call `profileService.ensureProfile(userId, googleDisplayName, googleAvatarUrl)` which upserts a `Profile` using the Google name (or email prefix fallback)
    - _Requirements: 5.5_
  - [ ] 3.10 Implement logout action
    - Add logout button to `Navbar.tsx`; call `supabase.auth.signOut()` then redirect to `/`
    - _Requirements: 4.6_
  - [ ] 3.11 Implement auth-guard middleware
    - `src/middleware.ts` — read session via server Supabase client; redirect to `/login` for any `/(protected)` or `/api/` path (excluding `/api/auth/callback`); use `matcher` config
    - _Requirements: 12.1 (Phase 1 deliverable)_

- [ ] 4. Checkpoint — Phase 1 complete
  - Ensure all tests pass (`vitest --run`), `tsc --noEmit` passes. Manually verify register, login, Google OAuth, and middleware redirect. Ask the user if questions arise.

- [ ] 5. Phase 2 — Profile: profile page, display name editing, avatar upload
  - [ ] 5.1 Implement display name validation
    - `src/lib/validations/profileValidation.ts` — accept iff trimmed length ∈ [1, 64]; reject empty / whitespace-only / > 64 chars
    - _Requirements: 6.2, 6.3_
  - [ ]* 5.2 Write property test for display name validation
    - **Property 3: Display name validation correctly classifies all strings**
    - **Validates: Requirements 6.2, 6.3**
    - Test file: `src/lib/validations/__tests__/profileValidation.test.ts`
  - [ ] 5.3 Implement avatar file validation
    - `src/lib/validations/avatarValidation.ts` — accept iff MIME ∈ {image/jpeg, image/png, image/webp} AND size ≤ 5 242 880 bytes; return specific error identifying violated constraint
    - _Requirements: 6.4, 6.5_
  - [ ]* 5.4 Write property test for avatar file upload validation
    - **Property 4: File upload validation rejects all invalid types and sizes**
    - **Validates: Requirements 6.5**
    - Test file: `src/lib/validations/__tests__/avatarValidation.test.ts`
  - [ ] 5.5 Implement `profileService`
    - `src/services/profileService.ts` — `getProfile`, `updateDisplayName`, `updateAvatar` (two-phase: upload → DB update → rollback file on DB failure), `ensureProfile`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8_
  - [ ] 5.6 Implement profile API routes
    - `src/app/api/profile/route.ts` — `GET` (return current profile) and `PATCH` (update displayName via `profileService`)
    - `src/app/api/avatar/route.ts` — `POST` (multipart upload, calls `profileService.updateAvatar`)
    - Return `ApiErrorResponse` shape on all errors
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  - [ ] 5.7 Implement `useProfile` hook
    - `src/hooks/useProfile.ts` — fetch from `/api/profile`, expose `profile`, `isLoading`, `error`, `updateDisplayName`, `updateAvatar`
    - _Requirements: 6.1_
  - [ ] 5.8 Build `ProfileCard` and `AvatarUpload` components
    - `src/components/features/profile/ProfileCard.tsx` — show displayName (empty string if null), avatarUrl (placeholder if null), inline edit for display name with validation feedback
    - `src/components/features/profile/AvatarUpload.tsx` — file picker with client-side validation, progress indicator, success/error feedback
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [ ] 5.9 Build profile page
    - `src/app/(protected)/profile/page.tsx` — compose `ProfileCard` + `AvatarUpload`, use `useProfile` hook, show skeleton during initial load
    - _Requirements: 6.1, 11.6_

- [ ] 6. Checkpoint — Phase 2 complete
  - Ensure all tests pass. Verify display name editing, avatar upload with rollback on DB failure (using mocked service). Ask the user if questions arise.

- [ ] 7. Phase 3 — Trip creation and multi-step questionnaire
  - [ ] 7.1 Implement `tripService` (creation and deletion)
    - `src/services/tripService.ts` — `createTrip` (insert DRAFT, return Trip), `getDraftTripCount`, `deleteTrip` (ownership check + cascade + best-effort PreferenceSet log)
    - Throw typed `ServiceError` with code `DRAFT_LIMIT_EXCEEDED` when count ≥ 10
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [ ]* 7.2 Write property test for trip creation always produces DRAFT
    - **Property 5: Trip creation always produces a DRAFT trip for the owner**
    - **Validates: Requirements 7.1**
    - Test file: `src/services/__tests__/tripService.test.ts`
  - [ ]* 7.3 Write property test for DRAFT trip count limit enforcement
    - **Property 6: DRAFT trip count limit is enforced universally**
    - **Validates: Requirements 7.3, 7.4**
    - Test file: `src/services/__tests__/tripService.test.ts`
  - [ ]* 7.4 Write property test for trip deletion authorization
    - **Property 7: Trip deletion authorization**
    - **Validates: Requirements 7.5, 7.7**
    - Test file: `src/services/__tests__/tripService.test.ts`
  - [ ] 7.5 Implement trips API routes (list, create, get, delete)
    - `src/app/api/trips/route.ts` — `GET` (getUserTrips sorted desc), `POST` (createTrip, enforce draft limit, redirect)
    - `src/app/api/trips/[tripId]/route.ts` — `GET` (ownership check), `DELETE` (ownership check, 403 on mismatch)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 10.1_
  - [ ] 7.6 Implement questionnaire validation
    - `src/lib/validations/questionnaireValidation.ts` — per-step Zod schemas: destination [2–100 chars after trim], groupSize [1–20], durationDays [1–30], budget [100–50 000 step 100], required single-selects
    - _Requirements: 8.2, 8.5, 8.6, 8.7, 8.8_
  - [ ]* 7.7 Write property test for questionnaire step validation
    - **Property 8: Questionnaire step validation blocks advancement on all invalid inputs**
    - **Validates: Requirements 8.2, 8.8**
    - Test file: `src/lib/validations/__tests__/questionnaireValidation.test.ts`
  - [ ] 7.8 Implement `useQuestionnaire` hook with sessionStorage persistence
    - `src/hooks/useQuestionnaire.ts` — state: `{ tripId, currentStep, answers, stepErrors, isSubmitting, submitError }`
    - On mount: read from `sessionStorage` key `questionnaire:{tripId}`; write on every state change
    - Navigation: `goNext` (validate → advance), `goBack` (restore answers), `reset`
    - _Requirements: 8.3, 8.11_
  - [ ]* 7.9 Write property test for questionnaire state round-trip
    - **Property 9: Questionnaire state round-trip (navigation and sessionStorage)**
    - **Validates: Requirements 8.3, 8.11**
    - Test file: `src/hooks/__tests__/useQuestionnaire.test.ts`
  - [ ] 7.10 Build UI control primitives: Slider, Stepper, Chip
    - `src/components/ui/Slider.tsx` — range slider, clamp to [100, 50 000] step 100, visible numeric label
    - `src/components/ui/Stepper.tsx` — integer stepper, prevent input outside configured [min, max]
    - `src/components/ui/Chip.tsx` — single-select and multi-select variants
    - `src/components/ui/Stepper.tsx` — Spinner and Skeleton placeholders (pulse animation)
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 11.3_
  - [ ]* 7.11 Write property test for input control range enforcement
    - **Property 10: Input control range enforcement**
    - **Validates: Requirements 8.5, 8.6, 8.7**
    - Test file: `src/components/ui/__tests__/controls.test.ts`
  - [ ]* 7.12 Write property test for selection cardinality
    - **Property 11: Selection cardinality is enforced per step**
    - **Validates: Requirements 8.4**
    - Test file: `src/components/features/questionnaire/__tests__/selection.test.ts`
  - [ ] 7.13 Build all 9 questionnaire step components
    - Create individual step files under `src/components/features/questionnaire/steps/`: `DestinationStep.tsx`, `BudgetStep.tsx`, `DurationStep.tsx`, `GroupSizeStep.tsx`, `TravelStyleStep.tsx`, `AccommodationStep.tsx`, `TransportationStep.tsx`, `FoodStep.tsx`, `ActivitiesStep.tsx`
    - Each step reads from / writes to `useQuestionnaire` hook; shows validation errors inline
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [ ] 7.14 Build `QuestionnaireShell` and `ProgressBar` components
    - `src/components/features/questionnaire/QuestionnaireShell.tsx` — renders active step, back/next buttons, step counter
    - `src/components/features/questionnaire/ProgressBar.tsx` — visual progress `currentStep / 9`
    - _Requirements: 8.1, 8.2, 8.3, 8.9_
  - [ ] 7.15 Implement `preferenceService` and preferences API route
    - `src/services/preferenceService.ts` — `upsertPreferenceSet`, `getPreferenceSet`
    - `src/app/api/trips/[tripId]/preferences/route.ts` — `POST` (upsert, ownership check)
    - _Requirements: 8.9, 8.10_
  - [ ] 7.16 Build questionnaire page and wire submit flow
    - `src/app/(protected)/trips/new/page.tsx` — calls `POST /api/trips` on mount, redirects to questionnaire
    - `src/app/(protected)/trips/[tripId]/questionnaire/page.tsx` — renders `QuestionnaireShell`, on final submit: POST preferences → POST generate → navigate to itinerary; show spinner; handle errors with retry
    - _Requirements: 7.1, 7.2, 8.9, 8.10, 8.11, 9.5_

- [ ] 8. Checkpoint — Phase 3 complete
  - Ensure all tests pass. Verify questionnaire navigation, sessionStorage persistence, and preference persistence via API. Ask the user if questions arise.

- [ ] 9. Phase 4 — AI itinerary generation: abstraction layer, adapter, prompt, parsing
  - [ ] 9.1 Define AI types and `AIProvider` interface
    - `src/ai/types.ts` — `GenerateItineraryRequest`, `GenerateItineraryResponse`, `DayPlan`, `Activity`, `AIProvider` interface, all as specified in design
    - _Requirements: 13.1, 13.2, 13.3_
  - [ ] 9.2 Implement `buildItineraryPrompt` function
    - `src/ai/prompts/itineraryPrompt.ts` — include all non-null fields from request in prompt; explicitly instruct model to return JSON conforming to `GenerateItineraryResponse` schema
    - _Requirements: 13.7_
  - [ ]* 9.3 Write property test for prompt construction includes all non-null fields
    - **Property 19: Prompt construction includes exactly all non-null request fields**
    - **Validates: Requirements 13.7**
    - Test file: `src/ai/__tests__/GeminiProvider.test.ts`
  - [ ] 9.4 Implement `GeminiProvider`
    - `src/ai/providers/GeminiProvider.ts` — call Google Gemini API with 30 s timeout; parse JSON response; validate against `GenerateItineraryResponse` Zod schema; throw typed error identifying missing/invalid fields on failure
    - _Requirements: 13.4, 13.7, 13.8, 13.9, 9.3, 9.8_
  - [ ]* 9.5 Write property test for AI response schema validation
    - **Property 13: AI response schema validation accepts conforming and rejects non-conforming responses**
    - **Validates: Requirements 9.3, 9.8, 13.8, 13.9**
    - Test file: `src/ai/__tests__/GeminiProvider.test.ts`
  - [ ] 9.6 Implement `aiService` with provider resolution
    - `src/ai/aiService.ts` — `PROVIDER_MAP`, `resolveProvider()` (defaults to `GeminiProvider` for unset/unrecognised `AI_PROVIDER`), `generateItinerary(request)` export
    - _Requirements: 9.2, 13.5, 13.6_
  - [ ]* 9.7 Write property test for AI provider resolution defaults to Gemini
    - **Property 18: AI provider resolution defaults to Gemini for all unrecognized values**
    - **Validates: Requirements 13.5**
    - Test file: `src/ai/__tests__/aiService.test.ts`
  - [ ] 9.8 Extend `tripService` with generation-related methods
    - Add `updateTripStatus(tripId, status, itineraryJson?)` and `getUserTrips` (sorted desc) to `tripService`
    - _Requirements: 9.4, 10.1_
  - [ ]* 9.9 Write property test for successful itinerary persists as COMPLETE Trip
    - **Property 14: Successful itinerary persists as COMPLETE Trip**
    - **Validates: Requirements 9.4**
    - Test file: `src/services/__tests__/tripService.test.ts`
  - [ ] 9.10 Implement `/api/trips/[tripId]/generate` route
    - `src/app/api/trips/[tripId]/generate/route.ts` — `POST`: load PreferenceSet, verify required fields non-null, call `aiService.generateItinerary`, on success call `tripService.updateTripStatus(COMPLETE, itineraryJson)`, on failure return 500 with reason, trip stays DRAFT
    - _Requirements: 9.1, 9.4, 9.5, 9.6, 9.7, 9.8_
  - [ ]* 9.11 Write property test for AI generation triggered for valid PreferenceSets
    - **Property 12: AI generation is triggered for all valid PreferenceSets**
    - **Validates: Requirements 9.1**
    - Test file: `src/services/__tests__/tripService.test.ts`
  - [ ] 9.12 Build itinerary UI components
    - `src/components/features/itinerary/ItineraryHeader.tsx` — title, summary
    - `src/components/features/itinerary/DayCard.tsx` — dayNumber, theme, activity list
    - `src/components/features/itinerary/ActivityItem.tsx` — name, description, duration, location
    - Show skeleton during fetch (≥ 200 ms threshold); spinner during AI generation
    - _Requirements: 9.5, 9.7, 10.2, 11.6_
  - [ ] 9.13 Build itinerary page
    - `src/app/(protected)/trips/[tripId]/itinerary/page.tsx` — fetch trip via `GET /api/trips/[tripId]`, render itinerary from `itineraryJson`, handle DRAFT redirect to questionnaire
    - _Requirements: 9.7, 10.2, 10.3_

- [ ] 10. Checkpoint — Phase 4 complete
  - Ensure all tests pass. Verify AI generation end-to-end with real Google Gemini API in development. Verify error states (timeout, schema mismatch). Ask the user if questions arise.

- [ ] 11. Phase 5 — Dashboard and trip history
  - [ ] 11.1 Build `TripCard`, `TripList`, and `EmptyTripState` components
    - `src/components/features/trips/TripCard.tsx` — show title, destination ("—" if null), duration ("X days" / "—" if null), `createdAt` formatted date, status badge; delete button with confirmation
    - `src/components/features/trips/TripList.tsx` — map trips to `TripCard`; skeleton during load
    - `src/components/features/trips/EmptyTripState.tsx` — message + CTA to create new trip; no list headers or pagination
    - _Requirements: 10.1, 10.4, 11.6_
  - [ ]* 11.2 Write property test for trip list ordering
    - **Property 15: Trip list is always ordered by createdAt descending**
    - **Validates: Requirements 10.1**
    - Test file: `src/services/__tests__/tripService.test.ts`
  - [ ] 11.3 Implement `useTrips` hook
    - `src/hooks/useTrips.ts` — fetch from `GET /api/trips`, expose `trips`, `isLoading`, `error`, `deleteTrip` (optimistic removal within 1 s, rollback on failure), `refetch`
    - _Requirements: 10.1, 10.5, 10.6, 10.7_
  - [ ] 11.4 Build dashboard page
    - `src/app/(protected)/dashboard/page.tsx` — use `useTrips`; render `TripList` or `EmptyTripState`; skeleton during loading; error message + retry on failure; COMPLETE → itinerary, DRAFT → questionnaire on card click
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  - [ ] 11.5 Build app layout shell: `Navbar`, `Sidebar`, `PageWrapper`
    - `src/components/layout/Navbar.tsx` — logo, nav links, logout button
    - `src/components/layout/PageWrapper.tsx` — consistent page padding and max-width
    - `src/app/(protected)/layout.tsx` — compose `Navbar` + `PageWrapper` for all protected pages
    - _Requirements: 11.1, 11.2_
  - [ ] 11.6 Build landing page
    - `src/app/page.tsx` — tagline "Plan Less. Explore More.", CTA to register/login
    - _Requirements: 11.1_

- [ ] 12. Checkpoint — Phase 5 complete
  - Ensure all tests pass. Verify dashboard renders trip list, empty state, optimistic delete (success and failure). Ask the user if questions arise.

- [ ] 13. Phase 6 — Polish and QA
  - [ ] 13.1 Add CSS transitions to all interactive elements
    - Apply `transition-all duration-[200ms]` (Tailwind `transition-ui` token) to `Button`, `Card`, `Chip`, and form inputs on hover/focus/active states
    - _Requirements: 11.3_
  - [ ] 13.2 Implement `Skeleton` and `Spinner` components with correct visibility logic
    - `src/components/ui/Skeleton.tsx` — visible iff `isLoading === true && error == null && data == null`; pulse animation; mirrors exact layout dimensions of replaced content
    - `src/components/ui/Spinner.tsx` — inline loading indicator for AI generation and form submissions
    - _Requirements: 11.6_
  - [ ]* 13.3 Write property test for skeleton placeholder visibility logic
    - **Property 17: Skeleton placeholders shown only during active loading**
    - **Validates: Requirements 11.6**
    - Test file: `src/components/ui/__tests__/Skeleton.test.ts`
  - [ ] 13.4 Conduct accessibility audit and fix violations
    - Run axe-core or Playwright accessibility checks on all pages
    - Fix missing `aria-label`, focus-ring styles, keyboard navigation gaps, and contrast issues
    - Ensure all interactive elements are reachable via keyboard
    - _Requirements: 11.4_
  - [ ] 13.5 Responsive layout QA and fixes
    - Verify all pages at 375 px, 768 px, 1440 px — no horizontal scroll, no clipped controls
    - Fix any layout overflow, stacking, or wrapping issues found
    - _Requirements: 11.1_
  - [ ] 13.6 Write Playwright E2E test suite
    - `e2e/` directory: register flow, login (email + Google OAuth stub), create trip, complete questionnaire, view itinerary, delete trip, empty state
    - Configure `playwright.config.ts` targeting local dev server
    - _Requirements: 12.1, 12.3, 12.4_
  - [ ]* 13.7 Write unit tests for remaining untested paths
    - Auth form submission edge cases (unverified email, generic wrong-password message)
    - Profile page rendering with null/non-null avatarUrl
    - Avatar upload rollback on DB failure (mocked storage + DB)
    - Navigation guard: COMPLETE → itinerary, DRAFT → questionnaire
    - Empty state rendering (no trips)
    - Loading spinner during AI generation
    - Trip deletion optimistic update rollback
    - _Requirements: 4.4, 4.5, 6.1, 6.7, 10.3, 10.4, 10.7_

- [ ] 14. Final checkpoint — All phases complete
  - Ensure all Vitest tests pass (`vitest --run`), Playwright E2E suite passes, `tsc --noEmit` passes, ESLint passes with zero errors. Ask the user if questions arise before marking MVP complete.


## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP iteration
- Each task references specific requirements for traceability
- Checkpoints (tasks 2, 4, 6, 8, 10, 12, 14) are gates — all automated checks must pass before proceeding
- Property-based tests use `fast-check` with a minimum of 100 iterations per property; tag each test with `// Feature: roamly-mvp, Property N: <name>`
- Unit tests and property tests are complementary — property tests verify universal invariants, unit tests verify specific scenarios and error states
- The `src/db/seed.ts` file can be populated in Phase 0 for development convenience but is not a blocking deliverable
- All `any` type usages must include both an ESLint disable comment and a ≥10-character explanation comment (Requirement 2.5)
- Service modules must be single-domain — never mix Profile logic into `tripService.ts` etc. (Requirement 1.4)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6"] },
    { "id": 3, "tasks": ["1.7", "1.8"] },
    { "id": 4, "tasks": ["1.9"] },
    { "id": 5, "tasks": ["3.1", "3.2", "3.4"] },
    { "id": 6, "tasks": ["3.3", "3.5", "3.6", "3.7"] },
    { "id": 7, "tasks": ["3.8", "3.9", "3.10", "3.11"] },
    { "id": 8, "tasks": ["5.1", "5.3"] },
    { "id": 9, "tasks": ["5.2", "5.4", "5.5"] },
    { "id": 10, "tasks": ["5.6"] },
    { "id": 11, "tasks": ["5.7"] },
    { "id": 12, "tasks": ["5.8"] },
    { "id": 13, "tasks": ["5.9"] },
    { "id": 14, "tasks": ["7.1", "7.6", "7.10"] },
    { "id": 15, "tasks": ["7.2", "7.3", "7.4", "7.7", "7.11", "7.12"] },
    { "id": 16, "tasks": ["7.5", "7.8"] },
    { "id": 17, "tasks": ["7.9", "7.13", "7.15"] },
    { "id": 18, "tasks": ["7.14"] },
    { "id": 19, "tasks": ["7.16"] },
    { "id": 20, "tasks": ["9.1"] },
    { "id": 21, "tasks": ["9.2", "9.6"] },
    { "id": 22, "tasks": ["9.3", "9.4", "9.7"] },
    { "id": 23, "tasks": ["9.5", "9.8"] },
    { "id": 24, "tasks": ["9.9", "9.10", "9.11"] },
    { "id": 25, "tasks": ["9.12"] },
    { "id": 26, "tasks": ["9.13"] },
    { "id": 27, "tasks": ["11.1", "11.5"] },
    { "id": 28, "tasks": ["11.2", "11.3"] },
    { "id": 29, "tasks": ["11.4", "11.6"] },
    { "id": 30, "tasks": ["13.1", "13.2"] },
    { "id": 31, "tasks": ["13.3", "13.4", "13.5"] },
    { "id": 32, "tasks": ["13.6"] },
    { "id": 33, "tasks": ["13.7"] }
  ]
}
```
