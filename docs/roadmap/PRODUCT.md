# Product Roadmap

User experience and the workflow of a transit professional using Atlas.

---

## Current app surfaces

- **Frequency Map — Live:** Where is service frequent or infrequent?
- **Live Vehicles — Live:** Where are supported vehicles now, and how are routes performing?
- **History — Limited:** How did service change across schedule periods?
- **Corridors — Contextual:** Which routes connect two selected stations? Available from stop-level interactions rather than primary navigation.
- **Fares — Paused:** What base fare is associated with a route?

**Bar for a new app:** needs the map + Atlas-processed data, and answers a question the Frequency Map can't answer cleanly. Otherwise it's a panel, toggle, or contextual mode.

## Future product concepts

- **Factbook / Insights — Proposed:** What surprising or useful stories does the data contain?

---

## Live Data Layer (Expanding)

- [x] **Live vehicle map**: live vehicle positions for configured agencies; the frontend polls supported feeds while the map is open
- [x] **Schedule adherence panel**: on-demand comparison of scheduled vs. actual headway for supported routes
- [ ] **Historical drift analysis**: combine archived snapshots with on-demand TripUpdates to surface patterns over time (e.g. "always 5 min late on Tuesdays at this stop")

---

## Map & Filter Improvements

- [ ] **Customizable time period hour ranges**: TIME_PERIODS drives both the pipeline and frontend filter. Per-user hour overrides would work as a display preference via the headwayByHour fallback path — e.g. letting someone define "my commute is 7:30–9am" and see headways for exactly that window. Would not affect baked tile colors but would work for card display and route filtering.
- [ ] **Bus sub-type filter**: distinguish Express, BRT, and Long-distance bus from local bus in the Mode filter
- [ ] **On-demand transit zones**: show flex/microtransit service areas on the map alongside fixed routes, using GTFS-Flex zone geometry and service hours (no booking rules needed)
- [ ] **Ferries**: Toronto Island Ferry and Montreal navettes fluviales — contingent on GTFS feed availability

---

## Design Principles

- Every view should be usable by a transit planner without data science training
- Default performance metric is headway consistency, not timepoint adherence — headway is what passengers experience

---

[Back to Roadmap](./ROADMAP.md)
