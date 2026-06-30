# Roadmap

Atlas is a regional transit atlas: GTFS feeds → processed GeoJSON on Cloudflare R2, rendered by a React + Leaflet frontend. Coverage extends outward from the Greater Golden Horseshoe — Buffalo, London, Kingston, Montreal, and more on one continuous map.

- **[Vision](docs/VISION.md)**: Product philosophy — frequency mapping to live performance evidence and long-term accumulation of real service data.
- **[Features](./README.md#features)**: Headway tiers, filtering, search, station view, corridors, live adherence, history, agency browser.
- **[Agencies](docs/AGENCIES.md)**: Current coverage, regions, and feed metadata.

**Current focus:** Corridors app live. History and live data layers expanding. Exploring the new Factbook for data-driven insights and stories.

### Strategy & Direction
- **[Research](docs/RESEARCH.md)**: Agency pain points and problem statements (broken metrics, data silos, evidence gaps for planning).
- **[Strategy](docs/STRATEGY.md)**: Competitive landscape and long-term product positioning.
- **[Factbook (proposed)](docs/ROADMAP_FACTBOOK.md)**: Atlas Factbook — surfacing data-driven findings, service change stories, frequency realities, corridors, and AI-assisted narratives.

### Product & Platform
- **[Product](docs/ROADMAP_PRODUCT.md)**: Map apps (Frequency Map, Corridors, History, Factbook/Insights), live data layer, filters, design principles.
- **[Technical](docs/ROADMAP_TECHNICAL.md)**: Infrastructure stack, GTFS-RT archiving, live data infrastructure (workers, databases, trip matching).
- **[Platform](docs/ROADMAP_PLATFORM.md)**: History & change analysis, public tools (shareable views, multi-agency merges).

### Operations & Documentation
- **[Pipeline](./PIPELINE.md)**: GTFS processing, weekly refresh, history builds, and supporting scripts.
- **[Changelog](./CHANGELOG.md)**: Detailed release notes and all notable changes.

---

[Back to Home](./README.md)
