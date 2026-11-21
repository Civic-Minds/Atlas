# CIV-845 / CIV-1957 evidence (re-run 2026-11-19, read-only; nothing pushed, no writes to Linear/GitHub/R2)

All paths below are under `/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/` (called `SP`).
Run everything with `~/Developer/Code/Platforms/Atlas/node_modules/.bin/tsx`, `nice -n 15`, one job at a time.
`runall.sh` / `runall2.sh` in this folder re-run every rejection experiment and write `outputs/*.out`.
`scripts/` is a copy of all scratchpad `.ts` files (relative imports intact; the data folders `drt`, `ttc*` live in `SP`, the scripts point there by absolute path).
`outputs_orig/` holds the first-run outputs (r_out.txt, r2_out.txt, ...) and the CIV-1957 diff.

## Baseline data
- LIVE published DRT: `https://data.transitatlas.fyi/atlas/drt.json` (+ `-stops`, `-sections`, `-stops-meta`); release pointer `atlas/release.json` = `release-mwmiit1u`, generatedAt 2026-11-18T19:30:27Z, drt files last-modified 2026-11-18 19:54 GMT. Saved copies: `SP/live/`.
- Per-stop published value = `properties.stopPeriodHeadways[stop][period]`; longest wait the stop was judged on = `stopPeriodCoverageHeadways`. (Not `sections.json`: that is a different, stretch-level field.)
- Replay GTFS: `SP/drt` (DRT feed, calendar 2026-10-19..11-29, service date 2026-11-18) and `SP/ttc*` (TTC, 2026-10-21 Wed / 10-24 Sat); `civ845-evidence/feeds/hamilton` (HSR, `_feeds/hamilton/20261226-fresh.zip`, date 2026-11-18). Scripts floor times to whole minutes like the pipeline.
- Replay vs LIVE, DRT 900 weekday evening: 59/59 EB stops and 56/56 WB stops identical (python check in the report; recompute with `an.ts`/`out/base12.json` vs `live/drt.json`).
- No local usable data for RTC 219 (current `rtc` feed has no route 219), Freedom M (`freedom-transit` has no route M; feed has calendar_dates only), GO 41 (calendar_dates only, 81 MB stop_times). Those pinned cases exist only as unit fixtures.

## Majority-refuse replay (item 2) and CIV-1957 branch (item 3)
- Real code, pinned snapshots (git archive) in `snap/`: `main` = origin/main 6af657cb6, `branch` = 0437649cc, plus scratch copies with only `POOLED_MAX_GAP_TYPICAL_RATIO` edited (`main155` 1.55, `main15` 1.5, `main14` 1.4, `branch15`).
- `mr.ts` = harness (SET=base12|wide|pin|hsr|marg; VARIANTS=...; OUTD=out dir). `an.ts` = analysis. `wb.ts` = WB 34-42 gap listing. `mixed.py` = sections still mixing pass+refused.
- Commands:
  - `SET=base12 VARIANTS=main,branch,main155,main15 nice -n 15 tsx mr.ts` then `SET=base12 SHOW="900 EB eve;900 WB eve" tsx an.ts`
  - same for `pin`, `marg`, `hsr`, `wide` (VARIANTS=main,branch,main155); ratio 1.4: `OUTD=out14 SET=<set> VARIANTS=main,main14 tsx mr.ts`, `OUTD=out14 SET=<set> tsx an.ts`
  - `python3 mixed.py`; `tsx wb.ts`
