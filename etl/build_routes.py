# etl/build_routes.py
"""
Frequent Transit Map - Starter ETL Script
This script is your "kitchen." Right now it just checks that your folders exist.
Later, it will open GTFS files, compute route frequencies, and export GeoJSON.
"""

import os
from pathlib import Path

# Define where your data lives
GTFS_DIR = Path("../data/gtfs")   # where GTFS .zip files will go
OUT_DIR = Path("../data/out")     # where results will be saved

def main():
    print("👋 Hello from build_routes.py!")
    print(f"Looking for GTFS files in: {GTFS_DIR.resolve()}")

    # Create output folder if it doesn't exist
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output folder ready at: {OUT_DIR.resolve()}")

    # List GTFS files if any exist
    zips = list(GTFS_DIR.glob("*.zip"))
    if not zips:
        print("⚠️ No GTFS files found yet. Drop a .zip into data/gtfs/")
    else:
        print("Found these GTFS files:")
        for z in zips:
            print(" •", z.name)

    print("✅ Setup check complete.")

if __name__ == "__main__":
    main()
