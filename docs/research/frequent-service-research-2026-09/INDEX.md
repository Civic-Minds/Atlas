# Frequent-service research

**Status:** Complete. Cleaned up and rechecked on 2026-10-11; the per-agency
file below is the single source for a cross-agency "frequent" comparison.

## Research question

How do agencies define frequent service, and what threshold and service span
should Atlas use for a comparable daytime measure?

## Sample

- [Catalog](catalog.json): 500 agency records (Canada 88, France 100, Mexico 1,
  United States 311), reviewed 2026-09-16 to 2026-09-18. They resolve to 495
  Atlas agencies, because five agencies were catalogued twice under different IDs
  (TransLink, STM, OC Transpo, YRT, Sound Transit).
- [System-map audit](../system-map-audit-2026-09/INDEX.md): 317 agencies after
  the 2026-10-11 duplicate merge, 179 of them in the Atlas registry.
- [Per-agency file](frequent-definitions-by-agency.json): 532 Atlas agencies,
  the union of both sets.

## Method

1. **Original review (2026-09).** Agency system maps, rider guides,
   frequent-network pages, service guidelines and plans were reviewed and every
   published tier recorded in the catalog. See [PILOT.md](PILOT.md) and
   [CRITERIA.md](CRITERIA.md).
2. **Atlas agency mapping (2026-10-11).**
   [`scripts/build-frequent-service-agency-map.mjs`](../../../scripts/build-frequent-service-agency-map.mjs)
   writes [atlas-agency-map.json](atlas-agency-map.json). It matches every catalog
   and audit record to registry slugs by exact slug, then exact official name,
   then official website host. The host is used only when exactly one registry
   agency matches. Six audit records (after the duplicate merge) are matched by hand, each with a note on the
   official evidence (for example, kcata.org redirects to ridekc.org). Anything
   else is listed as unmatched, never guessed.
3. **Definition recheck (2026-10-11).** Every Atlas agency with a definition
   claim in either set (258 agencies) was rechecked against current official
   pages. The page text was saved, and each quote was machine-checked as an exact
   substring after normalising Unicode, quote marks, dashes, spacing and case.
   - Only a named frequent tier counts. A list of route frequencies or unnamed
     frequency bands does not.
   - When official sources disagree, the narrower definition is used and the row
     is marked `conflictingSources`.
   - Evidence is in
     [definition-quotes-2026-10-11.json](definition-quotes-2026-10-11.json).
4. **Join.**
   [`scripts/build-frequent-definitions-by-agency.mjs`](../../../scripts/build-frequent-definitions-by-agency.mjs)
   writes [frequent-definitions-by-agency.json](frequent-definitions-by-agency.json)
   with one row per Atlas agency.

## Results and interpretation

### Two count bases, both correct

The earlier INDEX said "172 with documented numeric definitions, 73 with
qualitative or named definitions". Those are counts of the catalog's
`reviewStatus`, not of numeric definitions. [ANALYSIS.md](ANALYSIS.md)
reclassifies the same 500 records by tier content into `category`:

| reviewStatus \ analysis category | numeric | qualitative | formal, no frequent label | none | Total |
|---|---:|---:|---:|---:|---:|
| `definition_found` | 170 | 1 | 1 | 0 | 172 |
| `qualitative_definition_only` | 35 | 25 | 13 | 0 | 73 |
| `no_definition_found` | 0 | 0 | 0 | 255 | 255 |
| Total | 205 | 26 | 14 | 255 | 500 |

### Recheck of definition claims (258 Atlas agencies)

| definitionStatus | Agencies | Meaning |
|---|---:|---|
| `verified` | 105 | A current official page names a frequent tier in operation. The quote is machine-checked: 104 verbatim, plus STM, which was content-confirmed because stm.info blocks the fetch script |
| `planned-or-proposed` | 22 | Quote comes from a plan describing a proposed or future network, or uses "frequent" as an analytical or land-use term |
| `narrow-scope` | 9 | Quote covers one route or line, part of the area, a calendar service level or a future target: annapolis, annemasse, avignon, blacksburg, duluth-transit, embark, go, rtd-denver (City of Denver routes only), timmins |
| `unnamed-frequency-bands` | 2 | Map shows frequency classes with no frequent name: fax, indygo |
| `not-found-on-recheck` | 101 | No named frequent tier on current official pages. Most earlier records were route-frequency lists or unnamed frequency bands |
| `fetch-blocked` | 16 | Official site blocks automated fetches; not rechecked |
| `image-only` | 3 | Definition appears only in a map image: piercetransit, red-deer, reims |