- Sets: base12 = the 12 DRT/TTC replay cases (759 stops); wide = DRT 900/901 + TTC 102, 52, 41, 25, 29, 35, 54, 95, 10, 85, 32, 5 x 2 directions x AM/Mid/PM/Eve (112 windows, 5,964 stops); pin = TTC 52 mid Wed, TTC 41 Sat mid, DRT 900 midday; hsr = HSR 05 x 2 dirs x 4 periods x filters 10 and 15 (each stop counted once per filter); marg = TTC 52 x 2 dirs x 4 periods at filter 10.
- Section = contiguous pooled stops of one pattern with the same sharer set. Majority-refuse refuses the pooled value at every stop of a section only when >50% of its stops (with a reading) already refuse; never turns a refused stop into a pass. A newly refused stop shows `ownValue ?? longestGap` (same as #1417).
- Headline numbers (published values changed vs today's gate; "over-draw" = pooled value shown while the longest wait is >= 1.5x it, a ruler I chose; check the lists with `LIST=1`):

| set | gate | stops changed | crossing the filter | over-draws removed | real frequent dropped |
|---|---|---|---|---|---|
| base12 | MR on today's gate | 47 | 9 | 8 | 1 (WB 42, 17->24) |
| base12 | CIV-1957 branch alone | 7 | 7 | 7 | 0 |
| base12 | branch + MR | 54 | 16 | 15 | 1 |
| wide | MR on today | 56 | 15 | 8 | 7 (TTC 52 d1 AM x6 10->16, WB 42) |
| wide | branch alone | 14 (13 pass->refused, 1 refused->pass) | 13 | 13 | 0 |
| wide | branch + MR | 71 | 28 | 21 | 7 |
| hsr (HSR 05) | MR on today | 14 | 7 | 0 | 7 (PM d1: 5 stops 7->15; AM d0: 2 stops 15->30) |
| marg (TTC 52 f10) | MR on today | 9 | 9 | 1 (eve d1 stop 7->19) | 8 (AM d1 10->14/16) |
| pin (TTC 52 mid, 41 Sat, 900 mid) | MR / branch / branch+MR | 0 | 0 | 0 | 0 |

- DRT 900 live evening sections: EB one section (stops 13-58) 13/46 refused on today's gate (28%), 20/46 on the branch gate (43%): majority never triggers, EB stays patched under both. WB one section (0-42) 34/43 refused (79%): MR turns 34-42 from 16/17 to 24 under both gates.
- Branch alone changes exactly the 7 EB stops (2220, 2221, 412, 413, 93747, 434, 1181: 15 -> 24) on base12; 0 other published values. One refused->passing stop exists outside base12: DRT 900 dir 1 PM peak stop 1602 (24 refused -> 11, longest 18), because the unrounded value can exceed the rounded one.
- Sections still mixing pass+refused (`out_mixed.txt`): base12 10 of 50 today -> 4 with MR; wide 21 of 350 -> 10 (branch+MR 9).

## Item 1: DRT 900 WB stops 34-42 (`out_wb.txt`, `wb.ts`)
Live published weekday evening: stops 34-41 = 16, stop 42 = 17, with the longest gap the pooled list was judged on 24-25 (`stopPeriodCoverageHeadways`), limit 25.6.
Replay of stop 1596 (idx 34): pooled departures every 8/24/18/6/16/8/16/8/16/8/16 min until 21:35, then gaps 24, 24, 25 (21:35, 21:59, 22:23, 22:48). 19:00-21:00 mean 13.0, longest 24; 21:00-23:00 mean 19.4, longest 25. Own pattern (Centennial) is every 24 all evening. Stop 1601 (idx 38): same shape, longest 24; stop 1607 (idx 42): published 17, longest 24.

## Item 4: rejected rules, scripts, commands, headline numbers
Run from `SP` (cwd): `nice -n 15 tsx <script> [args] > civ845-evidence/outputs/<name>.out`. Outputs are in `outputs/`.

| rejected rule | script (exists now) | command | headline numbers (this run) |
|---|---|---|---|
| judge the stretch on one stop ("9-58 stops dropped") | `SP/rule.ts` | `tsx rule.ts all` -> `outputs/rule.out` | TOTAL over 12 cases / 759 stops: A(worst stop) 11 real stops dropped, B(own fallback) 9, A2(fullest stop) 58; all had published value under 20; also 17 refused stops turned green (A, B). So "9-58" = B 9 to A2 58. |
| R3 middle anchor (same trips at every stop, read at the middle stop) | `SP/ripple2.ts` (modes R1 first stop, R3 middle, R4 last, R2 any) and `SP/step2.ts main` | `tsx ripple2.ts`; `tsx step2.ts main` | R3: 0 pass->fail but 17 fail->pass (stops turned green, 2.4 min max over limit), 27 stops worse than today, 1,581 trips read from outside the window (up to 24 min). R1 23 / R4 29 / R2 64 stops pass->fail, 3,362-6,754 outside trips. step2: one-colour stretches 109 -> 117 of 126. |
| same trips at every stop blends the neighbouring period | `SP/step3.ts` | `tsx step3.ts` | 112 windows, 5,963 stops: 3,171 read at least one trip from outside the window (max 34 min); of 172 flagged real service changes, 15 values change (9 pass/fail flips). |
| blip fill (fill short dips in a stretch) | `SP/blip.ts`, `SP/blip2.ts` | `tsx blip.ts`; `tsx blip2.ts` | blip.ts: max 2 blips filled, one-colour stretches stay 109/126. blip2: C 51 stops go green over their own longest wait (126 one-colour), F 17, D10 27, E 0 but EB stays 10 runs. |
| median / best-reading / margin rules | `SP/var.ts` (C, D5, D10, E, F) and `SP/blip2.ts` | `tsx var.ts` | stops turned green although their own longest wait is over the limit: C 51, D5 4, D10 27, F 17 (own longest 26-32 min vs shown 15-16); E: 0 but 46 values change and EB stays 10 runs. |
| colour a failing stop with its neighbours' value | `SP/step4.ts` (`s4A3.ts` same on A3) | `tsx step4.ts` | 128 stops would change colour, 51 fail->pass; own longest wait 12-30 (median 15) shown as 6-16 (median 7); 42 of 116 passing neighbours have longest wait >= 20. |
| display-only (own piece / whole block) | `SP/s2c.ts T0`, `SP/blip2.ts` (L) | `tsx s2c.ts T0` | 18 green pieces on 38 routes; only 3 are a whole same-bus block, 15 are clipped by a failing neighbour. |
| slower-reading smoothing S | `SP/s1S.ts` | `tsx s1S.ts T0 vis` | 147 stretches, 17 multi-piece; fragments in multi-piece stretches 50 -> 38 (12 removed); 0 stretches become one colour; 8 stops pass->fail. |
| seconds precision A1/A2/A3 | `SP/step1run.ts`, `SP/s1runA3.ts`, `SP/s1bA3.ts` | `tsx step1run.ts`; `tsx s1runA3.ts`; `tsx s1bA3.ts` | stops pass->fail / pubChanged / tiers: A1 2 / 28 / 15, A2 18 / 237 / 63, A3 7 / 195 / 57 (UX `fracG` A4: 7 / 195 / 24, `scripts/a4_fracG`). Refusals in 1,874 readings: today 861, A1 882, A2 1,016, A3 1,011. The branch changes none of the 195 values (only 7). |

Not reproducible and why: the words "R3", "9-58", "102 S AM" do not appear in any CIV-845 comment (checked `SP/c845.txt`, 60 KB of comments); the opt2 `run.ts` / `agg.py` scripts and the 24-agency overlay dumps behind the "822 pieces / 266 over-draws / 541 real" count (CIV-845 comment 20238b8a, 2026-10-24) are not on this Mac (searched Atlas-worktrees/_reports, Atlas/tmp, all scratchpads).
