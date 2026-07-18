# Technical Roadmap

Engineering direction for Atlas infrastructure and the live data layer.

---

## Live Data Infrastructure

The goal is to make Atlas a stable live-data provider for multiple products without
forcing each consumer to poll GTFS-RT or access private R2. Replay is the validation
surface; derived operational semantics remain in consumers unless broadly reusable.

- [x] **Versioned canary snapshots**: publish normalized VehiclePositions and TripUpdates envelopes with freshness/error states.
- [x] **Replay access**: expose bounded snapshot history for deterministic consumer validation.
- [ ] **Canary validation**: verify feed health, schema, replay completeness, and Bridge integration before adding routes or agencies.
- [x] **Canary verification command**: `npm run verify:live-contract` checks the deployed provider contract and fails closed when live or replay data is unavailable.
- [ ] **Consumer contract tests**: run Atlas fixtures through Bridge's adapter and analysis boundary.
- [ ] **Add Neon Postgres**: serverless Postgres for structured adherence events — (agency, route, stop, scheduled time, actual time, day of week, period). Neon scales to zero when idle, no always-on instance needed.
- [ ] **Trip-matching logic**: match observed vehicle positions to scheduled trips using GTFS static data to derive delay in seconds per stop visit
- [ ] **Adherence event writer**: on each poll, derive stop-level delay and write rows to Postgres alongside the raw R2 archive

Why Postgres and not just R2: R2 is a file store, not a query engine. Pattern questions ("always late Tuesdays") require aggregating across thousands of observations — that needs SQL.

---

## Later

- [ ] **Data retention**: define pruning window for raw R2 `.pb` files; aggregate into daily summaries after 90 days
- [ ] **Expand Worker coverage**: add routes/agencies only after the canary expansion gate passes
- [ ] **Trip-matching confidence score**: flag observations where the vehicle-to-trip match is uncertain, so low-quality matches don't pollute performance metrics

---

## Rendering & Visualization

- [x] **Deck.gl vehicle rendering**: current vehicle positions use GPU-rendered Deck.gl layers over MapLibre.
- [ ] **Archived vehicle path animation**: use `TripsLayer` to animate vehicle paths over time from the `atlas-live` archive.
- [ ] **Line offsets for overlapping routes**: when multiple routes share the same road segment, offset each line laterally so they render as parallel bands rather than stacked on top of each other. Requires pre-computing overlap groups in the pipeline and storing an `offsetIndex` property in PMTiles features, then using MapLibre's `line-offset` paint expression.

---

## Pipeline & CI

- [ ] **Split weekly feed refresh per country/region**: currently one combined `refresh-feeds.yml` job refreshes all 466 agencies together, so one bad feed can't easily be isolated or re-run independently. Splitting refresh by country wouldn't fully decouple things on its own, though — `build-pmtiles` still merges every agency into one combined tileset regardless of how refresh is split, so this needs a real design (does PMTiles building become incremental/per-region too, or stay combined?) before it's an actionable task. Prompted by considering UK/Europe as a new region to validate.

## Data Quality

- [ ] **Per-agency name normalizer**: `titleCase(str, agencyAcronyms?)` accepts an optional agency-specific acronym map merged with the global `TRANSIT_ACRONYMS` table at call time. Rules live in a `nameAcronyms` field per agency in `index.json` (only agencies that need overrides add an entry). Fixes cases where the global table is wrong for a specific agency — e.g. "St" means Street in most stop names, but GO Transit uses "ST" as the Stouffville line code. Currently handled by excluding the entry globally; per-agency injection would let GO use the override without affecting every other agency.

---

## Data & Analysis

- [ ] **Transit isochrones**: "how far can you reach in 30 min by transit?" Compute travel-time matrices from GTFS using OpenTripPlanner or Valhalla (self-hosted or managed). Render as a filled polygon overlay on the map. Shows algorithmic depth beyond visualization.
- [ ] **Census / equity overlay**: join frequency scores to US Census tract data (income, car-ownership, density) via the Census API. Color tracts by transit access vs. need, surface which communities are under-served. Turns Atlas from a visualization into a planning analysis tool — directly relevant to urban planning work.

---

[Back to Roadmap](./ROADMAP.md)
