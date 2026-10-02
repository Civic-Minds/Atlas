# Atlas Fare Inventory (2026-09-30)

This dated ledger combines GTFS supporting evidence, official-site discovery, and individually verified official fares for all 693 agencies in the Atlas registry.

## Current status

- Individually verified official fares: 504
- Official pages found but still requiring manual fare verification: 0
- GTFS-only or not yet matched to an official fare source: 0
- Official-site inaccessible: 44
- No official fare page found: 113
- No official website: 32

## Targeted second pass

The second-pass site review checked 190 highest-priority unresolved agencies. Its outcome file records 1 newly verified official fares, 2 candidates needing manual interpretation, 112 pages without a fare source, 43 inaccessible sites, and 32 agencies without an official website. Raw page evidence is stored in fare-second-pass-site-review.json and interpreted outcomes in fare-second-pass-review.json.

An agency is not called free merely because its GTFS feed contains a zero fare. GTFS values remain supporting evidence unless an official source verifies the rider-facing fare.

The JSON contains the complete evidence, including candidate official pages and the separately marked verified fare record. The CSV is the review table.
