# Manual GTFS refresh queue

**Last reviewed:** 2026-10-07. This is a maintained, read-only source-recovery
queue; it does not mean that the listed replacements have been approved for a
live refresh. Re-run `npm run audit-expired-sources` before acting on it.

## Latest read-only audit — 2026-10-07

The registry contains 42 production-visible agencies whose recorded feed
expiry is before the audit date. This audit downloaded and checked their
configured and fallback sources without changing feed configuration, writing
refreshed data, or starting a pipeline action.

- 34 remain genuinely expired with no verified current replacement
- 5 need manual source review: `augusta`, `kcata`, `lavta`, `sfmta`, and
  `westberkeley`
- 3 newer candidates were rejected after local processing:
  `coast-transit-ms` is already expired and degraded, `grand-junction`
  produces zero usable routes, and `snowmass-village` contains stops but no
  required routes, trips, stop times, or calendar service

No agency from this audit is approved for a live refresh. The 34 genuinely
expired agencies remain a source-recovery queue, not a batch refresh list.

## Previous read-only audit — 2026-09-26

The registry contains 80 records whose schedules were expired before the audit
date. This audit downloaded and checked candidate feeds without changing feed
configuration, writing refreshed data, or starting a pipeline action.

- 47 pass Atlas's local processing check, including hidden production record `nice-fr`
- 18 remain genuinely expired with no verified current replacement
- 8 now have verified replacement feeds: `fast-ca`, `fred-transit`, `grt`,
  `path`, `riovista`, `unioncity`, `vacaville`, and `whatcomtransit`
- 4 need manual source review: `augusta`, `lavta`, `sfmta`, and `westberkeley`
- 1 newer source is not publishable: `snowmass-village` has stops but no routes,
  trips, stop times, or calendar service

The 47 passing feeds are candidates for a coordinated refresh only. Each still
needs agency identity and active-date review before refresh authorization. The
2026-09-19 snapshot below is historical and
superseded by this audit.

Newer source candidates: `abqride`, `carta-chattanooga`, `collier`,
`communitytransit`, `culvercitybus`, `dart`, `eugene-ltd`, `everetttransit`,
`gold-coast`, `goldengate`, `goraleigh`, `grand-junction`, `imperial-valley`,
`intercitytransit`, `juneau`, `kingcountymetro`, `marta`, `mata`,
`mont-tremblant`, `montebello`, `mst`, `nice`, `nice-fr`, `omahametro`,
`pace-bus`, `palm-tran`, `pgc-the-bus`, `psta`, `rct`, `regina`, `rfta`,
`ripta`, `riverside`, `rtc`, `rtcwashoe`, `santafetrails`, `sdmts`,
`soundtransit`, `sun-metro`, `tillamook`, `torrance-transit`,
`votran`, `vvta`, `wmata`, `wrta`, `yolobus`, and `youngstown-wrta`.

Genuinely expired: `albany-ga`, `amarillo`, `b-line`, `cat-savannah`,
`cheyenne`, `dc-streetcar`, `ecat`, `evansville`, `fast-ca`, `fred-transit`,
`glendalebeeline`, `glensfallstransit`, `green-bay`, `grt`, `hocts`, `mcts`,
`moose-jaw`, `path`, `qline`, `riovista`, `rockregion`, `saint-hyacinthe`,
`taft`, `unioncity`, `vacaville`, `whatcomtransit`, `wichita`, and `xpress-ga`.

Manual-review findings: `augusta` still has only an authenticated Transitland
source; `lavta`'s official endpoint is unavailable and its latest accessible
copy ends 2026-04-30; `sfmta`'s official feed is reachable but ends 2026-08-28;
and `westberkeley` still has no valid downloadable GTFS, although current city
documents confirm that the shuttle operates. None is safe to refresh yet.

Historical snapshot from the expired-source audit on 2026-09-19. The audit checked 74
remaining expired production snapshots: 40 now have newer sources, 30 remain genuinely
expired, and these four have no verified replacement that Atlas could currently
download automatically.

| Agency | Why it needs manual work | Next action |
| --- | --- | --- |
| Augusta Transit | Official archive URL is unavailable and the Mobility Database copy is expired | Find a current agency feed or request one from Augusta Transit |
| LAVTA / Wheels | Configured sources are expired, including the April 2026 schedule | Find the current Wheels schedule export |
| SFMTA / Muni | The official ZIP downloads, but its service calendar ends 2026-08-28 and no later feed was verified | Confirm the next Muni GTFS release and refresh the catalog URL |
| West Berkeley Shuttle | Cal-ITP URL does not return a usable ZIP and the catalog copy is expired | Confirm whether the shuttle still operates and locate its current feed |

The 18 agencies below remain candidates for source recovery. The read-only audit
and follow-up research found no current usable replacement among their configured,
official, or automatically derived candidates. Start with agencies whose snapshots
ended in 2026; do not replace any of these with an older archived ZIP.

