# Data

Atlas is built from publicly available transit data and publishes the processing choices behind the map so the results can be understood and checked.

## Current Coverage & Status

- **[Agencies](./AGENCIES.md)**: Current coverage and regions.
- **[Live polling](./LIVE_POLLING.md)**: Live GTFS-RT integration status — active/parked agencies, keys in hand, history archiving.
- **[Known issues](./KNOWN_ISSUES.md)**: Current data and coverage limitations.

## Expansion Planning

- **[Agency backlog](./AGENCY_BACKLOG.md)**: Coverage expansion queue and discovery notes.
- **[International expansion](./INTERNATIONAL.md)**: Country-by-country research and planning for coverage beyond Canada/US.

## Methodology

- **[Pipeline methodology](./PIPELINE.md)**: How Atlas processes GTFS and calculates frequency tiers.
- **[Route service metrics](./ROUTE_SERVICE_METRICS.md)**: Definitions and display semantics for route-level service metrics.
- **[Display naming](./DISPLAY_NAMING.md)**: Definitions and display semantics for agency name shortening and secondary text.

## Data freshness and review

- Atlas checks configured feeds during the weekly refresh and publishes the last successful schedule data it has.
- If a feed's `feed_end_date` has passed, Atlas keeps the data visible but marks the schedule as potentially outdated rather than silently removing the agency.
- New or changed schedule data may be marked as being verified while Atlas checks for missing service and known feed-quality problems.
- When a feed-specific correction is applied, the affected agency or route can show a public correction note explaining what changed.
- The map uses static GTFS schedule data unless a surface is explicitly marked Live; live vehicle and adherence data are limited to supported agencies and routes.

## Procedures and maintenance

- **[Adding Agencies](./ADDING_AGENCIES.md)**: Contributor procedure for onboarding one new agency (or a small batch).
- **[Updating the Map](./MAP_UPDATES.md)**: Refreshing feeds and publishing artifacts for already-live agencies.
- **[Coverage Gap Discovery](./COVERAGE_GAP_DISCOVERY.md)**: Finding new agency candidates and looking up their feeds.
