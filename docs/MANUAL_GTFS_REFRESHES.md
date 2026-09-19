# Manual GTFS refresh queue

Snapshot from the expired-source audit on 2026-09-19. The audit checked 99
expired production snapshots: 18 had newer sources, 77 remained genuinely
expired, and these four had no verified replacement that Atlas could currently
download automatically. A follow-up source review verified nine additional
current feeds, leaving 68 agencies still unresolved.

| Agency | Why it needs manual work | Next action |
| --- | --- | --- |
| Augusta Transit | Official archive URL is unavailable and the Mobility Database copy is expired | Find a current agency feed or request one from Augusta Transit |
| LAVTA / Wheels | Configured sources are expired, including the April 2026 schedule | Find the current Wheels schedule export |
| SFMTA / Muni | Configured current and fallback candidates could not be verified as a usable current feed | Confirm the current Muni GTFS source and refresh the catalog URL |
| West Berkeley Shuttle | Cal-ITP URL does not return a usable ZIP and the catalog copy is expired | Confirm whether the shuttle still operates and locate its current feed |

The other 68 expired agencies remain candidates for source recovery, but the
audit found no current usable schedule among their configured or automatically
derived Mobility Database candidates. Start with agencies whose snapshots ended
in 2026; do not replace any of these with an older archived ZIP.

## Verified replacements awaiting refresh

The following 27 agencies have a current ZIP with matching agency identity and
can be refreshed using the configured or automatically derived source:

`abqride`, `eugene-ltd`, `gold-coast`, `goldengate`, `goraleigh`, `mont-tremblant`,
`montebello`, `mst`, `nice`, `omahametro`, `pace-bus`, `pgc-the-bus`, `ripta`,
`riverside`, `rtcwashoe`, `santafetrails`, `sdmts`, `psta`, `rct`,
`communitytransit`, `everetttransit`, `intercitytransit`, `soundtransit`,
`wmata`, `wrta`, `yolobus`, `youngstown-wrta`.

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
