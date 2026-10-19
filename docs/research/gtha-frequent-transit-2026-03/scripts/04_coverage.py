"""
04_coverage.py
Intersects the GTHA walkshed with Statistics Canada 2021 Census
Dissemination Areas to calculate population coverage.

Census data setup (one-time, manual):
  1. Download DA boundary shapefile from StatsCan:
     https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm?year=21
     → "Dissemination areas" → "Cartographic boundary file" → Download
     → Unzip to data/census/lda_000b21a_e/

  2. Download DA population from StatsCan Census Profile (98-401-X):
     https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger.cfm
     → Table: 98-401-X2021006 (DA-level)
     → Unzip CSV to data/census/98-401-X2021006_English_CSV_data.csv

  Or use the censusmapper Python package (see README).

Outputs:
  output/coverage_summary.csv   — coverage % by CSD (municipality)
  output/coverage_das.geojson   — DAs coloured by in/out walkshed (optional)
"""

import geopandas as gpd
import pandas as pd
from pathlib import Path

DATA_DIR      = Path(__file__).parent.parent / "data" / "census"
OUTPUT_DIR    = Path(__file__).parent.parent / "output"
WALKSHED_PATH = OUTPUT_DIR / "walkshed_gtha.geojson"

DA_SHP = DATA_DIR / "lda_000b21a_e" / "lda_000b21a_e.shp"
POP_CSV = DATA_DIR / "98-401-X2021006_English_CSV_data.csv"

CRS_PROJ = "EPSG:32617"

# Ontario CSD UIDs (first 2 digits of DAUID = province; 35 = Ontario)
ONTARIO_PREFIX = "35"


def load_population() -> pd.DataFrame:
    """
    Parse the StatsCan Census Profile CSV to extract total population per DA.
    The file has one row per characteristic per DA — we want CHARACTERISTIC_ID == 1
    (Total population, 2021).
    """
    print("Loading population data...")
    # Read only needed columns for memory efficiency
    df = pd.read_csv(
        POP_CSV,
        usecols=["DGUID", "CHARACTERISTIC_ID", "C1_COUNT_TOTAL"],
        dtype=str,
        low_memory=False,
    )
    # Characteristic ID 1 = "Population, 2021"
    pop = df[df["CHARACTERISTIC_ID"] == "1"].copy()
    pop["population"] = pd.to_numeric(pop["C1_COUNT_TOTAL"], errors="coerce").fillna(0)
    # DGUID looks like: 2021A000535200001 — last 8 chars are DAUID
    pop["DAUID"] = pop["DGUID"].str[-8:]
    return pop[["DAUID", "population"]]


def main():
    # --- Load walkshed ---
    if not WALKSHED_PATH.exists():
        print(f"Walkshed not found: {WALKSHED_PATH}")
        print("Run 03_build_walkshed.py first.")
        return

    print("Loading walkshed...")
    walkshed = gpd.read_file(WALKSHED_PATH).to_crs(CRS_PROJ)
    walkshed_geom = walkshed.union_all()

    # --- Load DA boundaries ---
    if not DA_SHP.exists():
        print(f"DA shapefile not found: {DA_SHP}")
        print("See script header for download instructions.")
        return

    print("Loading DA boundaries...")
    das = gpd.read_file(DA_SHP).to_crs(CRS_PROJ)

    # Clip to Ontario only
    das = das[das["DAUID"].str.startswith(ONTARIO_PREFIX)].copy()
    print(f"  {len(das)} Ontario DAs loaded")

    # --- Load population ---
    if not POP_CSV.exists():
        print(f"Population CSV not found: {POP_CSV}")
        print("See script header for download instructions.")
        return

    pop = load_population()
    das = das.merge(pop, on="DAUID", how="left")
    das["population"] = das["population"].fillna(0)
    print(f"  Total Ontario population in dataset: {das['population'].sum():,.0f}")

    # --- Areal interpolation ---
    # For each DA, calculate what fraction of its area falls inside the walkshed,
    # then attribute that fraction of its population to the walkshed.
    print("Calculating intersection (may take a minute)...")
    das["da_area"] = das.geometry.area
    das["intersection_area"] = das.geometry.intersection(walkshed_geom).area
    das["coverage_fraction"] = (das["intersection_area"] / das["da_area"]).clip(0, 1)
    das["pop_covered"] = das["population"] * das["coverage_fraction"]

    # --- Overall GTHA summary ---
    total_pop     = das["population"].sum()
    covered_pop   = das["pop_covered"].sum()
    coverage_pct  = covered_pop / total_pop * 100 if total_pop > 0 else 0

    print(f"\n{'='*50}")
    print(f"GTHA Frequent Transit Coverage (AM Peak, ≤15 min)")
    print(f"{'='*50}")
    print(f"Total population (Ontario DAs):  {total_pop:>12,.0f}")
    print(f"Population in walkshed:          {covered_pop:>12,.0f}")
    print(f"Coverage:                        {coverage_pct:>11.1f}%")
    print(f"{'='*50}")

    # --- By CSD (municipality) ---
    # CSDUID = first 7 digits of DAUID
    das["CSDUID"] = das["DAUID"].str[:7]
    by_csd = (
        das.groupby("CSDUID")
        .agg(
            total_pop=("population", "sum"),
            covered_pop=("pop_covered", "sum"),
        )
        .reset_index()
    )
    by_csd["coverage_pct"] = (
        (by_csd["covered_pop"] / by_csd["total_pop"] * 100)
        .where(by_csd["total_pop"] > 0)
        .round(1)
    )
    by_csd = by_csd.sort_values("coverage_pct", ascending=False)

    csd_out = OUTPUT_DIR / "coverage_summary.csv"
    by_csd.to_csv(csd_out, index=False)
    print(f"\nPer-municipality breakdown saved → {csd_out}")
    print("\nTop 10 municipalities by coverage:")
    print(by_csd.head(10).to_string(index=False))

    # --- Optional: export DA-level GeoJSON for mapping ---
    da_out = OUTPUT_DIR / "coverage_das.geojson"
    das[["DAUID", "population", "coverage_fraction", "pop_covered", "geometry"]].to_crs(
        "EPSG:4326"
    ).to_file(da_out, driver="GeoJSON")
    print(f"\nDA-level output saved → {da_out}")
    print("Load in QGIS or Felt.com to map coverage.")


if __name__ == "__main__":
    main()
