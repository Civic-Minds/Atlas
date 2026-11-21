# Dry-run diff report

- Baseline: c1934 (commit 8111e820f, runAt 2026-11-19T17:38:07Z)
- Candidate: c1957 (commit 0437649cc, runAt 2026-11-19T18:27:09Z)

## Headline

- Agencies compared: 526 (69183 route/day/direction rows); countries: United States 441, Canada 85.
- Excluding drt: 525 agencies in 2 countries (United States, Canada). "Six additional agencies in two countries" (not counting DRT): SATISFIED by coverage (coverage = compared, not necessarily affected; stop-level pooled values need the agencies input, see usage).
- Changed cells: 42 total; value cells (figures, headlines, stops): 25. Published -> none: 7. none -> published: 4. Changed value to value: 14. Crossed a tier boundary: 11.
- Focus (drt route 900) changed cells: 0. Collateral (everything else): 42 cells (25 value cells) in 15 agencies.
- Stop-level compared: no (route-level artifact only; pass --baseline-stops/--candidate-stops).
- Agency status differences (report.json): none.

## Per agency

| Agency | Country | Routes | Rows | Changed cells | Value cells | Published->none | none->published | Tier changes | Delta min | median | max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| njt | United States | 277 | 2179 | 9 | 4 | 3 | 0 | 1 | -3 | -3 | -3 |
| lacmta | United States | 115 | 1084 | 8 | 6 | 0 | 0 | 6 | -16 | 0 | +10 |
| nyct-bus-bronx | United States | 46 | 361 | 4 | 2 | 2 | 0 | 0 | - | - | - |
| nyct-bus-brooklyn | United States | 68 | 507 | 4 | 2 | 0 | 1 | 1 | -9 | -9 | -9 |
| cta | United States | 132 | 988 | 2 | 1 | 0 | 1 | 0 | - | - | - |
| nyct-bus-manhattan | United States | 41 | 308 | 2 | 1 | 0 | 1 | 0 | - | - | - |
| portlandme | United States | 15 | 111 | 2 | 1 | 1 | 0 | 0 | - | - | - |
| septa | United States | 174 | 1191 | 2 | 1 | 0 | 0 | 1 | +1 | +1 | +1 |
| t3-transit | Canada | 12 | 52 | 2 | 1 | 1 | 0 | 0 | - | - | - |
| the-rapid | United States | 30 | 160 | 2 | 1 | 0 | 1 | 0 | - | - | - |
| cata-state-college | United States | 18 | 79 | 1 | 1 | 0 | 0 | 0 | -3 | -3 | -3 |
| lanta | United States | 40 | 161 | 1 | 1 | 0 | 0 | 1 | -12 | -12 | -12 |
| madison-metro | United States | 29 | 181 | 1 | 1 | 0 | 0 | 0 | +1 | +1 | +1 |
| pace-bus | United States | 134 | 683 | 1 | 1 | 0 | 0 | 1 | -5 | -5 | -5 |
| translink | Canada | 237 | 1486 | 1 | 1 | 0 | 0 | 0 | -1 | -1 | -1 |

Delta columns are after minus before, value-to-value cells only.

## Top changed routes

| Agency | Route | Changed cells | Largest delta (min) | Published->none | none->published |
|---|---|---|---|---|---|
| lacmta | 108 | 4 | 10 | 0 | 0 |
| njt | 139 | 4 | - | 2 | 0 |
| nyct-bus-bronx | Bx36 | 4 | - | 2 | 0 |
| njt | 73 | 3 | 3 | 0 | 0 |
| cta | 95 | 2 | - | 0 | 1 |
| lacmta | 105 | 2 | 1 | 0 | 0 |
| lacmta | 20 | 2 | 16 | 0 | 0 |
| njt | 165 | 2 | - | 1 | 0 |
| nyct-bus-brooklyn | B41 | 2 | 9 | 0 | 0 |
| nyct-bus-brooklyn | B44 | 2 | - | 0 | 1 |
| nyct-bus-manhattan | M4 | 2 | - | 0 | 1 |
| portlandme | 9A | 2 | - | 1 | 0 |
| septa | 55 | 2 | 1 | 0 | 0 |
| t3-transit | 1 | 2 | - | 1 | 0 |
| the-rapid | 33 | 2 | - | 0 | 1 |
| cata-state-college | WL | 1 | 3 | 0 | 0 |
| lanta | 613 | 1 | 12 | 0 | 0 |
| madison-metro | 38 | 1 | 1 | 0 | 0 |
| pace-bus | 381 | 1 | 5 | 0 | 0 |
| translink | 009 | 1 | 1 | 0 | 0 |

## Newly refused (published -> none) (7)

| Agency | Route | Day | Where | Period | Kind | Before | After |
|---|---|---|---|---|---|---|---|
| njt | 139 | Weekday | 1 to LAKEWOOD VIA FREEHOLD CENTER/MALL | overnight | headline | 50 | none |
| njt | 139 | Weekday | 1 to LAKEWOOD VIA FRHLD MAL | overnight | headline | 50 | none |
| njt | 165 | Saturday | 0 to NEW YORK TURNPIKE EXP | evening | headline | 19 | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV | late | headline | 14 | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV | overnight | headline | 32 | none |
| portlandme | 9A | Weekday | 0 to Washington Ave + Auburn St | amPeak | headline | 19 | none |
| t3-transit | 1 | Weekday | 0 to Royalty Crossing Mall | evening | headline | 19 | none |

