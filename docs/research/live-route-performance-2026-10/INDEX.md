# Where routes fall behind: methods (Live proof of concept)

Snapshot date: `2026-10-14`
Scope: TTC 504 King and 511 Bathurst, 15 service days (2026-09-30 to 2026-10-14;
the last day is partial, up to the time of analysis)

## Research question

Using only the vehicle positions Atlas already archives, can we tell a transit
planner where along a route vehicles lose time, where spacing between vehicles
breaks down, and how often scheduled trips don't show up, honestly enough to
act on?

## Sample

- **Positions:** TTC streetcar positions archived about once a minute in R2
  (`atlas-live/positions/ttc/…`), read only. The 504 alone is about 1.7 MB a
  day after filtering.
- **Timetable:** TTC "Surface Routes and Schedules for BusTime" GTFS (feed
  version S1000542, valid 2026-09-30 to 2026-10-31). Its trip IDs match the
  live feed: for the 504, 8,306 of 8,584 archived runs (96.8%) carry a trip
  number in this timetable; the other 278 are on trip numbers it doesn't list.
  The "Routes and Schedules" package Atlas imports today renumbers trips, so
  none match it.
- **Days:** only days the timetable covers. Earlier archived days are dropped,
  not matched to a guessed schedule.
- **Service day:** times after midnight (before 4 a.m.) belong to the previous
  service day, as in GTFS.

## How a pass is timed

Each vehicle's positions are placed on the route shape for its trip. The time
it passed a stop is interpolated between the two positions either side of the
stop, by distance along the shape. A stop is skipped when those two positions
are more than 2½ minutes apart. Positions more than 50 m off the shape end the
stretch, so no stop pair is measured across a detour. Positions implying more
than 90 km/h are dropped as bad GPS fixes.

## Metrics

### 1. Running time between stops (on the card)

