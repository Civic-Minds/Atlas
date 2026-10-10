# Atlas

A unified regional transit atlas — multiple analytical map views on processed GTFS from many agencies.

## Problem

GTFS feeds are scattered — one per agency, with no way to see a whole region's service at a glance. Atlas pulls any number of feeds onto one continuous map, colored by how often each route actually runs. Frequent service stands out. Everything else fades.

## Features

- **Frequency Tiers**: Two-phase GTFS analysis extracts per-direction departure times for each day type, assigns frequency tiers, and separates predictable time-limited service from genuinely irregular routes.
- **Filtering**: By agency, mode (bus/rail/etc.), frequency ceiling, and day of week. Optional irregular-service toggle hides exceptional and school-run routes while keeping predictable time-limited service visible.
- **Search**: Cross-agency route search by number or name, scoped to the current frequency filter.
- **Station View**: Click any stop to pin it and see every route serving it along with their current-day headways.
- **Corridors**: Station-to-station lookup — find direct routes between two stops with headway at the destination; off in every deployment for now.
- **Live Adherence**: Planned real-time headway drift for supported routes via GTFS-RT TripUpdates; paused.
- **History**: How each route's frequency changed across archived schedule periods; limited to agencies with usable archives and beta-only.
- **Agency Browser**: Browse all agencies with region filters, search, and a detail card showing routes by frequency and, when Live is on, live tracking status.

## Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, React Router, IndexedDB caching
- **Mapping**: MapLibre GL JS, deck.gl, PMTiles
- **Pipeline**: Node.js / tsx, JSZip, PapaParse, GTFS-Realtime protobuf bindings, Tippecanoe
- **Infrastructure**: Vercel (hosting), Cloudflare R2 (public map artifacts, private GTFS and history archives, retained GTFS-RT snapshots), Cloudflare Workers (legacy background GTFS-RT archiver), GitHub Actions (weekly refresh, temporarily paused)
- **Analytics**: Google Analytics 4 for privacy-conscious feature usage measurement, Vercel Web Analytics and Speed Insights for page views and real-user performance
- **Testing**: Vitest

---

- [Roadmap](./docs/roadmap/ROADMAP.md)
- [Documentation](./docs/README.md)
- [Data](./docs/DATA.md)
- [Changelog](./CHANGELOG.md)

Created by Civic Minds
