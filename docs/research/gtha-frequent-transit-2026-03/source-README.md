# GTHA Frequent Transit Coverage

Measures what percentage of the GTHA population lives within a 10-minute walk (800m) of a bus/streetcar route running every 15 minutes or better.

**Agencies included:** TTC, Brampton Transit, MiWay, YRT/Viva, DRT, Burlington Transit, HSR, Oakville Transit
**GO Transit:** excluded intentionally (regional rail, not local mobility)

---

## Setup

```bash
cd gtha-frequent-transit
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

---

## Run the pipeline

### Step 1 — Download GTFS feeds
```bash
python scripts/01_download_feeds.py
```
Downloads all 8 agency GTFS feeds to `data/gtfs/`. If any URL fails, grab the feed manually from [Mobility Database](https://database.mobilitydata.org) and drop the zip in `data/gtfs/<agency>.zip`.

### Step 2 — Find frequent stops
```bash
python scripts/02_find_frequent.py
```
Parses each feed and finds stops served by routes with ≤15 min headway during AM peak (7–9am). Outputs `data/frequent_stops.csv`.

### Step 3 — Build walkshed
```bash
python scripts/03_build_walkshed.py
```
Buffers each frequent stop by 800m, unions across all agencies. Outputs:
- `output/walkshed_by_agency.geojson`
- `output/walkshed_gtha.geojson`

### Step 4 — Calculate coverage
```bash
python scripts/04_coverage.py
```
Intersects walkshed with StatsCan 2021 Census DAs. Outputs coverage % overall and by municipality.

**Census data required before running step 4** (one-time download):

1. **DA shapefile** → [StatsCan boundary files](https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm?year=21)
   → Dissemination areas → Cartographic boundary → Unzip to `data/census/lda_000b21a_e/`

2. **Population CSV** → [StatsCan Census Profile 98-401-X](https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger.cfm)
   → Table 98-401-X2021006 (DA level) → Unzip CSV to `data/census/`

---

## Configuration

Edit these constants at the top of the relevant script:

| Script | Variable | Default | Meaning |
|--------|----------|---------|---------|
| `02_find_frequent.py` | `WINDOW_START/END` | `07:00–09:00` | Time window for headway calculation |
| `02_find_frequent.py` | `MAX_HEADWAY_MIN` | `15` | Frequency threshold (minutes) |
| `03_build_walkshed.py` | `WALK_METRES` | `800` | Walk distance buffer |

---

## Output files

| File | Description |
|------|-------------|
| `data/frequent_stops.csv` | All stops meeting the frequency threshold, with agency |
| `output/walkshed_by_agency.geojson` | Per-agency walkshed polygons |
| `output/walkshed_gtha.geojson` | Single merged GTHA walkshed |
| `output/coverage_summary.csv` | Coverage % by CSD (municipality) |
| `output/coverage_das.geojson` | DA-level data for mapping in QGIS/Felt |
