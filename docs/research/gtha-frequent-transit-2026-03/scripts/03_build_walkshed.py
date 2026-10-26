"""
03_build_walkshed.py
Buffers all frequent stops by 800m (10-min walk) and unions them into
a single walkshed polygon per agency, then a combined GTHA walkshed.

Outputs:
  output/walkshed_by_agency.geojson   — one polygon per agency
  output/walkshed_gtha.geojson        — single merged polygon
"""

import pandas as pd
import geopandas as gpd
from shapely.ops import unary_union
from pathlib import Path

INPUT  = Path(__file__).parent.parent / "data" / "frequent_stops.csv"
OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

WALK_METRES = 800   # 10-min walk at ~80 m/min
CRS_PROJ    = "EPSG:32617"   # UTM Zone 17N — accurate for GTHA
CRS_GEO     = "EPSG:4326"    # WGS84 for output


def main():
    if not INPUT.exists():
        print(f"Input not found: {INPUT}")
        print("Run 02_find_frequent.py first.")
        return

    stops = pd.read_csv(INPUT, dtype={"stop_id": str})
    stops["stop_lat"] = pd.to_numeric(stops["stop_lat"], errors="coerce")
    stops["stop_lon"] = pd.to_numeric(stops["stop_lon"], errors="coerce")
    stops = stops.dropna(subset=["stop_lat", "stop_lon"])

    gdf = gpd.GeoDataFrame(
        stops,
        geometry=gpd.points_from_xy(stops["stop_lon"], stops["stop_lat"]),
        crs=CRS_GEO,
    ).to_crs(CRS_PROJ)

    print(f"Buffering {len(gdf)} stops at {WALK_METRES}m...")

    # Per-agency walksheds
    agency_rows = []
    for agency, group in gdf.groupby("agency"):
        buffered = group.buffer(WALK_METRES)
        merged = unary_union(buffered)
        area_km2 = merged.area / 1e6
        agency_rows.append({
            "agency": agency,
            "stop_count": len(group),
            "geometry": merged,
        })
        print(f"  {agency}: {len(group)} stops → {area_km2:.1f} km² walkshed")

    agency_gdf = gpd.GeoDataFrame(agency_rows, crs=CRS_PROJ).to_crs(CRS_GEO)
    agency_out = OUTPUT_DIR / "walkshed_by_agency.geojson"
    agency_gdf.to_file(agency_out, driver="GeoJSON")
    print(f"\nSaved per-agency walkshed → {agency_out}")

    # Combined GTHA walkshed
    gtha_walkshed = unary_union(agency_gdf.to_crs(CRS_PROJ).geometry)
    gtha_area_km2 = gtha_walkshed.area / 1e6

    gtha_gdf = gpd.GeoDataFrame(
        [{"geometry": gtha_walkshed}], crs=CRS_PROJ
    ).to_crs(CRS_GEO)
    gtha_out = OUTPUT_DIR / "walkshed_gtha.geojson"
    gtha_gdf.to_file(gtha_out, driver="GeoJSON")
    print(f"Combined GTHA walkshed: {gtha_area_km2:.1f} km²")
    print(f"Saved combined walkshed → {gtha_out}")


if __name__ == "__main__":
    main()
