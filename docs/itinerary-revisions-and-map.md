# Itinerary revisions and map

## Revision persistence

`ItineraryRevision` stores a bounded, server-created snapshot of the itinerary immediately before every successful mutation. Rows include the trip, monotonic revision number, pre-mutation edit version, bounded action type and summary, itinerary JSON, creating owner ID, and timestamp. They never contain prompts, provider responses, authentication data, or client-supplied destination objects.

The default retention limit is 20 revisions per trip. Override it with `ITINERARY_REVISION_LIMIT`; values are constrained to 1-100. Every write locks the owner-scoped trip row, verifies `itineraryEditVersion`, inserts the pre-mutation snapshot, updates the itinerary, increments the version, and deletes only revisions older than the newest configured limit inside one Prisma transaction.

Full itinerary generation creates a revision only when it replaces an existing itinerary. Searches, previews, failed writes, stale writes, cancelled regeneration, and fallback previews create no revision.

## Revision APIs

- `GET /api/trips/:tripId/itinerary-revisions` returns metadata and restorable state, never itinerary JSON.
- `GET /api/trips/:tripId/itinerary-revisions/:revisionId` returns a sanitized day/item preview and active map points.
- `POST /api/trips/:tripId/itinerary-revisions/:revisionId/restore` requires `expectedVersion` and snapshots the current state before restoring.
- `POST /api/trips/:tripId/itinerary-editor/undo` requires `expectedVersion` and restores the newest pre-mutation revision.

All routes use verified authentication, owner-scoped trip lookup, strict candidate validation, active destination records, and `409` conflicts for stale versions. Restore never removes later history.

## Map architecture

The editor consumes only the existing `ItineraryMapPoint` contract. `validateItineraryMapPoints` rejects malformed candidate IDs, non-finite or out-of-range coordinates, invalid day/order values, missing item IDs, and duplicate item IDs. Invalid points are skipped and counted without blocking the editor.

`ItineraryMapAdapter` isolates the UI from the initial renderer. The current Leaflet adapter owns tile rendering, bounds, numbered markers, day-order lines, marker focus, and day emphasis. Replacing Leaflet requires a new adapter implementation rather than changes to itinerary persistence or editor APIs.

The initial tile source is OpenStreetMap. Its copyright attribution must remain visible on the map and must link to `https://www.openstreetmap.org/copyright`. Review the tile usage policy before sustained high-volume traffic or offline caching. Route lines connect itinerary stops in order; they are not driving routes, duration estimates, or navigation guidance.

The walkthrough never autoplays, supports play/pause/previous/next/restart/day selection, and disables animated panning when `prefers-reduced-motion` is enabled. Marker selection focuses the matching itinerary item; item selection focuses the marker. Reorder, cross-day movement, replacement, regeneration, undo, and restore all update the map from the returned editor document without a page reload.

Tile, network, or initialization failure leaves the itinerary editor usable. Client diagnostics emit only operation, duration, status, bounded error code, valid-point count, and skipped-point count. They do not include item IDs, destination names, coordinates, trip IDs, or user identifiers.
