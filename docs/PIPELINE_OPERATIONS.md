# Atlas Pipeline Operations

Maintainer and contributor runbooks for adding agencies, discovering coverage gaps, refreshing feeds, and publishing map artifacts. This is repository documentation, not user-facing product documentation.

## Integrating a New Transit Agency

1. Obtain the GTFS ZIP download link (preferring a stable agency URL or Mobility Database link).
2. Process the feed:
   ```bash
   npm run process -- <feed-url-or-local-zip> <slug> "[Display Name]" "[lat,lon]"
   ```
3. Add or edit `config/agencies/<slug>.json` with `region`, `feedUrl`, `mdbFeedUrl`, and `bbox`.
4. Generate the runtime index:
   ```bash
   npm run build:agency-index
   ```
5. Refresh the agency and set up supplemental feeds/history config:
   ```bash
   npm run refresh -- <slug> --force
   ```
6. Commit the agency source file and regenerated `public/data/index.json`.

## Querying Mobility Database

```bash
npm run find-mdb -- "[search query]" <slug> "[lat,lon]"
# Example:
npm run find-mdb -- "Hamilton Street Railway" hamilton "43.25,-79.87"
```

## Coverage Gap Discovery

```bash
npm run discover-gaps
npm run discover-gaps -- --region Ontario --limit 20
npm run discover-gaps -- --min-pop 100000
```

Candidates are written to `tmp/gap-candidates.json`.

## Batch Processing and Publishing

1. Identify candidates with coverage-gap discovery.
2. Process new agencies and update `config/agencies/`.
3. Run `npm run build:agency-index`.
4. Refresh new slugs together:
   ```bash
   npm run refresh -- slug1 slug2 slug3 --force
   ```
5. Rebuild the PMTiles archive:
   ```bash
   npm run build-pmtiles
   ```
6. Upload the completed archive to the Cloudflare R2 bucket.
7. Record product additions in `CHANGELOG.md` and mark backlog items `done` in `docs/AGENCY_BACKLOG.md`.
