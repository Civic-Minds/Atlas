# Atlas

A unified regional transit atlas — multiple analytical map views on processed GTFS from many agencies.

## Problem

Transit frequency data lives in separate GTFS feeds across many agencies, with no easy way to see the combined picture. Atlas pulls any number of feeds, runs a two-phase headway analysis, and renders all networks together on one continuous map. Routes are colored by how often service actually runs — frequent service stands out; infrequent service recedes.

## Features

- **Headway Tiers**: Two-phase GTFS analysis extracts per-direction departure times for each day type, applies configurable criteria, and assigns a tier — or flags routes as peak-only (span) vs. all-day-but-infrequent.
- **Filtering**: By agency, mode (bus/rail/etc.), frequency ceiling, and day of week. Optional service span toggle hides peak-only and school-run routes.
- **Search**: Cross-agency route search by number or name, scoped to the current frequency filter.
- **Station View**: Click any stop to pin it and see every route serving it along with their current-day headways.
- **Corridors**: Station-to-station lookup — find direct routes between two stops with headway at the destination.
- **Live Adherence**: Real-time headway drift for supported routes via GTFS-RT TripUpdates — fetched on demand.
- **History**: Week-over-week schedule adherence patterns from a background archiver; shows how reliably a route runs across days and times.
- **Agency Browser**: Browse all agencies with region filters, search, and a detail card showing routes by frequency and live tracking status.

## Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Mapping**: Leaflet, React Leaflet
- **Pipeline**: Node.js / tsx, JSZip, Papaparse
- **Infrastructure**: Vercel (hosting + serverless API routes), Cloudflare R2 (GeoJSON, stop indexes, GTFS-RT archives), Cloudflare Workers (background GTFS-RT archiver), GitHub Actions (weekly refresh)
- **Testing**: Vitest

---

- [Roadmap](./ROADMAP.md)
- [Pipeline](./PIPELINE.md)
- [Changelog](./CHANGELOG.md)

Created by Civic Minds
