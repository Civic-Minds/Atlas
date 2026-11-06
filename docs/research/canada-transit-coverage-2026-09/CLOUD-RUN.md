# Running the coverage study in the cloud (CIV-1182)

The workflow is `.github/workflows/coverage-study.yml`, started by hand only. It runs this folder's scripts on GitHub's runners against Atlas's current published data (read-only, public URLs). It never writes to R2: the only secrets it can use are the read-only R2 keys, for the StatCan fallback below. Reports come back as workflow artifacts.

## Why the rule is a parameter
The September 19 figures depend on Atlas's `headwayByPeriodSustained` flag, and that flag drops some very frequent lines (CIV-1179). `COVERAGE_RULE`, the workflow's `rule` input, picks the rule:

| rule | What it does |
|---|---|
| `study` (default) | The September 2026 rule, so the published figures can be reproduced on today's data. |
| `no-sustained` | The same rule without the sustained flag, as a sensitivity check. |
| `map-filter` | The map's own frequency filter. Not built: it waits for Ryan's pick (CIV-1179). Choosing it stops the run straight away with that message. |

## Inputs

| Input | Where it comes from | Size | Cache |
|---|---|---|---|
| DA population and representative points (2021 GeoSuite data package, `*/DA.csv`, as `src/prepare-statcan.mjs` expects) | `https://www12.statcan.gc.ca/census-recensement/2021/geo/aip-pia/geosuite/files-fichiers/2021_92-150-X_eng.zip` | tens of MB (to confirm on the first run) | `statcan-2021-v1` (never changes) |
| CMA/CA boundaries, 2021 cartographic boundary file, Shapefile, English | `https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcma000b21a_e.zip` | about 20 MB | same cache |
| Canadian OSM extracts, one per province | `https://download.geofabrik.de/north-america/canada/<province>-latest.osm.pbf` | ON 984 MB, QC 1.1 GB, BC 1.2 GB, AB 335 MB, MB 214 MB, SK 112 MB, NS 94 MB, NB 63 MB, NL 247 MB, PE 11 MB, YT 75 MB, NT 391 MB. About 4.9 GB in all | `geofabrik-ca-<province>-<YYYY-MM>` |
| US OSM extracts, one per state (fetched by `src/run-us-bundle.mjs`) | `https://download.geofabrik.de/north-america/us/<state>-latest.osm.pbf` | CA 1.2 GB, TX 692 MB, FL 629 MB, NY 475 MB … all 50 states about 11.4 GB | `us-inputs-<bundle>-<YYYY-MM>` |
| US 2020 block groups with POP100, and 2020 CBSA boundaries | Census TIGERweb REST: `tigerweb.geo.census.gov/arcgis/rest/services/Census2020/Tracts_Blocks/MapServer/1` and `…/CBSA/MapServer/8` | small per state (paged queries) | same cache as the US OSM extracts |
| Atlas route and stop files | `https://data.transitatlas.fyi/atlas/<slug>.json` and `<slug>-stops-meta.json`, the current published copies | TTC 23 MB; about 100 MB for the 17 largest Canadian agencies | none (always current) |

The downloads come to about 17 GB, not the 65 GB of the September run: that figure included derived files and caches.

**URL check.**
- The StatCan file names follow StatCan's documented naming. `lcma000b21a_e` breaks down as: `l` = file, `cma` = level, `000` = all of Canada, `b` = cartographic, `21` = 2021, `a` = Shapefile, `_e` = English (Boundary Files Reference Guide, 92-160-G).
- StatCan's site answers HTTP 403 to scripted requests from both this Mac and the web fetcher, so I couldn't open the download pages to confirm the exact links. The smoke run confirms them, or the fallback below takes over.
- The GeoSuite package's internal layout (`*/DA.csv` with `DArplat`, `DArplong`, `DApop_2021`) is what `prepare-statcan.mjs` read in September.
- The Geofabrik sizes come from download.geofabrik.de on 2026-10-30.