## Newly published (none -> value) (4)

| Agency | Route | Day | Where | Period | Kind | Before | After |
|---|---|---|---|---|---|---|---|
| cta | 95 | Saturday | 0 to Stony Island & 95th Street | amPeak | headline | none | 13 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND | overnight | headline | none | 38 |
| nyct-bus-manhattan | M4 | Saturday | 0 to WSHNGTN HTS CABRINI via MADISON via BWAY | midday | headline | none | 11 |
| the-rapid | 33 | Weekday | 0 to Northridge | pmPeak | headline | none | 43 |

## Collateral: changes outside drt route 900 (42)

| Agency | Route | Day | Where | Period | Kind | Before | After |
|---|---|---|---|---|---|---|---|
| cata-state-college | WL | Sunday | 1 to Out of Service | allDay | headline | 15 | 12 |
| cta | 95 | Saturday | 0 to Stony Island & 95th Street | amPeak | headline | none | 13 |
| cta | 95 | Saturday | 0 to Stony Island & 95th Street | amPeak | steady | none | steady |
| lacmta | 108 | Weekday | 1 to Mesmer / Major | amPeak | headline | 15 | 20 |
| lacmta | 108 | Weekday | 1 to Mesmer / Major | midday | headline | 10 | 20 |
| lacmta | 108 | Weekday | 1 to Mesmer / Major | amPeak | longest gap | 31 | 21 |
| lacmta | 108 | Weekday | 1 to Mesmer / Major | allDay | headline | 21 | 20 |
| lacmta | 105 | Weekday | 1 to Vernon Yard | amPeak | headline | 10 | 11 |
| lacmta | 105 | Weekday | 1 to Vernon Yard | amPeak | longest gap | 17 | 18 |
| lacmta | 20 | Saturday | 0 to 6th / Main | allDay | headline | 29 | 13 |
| lacmta | 20 | Sunday | 0 to 6th / Main | allDay | headline | 29 | 13 |
| lanta | 613 | Weekday | 1 to Commercial Center | allDay | headline | 68 | 56 |
| madison-metro | 38 | Weekday | 0 to U.W. HOSPITAL | allDay | headline | 21 | 22 |
| njt | 139 | Weekday | 1 to LAKEWOOD VIA FREEHOLD CENTER/MALL | overnight | headline | 50 | none |
| njt | 139 | Weekday | 1 to LAKEWOOD VIA FREEHOLD CENTER/MALL | overnight | steady | not steady | none |
| njt | 139 | Weekday | 1 to LAKEWOOD VIA FRHLD MAL | overnight | headline | 50 | none |
| njt | 139 | Weekday | 1 to LAKEWOOD VIA FRHLD MAL | overnight | steady | not steady | none |
| njt | 73 | Weekday | 0 to NEWARK PENN STATION | amPeak | headline | 32 | 29 |
| njt | 73 | Weekday | 0 to NEWARK PENN STATION | amPeak | steady | not steady | steady |
| njt | 73 | Weekday | 0 to NEWARK PENN STATION | amPeak | longest gap | 51 | 34 |
| njt | 165 | Saturday | 0 to NEW YORK TURNPIKE EXP | evening | headline | 19 | none |
| njt | 165 | Saturday | 0 to NEW YORK TURNPIKE EXP | evening | steady | steady | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV | late | headline | 14 | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV | overnight | headline | 32 | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV | late | steady | steady | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV | overnight | steady | steady | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to DOWNTOWN BKLYN CADMAN PLAZA via FLATBUSH | evening | headline | 19 | 10 |
| nyct-bus-brooklyn | B41 | Weekday | 0 to DOWNTOWN BKLYN CADMAN PLAZA via FLATBUSH | evening | longest gap | 30 | 15 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND | overnight | headline | none | 38 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND | overnight | steady | none | not steady |
| nyct-bus-manhattan | M4 | Saturday | 0 to WSHNGTN HTS CABRINI via MADISON via BWAY | midday | headline | none | 11 |
| nyct-bus-manhattan | M4 | Saturday | 0 to WSHNGTN HTS CABRINI via MADISON via BWAY | midday | steady | none | steady |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave | allDay | headline | 20 | 15 |
| portlandme | 9A | Weekday | 0 to Washington Ave + Auburn St | amPeak | headline | 19 | none |
| portlandme | 9A | Weekday | 0 to Washington Ave + Auburn St | amPeak | steady | steady | none |
| septa | 55 | Weekday | 1 to Olney Transit Center | pmPeak | headline | 15 | 16 |
| septa | 55 | Weekday | 1 to Olney Transit Center | pmPeak | longest gap | 20 | 26 |
| t3-transit | 1 | Weekday | 0 to Royalty Crossing Mall | evening | headline | 19 | none |
| t3-transit | 1 | Weekday | 0 to Royalty Crossing Mall | evening | steady | not steady | none |
| the-rapid | 33 | Weekday | 0 to Northridge | pmPeak | headline | none | 43 |
| the-rapid | 33 | Weekday | 0 to Northridge | pmPeak | steady | none | not steady |
| translink | 009 | Sunday | 1 to Granville St | allDay | headline | 12 | 11 |

## Changes on drt route 900 (0)

None.

