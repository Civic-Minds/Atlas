# Where routes fall behind: methods (Live proof of concept)

Snapshot date: `2026-10-14`
Scope: TTC 504 King and 511 Bathurst, 15 service days (2026-09-30 to 2026-10-14)

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
  live feed (504: 99% of archived runs). The "Routes and Schedules" package
  Atlas imports today renumbers trips, so none match it.
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

- **Measured:** each scheduled stop pass of each trip gets one status: timed;
  reporting but not timed here; no vehicle reported this trip; the vehicle
  started reporting after this stop; stopped reporting before it; off this
  trip's route; started another trip partway along; or feed down.
- **Feed health:** a minute counts as degraded when no snapshot arrived for
  over 3 minutes, a snapshot was empty or stale, or far fewer vehicles were
  reporting than the timetable has in service. A trip nobody reported that
  overlaps any degraded minute is unknown, not missing.
- **504 result:** 37 of 8,050 trips (0.5%) had no vehicle report them while
  the feed was healthy.
- **Limits:** "no vehicle reported this trip" can mean it was cancelled, ran
  under another trip number, or had its tracker off. We can't tell which.

### 4. Standing still near a stop (computed, not on the card)

- **Measured:** a vehicle moved 25 m or less for 2+ minutes within 60 m of a
  stop.
- **Excluded:** the first and last two stops of a pattern, within 400 m of a
  carhouse, within 10 minutes of the vehicle changing trip number or leaving
  the feed (operator changes, layovers), outside the trip's scheduled span, and
  any time the feed was degraded.
- **Limits:** this can't tell a deliberate hold from a breakdown or blocked
  track. The label is "Stood still 2+ min near this stop (includes layovers,
  operator changes and waiting for time)". The TTC timetable lists the same
  arrival and departure time at every stop, so no scheduled dwell is
  subtracted.

### 5. Turn-backs (computed, not shown)

- **Measured:** a trip whose vehicle stopped 1 km or more short of the route
  end (by both its last position and its last timed stop), then within 20
  minutes and 500 m started a trip in the opposite direction, and actually
  moved back 200 m or more.
- **Result:** only 5 on the 504 in 15 days. Too rare to detect reliably from
  this feed, so not shown.

### 6. Off-route running (computed, not shown)

- **Measured:** 2+ positions in a row more than 50 m off the trip's own route
  shape, away from either end.
- **Finding:** about 1% of 504 stop passes. 88% of those positions sit on no
  504 route at all (median 242 m away), in the same places almost every day
  (e.g. south of King near York, King and Spadina, Parliament north of Queen).
  These look like regular diversions the timetable doesn't show.
- **Next step:** "where streetcars regularly divert" is a candidate feature.

## Recommendation

Show running time and spacing now (metrics 1 and 2). Keep 3 to 6 computed and
reviewed before they reach the card. Separately, switch Atlas's TTC timetable
source to the Surface package so live trip IDs match.

## Supporting artifacts

| File | Purpose |
|---|---|
| `scripts/live-segment-delay.ts` | Builds the stats from archived positions and the GTFS |
| `shared/segmentDelay.ts` | Pass timing, metrics and trip-status rules (unit-tested) |
| `src/utils/segmentDelayView.ts` | Card thresholds, rounding and wording |
| `Atlas-worktrees/_live-data/out/` | Local output (not in the repo) |
