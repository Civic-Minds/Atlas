# Atlas Studio MCP: test log

The standing questions for the Atlas Studio MCP server ([README](README.md)), and what it answered each time. Rerun all of them after every change to the server, and add a dated section with the results checked against Atlas data.

## Standing questions

Ryan's, from his first test:
1. How often does the TTC 29 bus run on a Saturday?
2. How much does that change between Saturday and Sunday from 10 AM to 6 PM?
3. Between Dufferin Station and Wilson Station, are there other routes that make service effectively more frequent?
4. How much faster is the 929?
5. Do the 29 and 929 take the same time northbound between those stops from 10 AM to 6 PM, or does it change through the day?

Planner samples:
6. Which OC Transpo routes run every 10 minutes or better at weekday midday?
7. Compare TTC, TransLink, MBTA, CTA and SEPTA: how many routes run every 15 minutes or better on weekday evenings?
8. Which York Region Transit routes run every 15 minutes or better on Sunday midday?
9. What changed in Hamilton's spring schedule?
10. Which agencies does Atlas cover around Hamilton?

## 2026-11-17: Ryan's first test, in a fresh Claude Code chat

| # | Tools used | Answer | Right? | Gap or fix |
|---|---|---|---|---|
| 1 | route_frequency | Saturday frequency by period, from Atlas data | Right | None |
| 2 | route_frequency (Saturday, Sunday) | Compared the two days by period | Right, by period | It couldn't answer for 10 AM to 6 PM exactly. Fixed: a time window, hour by hour |
| 3 | route_frequency for the 929 | Picked the 929 from its own memory and guessed "every 4–6 combined" | Partly: the 929 is right, the combined figure was a guess | No tool for routes between two stops. Fixed: combined_frequency |
| 4 | None (looked through the repo, downloaded the TTC schedule itself) | Worked out a trip time by hand | Not checked | No trip-time tool. Fixed: trip_time |
| 5 | None | Same | Not checked | Same |

A reviewer also asked for these, all fixed:
- A period with a few trips but no regular frequency said "no service". It now says "some trips, but no regular frequency".
- Each period now gives its clock hours.
- A range such as "every 5–16 min" now gets a plain explanation.
- Internal words are gone.
- `list_agencies` lists nothing until given a search.

## 2026-11-17: rerun after the fixes (server 0.2.0)

Data: release release-mwl8qwjk for frequencies, and TTC's schedule file 20261031 for trip times.

| # | Tools used | Answer | Right? | Gap or fix |
|---|---|---|---|---|
| 1 | route_frequency | Saturday: AM peak every 10–20 min; midday every 5–16; PM peak and evening every 5–15; late every 8–16; overnight a few trips, no regular frequency. Each range runs from the busiest part of the route to the quietest. First trip 5:46 AM, last 2:08 AM | Right: matches the map's route card | None |
| 2 | route_frequency with 10 AM–6 PM, Saturday and Sunday | Before noon both days run every 15–16 on each branch. From about 1 PM, the Dufferin Gate branch runs every 10 on Saturday and every 5 southbound (8 northbound) on Sunday; the Princes' Gates branch runs every 15 both days | Right per Atlas data. Flagged for a check: Sunday's every 5 from 8 trips an hour | Look at the hourly value behind Sunday's Dufferin Gate branch |
| 3 | combined_frequency, Saturday 10 AM–6 PM | Routes 29, 929 and 329 (the 329 has no trips in the window). 29 every 6 min, 929 every 10, combined every 3 (137 departures) | Right: the map's rule for combining trips at a stop | None |
| 4 | trip_time, Saturday | 929: 37 min; 29: 44 min. The 929 is about 7 min faster | Right: schedule times | None |
| 5 | trip_time, 10 AM–6 PM | 929 takes 37 min in every hour. 29 takes 44 min, 45 from 11 AM to noon | Right | None |
| 6 | routes_at_frequency | Only Line 1 (every 6 min), out of 76 routes running at midday | Right: matches the map's filter | None |
| 7 | compare_agencies | TTC 64 of 167, CTA 34 of 93, MBTA 33 of 119, TransLink 32 of 173, SEPTA 10 of 122 | Right | None |
| 8 | routes_at_frequency | Only route 20 Jane (every 15 min), out of 31 running | Right | None |
| 9 | schedule_changes | Routes 56 and 99 added, 51 removed, with frequency changes biggest first | Right | Routes 56 and 99 read 102 and 83 min at midday, because they start part-way through the period. Being checked separately |
| 10 | list_agencies "hamilton" | Burlington Transit, Hamilton Street Railway, and Cincinnati Metro (its cities include Hamilton, Ohio) | Right | None |
