# Manual GTFS refresh queue

Snapshot from the expired-source audit on 2026-09-19. The audit checked 76
remaining expired production snapshots: 40 now have newer sources, 32 remain genuinely
expired, and these four have no verified replacement that Atlas could currently
download automatically.

| Agency | Why it needs manual work | Next action |
| --- | --- | --- |
| Augusta Transit | Official archive URL is unavailable and the Mobility Database copy is expired | Find a current agency feed or request one from Augusta Transit |
| LAVTA / Wheels | Configured sources are expired, including the April 2026 schedule | Find the current Wheels schedule export |
| SFMTA / Muni | Configured current and fallback candidates could not be verified as a usable current feed | Confirm the current Muni GTFS source and refresh the catalog URL |
| West Berkeley Shuttle | Cal-ITP URL does not return a usable ZIP and the catalog copy is expired | Confirm whether the shuttle still operates and locate its current feed |

The 31 agencies below remain candidates for source recovery. The read-only audit
found no current usable schedule among their configured or automatically derived
Mobility Database candidates. Start with agencies whose snapshots ended in 2026;
do not replace any of these with an older archived ZIP.

| Agency slug | Latest candidate expiry |
| --- | --- |
| `albany-ga` | 20240630 |
| `amarillo` | 20211231 |
| `avon-transit` | 20250413 |
| `b-line` | 20250531 |
| `cat-savannah` | 20250727 |
| `cheyenne` | 20250914 |
| `ecat` | 20221101 |
| `evansville` | 20250115 |
| `fast-ca` | 20260630 |
| `fred-transit` | 20250331 |
| `glendalebeeline` | 20220831 |
| `glensfallstransit` | 20231231 |
| `green-bay` | 20201231 |
| `grt` | 20260426 |
| `hocts` | 20211231 |
| `mcts` | 20250823 |
| `moose-jaw` | 20240331 |
| `octranspo` | 20260829 |
| `path` | 20260601 |
| `qline` | 20251231 |
| `riovista` | 20250131 |
| `rockregion` | 20251019 |
| `rts` | 20250817 |
| `sacrt` | 20260613 |
| `saint-hyacinthe` | 20241231 |
| `taft` | 20220101 |
| `tillamook` | 20260901 |
| `unioncity` | 20230927 |
| `vacaville` | 20260630 |
| `wichita` | 20260814 |
| `xpress-ga` | 20250705 |

## Research findings for unresolved agencies

These findings record why a candidate was not configured. A current-looking
catalog entry is not enough; Atlas needs a downloadable ZIP with the matching
agency identity and service dates extending beyond the audit date.

| Agencies | Finding |
| --- | --- |
| `albany-ga`, `cheyenne`, `ecat`, `riovista`, `saint-hyacinthe` | The agency is active, but no current public static GTFS ZIP was found. |
| `amarillo`, `fred-transit` | An official or catalog URL was found, but download access returned an authorization or server error. |
| `avon-transit`, `cat-savannah`, `qline`, `rts`, `sacrt`, `rockregion`, `taft`, `tillamook`, `wichita`, `xpress-ga` | A matching feed was found, but its service window ended before or at the audit date. |
| `b-line` | A current California B-Line feed was found, but this Atlas slug is the Corpus Christi RTA B-Line and the agency identities do not match. |
| `evansville`, `glendalebeeline`, `green-bay`, `mcts` | Catalog metadata shows a newer schedule, but the official download could not be directly validated from this environment. |
| `fast-ca`, `unioncity`, `vacaville` | The current regional feed is behind an API key, so no public static ZIP was verified. |
| `hocts` | The configured feed remains expired and malformed; no newer matching HOCTS feed was found. |
| `moose-jaw` | The official city feed is available, but its schedule is stale. |
| `octranspo` | The official static feed requires developer registration/API access. |
| `path` | Only realtime data was found; no current static schedule ZIP was verified. |

## Discontinued or merged services

These agencies remain in the historical audit output but should not receive a
replacement feed:

- `dc-streetcar`: DDOT ended DC Streetcar service on 2026-03-31.

- `glensfallstransit`: Greater Glens Falls Transit was merged into CDTA on
  2024-01-01; the old independent feed is no longer the right source.

## Verified replacements awaiting refresh

The following 63 agencies have a current ZIP with matching agency identity and
can be refreshed using the configured or automatically derived source:

`abqride`, `arvin`, `athens-oh`, `avta`, `blacksburg`, `carson-circuit`, `carta-chattanooga`, `clemson-cat`, `davenport`, `duke`, `elmonte`, `emta`, `eugene-ltd`, `gold-coast`, `goldengate`, `goraleigh`, `grand-junction`, `indygo`, `jfk-airtrain`, `mont-tremblant`, `mountainmetro`,
`culvercitybus`, `imperial-valley`, `kingcountymetro`, `mata`, `marta`, `montebello`, `mst`, `nice`, `omahametro`, `pace-bus`, `pgc-the-bus`, `regina`, `ripta`,
`riverside`, `rtc`, `rtcwashoe`, `santafetrails`, `saskatoon`, `sdmts`, `sioux-falls`, `skagittransit`, `starmetro`, `psta`, `rct`,
`communitytransit`, `everetttransit`, `guelph`, `intercitytransit`, `kenosha`, `nctd`, `soundtransit`, `torrance-transit`,
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