| Agency slug | Latest candidate expiry |
| --- | --- |
| `albany-ga` | 20240630 |
| `amarillo` | 20211231 |
| `b-line` | 20250531 |
| `cat-savannah` | 20250727 |
| `cheyenne` | 20250914 |
| `ecat` | 20221101 |
| `evansville` | 20250115 |
| `glendalebeeline` | 20220831 |
| `green-bay` | 20201231 |
| `hocts` | 20211231 |
| `mcts` | 20250823 |
| `moose-jaw` | 20240331 |
| `qline` | 20251231 |
| `rockregion` | 20251019 |
| `saint-hyacinthe` | 20241231 |
| `taft` | 20220101 |
| `wichita` | 20260814 |
| `xpress-ga` | 20250705 |
| `whatcomtransit` | Not recorded in this audit snapshot |

## Follow-up source findings — 2026-09-26

Eight current sources were found and passed Atlas's local processing check. These
are documented for a later, separately authorized refresh; this audit did not
change agency configuration or write refreshed artifacts.

| Agency | Replacement URL | Result |
| --- | --- | --- |
| `fred-transit` | `https://www.fredericksburgva.gov/DocumentCenter/View/31122/FXBGO-GTFS---CY2026` | Official CY2026 feed; processed successfully. The feed has no `feed_info.txt` expiry, so the official publication date is the active-date evidence. |
| `grt` | `https://webapps.regionofwaterloo.ca/api/grt-routes/api/staticfeeds/0` | Official GRT endpoint; processed successfully. The feed has no `feed_info.txt` expiry, so the official open-data page is the active-source evidence. |
| `path` | `https://rapid.nationalrtap.org/GTFSFileManagement/UserUploadFiles/14843/PATHGTFS.zip` | Current PATH feed; processed successfully through 2026-11-14. It was directly downloadable without a token from this environment. |
| `fast-ca` | `https://api.511.org/transit/datafeeds?operator_id=FS&api_key=<MUNI_511_API_KEY>` | Current 511.org feed; processed successfully through 2027-06-30. Atlas's existing 511 key provided access. Quality review: 90/100. |
| `riovista` | `https://api.511.org/transit/datafeeds?operator_id=RV&api_key=<MUNI_511_API_KEY>` | Current 511.org feed; processed successfully through 2027-12-31. Atlas's existing 511 key provided access. Quality review: 90/100. |
| `unioncity` | `https://api.511.org/transit/datafeeds?operator_id=UC&api_key=<MUNI_511_API_KEY>` | Current 511.org feed; processed successfully through 2027-08-16. Atlas's existing 511 key provided access. Quality healthy: 100/100. |
| `vacaville` | `https://api.511.org/transit/datafeeds?operator_id=VC&api_key=<MUNI_511_API_KEY>` | Current 511.org feed; processed successfully through 2026-12-31. Atlas's existing 511 key provided access. Quality healthy: 100/100. |
| `whatcomtransit` | `https://github.com/whatcomtrans/publicwtadata/raw/master/GTFS/wta_gtfs_latest.zip` | Current public agency repository feed; processed successfully through 2027-02-06. |

Other candidate URLs checked during this pass were not publishable replacements:

- `mcts`: the official-looking `https://kamino.mcts.org/gtfs/google_transit.zip`
  could not be reached from this environment after repeated connection timeouts.
- `moose-jaw`: the city still links its official ZIP, but it still ends
  2024-03-31.
- `green-bay`: the city URL is reachable through the current catalog, but the
  latest available version ends 2026-07-08, so it is already expired.
- `taft`: the Cal-ITP URL returns an HTML page rather than a ZIP, and the
  available catalog copy is old.
- `amarillo`: a current regional feed exists, but it still requires a separate
  token and was not directly downloadable here.

## Research findings for unresolved agencies

These findings record why a candidate was not configured. A current-looking
catalog entry is not enough; Atlas needs a downloadable ZIP with the matching
agency identity and service dates extending beyond the audit date.

