# Live route analysis (schema v3)

Local only, like all of Live. The TTC feed has no delay values, so the route analysis is our own calculation from archived
vehicle positions and the timetable.

## Build it

`npm run live:analyze -- 505` (or several routes, or `all`; `--days 14` for a longer window). It reads `../_live-data`
(`archive/` = archived positions, `gtfs/candidates/surface` = the TTC surface timetable) and writes
`../_live-data/out/ttc-<route>-segments.json`, which `/api/live-segments` serves.

## What it measures (the `v3` block)

- **Delay at a stop** = the time the car passed the stop (interpolated between archived positions, projected on the trip's shape)
  minus the timetable's departure for that trip at that stop. Trips are matched by trip number. Passages more than an hour off the
  timetable are dropped and counted.
- **On time** uses the same thresholds as the map (`shared/liveDelayStatus.ts`): early at or below -1.5 min, late at or above +5.5.
  "Early" only means the car passed the stop before the timetable's time (cars often wait to leave on time), so the headline is the
  share that is **not late**. Adherence is reported at timepoints (the stops the timetable really schedules) and at all stops.
- **B1 adherence** by hour, date, direction and weekday/weekend. **B2 stops with the most delay**: median and 90th percentile per
  stop (ranked when there are at least 30 passages). **B3 where delays start**: the first stretch that adds more than a minute of
  delay in at least half of the runs, and the delay already there at the first stop.
- **B4 bunching**: the gaps between consecutive cars at each stop. Bunched = gap under 2 minutes, gapped = more than twice the
  scheduled gap. Bunching forms at the first stretch where that share rises by 5 points and stays up. What lines up with it is
  listed as "linked to": uneven departures at the terminal, stood-still time, running time over the timetable, short turns.

The window is the last `--days` service dates (default 7) that the archive and the timetable both cover. The thresholds and
constants are in `shared/stopDelay.ts` and `shared/bunching.ts`.

## Check it

`python3 scripts/handcheck/live-arrival-check.py --route 505 --obs <obs.json> --gtfs ../_live-data/gtfs/candidates/surface --archive ../_live-data/archive`
recomputes random stop passages from the raw archive and the timetable with separate code and prints both numbers
(`--obs-out` on `scripts/live-segment-delay.ts` writes the passages it used).
