# How Live measures a route

This is how the Live route page (the dashboard and the full analysis at `/apps/live/<agency>/<route>`) gets its numbers. Live is local-only: it is off in every deployment (see [FEATURE_FLAGS.md](../FEATURE_FLAGS.md)). The analysis is built by `npm run live:analyze -- <route>` (`scripts/live-segment-delay.ts`); the page reads the file it writes through `/api/live-dashboard`, a local-only endpoint (`local-api/`, served by `npm run dev:api`, never deployed). Shared rules and wording live in `shared/liveDashboard.ts` and `shared/routeMetrics.ts`.

## Where the numbers come from

- **Positions, not reported delays.** The TTC feed sends no delay values, so Live works delays out itself. It uses the archived vehicle positions (one snapshot about every minute, measured at 1,440 snapshots a day, and a vehicle's own position advances at a median of 61 seconds; kept 30 days in the `atlas-live` bucket) and the agency's timetable (GTFS).
- **Window.** The last 7 service days by default. The page always says which days, how many trips and how many stop departures it is based on.
- **Good days only.** A day counts as good when the route has at least 90% of the snapshots a typical day of its kind has.
  - **What counts as a snapshot.** One per timestamp, and only when it carries at least one of the route's vehicles. The older fetcher wrote an empty line for a snapshot with none of the route's vehicles; `--routes all` leaves it out. They are counted the same (neither), so an archive that mixes the two formats gives the same verdict for every day.
  - **Typical day.** The median of the OTHER days that ran the same timetable (weekday, Saturday, Sunday; a statutory holiday that runs Sunday service is a Sunday, because the day's kind is the set of services the GTFS calendar runs that day). The same-kind comparison applies once the archive has 3 days of that kind (the day and 2 others); until then the day is compared with all other days. Today the archive has only 2 Saturdays and 2 Sundays, so weekends and holidays still compare against weekdays. A lone day is its own typical day.
  - **Feed outages** (the gaps the analysis treats as the feed being down) are read from the snapshot times of every route in the archive, not the route's own lines, so a route's quiet spell (overnight, a late Sunday start) is not an outage. A route-only outage is a feed snapshot that exists but holds none of this route's vehicles while the timetable has the route in service; it reads the same whether the archive wrote an empty line for it (older fetcher) or no line (`shared/feedOutages.ts`).

The tiles and every late share (by kind of day, by hour, the route and network figures in the planner) count only this week's good days, so the same figure reads the same everywhere. The stop lists, run time by hour, where delay builds up, bunching, extra wait and each direction's late share are worked out from the good days only too (the analysis file lists them in `window.goodDates`; `window.dates` and the per-day tables keep every day). If no day is good those sections are empty, and the page's few-measurements rules apply.

## When a vehicle left a stop

- **Departure, not arrival.** Delay at a stop is the moment the vehicle left it, minus the timetable's departure for that trip at that stop.
- **"Left" means 25 metres past the stop**, measured along the trip's shape. The moment is interpolated between the two positions either side of that point, which are about a minute apart.
- **Why departure.** At a terminal a vehicle arrives early and waits to leave on time. Counting arrivals would make it look early when it is not.
- **Precision.** Each time is an estimate between two positions. The method notes on the page say what share of departures sit within 0.75 minutes of an on-time cutoff, where a small error could flip the label (6-20% on the TTC streetcar routes).

## Matching vehicles to timetable trips

- **By trip number.** Each run is matched to the timetable trip whose number the vehicle reports.
- **Swaps.** Sometimes a vehicle runs under the wrong trip number. A run is treated as swapped when its median delay is 15+ minutes off its own trip.
  - If another scheduled trip on the same pattern fits within 3 minutes at 80% or more of the stops, the run is counted as that trip.
  - Otherwise it is left out.
  - Passages more than an hour off are always left out.
- **The page says how many** runs were reassigned and how many were left out (most routes 3-6%).

## On time, early and late

- **Late:** 5.5 or more minutes after the timetable.
- **Ahead (early):** 1.5 or more minutes before it.
- **On time:** anything in between.
- **Same limits as the Live map**, so the page and the map never disagree (`thresholds` in the analysis file).
- **History of the numbers.** They came in with the first Live map (commit 947d00de, 2026-06-27) with no stated reason. Their reason is now stated: Late is more than 5½ minutes behind the timetable, the TTC's 5-minute standard plus 30 seconds, half the one-minute gap between snapshots (Ryan, 2026-10-17).
- **Lateness is the reliable figure.** Vehicles often wait to leave on time, so the headline is the share late (or not late). "Ahead" is shown as a quieter note.
- **The headline counts trips leaving the end of the line.** Late is the share of trips that left their first stop (the end of the line) 5.5+ minutes after the timetable, the TTC's own measure: its Daily Customer Service Report counts "on time departures from end terminals", from 1 minute early to 5 minutes late (pw.ttc.ca, checked 2026-10-16). By hour, it is the hour the trip starts.
- **Why not every stop, or the timepoints.** On the TTC almost every timepoint is a trip's first or last stop, and every other stop's time is marked approximate. A delay against those approximate times is not a real measure of keeping to the timetable (on 504 most in-between stops look 1-2 min early; against a straight-line schedule most of that goes away). Per-stop figures (the route strip, the stop tables) still show delay at every stop, but they show "1+ min early" only at timepoints, and early elsewhere as on time. Details: `_reports/live-timepoint-method.md`.

## The questions the page answers

### Late departures by hour (B1)

- The share of trips that left the end of the line late, for all days, weekdays and weekends side by side (good days only).
- Below that, an hourly chart for each kind of day: the share of departures ahead, on time and late in each hour.

### Stops most often late (B2)

- Stops ranked by the share of departures 5.5+ minutes late.
- Only stops with at least 30 departures are ranked. The typical delay and the delay that 1 in 10 departures exceed sit beside each one.

### Where delays build up (B3)

- Per direction, the typical delay at each stop along the route.
- **Delay builds up** where the biggest jump in delay holds for the next few stops (3 stops or about 1 km).
- If no single jump holds, the page says delay builds slowly. It also lists the stretches that add the most delay, and the answer for each time of day.

### Where bunching forms (B4)

- **Bunched:** a gap between vehicles of under 2 minutes.
- **Gapped:** a gap more than twice the timetable's.
- **Forms** where the share of bunched or gapped gaps rises by 10 or more points and stays up for the next 3 stops or about 1 km. Smaller climbs are called gradual.
- **Linked to.** For that stretch the page checks four things measured nearby:
  - uneven departures at the terminal;
  - vehicles standing still;
  - running slower than the timetable;
  - trips cut short.
- "Linked" means measured near the stretch, never "the cause". The thresholds for each link are in `shared/bunching.ts`.

### Run time

- How long a trip takes over the route's main stretch (named on the page, for example "Spadina Station to Queens Quay"), by the hour it starts, against the timetable.
- Only runs seen at both ends of the stretch count. The typical (median) time is shown, with the time 1 in 10 trips exceed.

### Extra wait

- How much longer riders wait than scheduled, worked out from the gaps between vehicles at each stop.
- The method: the average wait a rider arriving at random would have with the actual gaps, minus the same with the timetable's gaps, weighted by how long each stretch of service lasts.
- Shown only where the timetable has a vehicle every 15 minutes or better, and at stops with at least 10 gaps.

### Service delivered

- The share of scheduled trips that ran.
- A trip counts as run when a vehicle was seen under its trip number.
- Trips that cannot be judged (the feed was down, or other vehicles covered their slot) are left out of the share, and so are days that are not good days.

## This week compared with last week

- **Weeks.** "This week" is the last 7 days and "last week" the 7 before. Only good days count, and each week needs at least 4 of them.
- **Colouring.** A change is coloured only when it is bigger than usual day to day; smaller changes stay grey. The tile's change line reads "last week 10%" (last week's value), and only its small arrow takes the colour. The rule is the same for every tile on every surface (`weekChangeTone` in `shared/liveDashboard.ts`).
  - Every measure (late, run time, extra wait, bunching, service delivered) has a value per day in the analysis file (`daily`). The change must be more than twice the standard error of the difference between the two weekly averages, worked out from that measure's own spread between days.
  - Only when a measure has fewer than 3 good days to measure the spread (or an older file has no daily values) does a fixed amount stand in: 2 points, 1 minute, half a minute, 1 point for service delivered.

## Small samples and less exact stops

- **Paler bars and tiles** rest on fewer than 30 trips, gaps or departures. They are shown but should be read with care.
- **Less exact stops.** Where vehicles report their position rarely, delay at the first stops is less exact. The TTC 510 northbound starts in the Union Station tunnel, with positions about every 90 seconds.
  - Those stops are drawn striped and marked "less exact".
  - They are left out of the B2 ranking.
  - The page reads their delay as "about +2 to +3 min".

## What is left out

- **Unscheduled runs:** vehicles on a trip number that is not in the timetable (extra or unscheduled buses, common on the 501). They cannot be compared with a timetable.
- **Replacement buses** that share a streetcar's route number (the 506) are a separate service and are left out. A route run entirely by replacement buses is labelled so.
- **Held routes.** A route is held off the page when its trip numbers cannot be trusted. The 512: some vehicles carry trip numbers that are not in the timetable, the rest point to slots 10-50 minutes away, and any run fits some trip on such a frequent route. It stays held until the feed gives something to check against.
- **The page says how many runs were left out and why**, and that its figures describe only the timetabled trips that were kept.
