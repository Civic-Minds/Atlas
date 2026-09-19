# Manual GTFS refresh queue

Snapshot from the expired-source audit on 2026-09-19. The audit checked 98
remaining expired production snapshots: 40 now have newer sources, 46 remain genuinely
expired, and these four have no verified replacement that Atlas could currently
download automatically.

| Agency | Why it needs manual work | Next action |
| --- | --- | --- |
| Augusta Transit | Official archive URL is unavailable and the Mobility Database copy is expired | Find a current agency feed or request one from Augusta Transit |
| LAVTA / Wheels | Configured sources are expired, including the April 2026 schedule | Find the current Wheels schedule export |
| SFMTA / Muni | Configured current and fallback candidates could not be verified as a usable current feed | Confirm the current Muni GTFS source and refresh the catalog URL |
| West Berkeley Shuttle | Cal-ITP URL does not return a usable ZIP and the catalog copy is expired | Confirm whether the shuttle still operates and locate its current feed |

The 46 agencies below remain candidates for source recovery. The read-only audit
found no current usable schedule among their configured or automatically derived
Mobility Database candidates. Start with agencies whose snapshots ended in 2026;
do not replace any of these with an older archived ZIP.

| Agency slug | Latest candidate expiry |
| --- | --- |
| `albany-ga` | 20240630 |
| `amarillo` | 20211231 |
| `athens-oh` | 20241231 |
| `avon-transit` | 20250413 |
| `b-line` | 20250531 |
| `blacksburg` | 20260731 |
| `cat-savannah` | 20250727 |
| `cheyenne` | 20250914 |
| `davenport` | 20241231 |
| `dc-streetcar` | 20250630 |
| `ecat` | 20221101 |
| `elmonte` | 20251031 |
| `emta` | 20231101 |
| `evansville` | 20250115 |
| `fast-ca` | 20260630 |
| `fred-transit` | 20250331 |
| `glendalebeeline` | 20220831 |
| `glensfallstransit` | 20231231 |
| `green-bay` | 20201231 |
| `grt` | 20260426 |
| `guelph` | 20250830 |
| `hocts` | 20211231 |
| `jfk-airtrain` | 20211231 |
| `kenosha` | 20240901 |
| `mcts` | 20250823 |
| `moose-jaw` | 20240331 |
| `nctd` | 20250517 |
| `octranspo` | 20260829 |
| `path` | 20260601 |
| `qline` | 20251231 |
| `riovista` | 20250131 |
| `rockregion` | 20251019 |
| `rts` | 20250817 |
| `sacrt` | 20260613 |
| `saint-hyacinthe` | 20241231 |
| `sioux-falls` | 20240403 |
| `starmetro` | 20240901 |
| `taft` | 20220101 |
| `theride` | 20260822 |
| `tillamook` | 20260901 |
| `unioncity` | 20230927 |
| `vacaville` | 20260630 |
| `valley-express` | 20250815 |
| `waukesha-metro` | 20250601 |
| `wichita` | 20260814 |
| `xpress-ga` | 20250705 |

DC Streetcar is listed for historical audit completeness, but DDOT ended service
on 2026-03-31. It should not receive a replacement feed.

## Verified replacements awaiting refresh

The following 49 agencies have a current ZIP with matching agency identity and
can be refreshed using the configured or automatically derived source:

`abqride`, `arvin`, `avta`, `carson-circuit`, `carta-chattanooga`, `clemson-cat`, `duke`, `eugene-ltd`, `gold-coast`, `goldengate`, `goraleigh`, `grand-junction`, `indygo`, `mont-tremblant`, `mountainmetro`,
`culvercitybus`, `imperial-valley`, `kingcountymetro`, `mata`, `marta`, `montebello`, `mst`, `nice`, `omahametro`, `pace-bus`, `pgc-the-bus`, `regina`, `ripta`,
`riverside`, `rtc`, `rtcwashoe`, `santafetrails`, `saskatoon`, `sdmts`, `skagittransit`, `psta`, `rct`,
`communitytransit`, `everetttransit`, `intercitytransit`, `soundtransit`, `torrance-transit`,
`votran`, `vvta`, `wmata`, `wrta`, `yolobus`, `youngstown-wrta`, `sun-metro`.

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
