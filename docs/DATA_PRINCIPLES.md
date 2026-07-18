# Data Principles

Atlas is built from publicly available transit data and publishes the processing choices behind the map so the results can be understood and checked.

## Freshness and continuity

- Atlas checks configured feeds during the weekly refresh and publishes the last successful schedule data it has.
- If a feed's `feed_end_date` has passed, Atlas keeps the data visible but marks the schedule as potentially outdated rather than silently removing the agency.
- New or changed schedule data may be marked as being verified while Atlas checks for missing service and known feed-quality problems.

## Corrections and provenance

- Feed-specific corrections are tied to the affected snapshot and clear when a new feed arrives.
- When a correction is applied, the affected agency or route can show a public correction note explaining what changed.
- Data-quality issues are documented as limitations of the source or processing, not hidden when they affect interpretation.

## Static and live data

- The map uses static GTFS schedule data unless a surface is explicitly marked Live.
- Live vehicle and adherence data are limited to supported agencies and routes with verified feed coverage.
- Schedule and real-time results should remain distinguishable so observed service is not mistaken for published service.

## Why this matters

Atlas aims to keep imperfect data useful without presenting it as more current, complete, or precise than it is. Continuity helps users find agencies even when feeds expire; visible review states and corrections help them judge whether the result is trustworthy.

[Back to Data](./DATA.md)
