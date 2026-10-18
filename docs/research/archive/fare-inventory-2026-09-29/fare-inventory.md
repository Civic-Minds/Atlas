# Atlas Fare Inventory (2026-09-29)

Research snapshot for the 693 agencies in Atlas's current registry. This is a best-effort core-fare inventory, not a complete concession or fare-product catalog.

## Coverage

- Confirmed or candidate fare records: 243
- Agencies without a usable fare record: 450
- Sources: current Atlas fare overrides and GTFS feeds available locally or fetched during this run
- Research date: 2026-09-29

Status counts: no fare found (414), partially confirmed (147), confirmed (96), unresolved (24), inaccessible (12).

## Lowest fare candidates found

| Agency | Fare | Type | Confidence | Source |
| --- | ---: | --- | --- | --- |
| Pioneer Valley Transit Authority | $0.00 USD | free service | high | [source](https://www.pvta.com/faresPasses.php) |
| Avon Transit | $0.00 USD | GTFS Fares V2 base product | medium | [source](https://www.avon.org/DocumentCenter/View/25051/TownOfAvon_gtfs) |
| DeKalb Public Transit | $0.25 USD | GTFS Fares V1 fare attribute | low | [source](http://data.trilliumtransit.com/gtfs/cityofdekalb-il-us/cityofdekalb-il-us.zip) |
| Culver City Bus | $0.35 USD | GTFS Fares V2 base product | medium | [source](https://web.culvercity.org/gtfs/gtfsexport.zip) |
| TriMet (Portland, OR) | $0.40 USD | GTFS Fares V2 base product | medium | [source](http://developer.trimet.org/schedule/gtfs.zip) |
| San Joaquin RTD | $0.50 USD | GTFS Fares V2 base product | medium | [source](http://sjrtd.com/RTD-GTFS/RTD-GTFS.zip) |
| Santa Barbara Metropolitan Transit District (MTD) | $0.50 USD | GTFS Fares V2 base product | medium | [source](https://files.mobilitydatabase.org/mdb-1246/latest.zip) |
| City of San Luis Obispo Transit | $0.50 USD | GTFS Fares V1 fare attribute | low | [source](https://files.mobilitydatabase.org/mdb-44/mdb-44-202603280107/mdb-44-202603280107.zip) |
| El Monte Transit | $0.50 USD | GTFS Fares V1 fare attribute | low | [source](https://rapid.nationalrtap.org/GTFSFileManagement/UserUploadFiles/11664/Google_Transit.zip) |
| Mason City Public Transit | $0.50 USD | GTFS Fares V1 fare attribute | low | [source](http://data.trilliumtransit.com/gtfs/masoncity-ia-us/masoncity-ia-us.zip) |
| Sun Metro (El Paso) | $0.50 USD | GTFS Fares V1 fare attribute | low | [source](https://transit.sunmetro.net/google_transit/google_transit.zip) |
| Tangipahoa Transit (Hammond) | $0.50 USD | GTFS Fares V1 fare attribute | low | [source](https://files.mobilitydatabase.org/ntd-60196/latest.zip) |

## Interpretation

GTFS fare files often publish several products without enough metadata to identify the ordinary adult fare. Those records are retained as candidates and marked partial or low-confidence. Missing fare data does not mean the agency is free; it means no usable fare was verified in the sources inspected.

The full per-agency evidence ledger is in the companion JSON and CSV files.
