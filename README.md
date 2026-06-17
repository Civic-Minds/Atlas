# Atlas

A unified frequency map for transit networks from multiple agencies.

## Problem

Transit frequency data lives in separate GTFS feeds across many agencies, with no easy way to see the combined picture. Atlas pulls any number of feeds, runs a two-phase headway analysis, and renders all networks together on one continuous map. Routes are colored by how often service actually runs — frequent service stands out; infrequent service recedes.

## Features

- **Frequency Map**: Routes from multiple agencies displayed together on a single interactive map, colored by scheduled headway tier (frequent to infrequent). Pan seamlessly across the combined network.
- **Headway Tiers**: Two-phase GTFS analysis extracts per-direction departure times for each day type, applies configurable criteria, and assigns a tier — or flags routes as peak-only (span) vs. all-day-but-infrequent.
- **Filtering**: By agency, mode (bus/rail/etc.), frequency ceiling, and day of week. Optional service span toggle hides peak-only and school-run routes.
- **Search**: Cross-agency route search by number or name, scoped to the current frequency filter.
- **Station View**: Click any stop to pin it and see every route serving it along with their current-day headways.
- **Live Adherence**: Real-time headway drift for supported routes via GTFS-RT TripUpdates — no background cron, fetched on demand.
- **Combined Corridors**: Overlay showing segments where multiple overlapping routes combine to provide higher aggregate frequency.

## Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Mapping**: Leaflet, React Leaflet
- **Pipeline**: Node.js / tsx, JSZip, Papaparse
- **Infrastructure**: Vercel (static hosting + Blob storage), GitHub Actions (weekly refresh)
- **Testing**: Vitest

---

- [Roadmap](./ROADMAP.md)
- [Changelog](./CHANGELOG.md)

Created by Civic Minds
