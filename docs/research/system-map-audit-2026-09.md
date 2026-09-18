# System-map verification audit

This is the map-first verification layer for the Frequent Service research story. It is separate from the broader agency catalog because the story’s verified claims must come from official system maps, not inferred service bands or planning documents.

## First batch

The first batch contains the first 50 agencies in catalog order. Each record begins as `pending_map_review` and must be updated only after the official system map is opened and checked.

## Evidence standard

Only an official system map can produce a verified chart result. Record the exact wording, map date, page or legend location, threshold/range, span, days, geography, and mode. Preserve a local copy in `/Users/ryan/Desktop/Data/System Maps/Atlas Frequent Service/` when practical, and record the filename in the audit database.

Planning documents, route pages, schedules, and generic service bands may explain context, but they do not establish that an agency defines service as “frequent.”

## Statuses

- `numeric_definition_on_map`: the map names frequent/high-frequency service and gives a number or range.
- `qualitative_definition_on_map`: the map names frequent/high-frequency service without a number.
- `no_definition_on_map`: the map was reviewed and does not name a frequent/high-frequency definition.
- `map_unavailable`: no official map could be located or accessed.
- `pending_map_review`: not yet reviewed.
