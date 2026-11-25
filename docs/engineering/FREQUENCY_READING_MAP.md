# Where a route's frequency reading is worked out (CIV-2951)

Ryan asked "Do we need to refactor". Strategy's answer was to map the code first and refactor nothing until the counts are in. This page is that map:
- every place that works out or reshapes a route's "every N min" for a period;
- what each place reads and which shared function it calls or copies;
- how often the places disagree in a real release.

It is read only: no code changed. The counts come from release-mwvbser2 (552 agencies, 100,327 route-periods: every route, day and period from AM peak to Late). They were computed with main's own functions, public build, trunk rule off. The scan script and its output are in the data worktree's `tmp/civ2951/` (`scan.mts`, `readings.tsv`, `cmp.py`).

## The places

### 1. Pipeline (works from trip times; writes the artifact fields every other place reads)

| Place | What it works out | Uses / copies |
|---|---|---|
| `pipeline/headway-utils.ts` `typicalOfGaps`, `medianHeadwayInWindow`, `periodHeadwayInWindow`, `computePeriodHeadways` | A period's typical gap, with the alternation rules | **The one gap rule.** |
| `headway-utils.ts` `computePeriodCoverageHeadways` | The longest wait in a period, edges included | Its own loop |
| `headway-utils.ts` `computePeriodHeadwayRanges` | Shortest and longest gap, with one big hole dropped | **Its own sorted-gap code; doesn't use `typicalOfGaps`** |
| `headway-utils.ts` `computeHourHeadways`, `computeHourDepartureCounts` | `headwayByHour`, `departuresByHour` | Adaptive median and counts per hour |
| `pipeline/tripSets.ts` `stretchPeriods`, `stretchFilterValue` | One stretch's reading: its spacing if steady and no wait over 60, otherwise its longest wait | Calls headway-utils |
| `tripSets.ts` `rollupDirection` | A direction's value: its slowest counting stretch (D1), trunk value, period edge, one-gap flag | Above, plus `periodEdge` |
| `tripSets.ts` `rollupRoute`, `stampStretchShadow` | The route's value (the slowest direction). Writes `routeFilterHeadwayByPeriod` (rv_), `routeTrunkHeadwayByPeriod` (tv_), `directionFilterHeadwayByPeriod`, `stretchPeriodEdge`, `stretchPeriodRange`, `stretchMeta`, `pieceReadings` | — |
| `pipeline/process-core.ts` (final `headwayByPeriod` via `routeGrading.decidePeriod`; `rowPeriodEdge` and `rowPeriodGap`) | Each row's own period value | **Re-implements `stretchFilterValue` inline** |
| `pipeline/pieces.ts` `classifyPiecePeriod` | Each piece's reading, tail or limited (`pieceReadings`) | **Copies the evenness test from `stopPools.pooledReadingInWindow`** |

### 2. Map grade, filter and colour

