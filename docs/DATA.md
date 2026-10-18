# Data

Atlas is built from publicly available transit data and publishes the processing choices behind the map so the results can be understood and checked. This page is the index for Atlas data documentation.

## Where to find things

Data docs are listed once in the [documentation index](README.md): coverage and status (agencies, History coverage, Live polling, known issues), methodology (pipeline, route service metrics, display naming), and procedures (adding agencies, updating the map, coverage gap discovery, fixing issues). This page keeps only the History archive policy below.

## History archives

History is a curated view of past schedule periods. Coverage varies by agency and period, depending on the availability and quality of archived schedule data. The decision and its reasoning are in the [decision log](product/DECISIONS.md) (2026-07-29, Curate History around meaningful service change). In practice:

- Official agency feeds come first; Mobility Database (MDB) is the fallback.
- Each downloaded GTFS snapshot stays intact and is identified by the period it was valid for.
- Only periods with usable route-level data are selectable; a missing period stays unavailable rather than duplicated or inferred.
- Sacramento (SacRT) is the prototype for period-level materialization. `materializeAllPeriods` is a per-agency flag in `history/{slug}/coverage.json` that `build-history` reads; the MDB, MBTA, and NORTA backfill scripts set it for every agency they backfill.

## Procedures and maintenance

The operational pages above are the source of truth. Historical refresh reports and research notes should be read with their dates in mind.
