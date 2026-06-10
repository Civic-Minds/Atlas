# Atlas

A hosted frequency map for transit in Ontario's Greater Golden Horseshoe.

**Live: https://atlas-gamma-two.vercel.app**

One continuous map of 13 transit networks — pan from Niagara Falls to Barrie like you would in Google Maps. Every route is colored by how often service actually runs (weekday scheduled headway, 7am–10pm), so frequent transit jumps out and infrequent coverage fades back. Search any route number or name across every agency at once.

## Agencies

TTC · MiWay · Brampton · York Region · Durham Region · Hamilton · Burlington · Oakville · Milton · Grand River · Guelph · Barrie · Niagara Region

## How it works

There is no server and no database.

1. `pipeline/process-core.ts` turns a GTFS zip into GeoJSON: the most-used shape per route/direction, tagged with a frequency tier from a two-phase headway analysis.
2. Output is stored in Vercel Blob; `public/data/index.json` (the only data file in the repo) maps each agency to its Blob URL and source feed URL.
3. The React + Leaflet frontend loads all networks in parallel onto one canvas-rendered map.
4. A GitHub Action re-downloads every feed weekly, so the map tracks current schedules without anyone touching it.

## Commands

```bash
npm run dev                          # local dev server
npm run process -- feed.zip slug "Name" "lat,lon"   # add an agency from a local zip
npm run refresh                      # rebuild every agency from its live feed URL
npm run refresh -- ttc grt           # rebuild specific agencies
```

`process` and `refresh` need `BLOB_READ_WRITE_TOKEN` — run `vercel env pull .env.local` once.

## Stack

React 19 · Vite · TypeScript · Tailwind · Leaflet · Vercel (static hosting + Blob)

---

Created by Civic Minds
