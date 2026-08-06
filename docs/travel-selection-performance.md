# Trusted travel-selection performance

## Targets

| Operation    | Target                                     |
| ------------ | ------------------------------------------ |
| GET restore  | p50 under 1.5 seconds, p95 under 4 seconds |
| PUT review   | p50 under 2 seconds, p95 under 5 seconds   |
| DELETE clear | p95 under 2 seconds                        |

Cold and warm results are reported separately because Vercel functions and their database
connections may start cold.

Production functions run in `sin1`, aligned with the Supabase `ap-southeast-1` database and the
primary ASEAN user base. This avoids placing every verified-auth and ownership query on the
previous `iad1` to Singapore network path.

## Call graph before optimization

```text
GET restore / PUT review
  requireAuthenticatedTrip
    getSession
    ensureUser
    getTripById
  TripTravelSelectionService.loadOwnedContext
    getTripById (duplicate)
    tripTravelProfile.findUnique
    getPreferenceSet
  previewBudget (first pass)
    getTripById
    getPreferenceSet
    getProfileSummary
    resolveDestinationCity
    tripTravelProfile.findUnique
    resolveExchangeRate
    DestinationRetrievalService.retrieve
      attraction + provenance + restaurant + hotel + activity + fact queries
    searchFlights + searchHotels
    current flight + hotel selections
    calculateBudget + timing + hotel-area scoring
  previewBudget (second pass, selected combined offer IDs)
    repeats the complete first pass
  fingerprint
  database read/write
```

One restore or review therefore performed three owned-trip reads, three preference reads, two
profile reads, two city resolutions, two exchange-rate resolutions, two destination retrievals,
two flight searches, two hotel searches, and two budget/timing builds. The selection path did not
invoke Gemini, but it paid nearly the full pre-Gemini itinerary-planning cost twice.

## Call graph after optimization

```text
GET restore / PUT review
  requireAuthenticatedTrip
    verified getUser
    ensureUser
    getTripById (owned trip reused below)
  tripTravelProfile.findUnique
  fingerprint (once)
  Promise.all
    deterministic flight generation (once)
    deterministic hotel generation (once)
  exact selected-ID resolution (once)
  budget calculation without attraction candidates (once)
  timing calculation (once)
  database read/write

GET planning-preview (lazy)
  verified ownership
  validate persisted fingerprint and selected IDs
  Promise.all
    resolveDestinationCity
    load profile interests
  retrieve active attraction candidates only
  strict candidate check + hotel-area scoring
```

The full itinerary path still retrieves the complete candidate set and preserves its existing
Gemini candidate and selected-offer validation contracts.

## Memoization and cache

`TrustedTravelRequestScope` memoizes normalized inputs, fingerprint, flight and hotel searches,
selected-offer resolution, and budget calculation for one request. It has no global mutable state.

The existing deterministic offer cache remains a 15-minute instance-local optimization. It is
bounded to 64 entries per offer type, evicts least-recently-used entries, coalesces concurrent
loads, and returns cloned values. Keys contain provider and normalized search inputs, never user
identity, cookies, tokens, or authorization state. Every cache hit still goes through exact
selected-ID resolution.

Vercel may discard or isolate this cache between function instances. Correctness and validation
must therefore behave identically on a cache miss.

## Diagnostics

Travel-selection and planning-preview routes emit a structured `trusted_travel_timing` event and
a `Server-Timing` response header. Components cover authentication, ownership, profile loading,
provider generation, destination retrieval, hotel-area scoring, selected-ID resolution, budget,
timing, fingerprint, database writes, Gemini invocation, and total duration. Logs exclude cookies,
tokens, emails, provider payloads, and database connection details.

## Local benchmark

The benchmark used a disposable Phu Quoc trip against the configured Supabase database. Warm
figures below are route-internal durations from the structured timing events, so they exclude
browser rendering and local development compilation. With five samples, the maximum is reported
instead of estimating a broad-tail p95.

| Operation            | Samples |  Minimum |   Median |  Maximum |
| -------------------- | ------: | -------: | -------: | -------: |
| GET valid restore    |      10 |   382 ms |   432 ms |   750 ms |
| GET no selection     |       6 |   392 ms |   395 ms |   515 ms |
| PUT initial review   |       5 |   530 ms |   567 ms |   632 ms |
| PUT re-review        |       5 |   446 ms |   496 ms |   574 ms |
| DELETE clear         |       5 |   543 ms |   564 ms |   784 ms |
| GET planning preview |       5 | 1,207 ms | 1,270 ms | 1,441 ms |

The first samples after resetting the local server process were 383 ms for an empty GET, 448 ms
for PUT, and 1,241 ms for planning preview. These are useful cache-cold application samples, but
they do not represent a Vercel infrastructure cold start because the route timer begins inside the
handler.

A representative 448 ms PUT spent 48 ms in verified authentication, 80 ms synchronizing the user,
121 ms in the owned-trip lookup, 86 ms loading the trip profile, and 96 ms in the atomic write.
Flight generation was 1.3 ms, hotel generation 2.3 ms, exact selected-ID resolution 0.3 ms,
fingerprinting 0.5 ms, budget calculation 4.4 ms, and timing calculation 2.3 ms. Destination
retrieval, exchange-rate lookup, and Gemini invocation were all zero.

A representative 1,241 ms lazy preview spent 581 ms retrieving active attraction candidates and
232 ms resolving destination metadata. Keeping that work behind the separate endpoint is what
lets selected travel, budget, and timing render first.

## Pre-deployment production baseline

One browser-measured sample on the preceding production deployment took 59.9 seconds to restore a
valid reviewed selection and 49.2 seconds to perform the initial review. Those wall-clock results
include network and rendering time and confirm the observed approximately one-minute regression.
