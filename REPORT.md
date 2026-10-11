# #710 Weekday stop pooling: report (uncommitted)

Branch fix/weekday-service-pooling, local commit e0c8f457 on origin/main e31c52e1. Not pushed. No R2, no merges.

## Why 4a744ce1 used a union
Its aim was to keep weekday and weekend service buckets.
- Before it, each service_id got only one day type (first match wins), and Monday alone stood for Weekday.
- So a 7-day service never reached the Saturday or Sunday stop groups.
- A feed with no Monday service (Tue-Fri, the Fredericksburg pattern) had no weekday stop data.
- Holiday Mondays were already handled separately by getActiveServiceIds' representative week (#658/#678).

## Rule chosen
Each Weekday stop map takes its departures from ONE weekday. There are three such maps: route/direction group, headsign, and shape.
- The day is picked per map by phase 2's median-count rule. That rule is now a shared helper, representativeIndexByCount.
- Phase 2 already uses it for each route-level Weekday subgroup (route, direction, headsign, shape), so stop and route levels pick days the same way.
- Only days with service count. Days with fewer than 2 departures are skipped, as in phase 1, unless no day has more.
- Tue-Fri feeds keep their weekday stop data, and #658 still swaps out a holiday Monday.
- Saturday, Sunday, the multi-bucket handling and the 7-day shape-selection union are unchanged.
- The day is chosen in a counting pass before the stop_times scan. No per-day copies are built, so memory stays flat.

Rejected options:
- One representative weekday per route and direction. A Weekday feature whose display shape runs only on Fridays loses its shape map. That made cata VE Campus worse.
- Monday for the whole feed. It doesn't match the route level.

## Issue's examples vs hand counts
| case | before | after #710 | after #710 + #712 loop fix (scratch) | hand count |
|---|---|---|---|---|
| uga M-N evening | 7 | 7 | 23 | ~22-23 |
| uga C-N evening | 8 | 8 | 17 | 16-17 (every 1000 s) |
| clemson TL-24 weekday | h27 t30 | h27 t30 | h27 t30 | runs Thu+Fri 17:45-02:45, every 27 |

- **uga is not caused by #710.**
  - M-N: the Mon-Wed and Thu-Sat evening windows are identical, so pooling them only adds duplicates.
  - C-N: the Mon-Wed trip has no frequencies rows, so it adds no evening departures.
  - Both low values come from the stop-level frequency expansion counting a loop's second terminal visit. That is #712. The earlier ko_union knockout showed the same thing.
  - #710 changes only M-N late and overnight. The typical weekday is Mon-Wed, whose service ends at 01:00.
- **TL-24 runs Thursday and Friday, not Friday only.**
  - TL-294's calendar row is 0,0,0,1,1,0,0. That is the same pattern as C-N.
  - Tier 30 comes from the phase-2 rollup. It takes the worst tier of the days that have service and only warns "2/5 weekdays". Step 4 can only lower a tier.
  - Live's 131 was an accident. All 28 clemson routes have an empty route_short_name, and `?? route_id` doesn't replace an empty string. So the old Monday stop group covered the whole agency.
  - No consistent day rule can give C-N about 16 and also keep TL-24 off weekday 30.
  - **Decision for Ryan:** should a route that runs on 2 of 5 weekdays show as weekday service?

## Real #710 cases (single-slug harness, origin/main vs e0c8f457)
11 feeds were run. TTC, TriMet, fast-nc, mountain-line and terrebonne-parish are unchanged.
- **cata-state-college: 6 Weekday features changed.** Service 90 runs Mon-Thu and service 54 runs Friday.
  - WL 57, both directions (am/mid/pm/eve/late/overnight): 6/3/3/3/11/12 became 6/5/6/12/12/-. The Mon-Thu hand count is 6/5/6/12/12, with the last trip at 24:02.
  - RL 51 Medlar: 12/12/9/18 became 12/12/12/18, matching the hand count.
  - RL 51 West Campus: 18/6/9/18 became 18/12/12/15, matching the hand count.
  - VE 44 Campus: 11/21/21 became 32/24/21.
    - Mon-Thu Campus trips reach the terminal at 7:37, 8:09 and 8:41 (every 32 min). Midday they alternate 11 and 21 min, then run every 32 min.
    - The old 11-minute AM came from Friday trips.
  - WL "Out of Service" span: the overnight coverage came from Friday and is now blank.
