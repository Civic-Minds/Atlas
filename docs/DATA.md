# Data

Atlas is built from publicly available transit data and publishes the processing choices behind the map so the results can be understood and checked.

## Coverage and status

- **[Agencies](./AGENCIES.md)**: Current coverage, regions, feed metadata, and data status.
- **[Known issues](./KNOWN_ISSUES.md)**: Current data and coverage limitations.
- **[Agency backlog](./AGENCY_BACKLOG.md)**: Coverage expansion queue and discovery notes.

## Methodology

- **[Pipeline methodology](./PIPELINE.md)**: How Atlas processes GTFS and calculates frequency tiers.
- **[Route service metrics](./ROUTE_SERVICE_METRICS.md)**: Definitions and display semantics for route-level service metrics.

## Data freshness and review

- Atlas checks configured feeds during the weekly refresh and publishes the last successful schedule data it has.
- If a feed's `feed_end_date` has passed, Atlas keeps the data visible but marks the schedule as potentially outdated rather than silently removing the agency.
- New or changed schedule data may be marked as being verified while Atlas checks for missing service and known feed-quality problems.
- When a feed-specific correction is applied, the affected agency or route can show a public correction note explaining what changed.
- The map uses static GTFS schedule data unless a surface is explicitly marked Live; live vehicle and adherence data are limited to supported agencies and routes.

## Maintainer guides

- **[Adding agencies](./ADDING_AGENCIES.md)**: Contributor guide for onboarding a new transit agency.
- **[Pipeline operations](./PIPELINE_OPERATIONS.md)**: Contributor procedures for adding agencies, refreshing feeds, and publishing artifacts.
