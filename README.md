# Atlas

A regional transit frequency map for the Greater Golden Horseshoe and beyond.

## Problem

Transit frequency data is scattered across 20+ agency GTFS feeds with no unified way to see it. Atlas pulls every feed, runs a two-phase headway analysis, and renders all networks on one continuous map — from Buffalo to Kingston — colored by how often service actually runs. Frequent transit jumps out; infrequent coverage fades back.

## Features

- **Frequency Map**: 20 agencies on one regional canvas, each route colored by scheduled headway tier (≤10m to infrequent). Pan across the entire GTHA like a single network.
- **Headway Tiers**: Two-phase GTFS analysis extracts per-direction departure times for each day type, applies configurable criteria, and assigns a tier — or flags routes as peak-only (span) vs. all-day-but-slow (infrequent).
- **Filtering**: Agency, mode (bus/rail/LRT), frequency ceiling, and day-of-week filters. Optional service span toggle hides peak-only and school-run routes.
- **Search**: Cross-agency route search by number or name, scoped to the current frequency filter.
- **Station View**: Click any stop to pin it and see every route serving it along with their current-day headways.
- **Live Adherence**: Real-time headway drift for covered routes (Burlington 1 & 10, Hamilton 01 & 10) via GTFS-RT TripUpdates — no background cron, fetched on demand.
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
