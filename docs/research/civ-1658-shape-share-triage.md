# CIV-1658: shape share check triage (release-mwi8lkbg)

Read-only triage of the top 15 flags from `npm run audit-shape-share` (CIV-1657) on release-mwi8lkbg: 163 flags in 65 agencies, 46 under 1.2x. All top 15 read 2.5x or more. The flag list came from the existing report (`_reports/civ1657-shape-share-release-mwi8lkbg.json`). Each agency's current feedUrl was checked against the registry's `lastFeedVersion`, and none was skipped. For each row, the headsign's trips were grouped by shape. Each group was tested against the destination pool rule (at least two thirds of the drawn stops, plus every stop of the last third), and the pool guards in `pooledHeadlineTimes` were replayed on the pooled terminal times (minimum departures, more than the drawn shape alone, `scopedTerminalHeadline`, `pooledStepOneHeadway`).

## Summary

| Group | Rows | Headline wrong for riders? | #771 pattern? |
|---|---|---|---|
| A. Pool qualifies by stops but its guards refuse it | 6 | Yes, reads too slow | No |
| B. Drop-off-only terminal skips the pool | 1 | Yes, reads too slow | No |
| C. Variant skips a last-third stop | 2 | Partly | Yes |
| False alarms | 6 | No | No |

## A. Pool qualifies by stops but its guards refuse it (6)

All shapes under the headsign pass the two-thirds and last-third stop rule, so these are not the #771 pattern. The rows are judged by that rule, which is the pipeline's own: a variant covering at least two thirds of the drawn stops counts for the line. Every row has a long hole in its day (peak-only or school service, a midday gap, or an evening gap), so the 6-22h sustained reading is null and `scopedTerminalHeadline` refuses the pool. In 4 of the 6, `pooledStepOneHeadway` also returns nothing: the merged midday and PM readings fail the evenness guard. The pool therefore never overrides, and the slow value comes from the own-pattern path. Its exact source was not traced: it matches the drawn shape's own midday only for LA Metro 108, and the first-stop `stopHeadways` for PVPTA White and Fairfax 334. Several of these are loops, where the first stop and the terminal coincide.

| Row | Published headline | Pooled service at terminal | Hole | Pooled reading |
|---|---|---|---|---|
| PVPTA White d0 Wkdy to PV Library | 262 | 10 trips 07:21-17:41 (school service), period values 33/48 | 10:00-14:36 | 48 |
| Fairfax 334 d1 Wkdy | 180 | every 30 at both peaks, 17 trips | 09:49-15:49 (one 12:19 trip) | 30 |
| CamTran 1 d1 Sat to Maple/Dellwood | 84 | midday every 17, 22 trips | clustered 18:00-19:00 pull-ins | none |
| PVTA R44 d1 Sat | 60 | every ~20 from 17:55 to 19:49 | afternoon-to-night service only | none |
| SEPTA 1 d1 Wkdy to 54th-City | 119 | midday 44, all-day 31 | 10:56-13:57 | none |
| LA Metro 108 d1 Wkdy to Mesmer/Major (83-stop feature) | 40 | midday every 10, 51 trips 06:00-18:18 | 18:18-23:11 evening gap | none |

Relaxing the all-day guard alone would fix 2 of the 6 (PVPTA White to 48, Fairfax 334 to 30). The other 4 also need the evenness guard looked at.

LA Metro 108 shows the evenness guard most clearly. Its midday has 36 merged departures about every 10 minutes, but a few 21-minute gaps exceed max(1.75 x mean, mean + 5) = 17, so `pooledHeadwayInWindow` returns null and the line reads the drawn shape's 40. The 76-stop sibling feature under the same headsign reads 20. Riders at the origin end (Passons/Slauson to Eastern/Harbor, about 13% of the stops) really do get only the drawn shape's trips. SEPTA 1 is the same: its variants start mid-line and cover 89% of the stops.

Any fix to either guard needs the full validation runbook.

## B. Drop-off-only terminal (1)

Sherbrooke 4 d1 Wkdy to Carrefour de l'Estrie reads 58, while riders get a bus about every 20 (41 trips across 4 shapes, and all of them qualify for the pool). The terminal stop 8000 is `pickup_type=1` on every trip. It has no reading of its own (`stopHeadways` has no terminal value), so the destination pool, which is read at the terminal, never runs. The headline falls back to the drawn shape's 14 trips. This is the #879 class (a drop-off-only terminal never pools), not the last-third rule.

## C. #771 pattern: variants skip last-third stops (2)

Pace 530 d1 to Galena/Constitution, Weekday 76 and Saturday 75. The headsign reaches the terminal every 30 (25 trips over 9 shapes). On a weekday only 7 trips serve every last-third stop. Two shapes (5 + 3 = 8 weekday trips) skip only Constitution House, the same one-stop swap as CCTA 1 (#1211). Three shapes take a different road for 7-8 Plum St stops, and the last-third rule rightly keeps those out. The 7 qualifying trips fall below MIN_POOLED_TIER_DEPARTURES (8); pooling the 8 one-stop-swap trips would lift the pool well past it. As published, so the headline reads the drawn shape's 3 trips. Riders at the terminal really get 30. Riders on the Plum St stretch get roughly every 45-60. The headline overstates the wait, and the 30 period values overstate service on that stretch.

## False alarms (6)

These rows pass the same two-thirds test: the variants they leave out cover less than two thirds of the drawn line or take another road, so the headline is right by the pipeline's own rule. In several of these the period values overstate service instead, because they count every headsign trip, including variants that skip part of the drawn line.

- **Madison Metro O d1 to Brooks** (60 vs midday 15): the second shape starts at Erin, mid-line, and covers 47% of the drawn stops. The outer stops really are hourly.
- **ECO Transit HY6 d1 to Vail**, Weekday, Saturday and Sunday (40 vs midday 15): the other shapes are the Beaver Creek branch (63% of the drawn stops) and Lake Creek expresses that skip 5-9 Highway 6 stops. The middle Highway 6 stops get only the drawn shape's every 40.
- **Athens (OH) CY d0** (60 vs midday 15): the pool qualifies and is read. It runs every 15 until 12:21, then hourly. The pooled midday reading is refused for evenness, and the PM window reads 60. The 60 headline is defensible, and the 15 midday value overstates the afternoon.
- **SMAT 30 d0** (180 vs PM 53): 8 trips a day at irregular times, and both 180 and the pooled 120 are in the infrequent tier. Unexplained mismatch: the replay passes every guard and reads 120, but the published value is 180. It is a loop, so the terminal is also the first stop, which is likely a loop-terminal artifact in the replay.

## Notes for the check

- The audit and this triage both map stops to their drawn ids. Where a stopOrder holds both a child stop and its parent (Sherbrooke `8000` and `8100`), a parent-blind match reports every shape as missing the terminal. The pipeline's pool credits both ids.
- Group A is the biggest real cause in the top 15. The check's "drawn shape under half" filter does not target it. The share filter only finds these rows when the trips also happen to be spread over several shapes.
