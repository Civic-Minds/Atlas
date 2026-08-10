# GTFS feed status

Snapshot from the full production refresh on 2026-08-10.

The refresh checked 465 production-visible agencies. It uploaded 116 current feeds and left the previous artifact unchanged for 73 agencies whose configured sources had no current service date. Two additional agencies failed to download and are listed below. The 143 agencies in countries not launched in production were not checked.

Freshness is derived from the latest date in `feed_info.txt`, `calendar.txt`, and added `calendar_dates.txt` entries. An expired or metadata-less source is now skipped and reported in `atlas/feed-refresh-meta.json` instead of silently replacing the published artifact.

## Sources needing follow-up

These agencies had no verified current source during the refresh:

`guelph`, `grt`, `saint-hyacinthe`, `saskatoon`, `qline`, `emta`, `moose-jaw`, `skagittransit`, `hocts`, `glensfallstransit`, `eugene-ltd`, `cherriots`, `unioncity`, `lavta`, `westberkeley`, `riovista`, `vacaville`, `fast-ca`, `rct`, `sacrt`, `yolobus`, `torrance-transit`, `carson-circuit`, `gold-coast`, `avta`, `nctd`, `mountainmetro`, `santafetrails`, `rockregion`, `mata`, `metrostlouis`, `mcts`, `culvercitybus`, `glendalebeeline`, `vvta`, `elmonte`, `transfort`, `path`, `indygo`, `votran`, `psta`, `xpress-ga`, `dc-streetcar`, `fred-transit`, `starmetro`, `cat-savannah`, `sun-tran`, `carta-chattanooga`, `sun-metro`, `amarillo`, `ecat`, `rts`, `b-line`, `waukesha-metro`, `green-bay`, `augusta`, `greensboro`, `evansville`, `kenosha`, `blacksburg`, `sioux-falls`, `grand-junction`, `davenport`, `albany-ga`, `clemson-cat`, `duke`, `athens-oh`, `jfk-airtrain`, `cheyenne`, `imperial-valley`, `arvin`, `valley-express`, `taft`.

Download failures requiring a separate retry/source check:

- `beeline` — source returned HTTP 503.
- `njt-bus` — source failed with a TLS connection error.

## Recheck

Run the read-only audit before changing a source:

```sh
npm run audit-feed-freshness
```

Run the production refresh only after validating a replacement feed by agency identity and active service calendar:

```sh
npm run refresh -- <slug>
```
