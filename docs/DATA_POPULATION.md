# Population Context

**Status:** Proposed / exploratory

Atlas could add population density as an independent context layer for understanding where scheduled transit service is provided relative to the people living nearby.

## Product question

The first useful question is:

> Which densely populated areas have poor frequent-transit coverage?

Population should provide context for Atlas's frequency and performance data. It should not replace the route map or become a general demographic dashboard.

## Initial scope (as originally proposed)

- **Geography:** Greater Toronto and Hamilton Area (GTHA)
- **Country:** Canada first
- **Census vintage:** 2021 Census
- **Initial measure:** residents per square kilometre
- **Initial map:** optional polygon overlay beneath the transit network
- **Primary comparison:** population density alongside Atlas frequency tiers

Census tracts are the preferred first geography because they should produce a readable map. Dissemination areas can be evaluated later for finer-grained planning analysis.

This scope was written when Atlas was much smaller and Ontario was a large share of the map. That premise is revisited below — see "Choosing the first geography (revisited)" — since Atlas's footprint has since grown substantially and is no longer centred on Canada.

## Choosing the first geography (revisited)

The original GTHA choice rested on two separate reasons: it would produce a "geographically compact, readable map," and it matched Atlas's product focus at the time. The second reason no longer holds. Atlas now covers 608 agencies across the US, Canada, and France, and the distribution (from `public/data/index.json`) looks like this:

- **United States** — California alone has 93 agencies, more than all of Ontario (26). Other large states: New York (28), Washington (20), Florida (18), Texas (17), Virginia (16). The US is Atlas's largest single-country footprint by a wide margin.
- **France** — seven-plus regions with real coverage: Auvergne-Rhône-Alpes (19), Nouvelle-Aquitaine (17), Occitanie (16), Bretagne (15), Provence-Alpes-Côte d'Azur (13), Hauts-de-France (12), Normandie (12), Grand Est (11), plus smaller regions.
- **Canada** — Ontario (26) is the largest Canadian region, comparable in size to a mid-size US state and well behind California.

The "compact, readable map" reasoning still holds, but it applies equally to a comparable single US metro or French région — it was never a reason unique to GTHA.

### Comparison

| | Canada (GTHA) | US (a comparable metro, e.g. within California) | France (a comparable région, e.g. Auvergne-Rhône-Alpes) |
|---|---|---|---|
| Footprint match | Ontario = 26 agencies system-wide, GTHA a subset of that | California alone = 93 agencies, Atlas's largest state footprint | Auvergne-Rhône-Alpes = 19 agencies, Atlas's largest French region |
| Population source | StatCan 2021 Census — actual count | Census Bureau ACS 5-year estimates — survey-based, carries margin of error at the tract level | INSEE Filosofi 200m population grid (tax-file derived) or IRIS boundaries |
| Boundary format / licence | Shapefile; Statistics Canada Open Licence (free, attribution required) | Shapefile / geodatabase (TIGER/Line); US government work, public domain, no licence terms | Shapefile / GeoJSON; Etalab Licence Ouverte (free, attribution required) |
| Existing tooling | No dedicated Python or JS library found for StatCan boundary+population joins; `cancensus` (R) is the closest maintained option | `pytidycensus` and `pygris` (Python) are purpose-built for ACS+TIGER joins; Census Bureau also publishes pre-joined TIGER+ACS geodatabases directly | No dedicated join library found; would be a from-scratch CSV/shapefile join |
| Land area for density | Ships as a field in StatCan boundary attribute tables | Ships as `ALAND`/`AWATER` fields in TIGER/Line attributes | Not applicable to the 200m grid (uniform cell area); IRIS would need a separate land-area source |
| Vintage risk | 2026 Census geographic/boundary products release November 18, 2026, with population counts following February 10, 2027 — the 2021 vintage this doc originally scoped is about to be one cycle behind | ACS 5-year estimates refresh annually on a rolling basis; no comparable step-change pending | Filosofi grid vintages found range from a 2010 population base to a 2015 tax-year base — already the oldest of the three sources |