| Place | What it works out | Uses / copies |
|---|---|---|
| `shared/tileFilterExprs.ts` `tileEffectiveHeadwayExpr` | The map's number for a row: tv_ (trunk rule) or rv_, only on a row that runs in the period and isn't span; older fallbacks without rv_ | **The source of truth for the grade** |
| `shared/routeHeadwayFilter.ts` `routeFilterHeadway`, `routeFilterReading` | That expression evaluated per row; the route's lowest = the grade | Calls the above |
| `src/utils/stretchCard.ts` `routeContract` / `routeFilterContract` | The stored rv_ / the stored value as the filter reads it (#1247) | `routeFilterHeadway` |

### 3. Route list rows (sidebar lists, agency card, search, the MCP's `shown`)

| Place | What it works out | Uses / copies |
|---|---|---|
| `src/utils/effectiveHeadway.ts` `routeListFilterDisplay` | The filter's number plus range low end and edge words: agency pages, the MCP's `waitMinutes`, `schedule_changes` | `routeFilterContract`; row fallbacks; **`directionSharedHeadway` hand-rolls a lower median** |
| `effectiveHeadway.ts` `routeListDisplay`, `routeListCellText` | The card's lowest and highest numbers, and the card's words (CIV-1447 "lists must match the card") | `routeCardRange`, which builds the whole card model |

### 4. Route card rows

| Place | What it works out | Uses / copies |
|---|---|---|
| `src/utils/routeCardRows.ts` `buildRouteCardModel` | The rows, the shared-stretch line, branch lines | `routeFilterContract`, `routeCardRowValue`, `groupTrunkHeadway`, branch readings |
| `routeCardRowValue.ts` `routeCardRowValue` | One row's value: variant, pooled, uneven worst wait or fallback | `directionFilterHeadwayByPeriod`, `stretchPeriodHeadway`, `rowTrips` |
| `rowTrips.ts` `rowTrips`, `rowOwnTripsEven`, `rowOwnTreatment` | A row's own trips, edge and gap words | **`rowOwnTripsEven` hard-codes 1.75× / +5 (a copy of the pooled-gap test); `rowOwnTreatment` copies `stretchFilterValue`** |
| `stretchCard.ts` `stretchRowFeatures` | Which feature stands for each stretch slot | — |
| `routeCardTrunk.ts` `groupTrunkHeadway`, `medianHeadway`, `thinHourHeadway` | Branches combined as 1/Σ(1/h); a local median; 60 / departures for a thin hour | **Copied again in `hourChartModel.stackHeadway`** |

### 5. Hourly chart (route card)

| Place | What it works out | Uses / copies |
|---|---|---|
| `src/utils/hourChartModel.ts` `routeHourModel` | Each hour's bar from `headwayByHour`. Branches are merged by a local median, and an hour under 0.75× is raised to the period value. The slowest direction wins each hour. | `medianHeadway`, `stackHeadway`, `thinHourHeadway` (computes 60 / departures itself) |
| The full-day chart's title line | The hovered hour's figure next to its period's name | #1820 (Studio 2): CapMetro 801 reads "Overnight every 15" from one 5:57 trip; 1,854 routes |
| `src/utils/routeFacts.ts` `periodHeadwayFromByHour` | A period fallback from the lowest hour | Its own rule |

### 6. Stop card

`src/utils/stopRoutes.ts` `buildStopRoutes`, `stopRowHeadway`: `rowTrips` (stretch off), stop values from `stopPeriodHeadways`, and the larger of the row's and the stop's value. `branchReadings.stopBranchReading` for pieces.

### 7. MCP (`scripts/mcp/`; the hosted Worker imports these with no logic of its own)

| Place | What it works out | Uses |
|---|---|---|
| `atlasData.ts` `periodFigure` / `summarize` (`route_frequency`) | `waitMinutes`, `shown` and `filter` | `routeListFilterDisplay`, `routeListDisplay`, `routeFilterReading` (three readings in one answer) |
| `routes_at_frequency`, `compare_agencies`, `rank_agencies` | Pass/fail at a grade | `filter` (= the map's grade) |
| `hourlyFrequency` | Raw `headwayByHour` per row, not merged | Not the chart's model |
| `schedule_changes` (`pipeline/feedCompare.ts` `periodFigures`) | Each side's figure | `routeWaitMinutes(routeListFilterDisplay)` |
| `stop_frequency`, `combined_frequency` | Stop rows; a pooled reading from departure times | `buildStopRoutes`; `stopPools.pooledReadingInWindow` |

### 8. Agency pages and History

- `scripts/build-agency-page-summaries.ts` stores `routeListFilterDisplay`, with the text from `routeListDisplay`.
- History (`pipeline/historyRoutePeriods.ts` `periodsOf`) **takes the largest raw rv_ across rows. It skips the filter's row and span check (#1247) and the trunk value.**

### 9. Other median or gap code

`pipeline/transit-utils.ts` `computeMedian`; `scripts/route-accuracy-spot-check.ts` (independent on purpose).

## How often they disagree (release-mwvbser2)

"Grade" means the public step (10, 15, 20, 30, 60, over 60). A pair disagrees when the two places give different steps, or one gives a number and the other none.

| Pair | Route-periods on different grades | Agencies | What it is |
|---|---:|---:|---|
| Map grade vs route list (also the MCP's `waitMinutes` vs `shown`) | **21,033** (+4,552 where the list reads Irregular) | 525 | By design in part. The grade counts a period's edge waits and the slowest piece; the list shows the card's cadence. Breakdown below. |
| Map grade vs trunk value (beta's rule, CIV-1822; RTD 31 #1786/#1787) | 4,576 | 153 | Trunk better than the slowest piece. CIV-2909 measured the same 4,590. |
| Stored rv_ vs map grade | 1,688 | 237 | All one-sided: a stored value the filter drops (#1247: span or not-running rows), or the reverse (ECAT 45 AM: no stored value, filter 115). |
| Map grade vs History | 1,496 | 238 | History reads the raw rv_ without #1247's row check (Thunder Bay 6 midday: History 222, map none). |
| Route list vs card's highest number | 868 | 207 | All one-sided: the list reads Irregular (CIV-1300) where the card still shows a number (OC Transpo 262 PM: card 63, list Irregular). |
| Map grade vs agency page / MCP `waitMinutes` | 606 | 175 | Almost all one-sided: one-gap routes the page reads as no number (#955). Sudbury 4 midday: map 240, page none. |

Grade vs route list, broken down (where both give a number):

| Kind | Route-periods | Example |
|---|---:|---|
| Grade slower; the list names the edge or gap ("until 9:34 PM", "with one 35 min gap") | 9,732 | Connect Transit GN Saturday evening: grade 86, list "every 30 min until 9:34 PM" (CIV-1248 edge rule, #1749) |
| Grade slower; the list shows a range | 2,274 | NJT 165 Sunday evening: grade 77, list "every 31–59 min" |
| **Grade slower; nothing in the list explains it** | **3,249** | Within 3 minutes of the line (#1755, "62 beside every 60"): 723. Further: 2,526, e.g. VIA 552 Sunday midday grade 60, list "every 30"; TransLink 173 AM grade 41, list "every 17"; GCRTA 10 Late grade 87, list "every 30". These are #1756–#1759's classes. |
| List slower than the grade | 1,184 | CDTA 85 PM: grade 20, list "every 30–40 min" |

Related evidence, folded in:
- **#1756–#1759** (CIV-2088 recount, earlier release): a slower piece, a too-thin direction, one long gap, or a pattern's own cadence sets the grade while the list doesn't show it (670 + 594 + 423 + 41). Here this is the 3,249 "nothing explains it" row, now counted across every period.
- **#1786 / #1787** (RTD 31): the grade and the MCP followed the thin far-north branch ("every 60 min until 5:14 PM") while the trunk ran every 10; the MCP gave no warning. This is the grade-vs-trunk pair.
- **#1760**: readings jump on a sub-minute nudge (TTC 939 AM 10 → 41). The same value is worked out by several rules with hard switches between them (steady vs longest wait, edge rule, alternation), so a small change can flip which rule wins.
- **#1820**: the chart's title line pairs an hour's figure with its period name (1,854 routes).

## What one shared source would change

- **The grade and the list would come from one reading, with its reason attached** (the edge, the gap, the slow piece). The 9,732 edge cases and the 2,274 ranges are explained disagreements: one function returning `{ value, words, low, high }` would make them the same number told two ways. The 3,249 unexplained cases (#1756–#1759) would become either a shown reason or a grade change, which is a methodology question for Ryan.
- **History, agency pages and the MCP's `waitMinutes` would stop re-reading raw fields.** That ends the 1,496 History and 606 page one-sided gaps, plus the 1,688 stored-vs-filter cases where something reads raw rv_.
- **The copies would go:** `computePeriodHeadwayRanges`' own gap code, process-core's inline `stretchFilterValue`, `rowOwnTreatment` / `rowOwnTripsEven`, the evenness copy in `pieces.ts`, and the three local medians and 1/Σ(1/h) merges in the card and chart code. Each copy is a place #1760-style flips can differ.
- **The chart would read the same period reading** for its title line and its period bands (#1820).
- **What it wouldn't settle:** which reading is right, trunk or slowest piece (CIV-2909), or how edges and long gaps count. Those are Ryan's rules. A shared source makes each rule apply everywhere at once, which makes changing one bigger, but visible in one place.
