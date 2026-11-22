# Kingston minimal GTFS fixture (CIV-2039)

- **Source:** Kingston Transit's GTFS, https://api.cityofkingston.ca/gtfs/gtfs.zip, as archived on 2026-11-15 (`_feeds/archive-cache/kingston/20271115-d9ac3c697d060b79.zip`).
- **Licence:** Contains information licensed under the Open Data Licence – City of Kingston (version 1.0, adapted from the Open Government Licence – Ontario): https://www3.cityofkingston.ca/documents/10180/144997/CityofKingston_OpenDataLicense.pdf
- **Trimmed to:** routes 2 and 19, the service week of Mon 2026-11-16 to Sun 2026-11-22 (calendar_dates rows of that week only), the stops those trips use, and each shape thinned to every 4th point. Rows are otherwise as published.
- **Why these:** the feed has no calendar.txt (services come from calendar_dates only), no direction_id column, and route 2 lists its deadhead trips as "Not In Service". Route 19 is a one-way loop with a long afternoon gap. Together they exercise calendar synthesis, direction inference and the not-in-service exclusion.
