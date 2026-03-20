# Roadmap

Atlas is a high-fidelity transit intelligence platform that automates network auditing, impact simulation, and strategic optimization. This roadmap outlines our path from a technical validation tool to a comprehensive mobility governance layer.

- **[Vision](docs/VISION.md)**: Product vision statement and long-term "North Star" goals.
- **[Product](docs/ROADMAP_PRODUCT.md)**: Feed management, verification workflows, and interactive analysis features.
- **[Technical](docs/ROADMAP_TECHNICAL.md)**: Analysis engine refinement, GTFS-RT integration, and infrastructure scaling.
- **[Platform](docs/ROADMAP_PLATFORM.md)**: Long-term equity modeling, generative network synthesis, and ecosystem initiatives.

---

## Current State (v0.10.0)

Atlas currently provides a robust foundational pipeline for GTFS data processing and route-level verification:

*   **GTFS Orchestration**: Multi-agency ZIP parsing with support for complex calendar exceptions and feed versioning.
*   **Two-Phase Analysis Engine**: Raw departure extraction optimized via Web Workers, followed by instant policy-based tier classification.
*   **Persistent Route Catalog**: IndexedDB-backed storage with schedule change detection and historical preservation.
*   **Verification Workflow**: Per-route audit views with high-precision headway timelines, gap distribution charts, and provenance tracking.

---

[Back to Home](./README.md)
