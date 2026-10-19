#!/usr/bin/env python3

import csv
import statistics
import zipfile
from collections import defaultdict
from pathlib import Path


GTFS_ZIP = Path(
    "/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/Toronto Transit Commission (TTC).zip"
)
OUTPUT_CSV = GTFS_ZIP.with_name("Toronto Transit Commission (TTC) streetcar stop spacing.csv")
CLEANED_OUTPUT_CSV = GTFS_ZIP.with_name(
    "Toronto Transit Commission (TTC) streetcar stop spacing cleaned.csv"
)
DAY_OUTPUT_CSV = GTFS_ZIP.with_name("Toronto Transit Commission (TTC) streetcar day stop spacing.csv")
DAY_CLEANED_OUTPUT_CSV = GTFS_ZIP.with_name(
    "Toronto Transit Commission (TTC) streetcar day stop spacing cleaned.csv"
)
DAY_ROUTE_SUMMARY_CSV = GTFS_ZIP.with_name(
    "Toronto Transit Commission (TTC) streetcar day route summary.csv"
)

STREETCAR_ROUTE_IDS = {
    "301",
    "304",
    "305",
    "306",
    "310",
    "312",
    "501",
    "503",
    "504",
    "505",
    "506",
    "507",
    "508",
    "509",
    "510",
    "511",
    "512",
}

DAY_ROUTE_IDS = {
    "501",
    "503",
    "504",
    "505",
    "506",
    "507",
    "508",
    "509",
    "510",
    "511",
    "512",
}


