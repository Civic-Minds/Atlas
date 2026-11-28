# Kingston row-count fixture (#1769, #1770, CIV-2227)

- **Source:** Kingston Transit's GTFS, https://api.cityofkingston.ca/gtfs/gtfs.zip, downloaded 2026-11-25.
- **Licence:** Contains information licensed under the Open Data Licence – City of Kingston (version 1.0, adapted from the Open Government Licence – Ontario): https://www3.cityofkingston.ca/documents/10180/144997/CityofKingston_OpenDataLicense.pdf
- **Trimmed to** (`make-fixture.py <source zip> <out dir>`, then zipped as `feed.zip`): routes 10 and 22, the week Mon 2026-11-30 to Sun 12-06 (calendar_dates rows of those days), every stop kept (directions are inferred from stop order), each shape thinned to every 4th point, short trip ids.
- **Why these:** route 22's "First Canada" row is time-limited; its departure counts kept only the trips inside the grading window (5 of 8 on weekdays). Route 10's counts mixed the end-stop list with the row's own list hour by hour and counted a trip near the hour line twice (34 each way against the feed's 33).