### Recommendation

The evidence favors a US metro over GTHA as the first candidate:

- Largest and most representative share of Atlas's current footprint.
- Public-domain licensing, no attribution or licence terms to track.
- Two actively maintained Python libraries (`pytidycensus`, `pygris`) built specifically for the ACS+TIGER join this doc describes, and the Census Bureau also publishes pre-joined TIGER+ACS geodatabases directly — meaningfully less integration work than a DIY join of StatCan shapefiles to population tables.
- Land area ships as a ready field (`ALAND`) in TIGER attributes, which effectively answers the land-area-vs-polygon-area open question below for the US case.

The real counterweight: ACS 5-year estimates are survey-based, not a full count, and carry a margin of error at the tract level. StatCan's census is an actual count with no MOE. Given Atlas's priority on never showing misleading precision, a density layer built on MOE-bearing tract estimates would need to visibly communicate that uncertainty rather than presenting a number with the same apparent confidence as a hard count. If that presentation problem isn't worth solving for a first experiment, Canada's actual-count data is the safer starting point despite the smaller relative footprint and the incoming 2026 census transition.

France is a reasonable second or third candidate but not a strong first candidate: no purpose-built join tooling was found, and the readily available population source (the Filosofi 200m grid) is the oldest vintage of the three and isn't natively a "readable tract-like polygon" geography. IRIS boundaries are the closer analogue to a US census tract or Canadian dissemination area, but would need their own from-scratch boundary-to-population join.

This is a recommendation, not a decision — the choice of first geography is Ryan's call.

## Data sources

**Canada.** Statistics Canada publishes census boundary files and population data for Canadian dissemination geographies. All three URLs below were checked and are current as of this writing:

