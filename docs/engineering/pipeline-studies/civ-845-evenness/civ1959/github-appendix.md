# CIV-1959 technical appendix (draft for GitHub; not posted)

All replays read-only, real pipeline code snapshots, local feeds. SP = /private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad. Run with Atlas node_modules/.bin/tsx, nice -n 15, one job at a time.

## Tried before? (checked against #1086 "Tried and rejected" + #1608 comment + SP/civ845-evidence/README.md)
| Candidate | Status |
|---|---|
| Majority-refuse / any-refuse per section | Tried, rejected (#1086: 12 cases 47 changed, 1 real dropped; 112 windows 56 changed, 7 real dropped; EB never reaches 50%). Not re-proposed. |
| Tighten-only T | Estimated only (#1608): ~3,416 cells, 0 newly published, ~356 swings over 60 min remain. Not re-proposed. |
| Lower the 1.6 ratio on the integer value (1.55, 1.5, 1.49) | Tried, rejected (1.49 refuses RTC 219, DRT 900 midday 12-13 to 24). Candidate 2 below is a cousin and says so. |
| Median / best / margin, R3 same-trips, blip fill, one-stop judging, display-only, seconds precision | Tried, rejected, untouched here. |
| Candidate 1: refused stop never swaps to a thin own list | Not tried before (named as scope of CIV-1959 in #1608). |
| Candidate 2: exact-mean 1.5 clause | Close cousin of the lower-ratio row; new replay below. |
| Display D: refused stop always shows pooled worst wait | Not tried before; replayed, rejected (below). |
| Candidate 3: rider-weighted gap | Not tried before; only a 2-direction DRT 900 evening replay done. |

## Mechanism facts
- pooledReadingInWindow (pipeline/stopPools.ts): refuse when longest > max(1.75 x mean, round(mean)+5) or > max(1.6 x value, value+5). value = min(max(typical, round(mean)), ownValue).
- Because value is floored at round(mean), the value clause is stricter than the mean clause only when the own-pattern cap lowers the value (Freedom M 165-minute hole: mean 114.75 would pass; the value clause refuses). A mean-only test fails the Freedom M fixture (replayed: value 98 published). So any rule keeps a value clause.
- Fallback (pipeline/process-core.ts ~2808-2850, commit 8e6b68a3f): when the pool refuses, the period value, coverage, max gap and sustained flag come from the own list (pickByPeriod); the worst-wait is used only if the own list has no reading. Pooling only adds departures, so the pooled worst wait is never longer than the own list's longest gap.
- Pinned unit fixtures (pipeline/__tests__/stop-pools.test.ts, alternating-gaps, pooled-worst-wait-1072): 15/15/30 alternation passes (mean 20, longest 30 = exactly 1.5 x mean); 3/27 bunched refused; 20 with a 30 hole refused; ttc 52 held bus passes; 165 hole vs 98 refused (worst wait 165). The WB 34 stop: longest 25 vs exact mean 15.5 = 1.61; WB 38/42: 24 vs 15.47 = 1.55. So a mean ratio in [1.5, 1.55) both keeps the 15/15/30 fixture and refuses WB 34-42.

## Replay A: exact-mean clause (candidate 2)
Change: first clause becomes longest > max(R x exact mean, round(mean)+5), R = 1.5 (exact15c) or 1.55 (exact155c); value clause untouched. Snapshots: SP/civ1959/snap/exact15c, exact155c (copy of main 6af657cb6 with one clause edited). Harness SP/civ1959/mr.ts, an.ts, fixtures.ts, run.sh; outputs SP/civ1959/out/*.json, an_c_summary.txt.
Fixtures (fixtures.ts): all five pass for both variants (an earlier variant using round-free grace failed TTC 52 held bus; a mean-only variant failed Freedom M; both discarded).
Counts vs today's gate (published values changed; "real frequent dropped" = pub <= filter to > filter while longest < 1.5 x shown, my ruler from the README):
| set | R | changed | crossing | over-draws removed | real dropped |
|---|---|---|---|---|---|
| base12 (759 stops) | 1.5 | 55 | 47 | 41 | 6 |
| base12 | 1.55 | 39 | 31 | 30 | 1 |
| pin (TTC 52 mid, 41 Sat, 900 mid) | 1.5 | 16 | 16 | 14 | 2 |
| pin | 1.55 | 3 | 3 | 2 | 1 |
| marg (TTC 52 f10) | 1.5 / 1.55 | 0 | 0 | 0 | 0 |
| hsr (HSR 05) | 1.5 | 122 | 75 | 75 | 0 |
| hsr | 1.55 | 92 | 70 | 70 | 0 |
| wide (112 windows, 5,964 stops) | 1.5 | 96 | 86 | 76 | 10 |
| wide | 1.55 | 66 | 57 | 52 | 5 |
DRT 900 evening: R=1.5 makes east and west one reading (24 at every stop, WB 34-42 fixed); R=1.55 leaves east patched (16 at stops 17-25 and 57/60). Pin changes at R=1.5: DRT 900 dir 0 midday 14 stops 12-13 to 24 (longest 19-20; shown 24 is worse than the real longest, because the refused stop reads the own list), DRT 900 dir 1 midday 2 stops. Verdict: fixes lines 1 and 2 on DRT 900 but repeats the lower-ratio failure (real stops dropped, midday DRT 900). Not recommended.

## Replay B: Display D (refused stop shows pooled worst wait, never the own list)
Run through an.ts with DISPLAY_D=1. pin set: 44 refused stops change, including every refused TTC 41 Saturday midday stop 8 to 14 (pinned case; own pattern runs every 8, pooled longest 14) and DRT 900 stops 24 to 20. Verdict: breaks the TTC 41 Sat pin; the own list is right when it is thick. This is why candidate 1 limits the swap only for thin own lists.

## Estimate C: thin-list fallback (candidate 1), from logged flips
Source: SP/dryrun-diff/civ-1957-all-gate-flips.csv (9,471 flips, 3,117 unique) joined to civ-1957-change-list-final.csv. Own-trip count (column ownDeps) of the 481 cells moving over 60 min: <=2: 63, 3: 134, 4: 102, 5: 55, 6+: 127 (caveat: ownDeps is 0 for 24 of them, which does not match the #1608 note that all fall back to 3+ trips; the column's window may differ from the cell's). So a minimum of 6 own trips would cover about 354 of 481 (74%). Mechanism: coverage cells (459 of 481) take the own list's max gap only when the stop fell back, so never swapping to a thin list removes them. Estimate only; not rerun.

## Replay D: rider-weighted gap (candidate 3), DRT 900 weekday evening 19:00-23:00 only
Script SP/civ1959/eff.ts. Value = sum(g^2)/sum(g) over the pooled list's gaps (average wait of a random arrival is half of it), printed as value/longest per stop.
- East (60 stops, 46 pooled): 18.7/26 at the start, 17.8, 17.3, 16.8-18.0 to the end; longest 24-26. One smooth band 16.8-18.7.
- West (59 stops, 43 pooled): 19.4/30 for the first 14, 17.9-18.7 mid, 18.1-18.5 at stops 34-42 (longest 24-25). One smooth band 17.7-19.4. Today: 24 / 16-17 / 24.
- Hand check, stop 1596 (idx 34): gaps 8,24,18,6,16,8,16,8,16,8,16,24,24,25 give 18.07; stop 1601: 18.1; stop 1591 (refused today): 18.3.
- Fixture effect: the 15/15/30 alternation (RTC 219) reads 22.5 vs 20 today, so it moves tier (pin changes). Not run on other sets: stops changed, tier crossings and TTC 52/41/GO 41 unknown.
- Settled-rule check: tier tolerances (#567/#568/#570/#571) are untouched; this changes what a pooled stop value means (needs Ryan's decision), and "understate rather than overstate" is respected because the value only rises on uneven windows.

## Process still owed before any ship
Implement on a branch; unit fixtures; 12 local replays; six-agency two-country dry run (the 22-agency CIV-1957 setup, scripts SP/dryrun-diff/run*.sh, analyze.ts) with every changed cell traced (9 untraced in CIV-1957: TTC 84, CTA 7); record agencies, commands, diff summary in the issue.
