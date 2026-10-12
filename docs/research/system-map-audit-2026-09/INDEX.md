# System-map audit

**Status:** Research complete for the reviewed sample. Duplicates merged on
2026-10-11.

## Research question

What do current official system maps call frequent service, and what thresholds
or service spans do those maps actually publish?

## Sample

317 unique agencies in 40+ countries, reviewed against current official system
maps or approved rider guides on September 18–19, 2026.

- The earlier "142 agencies" figure was out of date. The file held 337 records.
- 20 pairs of those records were the same Atlas agency under two IDs (for
  example `calgary` and `calgary-transit`), so the beta frequent-service story
  counted them twice.
- 179 of the 317 match an Atlas registry agency, through
  [atlas-agency-map.json](../frequent-service-research-2026-09/atlas-agency-map.json).
- 119 are in countries Atlas does not cover.
- 19 are North American or French agencies with no registry agency.

## Method

Use a current official system map, map legend, or approved rider-guide map as
the evidence standard. Retain every named map-defined tier and use a general or
representative tier only for aggregate charts. A map must name frequent or
high-frequency service; unnamed frequency bands do not count.

On 2026-10-11,
[`scripts/merge-system-map-audit-atlas-duplicates.mjs`](../../../scripts/merge-system-map-audit-atlas-duplicates.mjs)
merged the 20 duplicate pairs into one record each and added `atlasSlugs` to
every record.

- Six pairs disagreed on status: yrt, rtd-denver, burlington, cincinnatimetro,
  gcrta and cdta.
- For those, the narrower result was kept. The record is marked
  `conflictingSources`, and `conflictResolution` gives the reason.

## Results and interpretation

| Status | Agencies |
|---|---:|
| `numeric_definition_on_map` | 72 |
| `qualitative_definition_on_map` | 25 |
| `no_definition_on_map` | 213 |
| `map_unavailable` | 7 |

The beta frequent-service story uses the Canada and US records: 184 agencies
(Canada 74, United States 110). Of those, 47 are numeric, 12 qualitative, 120
have no definition and 5 have no map available.

## Limitations and next steps

- The audit describes map language, not GTFS performance.
- For a cross-agency comparison, use the per-agency file
  [frequent-definitions-by-agency.json](../frequent-service-research-2026-09/frequent-definitions-by-agency.json).
  It combines this audit with the catalog and adds machine-checked quotes.
- Many `exactMapWording` values are paraphrased or reconstructed from map
  graphics. Only 11 matched the current page text verbatim on 2026-10-11, so
  use the quotes in the per-agency file instead.
- Records list 69 preserved evidence files, but only 12 are in this folder; the
  rest were never committed.
- `bangkok-mrt-purple-map.jpg` was a byte-identical copy of the Blue Line map
  and has been removed. The Purple Line map itself was never preserved.

## Supporting artifacts

- [Verification report](REPORT.md)
- [Structured audit data](data.json), imported by the beta frequent-service story
- Map PDFs and images in this folder
