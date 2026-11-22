# Canada Transit Coverage

**Status:** superseded. The figures below were computed outside the repo and do not reproduce; see Verification for Atlas's verified figures.

Snapshot date: `2026-09-19`
Source: a separate local git repository (19 commits, no remote), last commit `364a083` (2026-09-19). The commit list is in [`source-git-log.txt`](source-git-log.txt).
Scope: 84 Atlas agencies, 2021 population, 10-minute walk, weekday 07:00-19:00.

## How Atlas data was used

The study read Atlas's published route, stop and headway artifacts from `https://data.transitatlas.fyi` as a read-only source. It never wrote to Atlas. Population (Statistics Canada 2021 dissemination areas, US Census) and walking networks (OpenStreetMap extracts) come from outside Atlas. Atlas's own code and data were not changed by this study, and no Atlas product decision depends on it.

## Verification (2026-11-21, CIV-2082)

**The September table below is superseded.** Atlas's verified, dated coverage figures are in [`src/data/frequent-coverage-metros.json`](../../../src/data/frequent-coverage-metros.json): coverage cloud run 43775315209 (`.github/workflows/coverage-study.yml`, rule `map-filter-trunk`, code `ea43d0480`), dated 2026-11-15, approved by Ryan on 2026-11-15 ("1", CIV-1579). The file matches that run's artifact exactly.

| Country | Metros (15-minute) | Population base | 15-minute service | 30-minute service |
| --- | ---: | ---: | ---: | ---: |
| Canada | 48 (18) | 27,149,074 | 29.47% | 61.53% |
| United States | 170 (79) | 234,641,958 | 13.56% | 26.75% |