- **Measured:** for every vehicle that passed stop A and then stop B, the
  actual A-to-B time, compared with the timetable's A-to-B time for that time
  of day (median over that day's scheduled trips in the same time band). It
  doesn't depend on which trip the vehicle was running, so short turns, swaps
  and holds-for-headway don't change it.
- **Shown:** the typical (median) extra time, and the 90th percentile ("1 in 10
  trips take X+ longer", rounded down). Stop pairs are flagged at 30 s or more
  (amber) and 60 s or more (red), tested on the raw seconds.
- **"Looser than needed":** only when the typical pass beats the timetable by
  30 s or more *and* 9 in 10 passes beat it too.
- **Excluded:** stop pairs with fewer than 30 passes or fewer than 5 days;
  stop pairs touching either end of a main pattern, or the stop next to it
  (layover and loop time isn't delay).
- **Limits:** one position a minute means a short stop pair's time is partly
  an interpolation of its neighbours; results are rounded to ½ minute for that
  reason. The timetable comparison is per time band, not per trip.

### 2. Spacing between vehicles (on the card)

- **Measured:** at each stop, the gaps between successive vehicles, compared
  with the timetable's gaps in the same time band. The headline is **excess
  wait**: the average wait for a rider arriving at random (Σgap² ÷ 2Σgap) minus
  the same for the timetable. It's the standard measure for frequent routes
  (TfL uses it). Also shown: the share of gaps within ±50% of scheduled.
- **Excluded:** a missed vehicle would look like one long gap, so gaps are only
  measured across stretches where every scheduled trip in a row was seen at
  that stop (matched by trip ID), at least 4 trips long, with no service break
  over 30 minutes. Vehicles not in that day's timetable (yard moves, the next
  day's first trips) are ignored. Each stretch is graded against its own
  schedule, so mixing time bands doesn't distort it.
- **Limits:** cancelled or unseen trips are left out, so this is a lower bound
  on real waits. The card says so.

### 3. Trips no vehicle reported (computed, not on the card)

- **Measured:** each scheduled stop of each trip gets one status: timed; the
  car was reporting nearby but this stop wasn't timed; the car went quiet here
  and reported again later; off this trip's route; the car started another
  trip partway along; the car first appeared on the route after this stop;
  its last report on the route was before this stop; no vehicle reported this
  trip's number; or feed down. Joining and stopping are judged by *where* on
  the route the car first and last appeared (allowing about 400 m, one
  report's worth of travel), not by timetable times. Reports from a car that
  took the trip number early while still heading the other way are ignored.
  A car counts as starting at the first stop only if it finished its
  previous trip within 400 m and 10 minutes of that stop.
- **Feed health:** a minute counts as degraded when no snapshot arrived for
  over 3 minutes, a snapshot was empty or stale, or far fewer vehicles were
  reporting than the timetable has in service. A trip nobody reported that
  overlaps any degraded minute is unknown, not missing.
- **Left out:** short trip pieces (10 stops or fewer, or under 12 minutes),
  and trips nobody reported while cars on unlisted trip numbers were running
  (they may have run it under another number).
- **504 result:** 3 of 7,655 trips had no vehicle report under their number
  while the feed was healthy and no unlisted cars were running; 11 more had
  unlisted cars running and aren't counted; 14 overlapped feed trouble.
- **Wording:** "No vehicle reported under this trip's number: N of M scheduled
  trips. Not a count of cancellations; trips cut short aren't included."
- **Limits:** a trip with no report can have been cancelled, run under another
  trip number, or had its tracker off; we can't tell which. Trips cut short
  show up as stops after the car's last report, not as missing trips. Not on
  the card until reviewed again.

### 4. Standing still near a stop (on the card)

- **Measured:** a vehicle moved 25 m or less for 2+ minutes within 60 m of a
  stop.
- **Excluded:** the first and last two stops of a pattern, planned turn-back
  points (ends of minor patterns, e.g. Broadview and Queen), within 400 m of a
  carhouse, within 10 minutes of the vehicle changing trip number or leaving
  the feed (operator changes, layovers), outside the trip's scheduled span,
  and any time the feed was degraded. A stop needs 10+ events on 5+ days.
- **Wording:** "Stood still 2+ min near this stop: N times on D of 15 days.
  Could be holding for time, a signal or a blockage; the data can't tell
  which."
- **Limits:** this can't tell a deliberate hold from a signal, a breakdown or
  blocked track. The TTC timetable lists the same arrival and departure time
  at every stop, so no scheduled dwell is subtracted.

### 5. Turn-backs (computed, not shown)

- **Measured:** a trip counts as "vehicle started another trip partway along"
  when all of these hold:
  - its last report and its last timed stop are both 1 km or more from the
    route end, on the route (not off it);
  - the same car's next trip is in the opposite direction, starts within 20
    minutes and 500 m, and the car actually moves 200 m or more along that
    next trip's route within its first 15 minutes;
  - no other car reported the same trip number at the same time;
  - the car wasn't off route in the 10 minutes before it stopped (a detour);
  - next to a carhouse, the next trip starts within 5 minutes (otherwise it
    looks the same as pulling in).
- **504 result:** 142 in 15 days, 89 of them at Roncesvalles and Queen
  (westbound, next to the Roncesvalles carhouse).
- **Limits:** each rule drops some real turn-backs (for example a car that
  pulls into the carhouse and out again after more than 5 minutes), so the
  count depends on the rules and is a lower bound. Not shown.

### 6. Off-route running (computed, not shown)

- **Measured:** 2+ reports in a row (each within 90 seconds of the last) more
  than 50 m off the trip's own route shape, more than 300 m from either end,
  and not within 400 m of a carhouse or the Dufferin Gate loop. Terminal
  loops and carhouse moves aren't diversions, so they're left out.
- **Finding:** on that subset (5,676 reports in 458 trip pieces), 94% of
  reports sit on no 504 route at all, a median 288 m from the nearest one, in
  the same places almost every day (e.g. just south of King near York, King
  and Spadina, Parliament north of Queen). These look like regular diversions
  the timetable doesn't show.
- **Next step:** "where streetcars regularly divert" is a candidate feature.

## Recommendation

Show running time, spacing and standing still now (metrics 1, 2 and 4). Keep
3, 5 and 6 computed and reviewed before they reach the card. Separately, switch Atlas's TTC timetable
source to the Surface package so live trip IDs match.

## Supporting artifacts

| File | Purpose |
|---|---|
| `scripts/live-segment-delay.ts` | Builds the stats from archived positions and the GTFS |
| `shared/segmentDelay.ts` | Pass timing, metrics and trip-status rules (unit-tested) |
| `src/utils/segmentDelayView.ts` | Card thresholds, rounding and wording |
| `Atlas-worktrees/_live-data/out/` | Local output (not in the repo) |
