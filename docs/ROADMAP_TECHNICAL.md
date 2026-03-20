# Technical Roadmap

This roadmap outlines the evolution of the Atlas analysis engine and infrastructure scaling.

## Analysis Engine
- [ ] **Geometric Engine**: Optimization of shape calculation and distance-based stop clustering for more accurate "isochrone" and "spacing" results.
- [ ] **RT Adaptation (GTFS-RT)**: Transition from static schedule analysis to live performance monitoring via VehiclePositions and TripUpdates feeds.
- [ ] **Service ID Logic Refinement**: Support for complex calendar exceptions and multi-day service period overlaps in the raw departure extractor.

## Authentication
- [x] **Firebase Auth** (email/password + GitHub OAuth): Replace the current toggle-based auth with real Firebase sessions. Firebase is the chosen provider for auth across all Civic Minds projects.
- [ ] **User Profiles**: Persist per-user preferences and catalog filters in Firestore once auth is live.

## Infrastructure & Scaling
- [ ] **Cloud Catalog (MongoDB Atlas)**: Migrate the IndexedDB route catalog to MongoDB Atlas (GitHub Student Pack). Document model maps 1:1 to `CatalogRoute`. Enables multi-device and team access.
- [ ] **GTFS File Storage (Cloudflare R2)**: Store raw GTFS ZIPs per-agency in R2 (zero-egress, S3-compatible). Enables re-analysis without re-upload and shared feed library.
- [ ] **Worker Parallelization**: Offloading complex geometric queries to dedicated Web Workers to maintain 60FPS UI responsiveness during large-scale network screenings.
- [ ] **API Access**: Programmatic interface for exporting verified frequency tiers and reliability scores to external planning tools.

## Validation & Compliance
- [ ] **Spec Compliance Suite**: Deep validation of agency_id referential integrity and shape geometry health.
- [ ] **Failure Point Mapping**: Automated "sanity checks" that flag statistically impossible headways or suspicious schedule patterns before they hit the catalog.

---

[Back to Roadmap](../ROADMAP.md)
