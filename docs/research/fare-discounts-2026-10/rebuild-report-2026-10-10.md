# Fare-discount rebuild report

The dated CSVs (`fare-discounts-B01-2026-10-10.csv` through `fare-discounts-B21-2026-10-10.csv`) are the canonical output set.

## Final audit

- 21 batches present; 640 rows across 549 unique agency slugs, matching `agencies.csv` exactly.
- 592 rows are `verified-official`.
- 6 rows are `partial-official`, with the limitation recorded in the row rather than presented as fully verified.
- 42 rows are `none-found`; each has at least two official pages recorded in `pagesSearched`.
- 0 rows remain `not-yet-checked` in the dated output set.
- 0 duplicate `(batch, slug, programId)` keys remain.
- 0 verified rows have a blank or `not found` program name, eligibility, discount type, discount amount, administering body, source URL, or evidence field.
- Paratransit-only evidence was excluded from in-scope fare rows; Mason City and Lafayette, Louisiana are not represented as verified fixed-route discounts.

## Batch totals

| Batch | Rows | Agencies | Verified | Partial | None found |
|---|---:|---:|---:|---:|---:|
| B01 | 57 | 27 | 46 | 0 | 11 |
| B02 | 16 | 15 | 12 | 0 | 4 |
| B03 | 43 | 28 | 42 | 0 | 1 |
| B04 | 27 | 27 | 27 | 0 | 0 |
| B05 | 35 | 26 | 34 | 0 | 1 |
| B06 | 23 | 23 | 23 | 0 | 0 |
| B07 | 42 | 29 | 42 | 0 | 0 |
| B08 | 36 | 30 | 35 | 0 | 1 |
| B09 | 31 | 31 | 30 | 0 | 1 |
| B10 | 28 | 28 | 28 | 0 | 0 |
| B11 | 32 | 31 | 31 | 0 | 1 |
| B12 | 21 | 21 | 19 | 1 | 1 |
| B13 | 37 | 30 | 35 | 1 | 1 |
| B14 | 22 | 22 | 20 | 2 | 0 |
| B15 | 34 | 27 | 18 | 0 | 16 |
| B16 | 20 | 20 | 20 | 0 | 0 |
| B17 | 35 | 35 | 33 | 0 | 2 |
| B18 | 11 | 11 | 11 | 0 | 0 |
| B19 | 35 | 35 | 35 | 0 | 0 |
| B20 | 25 | 25 | 25 | 0 | 0 |
| B21 | 30 | 28 | 26 | 2 | 2 |

## Material corrections

- Re-researched the previously incomplete B04-B21 shells and populated the required fields for verified rows.
- Corrected false or unsupported findings for CUE, WVU PRT, Saint-Jean-sur-Richelieu, GET Bakersfield, Clemson CATbus, Tampa SkyConnect, MARTA, UP Express, BC Transit, exo, and SMART Telluride.
- Removed duplicate CUE/WVU rows and excluded Mason City ADA paratransit from fixed-route fare research.
- Removed 77 repeated agency-program rows, restored Fredericksburg, GRTC, and Radford, and moved the stale undated B07 CSV into `archive-stale/`.
- Replaced known paraphrased or mis-cited evidence for Redwood Coast, RiverCities, TriMet, Durango, and Metra with source-specific evidence.
- Recorded incomplete amount/eligibility findings as `partial-official` instead of treating them as fully verified.
