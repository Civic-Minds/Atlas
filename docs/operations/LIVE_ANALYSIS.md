# Live route analysis (schema v3)

The analysis is built locally; where the Live pages are switched on is in [FEATURE_FLAGS.md](../FEATURE_FLAGS.md). The TTC feed has no delay values, so the route analysis is our own calculation from archived
vehicle positions and the timetable.

## Build it

`npm run live:analyze -- 505` (or several routes, or `all`; `--days 14` for a longer window). It reads `../_live-data`
(`archive/` = archived positions, `gtfs/candidates/surface` = the TTC surface timetable) and writes
`../_live-data/out/ttc-<route>-segments.json`, which the local-only `/api/live-segments` serves (`local-api/`, never deployed).

## Refresh the published report files (cloud)

The report pages on beta read `atlas/live/ttc/<route>.json`, `agency.json` and `manifest.json` from the public bucket. The
`live-report-refresh.yml` workflow rebuilds them from the last 15 service dates:

- `gh workflow run live-report-refresh.yml` (mode `no-publish`, the default) builds everything with the read-only R2 keys and
  writes nothing. The run artifact `live-report-files-<run id>` holds the files and `review/summary.md`: the weeks covered, the
  days with good recordings, how well each service date's positions matched its timetable, and each route's headline numbers
  for both weeks. Review that first.
- `-f mode=publish` runs only from `main`. A separate job saves the published files as the artifact `live-report-backup-<run id>`
  and then replaces them (`scripts/live-publish-upload.ts`). It refuses an incomplete file set and data older than what is
  published, and stops if it could not save the published set. To undo, upload a backup folder back with
  `--from <backup> --allow-older --upload`. Publishing is an R2 write: it
  needs the same go-ahead as any other.

A window that spans a TTC timetable change uses each service date's own timetable (`scripts/live-gtfs-for-window.ts` unpacks
every stored surface zip the window needs into `gtfs/candidates/surface-feeds/`). The run stops when a day's positions match
its timetable below 90%, when another stored timetable matches a day better than the one chosen, or when the fetch could not
read more than 2% of a day's snapshots.

The weekly schedule is in the file, off. Before it is turned on (a scheduled run publishes with nobody looking):

- an upload that fails part-way should put the saved files back by itself, or upload to a new prefix and switch once;
- refuse to publish when either week has too few days with good recordings;
- refuse a window that does not end yesterday;
- stop an unattended publish when a headline number moves by more than a set amount from the published one;
- tell someone when a run fails.

## What it measures (the `v3` block)

- **Delay at a stop** = the time the car LEFT the stop (interpolated between archived positions, at the point 25 m past the stop on
  the trip's shape) minus the timetable's departure for that trip at that stop. Departure, not arrival: at terminals a car arrives
  and waits, which would look early. Trips are matched by trip number. A run whose median delay is 15+ minutes off its own trip is
  reassigned if another scheduled trip on the same pattern fits within 3 minutes at 80% of its stops (a swapped trip number),
  otherwise dropped; the counts are in `v3.swaps`. Passages more than an hour off the timetable are dropped and counted.
- **On time** uses the same thresholds as the map (`shared/liveDelayStatus.ts`): early at or below -1.5 min, late at or above +5.5.
  "Early" only means the car left before the timetable's time (cars often wait to leave on time), so the headline is the
  share that is **not late**. Adherence is reported at timepoints (the stops the timetable really schedules) and at all stops.
  Positions come about every minute, so each time is interpolated; `v3.uncertainty.nearCutoffShare` is the share of timepoint
  departures within 0.75 min of a cutoff, where a small error can change the label.
- **B1 adherence** by hour, date, direction and weekday/weekend. **B2 stops with the most delay**: ranked by late share (5.5+ min late,
  at least 30 passages, `lateRank`), with the median and 90th percentile beside it. **B3 where delays start**: the first stretch that adds more than a minute of
  delay in at least half of the runs, and the delay already there at the first stop.
- **B4 bunching**: the gaps between consecutive cars at each stop. Bunched = gap under 2 minutes, gapped = more than twice the
  scheduled gap. Bunching "forms" at the largest step of 10+ points that stays up for the next 3 stops or about 1 km (recovering later does not undo where it formed); a slower climb is
  called gradual (`kind`), and the whole per-stop profile is stored. What lines up with it is
  listed as "linked to": uneven departures at the terminal, stood-still time, running time over the timetable, short turns.

- **Running time** (`v3.runningTime`): from leaving the first stop (25 m past it) to reaching the last, against the timetable's first departure and last arrival, per direction and start hour. Scheduled, typical (median) and 1 in 10 over (90th percentile).
  - `stretch`, `bands`, `byHour` and `weekly.tripTime`: over the stops every regular pattern serves, trimmed to reliably measured ends, so short turns count too (the route pages).
  - `branches`: a line for each regular pattern that runs well past that stretch.
  - `patterns` (CIV-945): every regular pattern timed on its own trips only, over its own stops trimmed to reliably measured ends, the busiest (`main`) first; the others are a `shortTurn` (the main pattern's stops in a row, allowing two loop stops at either end) or a `branch`. `stops` of `patternStops` says how much of the pattern is measured (the 510's Union tunnel end is not). `weekly.mainPatternTrip` is the main pattern's week figure; the planner's Run time for a picked route uses it.
- **Extra wait** (`v3.extraWait`): per stop where the timetable runs every 15 minutes or better, the average wait implied by the actual gaps minus the one implied by the scheduled gaps (sum of squares over twice the sum), per time of day.
- **Service delivered** (`v3.serviceDelivered`): per day, scheduled trips with a vehicle seen under their trip number among those we can judge; trips in feed gaps or covered by unlisted cars are "unknown", not missed. Only days with healthy archive coverage (at least 90% of a normal day's snapshots) count.
- **This week against last** (`v3.weekly`): the same measures (late share, typical trip time, extra wait, bunching share, service delivered) computed by one function over the newest 7 and the previous 7 service dates, healthy days only; compared only when each week has at least 4 healthy days.

The window is the last `--days` service dates (default 7) that the archive and the timetable both cover. The thresholds and
constants are in `shared/stopDelay.ts` and `shared/bunching.ts`.

## Check it

Also `scripts/handcheck/live-triptime-check.py` (end-to-end trip times), `live-extrawait-check.py` (extra wait at one stop) and `live-delivered-check.py` (service delivered for one day).

`python3 scripts/handcheck/live-arrival-check.py --route 505 --obs <obs.json> --gtfs ../_live-data/gtfs/candidates/surface --archive ../_live-data/archive`
recomputes random stop departures (25 m past the stop) from the raw archive and the timetable with separate code and prints both numbers
(`--obs-out` on `scripts/live-segment-delay.ts` writes the passages it used).

## The page

`/apps/live/<agency>/<route>` (see [FEATURE_FLAGS.md](../FEATURE_FLAGS.md) for where it is on) shows B1 to B4 and the method from the `v3` block, through the local-only
`/api/live-dashboard?agency=ttc&route=505` (`local-api/`, never deployed). The answer always has a status (`ready`, `held`, `no_analysis`, `unknown_route`) and a plain
reason. Routes held back until a known problem is fixed are listed in `shared/liveDashboard.ts` (`LIVE_DASHBOARD_HOLD`: 512).

Routes that share a number with another service: the 506 runs streetcars and, in parallel, 506B replacement buses, so `live:analyze` passes `--exclude-headsign "replacement bus"` for it and analyses the streetcars only. Runs under trip numbers missing from the timetable (the 501's unscheduled buses) are never matched. Both counts are in `v3.leftOut` and shown on the page.
