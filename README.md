# Atlas

A unified regional transit atlas — multiple analytical map views on processed GTFS from many agencies.

## Problem

Transit frequency data lives in separate GTFS feeds across many agencies, with no easy way to see the combined picture. Atlas pulls any number of feeds, runs a two-phase headway analysis, and renders all networks together on one continuous map. Routes are colored by how often service actually runs — frequent service stands out; infrequent service recedes.

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