- **Rule:** a route counts at 15 or 30 when the map's frequency test passes it at that setting on weekdays in AM peak, midday and PM peak, reading a branched route by its shared middle (trunk); on a route that passes only on its trunk, only the trunk's stops count. Public-map agencies only, a 10-minute walk, the 15-minute share on the 30-minute population base. The September figures used the `study` rule (every 15 or 30 sustained 7:00-19:00); see CLOUD-RUN.md for the rule options.
- **Sources:** Canada, Statistics Canada 2021 Census: dissemination-area population and representative points (GeoSuite 2021, 92-150-X) and 2021 CMA/CA cartographic boundaries (`lcma000b21a_e`). United States, 2020 Census block groups (POP100) and 2020 CBSA boundaries (TIGERweb). Walking network: Geofabrik OpenStreetMap extracts of November 2026. Atlas routes and stops as published on 2026-11-15.
- **Why the September figures don't reproduce:** the one full cloud run on the `study` rule (42334702058, 2026-11-07) gives Canada 8.55% / 32.26% on 33 metros and the US 4.22% / 12.96% on 126, against 8.72% / 22.98% (37) and 6.03% / 13.63% (124) here. Atlas data changed between the two dates, the metro scope differs, and the September run read "Not in service" patterns as gaps and merged routes with no short name into one (both fixed under CIV-1179).
- **Next:** CIV-2013 reruns these figures after the current data release, with the trunk filter (#1665); cite the run ID and date with any figure.

## Headline figures

Share of metro population within a 10-minute walk of stops with weekday 7:00-19:00 service every 15 or 30 minutes. The 15-minute rows use the same metro population base as each country's 30-minute row. Compare within a country only; population vintages and geographies differ between Canada and the United States.

| Country | 15-minute service | 30-minute service |
| --- | ---: | ---: |
| Canada | 8.72% | 22.98% |
| United States | 6.03% | 13.63% |

Checked on 2026-10-18 against `catalog/findings.json`: all four match (`frequent-15-minute-common-scope` 8.72, `frequent-30-minute` 22.98, `us-sensitivity-15-minute-common-scope` 6.03, `us-aggregate-30-minute` 13.63). The catalog also holds a Canada 15-minute figure of 10.2% measured on a different population base (only the 13 metros with qualifying service); the 8.72% figure is the comparable one.

## What is in this folder

| Path | What it is |
| --- | --- |
| `catalog/findings.json` | Canonical structured findings (42 entries: Canada, US pilots, US bundles, sensitivities) |
| `catalog/us-bundles.json`, `catalog/us-bundle-exclusions.json` | The US processing groups and exclusions |
| `summaries/coverage-by-cma-30-minute.csv` | Canada coverage by metro, 30-minute service (37 metros) |
| `summaries/coverage-by-cma-15-minute.csv` | Canada coverage by metro, 15-minute service, only the 13 metros with qualifying service |
| `src/`, `test/`, `package.json` | The scripts and test used to produce the study (plain Node, no dependencies) |
| `source-git-log.txt` | The source repository's commit list (stands in for its history) |

## What was not copied

- `output/` (4.3 GB): generated reports, map GeoJSON and per-bundle US reports. Regenerable.
- `data/` (65 GB): Statistics Canada GeoSuite, Census and Geofabrik OpenStreetMap inputs, caches. Re-downloadable.
- The source's `.git` history (19 commits, no remote): only the commit list is kept.
- Larger per-metro output files, such as `coverage-report.json` and `coverage-map.geojson`.

## How to regenerate

Copy `src/`, `test/` and `package.json` into an empty folder, download the inputs listed below, and run the commands in the original instructions that follow. Expect many hours and tens of GB of disk. The scripts expect a `data/` folder next to `src/`, and write to `output/`.

## Original instructions (from the source README)

Independent analysis of population access to frequent transit. Atlas is used as a read-only source of published route, stop, and headway artifacts; this project does not modify the Atlas repository.

The first report measures population within a 10-minute walk of stops served by sustained weekday service every 15 minutes or better from 7:00–19:00. It uses 2021 Canadian dissemination areas, CMA/CA boundaries, and a GeoJSON pedestrian network.

Use `--headway 30` to produce the comparable 30-minute report. Findings are
catalogued in `catalog/findings.json`; generated reports remain in `output/`.

### How to read the findings

Access changes substantially depending on what counts as frequent service. The
15-minute sensitivity uses the same metro population base as each country’s
30-minute result:

| Country | 15-minute service | 30-minute service |
| --- | ---: | ---: |
| Canada | 8.72% | 22.98% |
| United States | 6.03% | 13.63% |

The 30-minute result is the broad-access headline. The 15-minute result shows
the stricter standard. These percentages should be compared within each
country; the population vintages and geographies differ between Canada and the
United States.

To create the US processing list without running population analysis:

```sh
npm run plan:us-bundles -- --headway 30
```

This groups states connected by qualifying Atlas service and adds a 25-mile
network buffer around each bundle. The current list is summarized in
`catalog/us-bundles.json`; the full generated definitions, including bounds
and agencies, are written to `data/derived/us-service-bundles.json`.

Run one US bundle with cached Census and Geofabrik inputs:

```sh
npm run run:us-bundle -- --bundle 11-24-51
```

Run a throttled sequential batch:

```sh
npm run run:us-batch -- --bundles 11-24-51,17-18,20-29,27-38
```

To resume the full US rollout without selecting another batch manually:

```sh
npm run run:us-batch -- --all-remaining
```

This processes all uncatalogued bundles sequentially in groups of four,
continues after individual failures, updates `data/derived/us-rollout-status.json`,
and catalogues each successful report automatically.

Each bundle writes its report, map, city table, diagnostics, and provenance
under `output/us-bundles/<bundle-id>/`. Population areas and walking-network
inputs are cached under `data/derived/us-bundles/<bundle-id>/`; state highway
extracts are shared under `data/derived/us-osm-highways/`.

Batch reports can be merged without double-counting overlapping population
areas:

```sh
npm run merge:coverage -- --out output/us/coverage-report.json \
  output/us/batch-01/coverage-report.json output/us/batch-02/coverage-report.json
```

Completed pilot reports remain catalogued in `catalog/findings.json`.

### Run

Place Statistics Canada’s 2021 GeoSuite package at
`data/source/2021_92-150-X_eng.zip`, then prepare the population points:

```sh
npm run prepare:statcan
```

```sh
npm run coverage -- \
  --population /path/to/dissemination-areas.geojson \
  --metros /path/to/cma-ca.geojson \
  --network /path/to/walking-network.geojson \
  --out ./output
```

Population features must contain `population`, `POP2021`, `Population`, or `pop2021`; use `--population-property NAME` for another field. The network must be a GeoJSON FeatureCollection of pedestrian LineStrings.

Atlas data is fetched from `https://data.transitatlas.fyi` by default. It is never written to.

The report inputs are official Statistics Canada 2021 dissemination-area
representative points and CMA/CA boundaries, plus pedestrian ways from the
provincial OpenStreetMap extracts listed in `data/derived/`. Large source and
derived files are intentionally ignored by Git.