## StatCan fallback (needs Ryan's OK)
StatCan may refuse GitHub's runners the way it refuses this Mac. If it does, the workflow reads the same two files from the private archive bucket, under `research/coverage-inputs/`, with the read-only keys:
1. In a browser, download `2021_92-150-X_eng.zip` (GeoSuite 2021 data package) and `lcma000b21a_e.zip` (CMA cartographic boundary file, Shapefile, English) from statcan.gc.ca.
2. Upload both, unchanged, to the archive bucket at `research/coverage-inputs/` in the Cloudflare dashboard. This is a one-time manual upload of public reference data, not Atlas data. It's Ryan's call, because it writes to R2.

The workflow tries StatCan first. If StatCan refuses, it reads the archive copy. If neither is there, it stops with a message that points here. The files are cached after the first success.

## Job split

| Job | Runs | Runner |
|---|---|---|
| `plan` | Checks the inputs and builds the US bundle list (`plan-us-bundles.mjs`, with the chosen rule) and the province list | ubuntu-latest |
| `canada-inputs` | Gets the StatCan files, builds the population points and the CMA GeoJSON (gdal) once, and passes them on as an artifact | ubuntu-latest |
| `canada` × province | `src/run-ca-province.mjs`: OSM highways clipped to the qualifying stops plus 0.1°, then both thresholds (15 and 30) on one network. Up to 6 at a time | ubuntu-latest |
| `us` × bundle | `src/run-us-bundle.mjs` at 30, then at 15 (the 15-minute run reuses the 30-minute network). Up to 10 at a time | ubuntu-latest |
| `summarize` | Merges per country and threshold (`merge-reports.mjs`), then `summarize-cloud.mjs`: the headline figures the way catalog/findings.json computed them, plus a per-metro table. Writes to the run summary and the `coverage-summary` artifact | ubuntu-latest |

**Smoke mode:** Saskatchewan (Saskatoon and Regina; a 112 MB extract) and US bundle 15 (Hawaii; a 26 MB extract). This tests every path, StatCan files included, in a short run. The first run should be smoke with `rule=study`: Honolulu should land near the study's 12.97%, or this note's 17.8–22.0% bracket from CIV-1179.

## Runner size, time and cost
- **Runner:** ubuntu-latest, 4 vCPU, 16 GB RAM, about 14 GB free disk, plus about 25 GB once the workflow deletes the preinstalled toolchains. Node gets a 12 GB heap. The biggest jobs are Ontario, Quebec and BC, and the California, Texas, Florida and New York bundles. Clipping the network to qualifying stops keeps them inside 16 GB. If one runs out of memory, rerun only that job (`bundles` or `provinces` input) on a larger runner.
- **Time (estimate):**
  - Small provinces and bundles: 10–30 minutes each.
  - The big ones: 1–3 hours each.
  - Full run: about 25–40 runner-hours, about 3–5 hours of wall time at the parallel limits above.
  - Smoke: about 30–45 minutes.
- **Cost:** $0 on standard runners, because Civic-Minds/Atlas is a public repository, where GitHub-hosted standard runners are free. If a big job needs a larger runner (8 vCPU / 32 GB, about $0.032 a minute, set up at the organization level), four such jobs at 2 hours each come to about $15.

## Starting it (Ryan's yes first)
A manually started workflow has to be on the default branch before GitHub will start it, so it needs to be pushed and merged first:
```sh
git push origin fix/civ-1182-coverage-cloud
gh pr create --base main --head fix/civ-1182-coverage-cloud --title "Coverage study: cloud workflow (CIV-1182)" --body "..."
# after the merge:
gh workflow run coverage-study.yml --ref main -f mode=smoke -f rule=study
gh run watch "$(gh run list --workflow coverage-study.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run download <run-id> -n coverage-summary
# then the full run, with the rule Ryan picks:
gh workflow run coverage-study.yml --ref main -f mode=full -f rule=study
```
