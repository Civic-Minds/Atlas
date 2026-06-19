# Atlas

A unified regional transit atlas — multiple analytical map views on processed GTFS from many agencies.

## Problem

Transit frequency data lives in separate GTFS feeds across many agencies, with no easy way to see the combined picture. Atlas pulls any number of feeds, runs a two-phase headway analysis, and renders all networks together on one continuous map. Routes are colored by how often service actually runs — frequent service stands out; infrequent service recedes.

## Map apps

Atlas is organized as **map apps** — task-specific views on the same regional data, switched via the app drawer (waffle icon, top-left). Frequency Map is the default.

| App | Description |
|-----|-------------|
| **Frequency Map** | Explore scheduled headways across the region; filter, search, and inspect stops and routes. |
| **Corridors** | Find all direct routes between two stations (in development on `ai-104-corridors`). |
| **History** | Compare service across schedule periods (planned). |

## Features (Frequency Map)

- **Headway Tiers**: Two-phase GTFS analysis extracts per-direction departure times for each day type, applies configurable criteria, and assigns a tier — or flags routes as peak-only (span) vs. all-day-but-infrequent.
- **Filtering**: By agency, mode (bus/rail/etc.), frequency ceiling, and day of week. Optional service span toggle hides peak-only and school-run routes.
- **Search**: Cross-agency route search by number or name, scoped to the current frequency filter.
- **Station View**: Click any stop to pin it and see every route serving it along with their current-day headways.
- **Live Adherence**: Real-time headway drift for supported routes via GTFS-RT TripUpdates — no background cron, fetched on demand.
- **Combined Corridors** (overlay): Pipeline emits segments where overlapping routes share a stop link; toggle exists in Settings but overlay is currently hidden in the frontend (individual route lines already convey frequency).

## Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Mapping**: Leaflet, React Leaflet
- **Pipeline**: Node.js / tsx, JSZip, Papaparse
- **Infrastructure**: Vercel (static hosting), Cloudflare R2 (GeoJSON + stop indexes), GitHub Actions (weekly refresh)
- **Testing**: Vitest

---

- [Roadmap](./ROADMAP.md)
- [Pipeline](./PIPELINE.md)
- [Changelog](./CHANGELOG.md)

Created by Civic Minds
