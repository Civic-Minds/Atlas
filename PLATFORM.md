# Atlas Platform

The Atlas platform eliminates the guesswork in transit planning — providing a unified intelligence layer that bridges the gap between what is scheduled and what actually happens on the street.

Each component owns a distinct layer of the transit data stack.

---

## Components

**[Atlas Frontend](src/)** is the intelligence dashboard. It owns the visual expression of reliability — heatmaps, performance tables, and live vehicle maps. It is designed for transit planners to identify friction at a glance.

**[Atlas Server](server/)** is the ingestion and processing engine. It manages continuous GTFS-RT polling, correlates GPS pings with static schedules via the Matcher Service, and exposes the REST API. It is the persistent source of truth for North American metro mobility.

**[Matcher Engine](server/src/intelligence/matcher.ts)** is the R&D core. It solves the "Trip Assignment Problem" — assigning raw vehicle positions to scheduled blocks even when feed quality is degraded or trip IDs are missing.

---

## How They Connect

```
GTFS-RT Feeds (Multi-Agency)
  → Atlas Server: Continuous polling + historical snapshotting
      → Matcher Engine: Trip assignment + delay derivation
          → Static DB: Correlate with imported GTFS schedules
              → Intelligence API: Surface performance metrics

Atlas Frontend (React)
  → REST API: Consumes aggregated intelligence
      → Performance View: Tabular & visual reliability audits
      → Pulse Module: Real-time network health heatmaps
      → Map View: Live vehicle presence across the fleet
```

---

## Product Surface

Atlas is an agency-first platform. Planners log in to their specific agency context but can toggle to "Regional View" to see how their network interacts with neighboring providers.

The core value is **Mobility Precision**: moving beyond "Is the bus there?" to "Why is this corridor consistently 4 minutes slow at 5 PM?"

---

## Mobility Precision (Scoring)

Intelligence in Atlas is derived at the point of ingestion to ensure low-latency feedback for planners:

- **The Matcher Engine** runs a lightweight correlation at ingestion time — assigning GPS pings to scheduled trips. This produces the raw `delay_seconds` metric.
- **The Intelligence Service** performs the deep analytical aggregation (e.g., ghost-trip identification, corridor reliability) over 24-hour and 30-day windows.

There is no duplicate processing. The Matcher assigns; the Service analyzes.

---

## Roadmaps

Each layer of the platform maintains its own technical trajectory.

- [Vision Roadmap](docs/VISION.md)
- [Product Roadmap](docs/ROADMAP_PRODUCT.md)
- [Technical Roadmap](docs/ROADMAP_TECHNICAL.md)
- [NextGen R&D](docs/ROADMAP_NEXTGEN.md)
