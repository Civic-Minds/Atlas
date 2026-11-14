# History archive candidates, 2026-11-13

Research only: nothing here changes History membership or published data. Follow-ups are tracked in Linear (CIV-535 and the items it links). Supporting evidence: [`history-archive-validation.json`](history-archive-validation.json).

Read-only count of [the published History catalog](https://data.transitatlas.fyi/atlas/history-config.json), compared with `shared/data/history-agencies.json` at `6596b5dca`: **17 agencies have at least 10 distinct snapshot years through 2026**, exactly matching the committed agency list. These are distinct years with a route snapshot, not the elapsed span between the earliest and latest records; missing years and future years do not count. This catalog check does not independently revalidate the source calendar of each snapshot.

| Real snapshot years | Agencies |
| ---: | --- |
| 16 | MBTA |
| 14 | GCRTA, MARTA |
| 12 | Halifax Transit, Miami-Dade Transit, RTD Denver |
| 11 | CDTA, DDOT, Grand River Transit, IndyGo, Metro Transit, Metro St. Louis, Spokane Transit, STM |
| 10 | Burlington Transit, Community Transit, LA Metro |

**MBTA is already in the club.** The September research pool and prepared-batch notes in [DATA_HISTORY.md](../../data/DATA_HISTORY.md) are historical evidence, not the current membership or publication status.

## Existing candidates: recover missing snapshots before finding new archives

The published catalog already carries historical `coverageYears` for five agencies that have fewer than ten snapshot years. Coverage metadata establishes a sourcing lead; it does not supply route values for those years. The legacy eligibility rule counts the union, while real-year eligibility counts snapshots alone.

| Agency | Real snapshot years through 2026 | Years with only coverage metadata | Next check |
| --- | --- | --- | --- |
| Brampton Transit | **9:** 2016–2023, 2026 | 2014, 2015 | Downloaded feeds with proved weekday service in **2013, 2014, 2015, 2024, 2025** from [old MDB source](https://mobilitydatabase.org/feeds/gtfs/mdb-729) and [current source](https://mobilitydatabase.org/feeds/gtfs/mdb-1994). Any one usable new snapshot year reaches ten; all five could reach fourteen. Processor validation remains. |
| Kingston Transit | **9:** 2016, 2018, 2019, 2021–2026 | None | Downloaded [2017 and 2020 feeds](https://mobilitydatabase.org/feeds/gtfs/mdb-733), proving 1,249 and 1,352 active trips on sample weekdays. Both use `calendar_dates.txt` only. Either new snapshot year reaches ten; both could reach eleven. Processor validation remains. |
| NORTA | **7:** 2012–2015, 2020, 2021, 2026 | None | Reconcile the previously prepared 2012–2021 source batch with the missing route snapshot years. |
| SacRT | **5:** 2012, 2020, 2023, 2025, 2026 | 2013, 2014, 2018, 2019, 2024 | Check whether archived periods can supply actual route snapshots for the five coverage-only years. |
| Caltrain | **4:** 2017, 2020, 2025, 2026 | 2018, 2019, 2021–2024 | Check annual period materialization; metadata already covers ten years. |
| NFTA | **3:** 2011, 2015, 2026 | 2017–2023 | Recover route-bearing periods from the seven coverage-only years. |
| Worcester RTA | **2:** 2020, 2026 | 2013, 2014, 2016–2019, 2021, 2023–2025 | Check annual period materialization; metadata already covers twelve years. |

The November 12 local `history/tmp/history-config.dry-run.json` has the same counts for these seven candidates as today's public catalog. Re-publishing that existing output alone would not fill the gaps.

Two source checks explain why download years need care: a Caltrain feed downloaded in 2018 has calendars beginning in 2017, and a Worcester feed downloaded in 2016 begins in 2014. Blindly anchoring at the earliest calendar can select an older year; this is a follow-up hypothesis, not a verified pipeline diagnosis. NORTA's previously documented WordPress media API returned HTTP 404 during this pass, so its old prepared-batch claim does not establish a currently working download path.

## New archive shortlist

All three agencies already have Atlas agency configs. Local processing results below distinguish actual route-history years from archive labels; no agency membership or published data was changed.

| Agency | Verified archive evidence | Sample checked | Remaining validation |
| --- | --- | --- | --- |
| **Pittsburgh Regional Transit** (`port-authority-pa`) | [Official WPRDC archive](https://data.wprdc.org/en/dataset/gtfs-archive): annual feeds cover **2012–2026**. The [technical documentation](https://data.wprdc.org/dataset/d0175115-c16b-48a0-b2cc-ca967b23bd40/resource/b07e2fd6-95fa-4310-93b5-4b89fabc9c49/download/prt-gtfs-tech-doc-20260312.pdf) also describes selected 2007–2011 periods, which lack shapes. | Fifteen annual ZIPs downloaded, hashed, calendar-checked and processed successfully. Source selection follows the authoritative-feed table for each schedule period, rather than assuming one export system throughout. | Curate periods and review route identity before proposing publication; fifteen usable numerical years are confirmed below. |
| **SEPTA** (`septa`) | [Official GitHub release archive](https://github.com/septadev/GTFS/releases): 375 releases enumerated; `gtfs_public.zip` assets occur in **every release year 2015–2026** (12 years). Public downloads need no authentication. | Nested `google_bus.zip` and `google_rail.zip` processed separately for every year. Spring 2025 replaces a misleading September-release period in both feeds. | Validate a combined main-feed/regional-rail build before publication; the two independently processed outputs are not a combined publish artifact. |
| **Winnipeg Transit** (`winnipeg`) | [WT Live community archive](https://wtlivewpg.com/Pages/gtfs/): advertised ZIPs for 2010–2025. **The file labelled 2010 actually contains February–April 2011 calendars and is excluded.** The remaining annual inputs cover 2011–2025; source is a community mirror of agency feeds. | Annual source calendars and full ZIP hashes checked. The sampled `LICENCE` file states Public Domain Dedication and License v1.0. | Fourteen years produced numerical weekday route values after selecting a usable summer 2017 feed. Route numbers cannot be blindly joined across the 2025 network redesign. |

## Local processor validation

The existing local-only `pipeline/backfill-history-v2.ts` ran one agency at a time with `ATLAS_HISTORY_V2=1`, `nice -n 15`, and a 6 GB Node heap. No shared pipeline code was changed. The [supporting evidence](history-archive-validation.json) preserves source URLs, SHA256 values, actual calendar bounds, chosen service dates, numerical/blank/limited route counts and errors. Numerical years count positive finite weekday `rep.h` values; a written sidecar alone does not count.

| Agency | Usable numerical weekday years | Validation limits |
| --- | --- | --- |
| **Pittsburgh Regional Transit** | **15:** 2012–2026; 73–78 numerical routes per year. All fifteen periods processed successfully; source hashes and reference dates were independently checked against calendars. | Same-key route history shows real numerical change, but complete route geometry/terminus continuity has not been audited. |
| **SEPTA** | **12 main-feed years and 12 regional-rail years:** 2015–2026; 129–134 and 11–12 numerical routes per year respectively. | Main and regional-rail outputs were processed separately with the existing `--bus-only` policy gate. The flag's label does not change the rail input into a bus feed; no merged agency artifact was validated. |
| **Winnipeg Transit** | **14:** 2012–2025; 52–57 numerical routes per year. | The 2011 period produced 85 blank weekday routes and is excluded. Original 2017 anchored on an early September holiday before regular October service and produced no routes; the summer replacement produced 54 numerical routes on 2017-06-21. The [June 2025 network redesign](https://www.winnipeg.ca/news/2025-06-29-winnipeg-transit-launches-primary-transit-network-and-its-feeder-routes) reused numbers for different corridors: routes 28 and 31 each share zero stops between the 2024 and 2025 source feeds. Historical identities must be separated before publication. |

**Rejected periods remain in the evidence.** SEPTA's original `v202509141` main feed anchored at 2025-08-27, yielding four numerical and 162 blank weekday routes; its rail feed yielded twelve blank routes. The [spring `v202504091` source](https://github.com/septadev/GTFS/releases/tag/v202504091) instead produced 134 numerical main-feed routes on 2025-02-26 and twelve rail routes on 2025-03-19. One annual sample does not capture the [August cuts](https://www.septa.org/news/reduced-service-schedules-released/) and [September restoration](https://www.septa.org/news/ridership-september-2025/). The original 2026 main feed is retained: its chosen Wednesday is 2026-09-09 while its grid week starts 2026-10-19; the service-day model permits substituted day dates, so this difference alone is not a confirmed defect.

Winnipeg's 2011 source has real weekday service, but the existing processor produces no numerical weekday history. Missing direction IDs and headsigns were observed; the exact cause of the blank output is not established. No shared pipeline fix was attempted.

Comparable current checks use the same `representativeRep` helper over weekday `routeAllDayHeadway` stamps, rather than pattern minima. Examples: Pittsburgh **1 Freeport Road**, 50 minutes on 2012-11-21 versus 35 in the current artifact; SEPTA **4 Broad-Pattison to Fern Rock TC**, 17 minutes on 2015-09-16 versus 30 current; Winnipeg **74 Kenaston–Keewatin**, 20 minutes on 2025-09-10 versus 14 current. These demonstrate numerical differences for matching keys and names, not independently verified continuity of every route alignment. Winnipeg comparisons with current service deliberately use only post-redesign snapshots. Exact dates, source artifacts and additional examples are in the evidence JSON.

## Further source leads

These extend the pool beyond the first three agencies. Partial ZIP reads verified original calendar members and their CRC32/SHA256 values for TriMet and King County; the full ZIPs were **not** downloaded or hashed, trip references were not checked, and no route history was processed for these leads.

| Agency | Evidence | Next check |
| --- | --- | --- |
| **TriMet** (`trimet`) | [MDB `mdb-247`](https://mobilitydatabase.org/feeds/gtfs/mdb-247): a calendar member checked for **each year 2013–2026** (14). | Download annual ZIPs, prove active trip-referenced service in the target year, then process locally. |
| **King County Metro** (`kingcountymetro`) | [MDB `mdb-267`](https://mobilitydatabase.org/feeds/gtfs/mdb-267): a calendar member checked for **each year 2013–2026** (14). | Check trip references, especially the 2013 January 1 exception preceding the regular October start; then validate full annual feeds and process locally. |
| **Sound Transit** (`soundtransit`) | Metadata identifies **12 service-start years:** 2013–2021 and 2024–2026, across [legacy `tfs-44`](https://mobilitydatabase.org/feeds/gtfs/tfs-44) and [official `mdb-268`](https://mobilitydatabase.org/feeds/gtfs/mdb-268). 2022 and 2023 remain gaps. | Verify actual calendars and the legacy community-modified feed's provenance before combining sources. |
| **Capital Metro, San Diego MTS, DART Dallas** | [Austin `mdb-150`](https://mobilitydatabase.org/feeds/gtfs/mdb-150), [San Diego `mdb-13`](https://mobilitydatabase.org/feeds/gtfs/mdb-13), [Dallas `mdb-152`](https://mobilitydatabase.org/feeds/gtfs/mdb-152): download labels in each year 2013–2026. | Actual service-year calendars remain unverified; these are weaker leads, not fourteen-year claims. |

## Research follow-ups

1. Process the recovered missing-year Brampton and Kingston sources; each needs one additional real numerical snapshot year to reach ten.
2. Download full annual TriMet and King County feeds, verify trip references, and run local processing; calendar-member checks alone are not route-history validation.
3. Separate Winnipeg route identities across the 2025 redesign, and investigate 2011 blank outputs only as a bounded follow-up. Do not invent aliases or count the rejected periods.
4. Validate SEPTA's combined main/regional-rail build and choose additional within-year periods for cuts/restorations; separately curate Pittsburgh periods and review route continuity and source licensing before proposing any upload.

All processing and source downloads stayed local; no R2 writes, deployments, or membership changes were made. Preserve the archive policy: no invented years or copied route values.