- The other 274 agencies in the file had no definition in either set and were
  not rechecked (`no-definition-found`).
- `planned-or-proposed` (22): abqride, asheville, avta, bc-fraser-valley,
  brandon, comox-valley, grt, guelph, kamloops, lethbridge, niagara, oakville,
  raba, saint-john, sfmta, sjrtd, soundtransit, south-okanagan, squamish, start,
  sudbury, theride.
- **Thresholds:** of the 105 verified definitions, 83 publish a number. That
  number is the slowest headway for the tier in its main weekday daytime period,
  so "every 15–20 minutes on weekdays" is recorded as 20.
  - Counts: 15 minutes (49), 20 (12), 30 (10), 10 (8), 12 (3) and 9 (1).
  - The other 22 are named tiers with no number.
- **By country:** United States 59, France 27, Canada 19.
- **By source type:** system map 33, frequent-network page 22, service
  guidelines 14, planning document 13, rider guide 11, other 12.
- **Conflicting sources (9):** burlington, capmetro, cdta, cincinnatimetro,
  clermont, gcrta, rtd-denver, tarc and yrt. Each row's `conflicts` field says
  which source was used and why.
- **Checked by hand:** 7 agencies were checked by the lead researcher rather
  than a helper: brampton, burlington, communitytransit, halifax, marseille,
  metrobus and nfta.
  - Marseille's pages were not refetched; its result relies on the two
    system-map reviews.
  - NFTA's Frequent tier was read from a standards table by column position.

The catalog overstated definitions. Of the 258 earlier claims, only 105 survive
as a current, network-wide, named frequent tier.

## Recommendation

No product decision. For a cross-agency comparison, use
`frequent-definitions-by-agency.json` and show only `verified` rows, with the
quote, source and check date. The CRITERIA brief's weekday 7am–7pm, 15-minute
measure remains a proposed rule.

## Limitations and next steps

- **Fetch-blocked (16):** amiens, brownsville, burbankbus, cats, cyride,
  fred-transit, fredericton, grand-forks, greensboro, ladot, lyon, milton,
  rennes, unitrans, valence, visalia. These need a manual or browser check.
- **Not in the Atlas registry:** 138 audit records.
  - 119 are in countries Atlas does not cover. They are listed in
    `atlas-agency-map.json` and were not re-verified.
  - 19 are North American or French agencies with no registry agency: airdrie,
    bc-transit-prince-george, chilliwack, cts-strasbourg, ilevia-lille, leduc,
    montpellier, peterborough, port-alberni, powell-river, quesnel, ratp-paris,
    sault-ste-marie, seattle-dot, st-albert, strathcona-county, sts-saguenay,
    sttr-trois-rivieres, vernon.
  - NJ Transit and MTA New York City Transit each map to several registry feeds
    (`one-to-many`).
- **Registry issue:** the `embark` registry entry's `websiteUrl` points to OU
  CART (ou.edu/cart), not Embark.
- **Rule differences:** the system-map audit counts only maps that name
  "frequent" or "high-frequency". The recheck counts any named frequent tier on
  any official page. The two sets can therefore differ for the same agency: TTC's
  "Ten-Minute Network" is a verified definition here but `no_definition_on_map`
  in the audit.
- STM and TransLink still need stop- or corridor-level follow-up before the
  Atlas comparison is treated as a direct match.
- Time-sensitive: re-run the recheck before publishing anything.

## Supporting artifacts

- [Per-agency definitions](frequent-definitions-by-agency.json): single source
  for comparison.
- [Definition quotes and checks](definition-quotes-2026-10-11.json)
- [Atlas agency mapping](atlas-agency-map.json)
- [Catalog](catalog.json) and [derived analysis](analysis.json) /
  [ANALYSIS.md](ANALYSIS.md) (generated by `npm run analyze:frequent-service-catalog`)
- [Criteria brief](CRITERIA.md) and [agency review](PILOT.md)
- **Removed duplicates (2026-10-11):**
  - `frequent-service-catalog.json` was identical to `catalog.json`.
  - `frequent-service-analysis-2026-09.json`/`.md` and
    `frequent-service-pilot-2026-09.md` differed from their short-named
    originals only in self-links.
  - `scripts/build-lateness-policy-study.ts` now reads `catalog.json`.
