# Population Context

**Status:** Proposed / exploratory

Atlas could add population density as an independent context layer for understanding where scheduled transit service is provided relative to the people living nearby.

## Product question

The first useful question is:

> Which densely populated areas have poor frequent-transit coverage?

Population should provide context for Atlas's frequency and performance data. It should not replace the route map or become a general demographic dashboard.

## Initial scope

- **Geography:** Greater Toronto and Hamilton Area (GTHA)
- **Country:** Canada first
- **Census vintage:** 2021 Census
- **Initial measure:** residents per square kilometre
- **Initial map:** optional polygon overlay beneath the transit network
- **Primary comparison:** population density alongside Atlas frequency tiers

Census tracts are the preferred first geography because they should produce a readable map. Dissemination areas can be evaluated later for finer-grained planning analysis.

## Data sources

Statistics Canada publishes census boundary files and population data for Canadian dissemination geographies:

- [2021 Census boundary files](https://www150.statcan.gc.ca/n1/en/catalogue/92-160-X)
- [Dissemination area boundary files](https://www150.statcan.gc.ca/n1/en/catalogue/92-169-X)
- [2021 Census geography catalogue](https://www150.statcan.gc.ca/n1/pub/92-196-x/92-196-x2021001-eng.htm)

The United States could be added later using Census ACS data and Census tract boundaries. The US workflow is technically more standardized, but Canada is the better first test because it matches Atlas's current product focus.

## Proposed processing

1. Download the boundary and population datasets for the selected census vintage.
2. Join population counts to stable geography identifiers.
3. Calculate density using population divided by land area in square kilometres.
4. Clip or filter the context layer to the relevant agency and regional bounds.
5. Publish the result as a separate, versioned context artifact rather than adding fields to route GeoJSON.
6. Load the layer only when the user enables it.

Illustrative future artifact:

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

- Census tract versus dissemination-area geometry for the first usable map
- Whether land area or total polygon area should be used in the density calculation
- How to handle water, industrial land, parks, and very large rural polygons
- Whether the useful comparison is raw density, population within a transit walkshed, or density-weighted frequency
- Whether the layer belongs in the Frequency Map, Factbook, or a future planning-oriented app

## Success criteria

The experiment is worth continuing if it produces at least one clear, defensible view that the frequency map cannot provide alone—for example, identifying a high-population area where frequent service is absent or showing how a schedule change affected access for a defined population.

This document does not commit Atlas to building a demographic or equity product.

[Back to Data](./DATA.md)
