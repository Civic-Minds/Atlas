# Atlas

A unified regional transit atlas — multiple analytical map views on processed GTFS from many agencies.

## Problem

Transit data is published agency by agency as GTFS feeds, so planners can't easily compare service across agencies or see how often a route really runs. Atlas puts any number of feeds on one continuous map, coloured by how often each route actually runs. Frequent service stands out. Everything else fades.

## Features

On the public site:

- **Frequency map**: Every route is coloured by a frequency tier worked out per direction from the feed's departure times. A route only earns a tier when every direction passes. Predictable time-limited service stays separate from genuinely irregular routes.
- **Filters**: By agency, mode (bus, rail, ferry and so on), frequency, day (weekday, Saturday, Sunday) and time of day. One setting hides one-off routes such as school runs.
- **Search**: Find a route across all agencies by number or name.
- **Route cards**: Click a route to see its headway through the day, direction by direction, with the periods it does not run regularly.
- **Stop view**: Click a stop to see every route serving it and its headways.
- **Agency pages**: A page per agency, an agencies index and area pages listing routes by weekday frequency. Agencies with expired feeds stay listed with a notice.
- **Map image export**: Download or share the current map as an image.

Beta only (not on the public site):

- **History**: How a route's frequency changed across archived schedule periods, for a handful of agencies with usable archives.
- **Compare mode**: Two synced maps side by side, each with its own day and time.
- **On-demand zones**: On-demand service areas and an On-demand filter.
- **Phone bottom sheet**: Route and stop cards open as a bottom sheet on phones.

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
