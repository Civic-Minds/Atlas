# Data

Atlas is built from publicly available transit data and publishes the processing choices behind the map so the results can be understood and checked. This page is the index for Atlas data documentation.

## Current Coverage & Status

- **[Agencies](data/AGENCIES.md)**: Current coverage and regions.
- **[Live Polling](operations/LIVE_POLLING.md)**: Live GTFS-RT integration status — active/parked agencies, keys in hand, history archiving.
- **[History Coverage](data/DATA_HISTORY.md)**: Historical headway snapshots backfill log, candidate systems, and deferred agencies.
- **[Known Issues](operations/KNOWN_ISSUES.md)**: Current data and coverage limitations.

## Expansion Planning

- **[Agency Backlog](data/AGENCY_BACKLOG.md)**: Coverage expansion queue and discovery notes.

## Methodology

- **[Pipeline Methodology](data/PIPELINE.md)**: How Atlas processes GTFS and calculates frequency tiers.
- **[Route Service Metrics](data/ROUTE_SERVICE_METRICS.md)**: Definitions and display semantics for route-level service metrics.
- **[Display Naming](data/DISPLAY_NAMING.md)**: Definitions and display semantics for agency name shortening and secondary text.

## Freshness, quality, and operations

- **[Data Principles](data/DATA_PRINCIPLES.md)**: How Atlas approaches freshness, review, corrections, and static versus live data.
- **[Adding Agencies](data/ADDING_AGENCIES.md)**: Contributor procedure for onboarding one new agency or a small batch.
- **[Updating the Map](data/MAP_UPDATES.md)**: Refreshing feeds and publishing artifacts for already-live agencies.
- **[Coverage Gap Discovery](data/COVERAGE_GAP_DISCOVERY.md)**: Finding new agency candidates and looking up their feeds.
- **[Fixing Issues](engineering/FIXING_ISSUES.md)**: Scoping a fix to its blast radius and choosing the pipeline/data or UI validation runbook.

## History Archives

History is a curated view of past schedule periods. Coverage varies by agency
and period, depending on the availability and quality of archived schedule data.

For historical periods Atlas publishes:

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

Sacramento (SacRT) is the prototype for period-level materialization: its
official archive contains multiple dated periods, including periods with
unchanged route values. The `materializeAllPeriods` build flag is merged and
available per-agency, pending a decision on the date-level UI and storage
costs before enabling it more broadly.

## Procedures and maintenance

The operational pages above are the source of truth. Historical refresh reports and research notes should be read with their dates in mind.
