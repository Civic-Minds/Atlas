# Metro area population sources

Official population figures used to decide which metro areas count as "large" (see
scripts/build-large-metros.ts and shared/data/large-metros.json). Fetched read-only on 2026-10-13.

- `us-cbsa-population-2024.csv`: US Census Bureau, Vintage 2024 population estimates for
  metropolitan and micropolitan statistical areas, trimmed to CBSA, NAME, LSAD, POPESTIMATE2024.
  Source: https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/metro/totals/cbsa-est2024-alldata.csv
- `ca-cma-population-2021.csv`: Statistics Canada, 2021 Census, table 98-10-0003-01, census
  metropolitan areas, trimmed to GEO, DGUID, POPULATION2021.
  Source: https://www150.statcan.gc.ca/n1/tbl/csv/98100003-eng.zip (https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000301)

Rule: the 50 largest US metropolitan statistical areas and the 10 largest Canadian CMAs.
Regenerate: `npx tsx scripts/build-large-metros.ts --fetch`.
