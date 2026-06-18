# Atlas Pipeline

How GTFS feeds become the frequency map.

## Overview

```
GTFS zip  →  process-core.ts  →  GeoJSON  →  Vercel Blob  →  frontend
```

All 35 agencies are stored as individual GeoJSON files on Vercel Blob. The frontend fetches `public/data/index.json` to get the Blob URL for each agency, then lazy-loads each file as the user pans into its bounding box.

No server, no database. The pipeline only runs during processing or the weekly refresh job.

---

## Adding an Agency

```bash
# 1. Pull credentials (once per machine)
vercel env pull .env.local

# 2. Process the feed
npm run process -- /path/to/feed.zip <slug> "Display Name" "lat,lon"
```

This uploads `atlas/<slug>.json` to Vercel Blob and updates `public/data/index.json` with the Blob URL.

After that, **manually edit `index.json`** to add:
- `feedUrl` — the stable download URL (used by the weekly refresh)
- `bbox: [south, west, north, east]` — geographic bounding box for viewport-aware lazy loading

If the official feedUrl is unreliable, use the Mobility Database stable mirror:
```
https://storage.googleapis.com/storage/v1/b/mdb-latest/o/<mdb-id>.zip?alt=media
```
Find the `<mdb-id>` at [github.com/MobilityData/mobility-database-catalogs](https://github.com/MobilityData/mobility-database-catalogs).

Then commit `index.json` and deploy: `vercel --prod`.

---

## Refreshing Data

```bash
npm run refresh              # all agencies
npm run refresh -- ttc yrt   # specific slugs only
```

Reads each agency's `feedUrl` from `index.json`, downloads the zip, reprocesses, and re-uploads to Blob. The Blob URL stays the same across refreshes (same `atlas/<slug>.json` path) — only the content changes.

### Weekly Auto-Refresh

GitHub Actions runs `.github/workflows/refresh-feeds.yml` every Monday at 06:00 UTC (~01:00 Toronto). It requires `BLOB_READ_WRITE_TOKEN` as a repository secret (already set). If `index.json` changes during refresh (e.g. center coordinates updated), the workflow commits it automatically.

---

## GeoJSON Schema

Each uploaded file is a GeoJSON `FeatureCollection` with three feature types, distinguished by geometry:

### Route features (`LineString`)
One per route direction per day type. Properties:

| Property | Type | Notes |
|---|---|---|
| `routeId` | string | GTFS `route_id` |
| `routeShortName` | string | e.g. `"501"`, `"A"` |
| `routeLongName` | string \| null | e.g. `"Queen"` |
| `routeType` | number | GTFS route type (0=streetcar/LRT, 1=subway, 2=rail, 3=bus, 4=ferry) |
| `routeColor` | string \| null | Hex without `#`, from GTFS |
| `directionId` | number | 0 or 1 |
| `headsign` | string \| null | Cleaned terminal name |
| `day` | string | `"Weekday"`, `"Saturday"`, or `"Sunday"` |
| `tier` | string | Frequency tier label or `"span"` |
| `headway` | number \| null | Median headway in minutes; `null` when `tier === "span"` |

`tier === "span"` means the route runs only outside the analysis window (before 07:00 or after 22:00).

### Stop features (`Point`)
One per served stop. Properties:

| Property | Type | Notes |
|---|---|---|
| `stopId` | string | GTFS `stop_id` |
| `stopName` | string | |
| `routeIds` | string[] | All route IDs serving this stop |
| `isHub` | boolean | `location_type=1` or 3+ distinct routes |
| `isRail` | boolean | Served by any of route_type 0, 1, or 2 |

### Corridor features (`LineString`, stop-pair chords)
Combined-frequency segments where 2+ routes overlap. Properties:

| Property | Type | Notes |
|---|---|---|
| `type` | `"corridor"` | Distinguishes from route features |
| `day` | string | `"Weekday"`, `"Saturday"`, or `"Sunday"` |
| `headway` | number | Aggregate headway for all overlapping routes |
| `routes` | string[] | Short names of overlapping routes |

Corridors are skipped for all-rail feeds (GO, UP Express, VIA) since shared rail frequency isn't meaningful in the same way.

---

## Frequency Analysis

Defined in `pipeline/defaults.ts` (`DEFAULT_CRITERIA`):

| Day type | Window |
|---|---|
| Weekday | 07:00–22:00 |
| Saturday | 07:00–22:00 |
| Sunday | 09:00–21:00 |

**Tiers** (assigned by median headway):

| Tier | Bus | Rail/LRT/Subway |
|---|---|---|
| Rapid | ≤10 min | ≤5 min |
| Freq++ | ≤15 min | ≤8 min |
| Freq+ | ≤20 min | ≤10 min |
| Freq | ≤30 min | ≤15 min |
| Good | ≤60 min | ≤30 min |
| Basic | — | ≤60 min |
| Infreq | >60 min | >60 min |

Phase 1 (`transit-phase1.ts`) computes departure gaps per route per direction per day. Phase 2 (`transit-phase2.ts`) applies tiers and grace tolerances.

**Shape selection**: display uses the longest shape per direction (to show full branch extent); frequency analysis uses the most-common shape cluster (to exclude short-turn trips from distorting the headway).

---

## `index.json` Schema

```json
{
  "agencies": [
    {
      "slug": "ttc",
      "name": "TTC",
      "center": [43.653, -79.383],
      "url": "https://...vercel-storage.com/atlas/ttc.json",
      "feedUrl": "https://open.toronto.ca/.../GTFS.zip",
      "bbox": [43.55, -79.65, 43.85, -79.10],
      "preprocess": "nrt-day-night"
    }
  ]
}
```

- `url` — Vercel Blob URL, written by the pipeline automatically
- `feedUrl` — source for weekly refresh; add manually when adding a new agency; use Mobility Database mirror if official URL is unstable
- `bbox` — `[south, west, north, east]` for lazy loading; add manually; missing bbox falls back to `center ± 0.4°`
- `preprocess` — optional transform applied before analysis; currently only `"nrt-day-night"` (NRT Toronto day/night route merge)

---

## GTFS Data Directory

Test feeds: `/Users/ryan/Desktop/Data/GTFS/` (organized by country/region).

---

## Special Cases

**NRT day/night routes** (`preprocess: "nrt-day-night"`): NRT (Newmarket) uses separate route IDs for day and night variants of the same corridor. The merge transform combines them before analysis so they show as a single route.

**GO Transit / commuter rail shape selection**: rail uses longest shape (not most-common) to prevent short-turn trains (e.g. Union→Bramalea) from winning over the full end-to-end line. Short-turn trains still count toward corridor frequency because they serve every intermediate stop.

**Seasonal agencies**: feeds may include future service dates. The pipeline detects the reference date (nearest date within ±90 days that has active service) before counting shapes and building frequency, so it always reflects the current or upcoming schedule rather than old/future service periods.

**Ferries (route_type=4)**: no agencies currently in Atlas have a public GTFS feed. See Linear AI-76 (Toronto Island Ferry) and AI-77 (Montreal navettes fluviales) for tracking. When a ferry feed appears, process it like any other agency — the Mode filter already includes Ferry. Note: the Société des traversiers du Québec publishes a GTFS feed but covers provincial highway crossings (Matane, Rivière-du-Loup, etc.) — not urban transit and not a fit for Atlas.