- [2021 Census boundary files](https://www150.statcan.gc.ca/n1/en/catalogue/92-160-X) — live; covers provinces/territories through aggregate dissemination areas for 2021, 2016, 2011, and archived 2006 vintages.
- [Dissemination area boundary files](https://www150.statcan.gc.ca/n1/en/catalogue/92-169-X) — live; same vintage coverage as above at the dissemination-area level.
- [2021 Census geography catalogue](https://www150.statcan.gc.ca/n1/pub/92-196-x/92-196-x2021001-eng.htm) — live, published for the 2021 cycle specifically (not continuously updated).
- Licensing: [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/terms-conditions/open-licence) — free to use and redistribute with attribution.
- **2026 Census status:** collection began May 4, 2026. Per StatCan's [release schedule](https://www12.statcan.gc.ca/census-recensement/releaseschedule-calendrierdediffusion/upcomingreleases-diffusionsavenir-eng.cfm), geographic/boundary products are planned for November 18, 2026, with population and dwelling counts following February 10, 2027. The 2021 vintage remains the only complete option until early 2027.

**United States.** The Census Bureau publishes ACS population estimates and TIGER/Line boundary files, both free and public domain:

- [TIGER/Line Shapefiles](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) — census tract (and other) boundaries, updated annually; includes `ALAND`/`AWATER` fields.
- American Community Survey (ACS) 5-year estimates — tract-level population figures, published via the Census API and `data.census.gov`; joins to TIGER geometry on the shared `GEOID` field. Figures are survey-based estimates with a published margin of error at the tract level, not a full count.
- Pre-joined TIGER+ACS geodatabases are published directly by the Census Bureau on the [TIGER Products page](https://www.census.gov/geo/maps-data/data/tiger-data.html), which can shortcut the join step entirely.
- Tooling: [`pytidycensus`](https://pypi.org/project/pytidycensus/) and [`pygris`](https://walker-data.com/pygris/) (both Python) are maintained libraries purpose-built for pulling and joining ACS + TIGER data.
- Licensing: public domain (US government work); attribution requested but not legally required.

**France (for comparison, not scoped as a first candidate).** INSEE (Institut national de la statistique et des études économiques) publishes a 200m population grid (the Filosofi *données carroyées*) and IRIS boundaries:

- [Données carroyées à 200 mètres](https://www.insee.fr/fr/statistiques/2520034) — population by 200m grid cell; primarily French-language documentation, tax-file (Filosofi) derived, so it under-covers populations not captured in housing tax declarations. Vintages found in circulation range from a 2010 population base to a 2015 tax-year base.
- IRIS boundaries are INSEE's closer equivalent to a census tract/dissemination area, but a ready-made population join for IRIS wasn't found in this pass and would need its own build.
- Licensing: [Etalab Licence Ouverte](https://github.com/etalab/licence-ouverte/blob/master/LO.md) — free to use and redistribute with attribution; English-language licence text exists, but most INSEE dataset documentation itself is French-only.

## Proposed processing

1. Download the boundary and population datasets for the selected census vintage.
2. Join population counts to stable geography identifiers.
3. Calculate density using population divided by land area in square kilometres.
4. Clip or filter the context layer to the relevant agency and regional bounds.
5. Publish the result as a separate, versioned context artifact rather than adding fields to route GeoJSON.
6. Load the layer only when the user enables it.

**Toolchain note:** Atlas's pipeline is currently 100% TypeScript (`pipeline/*.ts`, run via `npx tsx`); this repo has no Python and no existing shapefile/boundary-join tooling for any of the three candidate sources. Whichever geography is chosen, steps 1-3 above would most likely run as a one-off/offline process (e.g. Python with `geopandas` plus one of the libraries named in Data sources) outside the npm pipeline, producing a GeoJSON or PMTiles file as output. Step 5-6 (publishing as a versioned artifact, loading it as an optional layer) reuses machinery Atlas already has — `pipeline/build-pmtiles.ts` already knows how to produce a versioned PMTiles artifact, so that leg of the work is largely solved regardless of which geography is picked.

Illustrative future artifact (path shape only — geography/vintage in the filename depends on which candidate is chosen, see above):

```text
atlas/context/ca-gtha-population-2021.pmtiles
```

Each feature should retain provenance, census vintage, source geography, and calculation metadata so the map does not imply current population precision that the source cannot support.

## Rendering and interpretation

Density should use a restrained sequential colour scale beneath the transit lines. The transit network remains visually primary.

The map should avoid presenting density as a service recommendation by itself. A dense area may have short walks, rapid service, barriers, or poor reliability. A later derived layer could combine density with frequency and walkshed access to identify candidate service gaps.

## Architecture boundary

Population context should be a separate data product:

- separate pipeline or script
- separate dated artifact
- separate map layer and legend
- independent refresh cadence
- explicit source attribution

It should not be merged into the agency route GeoJSON, the core schedule schema, or the main PMTiles build until the experiment proves useful.

## Open questions

- **Which country/geography is the first candidate** — Canada (GTHA), a US metro, or a French région. See "Choosing the first geography (revisited)" above; a recommendation is given but the call is Ryan's.
- Census tract versus dissemination-area (or IRIS, for France) geometry for the first usable map
- ~~Whether land area or total polygon area should be used in the density calculation~~ — resolved for the US and Canada candidates: both StatCan and TIGER/Line ship a land-area attribute field directly, so land area (not total polygon area) is calculable without a separate step. Still open for a France/IRIS candidate.
- How to handle water, industrial land, parks, and very large rural polygons
- Whether the useful comparison is raw density, population within a transit walkshed, or density-weighted frequency
- Whether the layer belongs in the Frequency Map, Factbook, or a future planning-oriented app
- **If the US is chosen:** how to present tract-level ACS estimates — which carry a published margin of error — without implying the same precision as an actual count (StatCan's 2021 Census). This is a provenance/labeling question, not a blocker, but needs an answer before publishing the layer.

## Success criteria

The experiment is worth continuing if it produces at least one clear, defensible view that the frequency map cannot provide alone—for example, identifying a high-population area where frequent service is absent or showing how a schedule change affected access for a defined population.

This document does not commit Atlas to building a demographic or equity product.

[Back to Data](./DATA.md)
