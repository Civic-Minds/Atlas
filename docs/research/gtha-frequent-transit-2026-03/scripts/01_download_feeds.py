"""
01_download_feeds.py
Downloads GTFS feeds for all GTHA local transit agencies (GO excluded).
Saves to data/gtfs/<agency>.zip
"""

import os
import requests
from pathlib import Path
from tqdm import tqdm

OUTPUT_DIR = Path(__file__).parent.parent / "data" / "gtfs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Official open data / direct GTFS sources for each agency.
# If a URL fails, visit the portal page or search https://database.mobilitydata.org
FEEDS = {
    # Open Data Toronto — direct resource download
    "ttc": "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/TTC%20Routes%20and%20Schedules%20Data.zip",
    # Brampton GeoHub — https://geohub.brampton.ca/pages/brampton-transit
    "brampton": "https://www.brampton.ca/EN/City-Hall/OpenGov/Open-Data-Catalogue/Documents/Google_Transit.zip",
    # City of Mississauga developer download
    "miway": "https://www.mississauga.ca/media/transit/google_transit.zip",
    # YRT Open Data — NOTE: yrt.ca may require completing a form at
    # https://forms.yrt.ca/YRT-GTFS-Data before the direct link works
    "yrt": "https://www.yrt.ca/google/google_transit.zip",
    # Durham Region Open Data — https://opendata.durham.ca/
    "drt": "https://opendata.durham.ca/datasets/feed/durham-region-transit-gtfs/google_transit.zip",
    # Burlington Navigate Open Data — https://navburl-burlington.opendata.arcgis.com/
    "burlington": "https://www.burlington.ca/en/services-and-payments/resources/Parking-and-Traffic/transit-GTFS-data.zip",
    # Hamilton Open Hamilton — https://open.hamilton.ca/datasets/6eeccf172c824c2db0484aea54ed7fe4
    "hsr": "https://www.hamilton.ca/sites/default/files/media/browser/2022-10-05/google_transit.zip",
    # Oakville Open Data — https://portal-exploreoakville.opendata.arcgis.com/
    "oakville": "https://www.oakville.ca/getmedia/b9d8e3a6-2a69-481b-b5b2-df5a59b5cba0/transit-google-transit-feed.zip",
}

def download(name: str, url: str) -> Path:
    dest = OUTPUT_DIR / f"{name}.zip"
    if dest.exists():
        print(f"  {name}: already downloaded, skipping")
        return dest

    print(f"  {name}: downloading...")
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()

    total = int(resp.headers.get("content-length", 0))
    with open(dest, "wb") as f, tqdm(
        total=total, unit="B", unit_scale=True, desc=name, leave=False
    ) as bar:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
            bar.update(len(chunk))

    print(f"  {name}: saved to {dest}")
    return dest


def main():
    print(f"Downloading {len(FEEDS)} GTFS feeds to {OUTPUT_DIR}\n")
    failed = []
    for name, url in FEEDS.items():
        try:
            download(name, url)
        except Exception as e:
            print(f"  {name}: FAILED — {e}")
            failed.append(name)

    print()
    if failed:
        print(f"Failed: {', '.join(failed)}")
        print("Check the URLs in this script — agency open data portals change.")
        print("Fallback: https://database.mobilitydata.org (search by agency name)")
    else:
        print("All feeds downloaded successfully.")


if __name__ == "__main__":
    main()
