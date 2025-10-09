# etl/build_routes.py
"""
Frequent Transit Map — version 2
This script now opens any GTFS .zip file you drop into data/gtfs/
and lists all of its route short names + long names.
"""

import zipfile
import pandas as pd
from pathlib import Path

GTFS_DIR = Path("../data/gtfs")
OUT_DIR = Path("../data/out")

def list_routes(gtfs_zip_path: Path):
    """Return a DataFrame of routes from a GTFS zip."""
    with zipfile.ZipFile(gtfs_zip_path, "r") as z:
        if "routes.txt" not in z.namelist():
            print(f"⚠️  {gtfs_zip_path.name} is missing routes.txt")
            return None
        with z.open("routes.txt") as f:
            df = pd.read_csv(f)
    # show only a few helpful columns
    cols = [c for c in ["route_id", "route_short_name", "route_long_name", "route_type"] if c in df.columns]
    return df[cols]

def main():
    print("👋 Frequent Transit Map – Route Lister")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not GTFS_DIR.exists():
        print("⚠️  Folder data/gtfs/ doesn’t exist yet.")
        print("    Create it and add at least one GTFS .zip (e.g., ttc.zip).")
        return

    zips = list(GTFS_DIR.glob("*.zip"))
    if not zips:
        print("⚠️  No GTFS .zip files found in data/gtfs/.")
        print("    Download one and put it there, then rerun this script.")
        return

    for z in zips:
        print(f"\n📦 Reading {z.name} …")
        routes =
