# Atlas

A unified regional transit atlas — multiple analytical map views on processed GTFS from many agencies.

## Problem

GTFS feeds are scattered — one per agency, with no way to see a whole region's service at a glance. Atlas pulls any number of feeds onto one continuous map, colored by how often each route actually runs. Frequent service stands out. Everything else fades.

## Features

- **Headway Tiers**: Two-phase GTFS analysis extracts per-direction departure times for each day type, assigns frequency tiers, and separates predictable time-limited service from genuinely irregular routes.
- **Filtering**: By agency, mode (bus/rail/etc.), frequency ceiling, and day of week. Optional irregular-service toggle hides exceptional and school-run routes while keeping predictable time-limited service visible.
- **Search**: Cross-agency route search by number or name, scoped to the current frequency filter.
- **Station View**: Click any stop to pin it and see every route serving it along with their current-day headways.
- **Corridors**: Station-to-station lookup — find direct routes between two stops with headway at the destination.
- **Live Adherence**: Real-time headway drift for supported routes via GTFS-RT TripUpdates — fetched on demand.
- **History**: Week-over-week schedule adherence patterns from a background archiver; shows how reliably a route runs across days and times.
- **Agency Browser**: Browse all agencies with region filters, search, and a detail card showing routes by frequency and live tracking status.

## Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, React Router, IndexedDB caching
- **Mapping**: MapLibre GL JS, deck.gl, PMTiles
- **Pipeline**: Node.js / tsx, JSZip, PapaParse, GTFS-Realtime protobuf bindings, Tippecanoe
- **Infrastructure**: Vercel (hosting + serverless API routes), Cloudflare R2 (public map artifacts and private GTFS-RT archives), Cloudflare Workers (background GTFS-RT archiver), GitHub Actions (weekly refresh)
- **Analytics**: Google Analytics 4 for privacy-conscious feature usage measurement, Vercel Speed Insights for real-user performance
- **Testing**: Vitest

---

- [Roadmap](./docs/roadmap/ROADMAP.md)
- [Documentation](./docs/README.md)
- [Data](./docs/DATA.md)
- [Changelog](./CHANGELOG.md)

Created by Civic Minds
