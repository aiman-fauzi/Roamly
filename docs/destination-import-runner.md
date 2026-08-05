# Destination Import Runner

The executable runner imports destination data into the Supabase PostgreSQL database through the existing `DestinationImportService`.

It does not call AI enrichment and does not modify itinerary generation.

Structured verified facts use a separate manual import command and the durable `DestinationFact` table. Destination discovery/import and fact verification are intentionally separate steps.

## Command

```bash
npm run import:destinations -- --source=wikivoyage --country=Malaysia --city="Kuala Lumpur"
```

Supported arguments:

- `--source`: `openstreetmap`, `osm`, `wikivoyage`, `wikipedia`, `government`, or `government_tourism`.
- `--country`: Country name used for source queries and existing city matching.
- `--city`: City name used for source queries and existing city matching.
- `--limit`: Optional positive integer. Defaults to `50`.

Examples:

```bash
npm run import:destinations -- --source=openstreetmap --country=Malaysia --city="Kuala Lumpur" --limit=100
npm run import:destinations -- --source=wikipedia --country=Malaysia --city="Kuala Lumpur" --limit=25
npm run import:destinations -- --source=wikivoyage --country=Malaysia --city="Kuala Lumpur"
```

Government datasets do not have one universal URL format. Set one of these environment variables before running:

```bash
GOVERNMENT_TOURISM_DATASET_URL=https://example.gov/dataset.json npm run import:destinations -- --source=government --country=Malaysia --city="Kuala Lumpur"
```

## Behavior

The runner builds a stable import `sourceKey` from `source`, `country`, `city`, and `limit`.

During execution it prints:

- Current progress from `destination_import_jobs`.
- Imported record count.
- Skipped record count.
- Failed record count.
- Final summary.
- A sample of attractions found in the database after import.

## Resumability And Duplicates

The runner delegates actual importing to the existing `DestinationImportService`, which uses `DestinationImportJobRepository` for resumable cursor checkpoints.

If the same `sourceKey` already has a completed import job, the runner skips the duplicate import and prints the previous summary. Failed or interrupted jobs are passed back to the service so they can resume from the stored cursor.

The importer still performs its existing normalization and duplicate handling. The runner does not modify parser, repository, or normalization behavior.

## Exit Codes

- `0`: Import completed and attractions were verified in the database.
- `1`: Import failed, any records failed, arguments were invalid, or no attractions were found for the requested city/country.

## Verified Fact Import

Manual verified facts can be staged and applied with:

```bash
npm run destinations:facts:import -- --file=data/verified-kl-facts.json --dry-run
npm run destinations:facts:import -- --file=data/verified-kl-facts.json --apply
```

The fact importer defaults to dry-run, requires explicit `--apply`, validates active entity IDs, validates allowlisted source URLs, validates timestamps/currencies/fact formats, and upserts by fingerprint so exact re-imports are idempotent.

## Quality Audit

Run the read-only destination quality audit with:

```bash
npm run destinations:audit -- --city="Kuala Lumpur"
npm run destinations:audit -- --city="Kuala Lumpur" --json
```

The audit reports active/quarantined counts, verified opening-hour and price coverage, stale/conflicting facts, missing coordinates, missing source URLs, possible duplicates, and Gemini enrichment coverage.
