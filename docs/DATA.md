# History archive policy

How Atlas chooses and keeps the past schedule periods that History shows. Every other data doc is listed in the [documentation index](README.md).

History is a curated view of past schedule periods. Coverage varies by agency and period, depending on the availability and quality of archived schedule data. The decision and its reasoning are in the [decision log](product/DECISIONS.md) (2026-07-29, Curate History around meaningful service change). In practice:

- Official agency feeds come first; Mobility Database (MDB) is the fallback.
- Each downloaded GTFS snapshot stays intact and is identified by the period it was valid for.
- Only periods with usable route-level data are selectable; a missing period stays unavailable rather than duplicated or inferred.
- Sacramento (SacRT) is the prototype for period-level materialization. `materializeAllPeriods` is a per-agency flag in `history/{slug}/coverage.json` that `build-history` reads; the MDB, MBTA, and NORTA backfill scripts set it for every agency they backfill.
