# Product Roadmap

User experience and the workflow of a transit professional using Atlas.

---

## Map Apps

| App | Status | Question it answers |
|-----|--------|---------------------|
| **Frequency Map** | Live | Where is service frequent or infrequent? |
| **Corridors** | Live (v2.3.0) | What runs directly between these two stations? |
| **History** | Planned | How did service change across schedule periods? |

**Bar for a new app:** needs the map + Atlas-processed data, and answers a question the Frequency Map can't answer cleanly. Otherwise it's a panel, toggle, or filter.

---

## Live Data Layer (Next)

- [ ] **Live vehicle map**: extend GTFS-RT archiver Worker to write vehicle position snapshots per agency; frontend polls for live positions
- [ ] **Schedule adherence panel**: per-stop comparison of scheduled vs. actual headway — start with Hamilton B-Line and Burlington Route 1
- [ ] **Historical drift analysis**: combine archived snapshots with on-demand TripUpdates to surface patterns over time (e.g. "always 5 min late on Tuesdays at this stop")

---

## Design Principles

- Every view should be usable by a transit planner without data science training
- Default performance metric is headway consistency, not timepoint adherence — headway is what passengers experience

---

[Back to Roadmap](../ROADMAP.md)
