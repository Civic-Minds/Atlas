# Data

Atlas is built from publicly available transit data and publishes the processing choices behind the map so the results can be understood and checked. This page is the index for Atlas data documentation.

## Current Coverage & Status

- **[Agencies](./AGENCIES.md)**: Current coverage and regions.
- **[Live Polling](./LIVE_POLLING.md)**: Live GTFS-RT integration status — active/parked agencies, keys in hand, history archiving.
- **[Known Issues](./KNOWN_ISSUES.md)**: Current data and coverage limitations.

## Expansion Planning

- **[Agency Backlog](./AGENCY_BACKLOG.md)**: Coverage expansion queue and discovery notes.
- **[International Expansion](./INTERNATIONAL.md)**: Country-by-country research and planning for coverage beyond Canada/US.

## Methodology

- **[Pipeline Methodology](./PIPELINE.md)**: How Atlas processes GTFS and calculates frequency tiers.
- **History archives**: How Atlas selects, sources, and stores historical GTFS service periods.
- **[Route Service Metrics](./ROUTE_SERVICE_METRICS.md)**: Definitions and display semantics for route-level service metrics.
- **[Display Naming](./DISPLAY_NAMING.md)**: Definitions and display semantics for agency name shortening and secondary text.
- **[Population Context](./DATA_POPULATION.md)**: Proposed population-density data layer and its relationship to transit frequency.
- **[Frequent Network Criteria](./DATA_FREQUENT_NETWORK.md)**: Proposed "Frequent" tool (Night Service's daytime counterpart) and the cross-agency research needed before picking a threshold.

## Data Freshness & Review

- **[Data Principles](./DATA_PRINCIPLES.md)**: How Atlas approaches freshness, review, corrections, and static versus live data.
- **[Known Issues](./KNOWN_ISSUES.md)**: Feed limitations, data quirks, and known coverage gaps.
- **[Adding Agencies](./ADDING_AGENCIES.md)**: Refresh, review, correction, and publication procedures.
- **[Live Polling](./LIVE_POLLING.md)**: Freshness and coverage details for real-time vehicle and adherence data.

## Procedures & Maintenance

- **[Adding Agencies](./ADDING_AGENCIES.md)**: Contributor procedure for onboarding one new agency (or a small batch).
- **[Updating the Map](./MAP_UPDATES.md)**: Refreshing feeds and publishing artifacts for already-live agencies.
- **[Coverage Gap Discovery](./COVERAGE_GAP_DISCOVERY.md)**: Finding new agency candidates and looking up their feeds.
- **[Fixing Issues](./FIXING_ISSUES.md)**: Scoping a fix to its blast radius (single agency, a group, or all agencies) and validating accordingly.

## History Archives

History is a curated static-schedule feature, not an automatic archive of every
agency. Atlas prioritizes cities where historical feeds can show meaningful
network or service changes; it does not need to backfill all 400+ cities.

For each selected agency:

- Use the agency’s official current and historical feeds first. Use Mobility
  Database (MDB) as a fallback when the official archive is unavailable or
  incomplete.
- Keep each downloaded GTFS snapshot intact and identify it by the period for
  which it was valid. Do not delete old local feeds or pretend one file covers
  multiple periods merely because its contents are unchanged.
- Store compact route-level history snapshots for distinct archived periods.
  Change-only snapshots are sufficient for ordinary history; period-level
  materialization is appropriate when the UI needs to let riders inspect each
  documented schedule period, including periods where a route’s value did not
  change.
- Show only periods for which Atlas has usable route-level data. A coverage
  record may document that an archive exists, but it does not fabricate route
  facts or make a missing period selectable.

Sacramento (SacRT) is the prototype for period-level materialization. Its
official archive contains multiple dated periods, including periods with
unchanged route values; the experiment lives on the
`experiment/sacrt-history-periods` branch until the date-level UI and storage
costs are evaluated.
