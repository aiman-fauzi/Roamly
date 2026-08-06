# Versioned itinerary editor

The itinerary editor keeps the generated plan in `Trip.itineraryJson` and uses `Trip.itineraryEditVersion` as an optimistic-concurrency token. Full itinerary generation and every editor mutation increment the version. A stale mutation returns HTTP `409` with `ITINERARY_VERSION_CONFLICT`; the client rolls back optimistic state and asks the traveler to reload.

## Trusted mutation boundary

Client requests contain only the itinerary ID in the route, the expected version, item/day coordinates, lock or notes values, and an exact candidate ID when selecting a replacement. The server never accepts client-supplied destination objects, names, coordinates, categories, images, prices, or Gemini output as persistence-ready data.

Before every write, the service verifies ownership, item identity, unique candidate IDs, and that every referenced attraction, restaurant, hotel, or activity is still active with an active city and country. Replacement IDs must appear in the same current top-six retrieved candidate set exposed by the alternatives endpoint. A single owner-and-version-scoped `updateMany` persists the complete normalized document and increments the version.

## Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/trips/:tripId/itinerary-editor` | `GET` | Load the versioned editor document and map-ready points |
| `/api/trips/:tripId/itinerary-editor/reorder` | `PUT` | Move one item to an exact day, period, and index |
| `/api/trips/:tripId/itinerary-editor/lock` | `PUT` | Lock or unlock one item |
| `/api/trips/:tripId/itinerary-editor/notes` | `PUT` | Save bounded traveler notes |
| `/api/trips/:tripId/itinerary-editor/replacements` | `GET` | Return up to six unused, active alternatives |
| `/api/trips/:tripId/itinerary-editor/replacements` | `PUT` | Replace exactly one item from the allowed set |
| `/api/trips/:tripId/itinerary-editor/regenerate-day` | `POST` | Regenerate one day while preserving locks and other days |

Day regeneration sends Gemini candidate IDs and planning fields only. Returned IDs are validated against the retrieved set, duplicates and destinations used on other days are rejected, and arrival/final-day timing windows are enforced. Provider or contract failure leaves the persisted itinerary untouched and returns a deterministic fallback proposal. The fallback is persisted only after a second explicit request with the same expected version.

Map-ready output contains only item ID, candidate ID, day sequence, title, category, area, latitude, and longitude. No map provider is integrated yet.
