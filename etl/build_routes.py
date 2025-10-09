"""GTFS routes to GeoJSON converter."""
from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Iterable, List

import pandas as pd

GTFS_DIR = Path("../data/gtfs")
OUT_DIR = Path("../data/out")
OUT_FILE = OUT_DIR / "routes.geojson"
REQUIRED_COLUMNS = [
    "route_id",
    "route_short_name",
    "route_long_name",
    "route_type",
]


def _read_routes_from_zip(zip_path: Path) -> pd.DataFrame:
    """Read routes.txt from a GTFS zip archive."""
    with zipfile.ZipFile(zip_path, "r") as archive:
        if "routes.txt" not in archive.namelist():
            return pd.DataFrame(columns=REQUIRED_COLUMNS)
        with archive.open("routes.txt") as routes_file:
            df = pd.read_csv(routes_file)
    # ensure required columns exist
    for column in REQUIRED_COLUMNS:
        if column not in df.columns:
            df[column] = None
    return df[REQUIRED_COLUMNS]


def _collect_routes(zip_paths: Iterable[Path]) -> pd.DataFrame:
    frames: List[pd.DataFrame] = []
    for zip_path in zip_paths:
        frames.append(_read_routes_from_zip(zip_path))
    if not frames:
        return pd.DataFrame(columns=REQUIRED_COLUMNS)
    return pd.concat(frames, ignore_index=True)


def _routes_to_geojson(df: pd.DataFrame) -> dict:
    features = []
    for _, row in df.iterrows():
        properties = {column: row[column] for column in REQUIRED_COLUMNS}
        features.append({
            "type": "Feature",
            "geometry": None,
            "properties": properties,
        })
    return {
        "type": "FeatureCollection",
        "features": features,
    }


def main() -> None:
    zip_paths = sorted(GTFS_DIR.glob("*.zip"))
    routes_df = _collect_routes(zip_paths)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    geojson = _routes_to_geojson(routes_df)
    OUT_FILE.write_text(json.dumps(geojson, indent=2))


if __name__ == "__main__":
    main()