def load_csv_from_zip(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as fh:
        yield from csv.DictReader(line.decode("utf-8-sig") for line in fh)


def parse_branch_code(row: dict) -> str:
    branch = (row.get("trip_short_name") or "").strip()
    if branch:
        return branch
    headsign = (row.get("trip_headsign") or "").strip()
    parts = headsign.split()
    if parts:
        token = parts[2] if len(parts) > 2 else ""
        if token.startswith(row["route_id"]) and len(token) > len(row["route_id"]):
            return token[len(row["route_id"]) :]
    return ""


def parse_direction_label(headsign: str, direction_id: str) -> str:
    if headsign and " - " in headsign:
        return headsign.split(" - ", 1)[0].strip()
    return {"0": "0", "1": "1"}.get(direction_id, direction_id)


def parse_shape_distance(value: str, stop_sequence: int) -> float | None:
    if value:
        return float(value) * 1000.0
    if stop_sequence == 1:
        return 0.0
    return None


def main() -> None:
    with zipfile.ZipFile(GTFS_ZIP) as zf:
        routes = {
            row["route_id"]: row
            for row in load_csv_from_zip(zf, "routes.txt")
            if row["route_id"] in STREETCAR_ROUTE_IDS
        }

        stops = {
            row["stop_id"]: row["stop_name"]
            for row in load_csv_from_zip(zf, "stops.txt")
        }

        trips = {}
        for row in load_csv_from_zip(zf, "trips.txt"):
            route_id = row["route_id"]
            if route_id not in routes:
                continue
            headsign = (row.get("trip_headsign") or "").strip()
            trips[row["trip_id"]] = {
                "route_id": route_id,
                "route_short_name": routes[route_id]["route_short_name"],
                "route_long_name": routes[route_id]["route_long_name"],
                "branch": parse_branch_code(row),
                "direction_id": row.get("direction_id", ""),
                "direction_label": parse_direction_label(
                    headsign=headsign,
                    direction_id=row.get("direction_id", ""),
                ),
                "trip_headsign": headsign,
            }

        stop_times_by_trip = defaultdict(list)
        for row in load_csv_from_zip(zf, "stop_times.txt"):
            trip_id = row["trip_id"]
            if trip_id not in trips:
                continue
            stop_sequence = int(row["stop_sequence"])
            shape_distance_m = parse_shape_distance(
                row.get("shape_dist_traveled", ""),
                stop_sequence,
            )
            stop_times_by_trip[trip_id].append(
                {
                    "stop_id": row["stop_id"],
                    "stop_sequence": stop_sequence,
                    "shape_distance_m": shape_distance_m,
                }
            )

    spacing_samples = defaultdict(list)

    for trip_id, trip_stop_times in stop_times_by_trip.items():
        trip_stop_times.sort(key=lambda row: row["stop_sequence"])
        trip = trips[trip_id]
        for current_stop, next_stop in zip(trip_stop_times, trip_stop_times[1:]):
            current_distance = current_stop["shape_distance_m"]
            next_distance = next_stop["shape_distance_m"]
            if current_distance is None or next_distance is None:
                continue
            spacing_m = next_distance - current_distance
            if spacing_m <= 0:
                continue
            key = (
                trip["route_id"],
                trip["route_short_name"],
                trip["route_long_name"],
                trip["branch"],
                trip["direction_id"],
                trip["direction_label"],
                current_stop["stop_id"],
                next_stop["stop_id"],
            )
            spacing_samples[key].append(round(spacing_m, 1))

    rows = []
    for key, values in spacing_samples.items():
        (
            route_id,
            route_short_name,
            route_long_name,
            branch,
            direction_id,
            direction_label,
            from_stop_id,
            to_stop_id,
        ) = key
        median_spacing = round(statistics.median(values), 1)
        mean_spacing = round(statistics.fmean(values), 1)
        rows.append(
            {
                "route_id": route_id,
                "route_short_name": route_short_name,
                "route_long_name": route_long_name,
                "branch": branch,
                "direction_id": direction_id,
                "direction_label": direction_label,
                "from_stop_id": from_stop_id,
                "from_stop_name": stops.get(from_stop_id, ""),
                "to_stop_id": to_stop_id,
                "to_stop_name": stops.get(to_stop_id, ""),
                "sample_trip_count": len(values),
                "spacing_m_median": median_spacing,
                "spacing_m_mean": mean_spacing,
                "spacing_m_min": round(min(values), 1),
                "spacing_m_max": round(max(values), 1),
            }
        )

    rows.sort(
        key=lambda row: (
            int(row["route_short_name"]),
            row["branch"],
            row["direction_id"],
            row["from_stop_name"],
            row["to_stop_name"],
        )
    )

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as fh:
        fieldnames = [
            "route_id",
            "route_short_name",
            "route_long_name",
            "branch",
            "direction_id",
            "direction_label",
            "from_stop_id",
            "from_stop_name",
            "to_stop_id",
            "to_stop_name",
            "sample_trip_count",
            "spacing_m_median",
            "spacing_m_mean",
            "spacing_m_min",
            "spacing_m_max",
        ]
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    cleaned_rows = [
        row
        for row in rows
        if row["from_stop_name"].strip().casefold()
        != row["to_stop_name"].strip().casefold()
    ]

    with CLEANED_OUTPUT_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cleaned_rows)

    day_rows = [row for row in rows if row["route_id"] in DAY_ROUTE_IDS]
    day_cleaned_rows = [row for row in cleaned_rows if row["route_id"] in DAY_ROUTE_IDS]

    with DAY_OUTPUT_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(day_rows)

    with DAY_CLEANED_OUTPUT_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(day_cleaned_rows)

    day_summary_rows = []
    day_by_route = defaultdict(list)
    for row in day_cleaned_rows:
        day_by_route[
            (row["route_id"], row["route_short_name"], row["route_long_name"])
        ].append(float(row["spacing_m_median"]))

    for route_id, route_short_name, route_long_name in sorted(
        day_by_route, key=lambda item: int(item[1])
    ):
        values = sorted(day_by_route[(route_id, route_short_name, route_long_name)])
        count = len(values)

        def percentile(p: float) -> float:
            idx = min(count - 1, max(0, round((count - 1) * p)))
            return values[idx]

        day_summary_rows.append(
            {
                "route_id": route_id,
                "route_short_name": route_short_name,
                "route_long_name": route_long_name,
                "stop_pair_count": count,
                "spacing_m_mean": round(statistics.fmean(values), 1),
                "spacing_m_median": round(percentile(0.5), 1),
                "spacing_m_p10": round(percentile(0.1), 1),
                "spacing_m_p90": round(percentile(0.9), 1),
                "spacing_m_min": round(values[0], 1),
                "spacing_m_max": round(values[-1], 1),
            }
        )

    with DAY_ROUTE_SUMMARY_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "route_id",
                "route_short_name",
                "route_long_name",
                "stop_pair_count",
                "spacing_m_mean",
                "spacing_m_median",
                "spacing_m_p10",
                "spacing_m_p90",
                "spacing_m_min",
                "spacing_m_max",
            ],
        )
        writer.writeheader()
        writer.writerows(day_summary_rows)

    print(f"Wrote {len(rows)} rows to {OUTPUT_CSV}")
    print(f"Wrote {len(cleaned_rows)} rows to {CLEANED_OUTPUT_CSV}")
    print(f"Wrote {len(day_rows)} rows to {DAY_OUTPUT_CSV}")
    print(f"Wrote {len(day_cleaned_rows)} rows to {DAY_CLEANED_OUTPUT_CSV}")
    print(f"Wrote {len(day_summary_rows)} rows to {DAY_ROUTE_SUMMARY_CSV}")


if __name__ == "__main__":
    main()
