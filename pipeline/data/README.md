# na-places.json

North America (US + Canada) populated places with population >= 50,000, trimmed from the
[GeoNames](https://www.geonames.org/) `cities500` dump (CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/).

Each row is `[name, lat, lon, countryCode, region]`. Used by `pipeline/deriveCities.ts` to derive
which cities an agency serves from its stop coordinates (nearest-city, by stop density), instead of
hand-curating a city per agency.

Regenerate by downloading `https://download.geonames.org/export/dump/cities500.zip` +
`https://download.geonames.org/export/dump/admin1CodesASCII.txt`, filtering to `US`/`CA` rows with
population >= 50000, and mapping admin1 codes to region names.
