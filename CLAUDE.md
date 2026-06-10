# Atlas — Claude Working Notes

Atlas is a hosted GTHA frequency map (https://atlas-gamma-two.vercel.app). A pipeline processes GTFS feeds into GeoJSON stored in Vercel Blob; the React + Leaflet frontend renders route shapes colored by headway tier. No server, no database.

## Architecture

- `pipeline/process-core.ts` — shared GTFS zip → GeoJSON logic
- `pipeline/process-gtfs.ts` — CLI: local zip → Blob (`npm run process`)
- `pipeline/refresh.ts` — re-downloads every agency's `feedUrl` → Blob (`npm run refresh`)
- `public/data/index.json` — agency registry: slug, name, center, Blob `url`, source `feedUrl` (the only data file in the repo)
- `src/` — React + Leaflet frontend; fetches index, then GeoJSON from Blob URLs
- `scripts/` — test/diagnostic scripts for the pipeline
- `.github/workflows/refresh-feeds.yml` — weekly Monday refresh (needs `BLOB_READ_WRITE_TOKEN` secret, already set)

## Adding an Agency

```bash
vercel env pull .env.local   # once, for BLOB_READ_WRITE_TOKEN
npm run process -- /path/to/feed.zip slug "Display Name" "lat,lon"
```

Then add the agency's stable `feedUrl` to `public/data/index.json` so the weekly refresh covers it, commit index.json, and `vercel --prod`.

## Refreshing Data

```bash
npm run refresh              # all agencies
npm run refresh -- ttc yrt   # specific slugs
```

## GTFS Data

Test feeds live at `/Users/ryan/Desktop/Data/GTFS/` organized by country/region.

## External Tracking

**AtlasLog** — Notion portfolio tracker for resume-worthy technical work. See [`ATLASLOG.md`](./ATLASLOG.md) for what belongs there, entry format, and the AI assistant rule.
