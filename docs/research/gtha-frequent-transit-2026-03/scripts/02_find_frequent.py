"""
02_find_frequent.py
For each agency GTFS feed, finds all stops served by at least one route
running every 15 minutes or better within a given time window.

Outputs: data/frequent_stops.csv  (agency, stop_id, stop_lat, stop_lon)
"""

import zipfile
import pandas as pd
from pathlib import Path

GTFS_DIR = Path(__file__).parent.parent / "data" / "gtfs"

# Mapping from the existing feed filenames to short agency names.
# Adjust paths if your local copies differ.
FEED_MAP = {
    "Toronto Transit Commission (TTC).zip": "ttc",
    "Brampton Transit ON.zip": "brampton",
    "MiWay.zip": "miway",
    "York Region Transit.zip": "yrt",
    "Durham Region Transit.zip": "drt",
    "Burlington Transit.zip": "burlington",
    "Hamilton Street Railway.zip": "hsr",
    "Oakville Transit.zip": "oakville",
}

# If GTFS_DIR is empty, fall back to the pre-existing data folder
_EXISTING_GTFS = Path("/Users/ryan/Desktop/Data/GTFS/Canada/Ontario")
OUTPUT = Path(__file__).parent.parent / "data" / "frequent_stops.csv"

# Time window for headway calculation (HH:MM:SS, 24h)
# GTFS allows times > 24:00:00 for trips past midnight — this handles that
WINDOW_START = "07:00:00"
WINDOW_END   = "09:00:00"
WINDOW_MINUTES = 120

MAX_HEADWAY_MIN = 15


def time_to_seconds(t: str) -> int:
    """Convert HH:MM:SS (including >24h GTFS times) to seconds."""
    h, m, s = t.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


WINDOW_START_S = time_to_seconds(WINDOW_START)
WINDOW_END_S   = time_to_seconds(WINDOW_END)


def read_zip_table(zip_path: Path, filename: str) -> pd.DataFrame:
    """Read a CSV table from inside a GTFS zip."""
    with zipfile.ZipFile(zip_path) as z:
        # Handle feeds that nest files in a subdirectory
        names = z.namelist()
        match = next((n for n in names if n.endswith(filename)), None)
        if match is None:
            raise FileNotFoundError(f"{filename} not found in {zip_path.name}")
        with z.open(match) as f:
            return pd.read_csv(f, dtype=str)


def get_frequent_stops(feed_path: Path) -> pd.DataFrame:
    """
    Returns a DataFrame of stops (stop_id, stop_lat, stop_lon) that are
    served by at least one route with headway <= MAX_HEADWAY_MIN in window.
    """
    try:
        stop_times = read_zip_table(feed_path, "stop_times.txt")
        trips      = read_zip_table(feed_path, "trips.txt")
        stops      = read_zip_table(feed_path, "stops.txt")
    except Exception as e:
        print(f"  [{feed_path.stem}] Could not read tables: {e}")
        return pd.DataFrame()

    # Filter to trips that have at least one stop time in the window
    stop_times["dep_s"] = stop_times["departure_time"].apply(
        lambda t: time_to_seconds(t) if pd.notna(t) and t.strip() else None
    )
    in_window = stop_times[
        (stop_times["dep_s"] >= WINDOW_START_S) &
        (stop_times["dep_s"] <= WINDOW_END_S)
    ]

    if in_window.empty:
        print(f"  [{feed_path.stem}] No stop times found in window {WINDOW_START}–{WINDOW_END}")
        return pd.DataFrame()

    # Join to get route_id per trip
    in_window = in_window.merge(trips[["trip_id", "route_id"]], on="trip_id", how="left")

    # For each stop+route, compute the worst (max) gap between consecutive departures.
    # This catches bunching — e.g. 8 trips all in the first hour still fails the threshold.
    def max_gap_minutes(dep_seconds: pd.Series) -> float:
        times = sorted(dep_seconds.dropna())
        if len(times) < 2:
            return float("inf")
        gaps = [times[i + 1] - times[i] for i in range(len(times) - 1)]
        return max(gaps) / 60  # seconds → minutes

    headways = (
        in_window.groupby(["stop_id", "route_id"])["dep_s"]
        .apply(max_gap_minutes)
        .reset_index(name="max_headway_min")
    )

    # Keep stops where ANY route's worst gap is within the threshold
    frequent_stop_ids = headways[
        headways["max_headway_min"] <= MAX_HEADWAY_MIN
    ]["stop_id"].unique()

    if len(frequent_stop_ids) == 0:
        print(f"  [{feed_path.stem}] No frequent stops found")
        return pd.DataFrame()

    result = stops[stops["stop_id"].isin(frequent_stop_ids)][
        ["stop_id", "stop_lat", "stop_lon"]
    ].copy()
    return result


def main():
    feeds_raw = sorted(GTFS_DIR.glob("*.zip"))

    # If local data/gtfs is empty, use the pre-existing Ontario GTFS folder
    if not feeds_raw:
        print(f"No feeds in {GTFS_DIR} — using existing data at {_EXISTING_GTFS}")
        feeds = [
            (_EXISTING_GTFS / filename, agency)
            for filename, agency in FEED_MAP.items()
            if (_EXISTING_GTFS / filename).exists()
        ]
        missing = [f for f, _ in [(fn, ag) for fn, ag in
                   [(Path(fn), ag) for fn, ag in FEED_MAP.items()]]
                   if not (_EXISTING_GTFS / f.name).exists()]
        if missing:
            print(f"  Missing from existing folder: {missing}")
    else:
        feeds = [(f, f.stem) for f in feeds_raw]

    if not feeds:
        print("No feeds found. Run 01_download_feeds.py or check FEED_MAP paths.")
        return

    all_stops = []
    for feed_path, agency_name in feeds:
        print(f"Processing {agency_name} ({feed_path.name})...")
        df = get_frequent_stops(feed_path)
        if not df.empty:
            df["agency"] = agency_name
            print(f"  [{agency_name}] {len(df)} frequent stops")
            all_stops.append(df)
        else:
            print(f"  [{agency_name}] skipped")

    if not all_stops:
        print("No frequent stops found across any feed.")
        return

    combined = pd.concat(all_stops, ignore_index=True)
    combined.to_csv(OUTPUT, index=False)
    print(f"\nSaved {len(combined)} frequent stops to {OUTPUT}")
    print(combined.groupby("agency").size().to_string())


if __name__ == "__main__":
    main()