| Agencies | Finding |
| --- | --- |
| `cheyenne`, `saint-hyacinthe` | The agency is active, but no current public static GTFS ZIP was found. |
| `albany-ga` | Albany Transit remains active, but its official National RTAP feed ends 2024-06-30 and the city site publishes schedules without a newer GTFS ZIP. |
| `ecat` | ECAT remains active, but the Florida Transit Data Exchange’s latest ECAT post is from February 2022 and no newer public static ZIP was found. |
| `amarillo` | The official source requires a token and returns HTTP 403 here; the catalog’s latest listed version runs through 2026-12-30, but no current ZIP was directly verified. |
| `cat-savannah` | The official `GTFS-1.zip` downloads and identifies Chatham Area Transit, but its feed ends 2026-05-31. |
| `rockregion` | The official `rrmetro.org/gtfs.zip` downloads, but its current file has no regular calendar service and its exception dates end 2025-10-19. |
| `taft`, `xpress-ga` | A matching feed was found, but its service window ended before or at the audit date. |
| `wichita` | The official download works, but the fetched file ends 2026-05-22; Transitland’s latest catalog version ends 2026-08-14. |
| `tillamook` | The current matching feed ends 2026-09-01, while the official district site shows service continuing and expanding in 2026; no later static feed was verified. |
| `qline` | QLINE is still operating, but the matching feed identifies Qline Detroit and ends 2025-12-31; no newer static schedule was verified. |
| `b-line` | A current California B-Line feed was found, but this Atlas slug is the Corpus Christi RTA B-Line and the agency identities do not match. |
| `mcts` | Catalog metadata shows a newer schedule, but the official download timed out repeatedly and could not be directly validated from this environment. |
| `green-bay` | The catalog points to the official Green Bay document, but its download returns HTTP 403 here and the older alternate host is unavailable; no current ZIP was verified. |
| `evansville` | The official METS URL has a 2026-06-02–2026-12-31 feed, but its download returns HTTP 403 here; do not configure the unverified archive copy. |
| `glendalebeeline` | Transitland reports the official Glendale URL has a matching 2026-08-30–2027-10-01 version, but the official download returns HTTP 403 here; do not configure the unverified mirror. |
| `fast-ca`, `riovista`, `unioncity`, `vacaville` | Resolved on 2026-09-28 using Atlas's existing 511.org key; see the verified replacements above. |
| `hocts` | The configured feed remains expired and malformed; no newer matching HOCTS feed was found. |
| `moose-jaw` | The city still links its official GTFS URL and it downloads, but the feed still ends 2024-03-31; no current replacement was verified. |

Additional source checks on 2026-09-27 did not produce a publishable replacement:

- `hocts`: the official county page and the current public scorecard still point
  to the same expired feed; downloading that URL returned the old 2020 archive,
  not a current schedule.
- `qline`: transit.det.city confirms a 2026-01-01–2027-12-31 QLINE dataset,
  but it does not publish the underlying ZIP URL; the agency's Transitland
  source remains the expired 2025 file.
- `wichita`: the official site has newer rider schedules, but the available
  GTFS URL and Transitland copy still end before the audit date; no replacement
  download was verified.
- `cheyenne`: the city is actively operating and has newer service notices, but
  the published National RTAP feed still ends 2025-09-14; no newer ZIP was
  found.
- `green-bay`: the city now gates its transit-data downloads behind a developer
  license agreement; the public page does not expose a downloadable ZIP URL
  that Atlas can validate automatically.
- `albany-ga`: the city publishes current route information and Georgia reports
  that Albany added GTFS data in 2025, but the discoverable feed still ends
  2024-06-30 and no newer ZIP URL was verified.
- `amarillo`: the catalog lists a 2024 source with service through 2026-12-30,
  but it requires a query token; no directly downloadable authoritative ZIP was
  verified.

## Discontinued or merged services

These agencies remain in the historical audit output but should not receive a
replacement feed:

- `dc-streetcar`: DDOT ended DC Streetcar service on 2026-03-31.

- `glensfallstransit`: Greater Glens Falls Transit was merged into CDTA on
  2024-01-01; the old independent feed is no longer the right source.

## Verified replacements awaiting refresh

The following 67 agencies have a current ZIP with matching agency identity and
can be refreshed using the configured or automatically derived source:

`abqride`, `arvin`, `athens-oh`, `avta`, `blacksburg`, `carson-circuit`, `carta-chattanooga`, `clemson-cat`, `davenport`, `duke`, `elmonte`, `emta`, `eugene-ltd`, `gold-coast`, `goldengate`, `goraleigh`, `grand-junction`, `indygo`, `jfk-airtrain`, `mont-tremblant`, `mountainmetro`, `rts`, `sacrt`,
`culvercitybus`, `imperial-valley`, `kingcountymetro`, `mata`, `marta`, `montebello`, `mst`, `nice`, `omahametro`, `pace-bus`, `pgc-the-bus`, `regina`, `ripta`,
`riverside`, `rtc`, `rtcwashoe`, `santafetrails`, `saskatoon`, `sdmts`, `sioux-falls`, `skagittransit`, `starmetro`, `psta`, `rct`,
`communitytransit`, `everetttransit`, `guelph`, `intercitytransit`, `kenosha`, `nctd`, `octranspo`, `soundtransit`, `torrance-transit`,
`theride`, `valley-express`, `votran`, `vvta`, `waukesha-metro`, `wmata`, `wrta`, `yolobus`, `youngstown-wrta`, `sun-metro`.

Refreshing these agencies writes to live R2 and must be authorized separately.

Do not replace these URLs with an older catalog snapshot just to clear the
warning. Re-run the read-only audit after each source change:

```sh
npm run audit-expired-sources
```

Once a replacement is validated by agency identity and active service dates,
update its config and run:

```sh
npm run refresh -- <slug>
```
