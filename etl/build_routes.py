# etl/build_routes.py
"""
Frequent Transit Map — Minimal GTFS -> GeoJSON exporter (noisy version)
- Scans ../data/gtfs/*.zip
- For each feed, reads routes.txt and shapes.txt
- Creates one feature per (route_id, direction_id) using the most common shape_id
- Writes to ../web/data/routes.geojson (so Pages can load it)
"""

from pathlib import Path
import zipfile
import pandas as pd
import json

GTFS_DIR = Path("../data/gtfs")
WEB_DATA_DIR = Path("../web/data")
OUT_GEOJSON = WEB_DATA_DIR / "routes.geojson"

def read_csv_from_zip(z: zipfile.ZipFile, name: str) -> pd.DataFrame | None:
    if name not in z.namelist():
        return None
    with z.open(name) as f:
        return pd.read_csv(f)

def build_linestring_from_shape(shapes_df: pd.DataFrame, shape_id: str):
    shp = shapes_df[shapes_df["shape_id"] == shape_id].copy()
    if shp.empty:
        return None
    if "shape_pt_sequence" in shp.columns:
        shp = shp.sort_values("shape_pt_sequence")
    coords = list(zip(shp["shape_pt_lon"].astype(float), shp["shape_pt_lat"].astype(float)))
    if len(coords) < 2:
        return None
    return {"type": "LineString", "coordinates": coords}

def process_gtfs_zip(zip_path: Path) -> list[dict]:
    print(f"📦 Reading {zip_path.name}")
    feats: list[dict] = []
    with zipfile.ZipFile(zip_path, "r") as z:
        routes = read_csv_from_zip(z, "routes.txt")
        trips = read_csv_from_zip(z, "trips.txt")
        shapes = read_csv_from_zip(z, "shapes.txt")

        if routes is None or trips is None or shapes is None:
            missing = [n for n, df in [("routes.txt", routes), ("trips.txt", trips), ("shapes.txt", shapes)] if df is None]
            print(f"  ⚠️  Missing required files: {', '.join(missing)} — skipping.")
            return feats

        # map route_id+direction_id -> most common shape_id
        group_cols = ["route_id"]
        if "direction_id" in trips.columns:
            group_cols.append("direction_id")
        else:
            trips["direction_id"] = None
            group_cols.append("direction_id")

        for key, g in trips.groupby(group_cols):
            route_id = key[0]
            direction_id = key[1]

            if "shape_id" not in g.columns or g["shape_id"].isna().all():
                # no shapes on trips — skip this route/direction
                continue
            # choose the most frequent shape_id for this route/direction
            shape_id = g["shape_id"].mode().iloc[0]
            geom = build_linestring_from_shape(shapes, shape_id)
            if geom is None:
                continue

            r = routes[routes["route_id"] == route_id]
            if r.empty:
                short, long, rtype = "", "", 3
            else:
                row = r.iloc[0]
                short = str(row.get("route_short_name", "") or "")
                long = str(row.get("route_long_name", "") or "")
                rtype = int(row.get("route_type", 3))

            props = {
                "route_id": route_id,
                "direction_id": None if pd.isna(direction_id) else int(direction_id),
                "route_short_name": short,
                "route_long_name": long,
                "route_type": rtype
            }
            feats.append({"type": "Feature", "geometry": geom, "properties": props})

    print(f"  ✅ Built {len(feats)} features from {zip_path.name}")
    return feats

def main():
    print("👋 GTFS → GeoJSON exporter starting…")
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not GTFS_DIR.exists():
        print("⚠️  ../data/gtfs does not exist. Add GTFS zips there.")
        return

    zips = sorted(GTFS_DIR.glob("*.zip"))
    if not zips:
        print("⚠️  No GTFS zips found in ../data/gtfs.")
        return

    all_features: list[dict] = []
    for zp in zips:
        all_features.extend(process_gtfs_zip(zp))

    if not all_features:
        print("⚠️  No features were built (maybe shapes missing).")
        return

    fc = {"type": "FeatureCollection", "features": all_features}
    with open(OUT_GEOJSON, "w", encoding="utf-8") as f:
        json.dump(fc, f)
    print(f"🎯 Wrote {len(all_features)} features to {OUT_GEOJSON.resolve()}")

if __name__ == "__main__":
    main()
