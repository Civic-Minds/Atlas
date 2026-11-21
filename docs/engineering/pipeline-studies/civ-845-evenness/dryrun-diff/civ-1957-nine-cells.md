# CIV-1957: the nine unexplained stop cells, traced

Method: base 6af657cb6, candidate 0437649cc, detached worktrees, ATLAS_RUN_AT 2026-11-19T12:00:00Z, processAgencyFeeds via drive.ts, no gate, no R2, ttc then cta, base then candidate, one process at a time. Probe (patch-probe2.mjs) wraps pooledReadingInWindow and logs EVERY call of route ttc 84 / cta 7 (feature, stop, period, site, window, pooled list, own list, mean, longest, typical, own value, old and new limits, outcome). Output JSON of this rerun is byte-identical to the earlier dry-run outputs. Logs: nc/probe-{pbase,pcand}-{ttc,cta}.jsonl; outputs nc/stops-{pbase,pcand}.

## Finding

All nine cells have a direct gate flip at the SAME stop, SAME headsign, SAME period. The earlier probe missed it because its context only set the stop at the main per-stop loop; the flipping call is the CIV-850 rush-hour overlay (process-core.ts line ~2937, pooledHeadwayInWindow in the rushPeriodOverlay loop), which iterates its own stops, so the earlier log labelled those calls with a stale stop and period (ttc "stop 8102 overnight", cta "stop 228 overnight"). The window 900-1140 is pmPeak and 360-540 is amPeak. No headline-phase, route-level, stopTiers, trunk or shared-stretch call flipped. Unexplained cells: 0 of 9.

Chain, all nine: the rush overlay reads the merged pool at the stop (pooledHeadwayInWindow, merged vs own list). If the gate accepts it, the overlay value is published; if it refuses, the overlay is skipped (value null, `continue`) and the cell shows the stop's own-pattern value (periods = {...worstWait, ...allStopPeriodHw, ...overlay}). These stops are not in the feature's main pool, so the underlying value is the own median (ttc 30, cta 17).

## Per cell (old -> new, Weekday)

| Cell | Old | New | Overlay gate call (merged n / own n, mean, longest) | Old rule | New rule | Cell after |
|---|---|---|---|---|---|---|
| ttc 84 dir1 Steeles via Arrow Rd, 7129 pmPeak | 10 | 30 | 26/7, 9.60, 16 | value 10, limit 1.6*10=16.0, 16 not > 16: accept (10) | exact 9.6*1.6=15.36, 16 > 15.36: refuse | own 30 |
| same, 14774 pmPeak | 10 | 30 | 26/7, 9.60, 16 | same | same | own 30 |
| same, 7295 pmPeak | 10 | 30 | 25/7, 9.708, 16 | limit 16.0, accept | 15.53, refuse | own 30 |
| ttc 84 dir1 Pioneer Village via Oakdale, 6057 pmPeak | 10 | 30 | 25/8, 9.75, 16 | limit 16.0, accept | 15.60, refuse | own 30 |
| same, 14659 pmPeak | 30 | 9 | 26/8, 9.48, 15 | value 9, limit 14.4 (grace floor 14), 15 > 14.4: refuse | exact 9.48*1.6=15.17, 15 <= 15.17: accept (9) | overlay 9 |
| same, 11860 pmPeak | 30 | 9 | 26/8, 9.48, 15 | same | same | overlay 9 |
| cta 7 dir0 Congress & Kedzie, 207 amPeak | 11 | 17 | 16/5, 10.6, 17 | value 11, limit 17.6, accept (11) | exact 10.6*1.6=16.96, 17 > 16.96: refuse | own 17 |
| same, 208 amPeak | 11 | 17 | same | same | same | own 17 |
| same, 210 amPeak | 11 | 17 | same | same | same | own 17 |

Same mechanism also explains the three other cta 7 Congress cells (75, 77, 4732 amPeak, 10 -> 16, mean 9.72/9.88/9.94, longest 16: limit 16.0 accepts, 15.56-15.91 refuses; own 16). These were filed as sibling-headsign inferences; they are direct flips too. cta 7 Harrison & Central Terminal 75/77/4732 amPeak 10 -> 16 are direct flips at the CIV-1389 sibling-rush site (process-core ~3010), also same stop.

Totals, route level: ttc 84 has 6 gate flips (all rush overlay) and 6 changed cells; cta 7 has 9 gate flips (6 rush overlay, 3 sibling-rush) and 9 changed cells. Zero other flips among 2593 (ttc 84) and 403 (cta 7) logged calls. Whole-feature diff base vs candidate: only stopPeriodHeadways entries above; every other property (stopPeriodCoverageHeadways, stopHeadways, stopTiers, headline, tier, geometry) identical; the -stops.json files identical.

## Advisor criteria

- (a) Recompute from GTFS reproduces the new outcome: yes for all nine, from the logged lists (arithmetic above). Hand-checked one against GTFS stop_times (below).
- (b) Rounding the same inputs reproduces the old outcome: yes. Logged old limit equals max(1.6*rounded value, value+5), and it accepts or refuses exactly as the base run did (base actual outcome matches refusedOld on all nine).
- (c) Nothing else changed for the stop: yes. Only the stop-period value of that period changed in those features.

All nine pass. Each sits on a boundary: the longest gap is within 0.04-0.65 minute of the limit (15 vs 14.4/15.17; 16 vs 16.0/15.36-15.6; 17 vs 17.6/16.96).

## Hand check: ttc 84 Pioneer Village via Oakdale, stop 11860 (parent station) pmPeak, Weekday

GTFS: ttc 20261221-current.zip, route 84 direction 1, children of parent 11860, service active on a weekday (2026-11-25; 11-24 identical), pickup_type not 1, 15:00-19:00. The probe's merged list (26 departures) equals exactly the 84A (18) plus 84D (8) departures at 903, 910, 918, 933, 940, 948, 963, 970, 985, 993, 1000, 1015, 1023, 1030, 1045, 1053, 1060, 1075, 1083, 1090, 1105, 1113, 1117, 1126, 1133, 1140 minutes (84C trips excluded by the pool); own list (84D) 903, 933, ... 1113 = 8 trips. By hand: 25 gaps (7 to 9 min, seven of 15), mean (1140-903)/25 = 9.48, typical 8, floored to round(mean) = 9, own value 30 so value 9, longest 15. Old: 15 > max(1.6*9=14.4, 9+5=14) refuse; new: 15 <= 1.6*9.48 = 15.17 accept; ratio to mean 1.75*9.48=16.59 also passes. Published 30 -> 9 matches.

Cleanup: worktrees civ1957-pbase and civ1957-pcand removed.
