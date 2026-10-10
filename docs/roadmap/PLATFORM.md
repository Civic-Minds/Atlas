# Platform roadmap

Long-term direction for Atlas as a tool for transit planning and public accountability.

---

## History and change analysis

- [ ] **Before/after service change**: compare frequency maps across two schedule periods to show what changed and where — made possible once the History app has enough accumulated snapshots
- [ ] **Route history comparison**: let someone compare one route's frequency and service span over time; first build on dated route snapshots, then evaluate R2 Data Catalog for larger structured history rather than querying it directly from the app

---

## Public tools

- [ ] **Share a view**: shareable URL for a specific map state (agency, filter, zoom) — for advocacy, journalism, and public consultation. Partly in place: the URL already carries map position, zoom, filters, route, and stop; selected agencies are not in the URL yet
- [ ] **Multi-agency merged view**: combine adjacent regional agencies into a single continuous network (partially implemented already for the GTHA)

---

## Feed data confidence

- [ ] **Per-agency data confidence indicator**: surface feed health per agency (known override count, feed staleness via `lastRefreshedAt`, `feedReviewStatus`, `pmtilesPending`) as a transparency signal, not a comparative leaderboard — the messiest feeds are usually small/volunteer-run agencies, not incompetent ones. Idea prompted by the Niagara 301/401 investigation (#241/#242/#243), which surfaced several data-encoding quirks in one feed.

---

[Back to Roadmap](./ROADMAP.md)
