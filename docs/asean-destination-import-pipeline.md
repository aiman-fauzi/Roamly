# ASEAN Destination Intelligence Import Pipeline

This pipeline discovers tourism attractions from approved open sources, normalizes
them into a provider-neutral staging model, validates geography and source policy,
deduplicates against existing Roamly destinations, optionally enriches with
Wikidata and Wikimedia Commons metadata, scores import readiness, and produces a
dry-run report before any write.

Default mode is always dry-run. Use `--commit` only after reviewing the report.

## Supported Providers

- `openstreetmap-overpass`: OpenStreetMap data through Overpass API. Licence:
  ODbL 1.0. Attribution required.
- `wikidata`: Wikidata entity data. Licence: CC0.
- `wikimedia-commons`: MediaWiki API image metadata. Per-file licence must be
  reusable and attribution-complete.
- `wikivoyage`: Registered for future MediaWiki API use. CC BY-SA prose is not
  imported until UI attribution display is implemented.
- `government-tourism-open-data`: disabled until a specific government or tourism
  API/dataset is reviewed and registered.

HTML scraping is disabled by default. Commercial travel platforms such as Google
Travel, Google Maps, TripAdvisor, Booking.com, Agoda, Expedia, Airbnb, Yelp,
Instagram and TikTok are out of scope.

## Source Registry

Definitions live in:

`src/services/destinations/sources/sourceRegistry.ts`

Each source records access method, licence, terms URL, attribution requirements,
commercial reuse status, rate limit and review timestamps. The importer rejects
unregistered, disabled, unlicensed, commercial-reuse-disallowed and default HTML
sources.

## Destination Configuration

ASEAN areas live in:

`src/services/destinations/importPipeline/destinationAreas.ts`

Every area has a country code, aliases, area type and a fixed bounding box. This
avoids ambiguous text geocoding. Add new destinations by adding a config entry,
not by changing importer logic.

Pilot areas:

- Bangkok
- Phuket
- Da Nang
- Phu Quoc
- Langkawi
- Sapa
- Jakarta
- Bali

## Commands

Discover only, dry-run, no enrichment:

```bash
npm run destinations:discover -- --area=bangkok --provider=osm --limit=20 --json
```

Full dry-run import report:

```bash
npm run destinations:import -- --area=bangkok --provider=osm --limit=20 --dry-run --json
```

Dry-run all pilot areas:

```bash
npm run destinations:import -- --all-areas --pilots --provider=osm --limit=20 --dry-run
```

Committed import, after review and migration deployment:

```bash
npm run destinations:import -- --area=bangkok --provider=osm --limit=20 --commit
```

Read a committed job report:

```bash
npm run destinations:report -- --job-id=<job-id>
```

Resume a failed committed job:

```bash
npm run destinations:resume -- --job-id=<job-id> --commit
```

## Environment Variables

- `ROAMLY_IMPORT_CONTACT`: contact string included in API `User-Agent`.
- `OVERPASS_API_URL`: optional replacement Overpass endpoint.

The default user agent includes the Roamly production URL and an unset contact
marker. Set `ROAMLY_IMPORT_CONTACT` before larger runs.

## Workflow

1. Discover: bounded Overpass request inside configured area.
2. Normalize: create `NormalizedDestinationCandidate` records with structured
   multilingual names.
3. Validate: source policy, name, coordinates, category, identity and
   exclusions. Strong cultural, tourism, historic and natural classifications
   prevent weak generic-name tokens from becoming false hard rejects.
4. Deduplicate: compare source IDs, multilingual identity keys, Wikidata IDs,
   websites and coordinates. Short numeric aliases are ignored.
5. Enrich: follow only OSM-supplied Wikidata/Commons IDs.
6. Score: calculate import readiness separately from itinerary relevance.
7. Stage: dry-run report with accepted/rejected/duplicate examples.
8. Review: inspect proposed inserts/updates and rejection reasons.
9. Upsert: only when `--commit` is explicit.
10. Report: committed jobs can be inspected by ID.

## Attribution Rules

- OSM records store ODbL source attribution and source URL.
- Wikidata metadata is CC0 and is used only via stable entity IDs.
- Commons images require reusable licence metadata, author, licence URL, file
  page URL and attribution text.
- Wikivoyage prose is not imported in this phase. If enabled later, downstream
  UI must expose CC BY-SA attribution and source links.

## Database Integration

The pipeline uses existing `Country`, `City`, `Attraction`, `DestinationImage`,
`DestinationImportJob`, `DestinationFact` and `DestinationEnrichment` concepts.

Migration `20260806010000_destination_source_provenance` adds:

- `destination_source_provenance` for provider/source record identity,
  attribution, external IDs, raw payloads, source content hashes and import
  confidence.
- Additional `destination_images` attribution fields for Commons source URL,
  page URL, author and licence metadata.

The migration is additive. Do not deploy it automatically to production.

## Review Rejected Records

Dry-run JSON includes:

- `categoryDistribution`
- `osmObjectTypeDistribution`
- `rejectionReasonDistribution`
- `reviewReasonDistribution`
- `duplicateDecisionDistribution`
- coverage metrics for English names, Wikidata, websites and licensed images
- `rejectedExamples`
- `reviewExamples`
- `unsupportedCategories`
- `localityMismatches`
- `ambiguousLocalityCandidates`
- `imageLicenseFailures`
- `duplicateDiagnostics`
- `proposedInserts`
- `proposedUpdates`

Large reports write complete diagnostics to `.tmp/destination-import-reports`
while keeping representative samples in the console output.

Unknown values stay null. The importer must not invent descriptions, coordinates,
ratings, prices, opening hours or images.

## Adding A New Source

1. Review licence, API terms, robots policy and reuse conditions.
2. Add a registry entry in `sourceRegistry.ts`.
3. Keep `accessMethod: "html"` disabled unless explicitly approved.
4. Add mocked tests for malformed responses, rate limits and licence failures.
5. Preserve attribution in the staging model and provenance table.

## Refreshing Existing Records

Committed runs use `sourceProvider + sourceRecordId` as the stable external
identity. Existing manually curated fields should not be overwritten by weaker
imported data. The writer fills empty fields, preserves existing non-null fields
without provider provenance, and replaces provider-managed fields only when the
new source confidence is stronger. Null imports never erase existing values.
Existing selected images are preserved; matching image URLs may receive missing
attribution metadata.

## UI Attribution

Attraction detail surfaces should eventually display:

- source attribution for OSM-derived records;
- Commons image author, licence and file page;
- CC BY-SA attribution if Wikivoyage-derived text is ever displayed.