- **MBTA: 37 features changed, mostly late and overnight.**
  - MBTA publishes separate Mon-Thu and Friday services, e.g. Orange hmo46011 (1111000) and hmo46fr1 (0000100).
  - Friday late-night trips no longer tighten weekday late coverage. Orange late coverage goes from 14 to 59.
  - Headline, AM, midday and PM values are unchanged.
  - Route 59 weekday evening is now blank. Regular Mon-Fri service (hba46011) ends 19:00 (dir 0) / 19:50 (dir 1). The only later trips are the Friday-only sbc46wf1 service (19:30-24:00), so a typical weekday has no evening service.
  - SLW 746 South Station evening goes from 3 to 12. The Mon-Thu (hbs46sw1) and Friday (FallWeekday) evening trips were interleaved. Mon-Thu alone has trips at 21:06, 21:07, 21:18, 21:33 ... 22:51, a median gap of about 12.
- **OC Transpo: 2 features changed.** Line 1 has two services, CFDMTh and CFDFri, split by calendar exceptions. Late values go from 8/8 to 13/15 (Mon-Thu).
- **valleymetro: 1 feature changed.** On the 32s school tripper, the Mon/Tue/Thu/Fri and Wednesday late-start bell schedules had interleaved. AM goes from 6 to 8, which matches the hand count.
- **uga: 1 feature changed.** M-N overnight coverage 180 is now blank.
- **clemson-cat: 1 feature changed.** TL-24's Weekday night service flag goes from true to false.
  - Its night map is the group map, which covers the whole agency because of the empty short_name.
  - That group's representative day is Monday, and TL-24 doesn't run on Mondays.

