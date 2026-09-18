# System-map verification audit

This is the map-first verification layer for the Frequent Service research story. It is separate from the broader agency catalog because the story’s verified claims must come from official system maps, not inferred service bands or planning documents.

## Current sample

The current sample contains the first 250 agencies in catalog order. Records 1–50 are the first batch, records 51–100 are the second batch, records 101–150 are the third batch, and records 151–250 are the fourth batch. Each record begins as `pending_map_review` and must be updated only after the official system map or an approved official rider-facing definition is reviewed.

## Evidence standard

Official system maps are preferred evidence. When the current map is unavailable or insufficient, an official rider-facing service-definition page may be used and its source type must be recorded. Record the exact wording, source URL, map/page location, threshold/range, span, days, geography, and mode. Preserve a local copy in `/Users/ryan/Desktop/Data/System Maps/Atlas Frequent Service/` when practical, and record the filename in the audit database.

Planning documents, route pages, schedules, and generic service bands may explain context, but they do not establish that an agency defines service as “frequent.”

## Statuses

- `numeric_definition_on_map`: the map names frequent/high-frequency service and gives a number or range.
- `qualitative_definition_on_map`: the map names frequent/high-frequency service without a number.
- `no_definition_on_map`: the map was reviewed and does not name a frequent/high-frequency definition.
- `map_unavailable`: no official map could be located or accessed.
- `numeric_definition_on_official_page`: an official rider-facing page names frequent/high-frequency service and gives a number or range when the map is unavailable or insufficient.
- `qualitative_definition_on_official_page`: an official rider-facing page names frequent/high-frequency service without a number when the map is unavailable or insufficient.
- `no_definition_on_official_page`: the reviewed official rider-facing material does not name a frequent/high-frequency definition.
- `pending_map_review`: not yet reviewed.

## Representative threshold

Every named frequent/high-frequency tier is retained in the record. The aggregate chart counts an agency once using its general or representative frequent tier. Express, peak-only, rail-only, and other secondary tiers remain in the audit as context. If no representative tier can be selected without interpretation, the agency is excluded from the numeric chart rather than assigned an inferred number.
