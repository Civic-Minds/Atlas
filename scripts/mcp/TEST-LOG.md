# Atlas Studio MCP: test log

The standing questions for the Atlas Studio MCP server ([README](README.md)), and what it answered each time. Rerun all of them after every change to the server, and add a dated section with the results checked against Atlas data.

## Versions

Atlas Studio MCP has its own version, separate from the Atlas app's, shown to clients in the server info. The minor version goes up for any tool or answer change, and the patch version for fixes. It stays below 1.0 until there is a public version.

| Version | Date | What changed |
|---|---|---|
| 0.1.0 | 2026-11-17 | First version: list_agencies, route_frequency, routes_at_frequency, compare_agencies, schedule_changes (3229a4ea3) |
| 0.2.0 | 2026-11-17 | trip_time, combined_frequency, time windows, plainer answers, named Atlas Studio (e16b2037e) |
| 0.3.0 | 2026-11-17 | rank_agencies, filtered list_agencies, schedule_changes dates up front |

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

Ryan's second round:
11. Which Mississauga routes run every 15 minutes or better on weekday evenings?
12. Compare frequent service on Sunday midday in Calgary, Edmonton and Winnipeg.
13. What changed in Hamilton's spring schedule?
14. Which US agencies our size run the most routes every 10 minutes or better at midday? ("Our size": Hamilton Street Railway.)

Full chats and reruns are kept outside the repo, because they hold local paths: `Atlas-worktrees/_reports/mcp-tests/`.

## 2026-11-17: Ryan's first test, in a fresh Claude Code chat

Chat: `_reports/mcp-tests/2026-11-17-round1-2.jsonl` (questions 1–5). Version 0.1.0.

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

## 2026-11-17: rerun after the fixes

Run: `_reports/mcp-tests/2026-11-17-rerun1.jsonl`. Version 0.2.0.

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

## 2026-11-17: Ryan's second round, in the same chat

Chat: `_reports/mcp-tests/2026-11-17-round1-2.jsonl` (from "Which Mississauga routes"). Version 0.1.0.

| # | Tools used | Answer | Right? | Gap or fix |
|---|---|---|---|---|
| 11 | routes_at_frequency | MiWay's evening routes every 15 or better | Right | None |
| 12 | compare_agencies, routes_at_frequency | Calgary, Edmonton and Winnipeg on Sunday midday, with route lists | Right | None |
| 13 | schedule_changes | Hamilton's added, removed and changed routes | Right | Routes 56 and 99 read about every 100 and 80 min at midday because they start part-way through the period. Being checked separately. The dates compared were not stated up front. Fixed: the answer now opens with them |
| 14 | list_agencies, then its own scripts | A ranking of Hamilton against 92 US agencies with 22–45 weekday routes, reached by reading the repo and writing scripts | Right in the end, but no tool did it | The full agency list overflowed the chat. Fixed: list_agencies takes filters and returns at most 40 short rows. New tool rank_agencies |

## 2026-11-17: rerun of round two after the fixes

Run: `_reports/mcp-tests/2026-11-17-rerun2.jsonl`. Version 0.3.0. Data: release release-mwl8qwjk, with its agency index.

| # | Tools used | Answer | Right? | Gap or fix |
|---|---|---|---|---|
| 11 | routes_at_frequency | 6 of 43 routes running in the evening: 2 Hurontario (every 12), 61 Mavis and 66 McLaughlin (14), 1 Dundas, 42 Derry and 109 Meadowvale Express (15) | Right: matches the map's filter | None |
| 12 | compare_agencies | Sunday midday, every 15 or better: Edmonton 13 of 105 routes running, Calgary 2 of 122, Winnipeg 0 of 37 | Right | None |
| 13 | schedule_changes | Opens with "Weekday service on 2026-04-15 (before) with 2026-05-27 (after)". 56 and 99 added, 51 removed | Right | The 56 and 99 midday figures, as above |
| 14 | rank_agencies (United States, similar to Hamilton, midday, every 10) | Hamilton has 31 weekday routes, so it compares the 172 US agencies with 16 to 62. NYC Subway leads with 21 routes, then MTA Bronx buses with 15; each agency lists its routes | Right: the same figures as routes_at_frequency | "Our size" is half to double Hamilton's weekday routes; min_routes and max_routes set another band |
| – | list_agencies, no filter | Only the count, 548, and how to filter | Right | None |
| – | list_agencies, Canada and Alberta | 6 agencies, one short line each | Right | None |