## Tests
- New file pipeline/__tests__/weekday-stop-pooling.test.ts with 7 tests:
  - 4 synthetic: the Mon-Thu/Fri interleave, a Friday-extra service (the typical day wins), Tue-Fri with no Monday, and an all-week service reaching Weekday, Saturday and Sunday.
  - 3 real fixtures: cata White Loop (pinned to the hand counts), uga C-N, and clemson TL-24 (pins tier 30 as current behaviour pending Ryan's decision).
- Against origin/main, 3 of the 7 fail (the interleave tests and cata). The other 4 are guards and pass.
- The holiday-Monday case is still covered by holiday-reference-week.test.ts.
- Full suite: 156 files, 1136 tests pass. npm run typecheck is clean.

## Merge check (git merge-tree only)
- **#705 (7030ad84):** only CHANGELOG.md conflicts, because both add an Unreleased line. process-core.ts auto-merges. On the merged tree, tsc and the pipeline tests (55 files, 492 tests) pass.
- **#665 (fee196a8):** only CHANGELOG.md conflicts. There's no code overlap.

## Follow-ups
1. **#712:** loop dedupe in the stop-level frequency expansion. This is what actually fixes uga M-N and C-N.
2. **Shape selection:** it picks the Weekday display shape by counting each pooled trip once. cata VE Campus shows the Friday-only shape (31 trips) over the Mon-Thu shape (30 trips, run 4 days each). The file is gated and the change affects geometry for every feed.
3. **Empty route_short_name:** it pools every route into one stop group (clemson-cat). Use `||`, not `??`.
4. **Product decision:** whether 2-of-5-weekday routes get a weekday tier (TL-24).
5. **Route-level consistency:** rawByDayType uses the weekday with the most departures, while the phase-2 headline uses the median day.

Harness: scratchpad/w710 (harness.mjs, runall.sh, cmp.py, runs/*.json).

## Follow-up commit 660bdef7 (on top of e0c8f457, local only)
Ryan's rule: a route that runs on only some weekdays gets the Weekday tier "infrequent" (shown as "limited"). It gets no headway and no "no service".
- **How the representative weekday is chosen:** it is now picked over all five weekdays, counting 0 for days without service, at both route level (the phase-2 rollup) and stop level.
  - If the lower-middle weekday has no service, the Weekday result is infrequent, with no headway, no timetable and no stop metrics.
  - Routes that run on 3 or more weekdays keep a frequency tier, including Tue-Fri (no Monday) and Wed-Fri.
  - Holiday Mondays are still swapped by getActiveServiceIds (#658).
- **Review nits:**
  - (2) The median uses the lower middle for an even count.
  - (3) A comment now explains why stop maps are keyed by short name rather than route_id.
  - (4) Stop-level frequency counting ignores headway_secs under 60, as phase 1 does.
  - (5) New tests cover a holiday Monday at stop level, a service starting mid-week, and Wed-Fri/Tue-Fri rollups.
  - Phase-2 unit tests that model one weekday with a Monday row now expand that row to Mon-Fri.
- **Harness vs e0c8f457** (run sequentially; ttc rerun after the memory pause):
  - **clemson-cat TL-24:** weekday 27 / tier 30 → infrequent, no headway (Saturday is unchanged).
  - **uga C-N:** weekday tier 20 → infrequent. Mon-Wed have one trip a day; the real service runs Thu-Fri only.
  - **ttc 402:** both directions → infrequent, no headway. Service 4501 runs Tuesdays and Fridays only (calendar_dates).
  - **cata VE:** the Friday-only shape subgroup no longer wins the Weekday slot, so the Mon-Thu subgroups are used instead.
    - Campus is now drawn on the Mon-Thu shape 17779, so follow-up 2 is fixed for this feature. Its headline changes 21 → 24.
    - Vairo Blvd dir 0 now uses the 9-trip Mon-Thu variant shape 17776, so its headline goes 21 → 32.
    - Period values are unchanged, because they come from the headsign map.
    - This dir 0 result is the existing per-shape split for a Mon-Thu route that uses two shapes (26 + 9 trips). It's a follow-up, not new logic.
  - **(2) and (4) caused no diffs.** Weekday count arrays always have 5 entries, so the lower middle doesn't change any pick. None of these feeds has a headway under 60 s.
  - **valleymetro, mbta and trimet** are unchanged.
- **Tests:** 1140 pass. Typecheck is clean.

## Follow-up commit 66ed1230: "any frequency" visibility (local only)
- **Root cause:** after 660bdef7, partial-weekday Weekday features had no period headway values. The shared period-service predicate (tilePeriodServiceExpr) is used by the tiles and, through routeHeadwayFilter, by the lists, counts and card. It treats "no period values" as "no service", so "Weekday evening, any frequency" hid TL-24.
- **Fix:**
  - The rollup records the periods a partial-weekday route runs in on its served weekdays, as partialWeekdayServiceByPeriod (pws_<period> in tiles; also added to the overview allowlist).
  - tilePeriodServiceExpr accepts pws_<period> as service in that period.
  - Any frequency threshold still hides these routes, because they have no effective headway.
  - The Weekday result is also serviceClass time-limited, so the beta "hide limited-service" toggle hides it and regular infrequent routes are unaffected.
- **Side effects of time-limited:**
  - FrequentServiceStoryMap already excludes time-limited routes; partial-weekday routes were never frequent anyway.
  - routeHasLimitedDirection: if only one direction of a route is partial-weekday, hide-limited hides the whole route. That is the existing limited-direction behaviour.
- **Tile rules:** the fingerprint hash is updated and TILE_RULES_VERSION is not bumped. Old tiles have no pws keys and evaluate exactly as before, and old apps ignore the new keys.
- **Merge check:**
  - #705: only CHANGELOG.md conflicts.
  - #665: CHANGELOG.md conflicts, and so does the releaseGuard.test.ts fingerprint line, because both branches change tile-rule files. Whoever merges second recomputes the hash with tileRulesFingerprint() and keeps #665's version 2.
- **Tests:** 1144 pass. Typecheck is clean.
  - New tests cover TL-24 and uga C-N: Weekday evening with any frequency is shown, every 30/60 is hidden, AM is hidden, and hide-limited hides them.
  - The tile-path flattening is tested, and a frequent all-week route is unchanged.
- **Typecheck coverage:** `npm run typecheck` does not cover pipeline/. An ad-hoc tsc run over the touched pipeline files showed the same 24 pre-existing errors before and after this change, so none are new.

## Regression fix: full-week routes shown as weekday-limited (16e622dc, cde0b69c, 2b13ee1f; local only)
The full dry run on 65ab63cb flagged LANTA, Lancaster, bts-or, Kalamazoo, the GCRTA Blue Line and the SLU Streetcar. They had three separate causes.
- **(a) Shape per weekday** (LANTA, Lancaster, bts-or).
  - The partial-weekday check was made per phase-2 subgroup, and that subgroup includes the shape. These feeds give each weekday its own shape.
  - Fix (16e622dc): "runs on only some weekdays" is now decided once per route_id::direction, across all trips. Phase 2 and the stop maps both use that answer. A pattern of a full-week route keeps the typical served-day rollup.
- **(b1) Weekdays added through calendar_dates** (SLU Streetcar 128666, in seattle-streetcar and kingcountymetro).
  - calendar.txt says Tue+Wed, and calendar_dates adds the service on every Mon, Thu and Fri. getActiveServiceIds ignores those additions for calendar.txt services.
  - Fix (16e622dc): the weekday check also counts additions that fall on a weekday at least 3 times within 90 days.
- **(b2) A two-week suspension in the reference week** (GCRTA Blue Line).
  - The regular Mon-Fri service is removed Oct 5-16, and the replacement runs only on some of those days. The reference week the calendar logic picks therefore shows Tue+Wed only.
  - Fix (cde0b69c): the check also counts a calendar.txt service's regular weekdays when calendar_dates removes fewer than half of that weekday's dates within 90 days.
- **(c) Synthesized directions** (Kalamazoo, no direction_id).
  - Direction synthesis groups trips by shape, so a Friday-only shape became "direction 1".
  - Fix (2b13ee1f): synthesis records which routes it touched, and those routes are judged across all directions.
- **Not changed:** getActiveServiceIds is untouched, and so is which departures feed the headways.
- **Tests:** real-feed fixtures for lanta route 1, SLU 100340 and gcrta 67 (with stub trips so the reference date matches the full feed), plus a synthetic Kalamazoo-style test and phase-2 unit tests. Each fails on the commit before its fix. 1150 tests pass and typecheck is clean.

### Full-archive sweep (single-slug, sequential, memory checked before each run)
- 453 of 454 feeds were processed. caltrain fails GTFS validation before processing, which is a feed problem and not caused by this change.
- After the fixes there are 85 weekday-limited features: 82 route directions across 43 agencies. The full list is in scratchpad/w710/limited-list.txt.
- LANTA, Lancaster, bts-or, Kalamazoo, GCRTA, seattle-streetcar and kingcountymetro now have none.
- The sweep ran on cde0b69c's code. Of the agencies that still had limited routes, the three with synthesized directions (kalamazoo, jacksonville-nc, uga) were re-run on 2b13ee1f. 2b13ee1f can only remove limited flags, so the rest of the list stands.
- Hand-check of 18 route directions across 16 agencies, using each route's services and the dates with trips in the 4 weeks from Oct 12:
  - **Truly part-week:** TL-24 (Thu/Fri), TTC 402 (Tue/Fri) and uga C-N (one Mon-Wed trip, real service Thu/Fri) stay limited as intended. The sample also confirms:
    - Friday only: ata FRST, broward 748, capmetro 492, carta-chattanooga 14N, cota ZOO 141, transfort GOLD d1, longbeach Passport, jacksonville-nc 5087, victoria 76.
    - Two days: cdta 452 (Thu/Fri), comox-valley 13 (Tue/Thu), sherbrooke 29 (Thu/Fri), yrt 360 (Thu/Fri; one holiday Monday).
    - One day: cdta 840 (Tue only).
    - carta 16781 (Fri, expired window), drt 100 (Thu, expired window) and mountain-line RT 1 (Thu/Fri, expired) are part-week in their own windows.
  - **Borderline:** actransit 663 and calgary 699 are school trippers. They run every weekday but have only 1 trip on most days. Days with fewer than 2 departures don't count (the phase-1 rule, and the same rule that keeps uga C-N limited), so they show as limited. **Decision for Ryan:** count 1-trip days as service? That would also make uga C-N a weekday route again.

## Narrowed calendar_dates additions (manager review of 16e622dc..2b13ee1f)
- **Risk measured** over all 454 archive feeds, with parse and normalize only (scratchpad/w710/meas).
  - 60 route directions were judged full-week only because of calendar_dates additions.
  - 51 of those relied on additions more than 6 weeks from the reference date, or outside the service's calendar.txt range. They are in longbeach 174, loudoun-transit (6), mtd-champaign (6), sbmtd (31), trinitymetro (3), valleymetro 514 (2) and victoria 70X d1.
- **Narrowed (commit "Count calendar_dates weekday additions only near the reference date"):** an addition now counts only within ±6 weeks of the reference date and inside the service's calendar.txt range.
- **Re-check** of those 7 slugs plus clemson-cat, ttc, uga, lanta, seattle-streetcar, kingcountymetro and gcrta: only one weekday-limited result changed.
  - victoria 70X direction 1 is now limited. Mon-Thu has 1 trip a day (5456) and Friday has 6 (5458).
  - It had counted as full-week only through December holiday-period additions, which is exactly the overclaim the review describes. It now joins the 1-trip-day class (actransit 663, calgary 699, uga C-N) that is waiting on Ryan's decision.
  - TL-24, TTC 402 and uga C-N stay limited. lanta, the SLU Streetcar and GCRTA stay full-week.
- **Tests added:**
  - The regular-pattern check: a Mon-Fri service removed on most Mon-Wed dates counts 2 weekdays, while a two-Monday suspension still counts 5.
  - A feed without direction_id: a Friday-only route stays limited and a Mon-Fri route doesn't.
  - 1152 tests pass and typecheck is clean.
