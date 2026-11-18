# Atlas Studio MCP: test log

The standing questions for the Atlas Studio MCP server ([README](README.md)), and what it answered each time. Rerun all of them after every change to the server, and add a dated section with the results checked against Atlas data.

## Versions

Atlas Studio MCP has its own version, separate from the Atlas app's, shown to clients in the server info. The minor version goes up for any tool or answer change, and the patch version for fixes. It stays below 1.0 until there is a public version.

| Version | Date | What changed |
|---|---|---|
| 0.1.0 | 2026-11-17 | First version: list_agencies, route_frequency, routes_at_frequency, compare_agencies, schedule_changes (3229a4ea3) |
| 0.2.0 | 2026-11-17 | trip_time, combined_frequency, time windows, plainer answers, named Atlas Studio (e16b2037e) |
| 0.3.0 | 2026-11-17 | rank_agencies, filtered list_agencies, schedule_changes dates up front (88f7e2bb8) |
| 0.4.0 | 2026-11-17 | Peers match on kind (buses only or with rail) and leave out parts of a larger operator; agencies found by short name (HSR); a station matches its bays and platforms; trip times warn when the schedule file on this Mac is older than the map's |
| 0.5.0 | 2026-11-17 | routes_near, route_history, buses_needed, branches in route_frequency, list_agencies near a place; "Blue" finds the Blue Line; a newer schedule file is read without a restart |
| 0.5.1 | 2026-11-17 | route_history marks impossible old figures (3 min or less on a route now at 30 or more) as doubtful |
| 0.5.2 | 2026-11-17 | buses_needed reads Studio's buses-needed file instead of running the calculation (8+ minutes per question on TTC); no file, it says so; targets 10/15/20/30/60 only; the recovery option is gone |
| 0.5.3 | 2026-11-17 | A wait Atlas counts to a period's edge (every 61 min for service every 10 until 1 AM) says it is the rule, in route_frequency and route_history; branches with no stops are dropped |

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

Weak spots (no tool yet: a good answer says so instead of guessing):
- Which routes are near Bathurst and Bloor?
- How has the 504 changed since 2019?

Ryan's test page for the next round: `Atlas-worktrees/_reports/mcp-tests/test-questions.html`.

- How has Kingston Transit route 12 changed since 2018? (Its old schedules hold impossible 3-minute figures; a good answer calls them doubtful.)

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

## 2026-11-17: Ryan's third round, from the test page, plus his own extra questions

Chat: `_reports/mcp-tests/2026-11-17-round3.jsonl`. Version 0.4.0, with TTC's current schedule (to 2026-12-21) downloaded with his OK during the round.

| Question | Tools used | Answer | Right? | Gap or fix |
|---|---|---|---|---|
| TTC 29 on Saturday | route_frequency | Every 5–16 most of the day, 10–20 early, first 5:46 AM, last 2:08 AM | Right | None |
| (extra) What branches does the route have? | Web search | 29A to Dufferin Gate, 29C to Princes' Gates, not confirmed | Right but not from Atlas | Atlas knows each branch and its ends; no tool shows them. Fix: list branches |
| 29 Saturday vs Sunday, 10 AM–6 PM | route_frequency with a window | Hour by hour per branch; Dufferin Gate branch every 5 on Sunday from 1 PM against every 10 on Saturday | Right per Atlas data | Sunday's every 5 is being checked separately |
| (extra) Buses needed for the 29 in the weekday AM peak | route_frequency, trip_time (4 calls) | About 15 buses, worked out by the assistant itself | Plausible, not Atlas's own calculation | Studio has a vehicles-needed calculation; no tool uses it. Fix: a buses-needed tool on Studio's rule |
| (extra) With a 10% buffer | None | About 17 | Plausible | Same |
| Other routes from Dufferin Station to Wilson Station | trip_time, combined_frequency | The 929; together every 4–6 on weekdays | Right | None |
| How much faster is the 929 | (from the call above) | 4 min typical, 8 in the morning rush (weekday) | Right | None |
| Do 29 and 929 times change 10 AM–6 PM | (from the call above) | Steady until 2–3 PM, then about 7 min longer | Right (weekday; the page's sample answer was for Saturday) | None |
| US bus peers of HSR, midday every 10 | rank_agencies | Lubbock 6, LADOT DASH 5, Grand Rapids 4 … of 153 bus-only agencies with 16–62 routes; HSR has 2 | Right | None |
| Routes near Bathurst and Bloor | None | Said Atlas can't search by place, then listed routes from memory, marked as unchecked | Admitted the gap, but still guessed | Fix: routes near a stop or corner, from Atlas's stops |
| The 504 since 2019 | schedule_changes, route_frequency | Said Atlas has no older TTC schedule, gave today's figures | Admitted the gap | Atlas's History data has the 504 back to 2019. Fix: a route-history tool |
| (extra) The Cherry streetcar | route_frequency, web search | Not in today's schedule; history from memory and the web | Right that it doesn't run today | History tool would help |
| Rank Canadian agencies, evenings every 15 | rank_agencies | TTC 64, TransLink 32, Edmonton 11 … | Right | None |
| Calgary 3, Sunday 8–11 AM | route_frequency with a window | Every 20 (21 in one hour), both directions | Right | None |
| Finch to York Mills, weekday afternoon | combined_frequency | Line 1 every 4, the 97 about hourly, every 4 combined | Right | None |
| PM peak every 10: Ottawa, Edmonton, Calgary | compare_agencies, routes_at_frequency | Calgary 7, Edmonton 4, Ottawa 2 | Right | None |
| OC Transpo midday every 10 | routes_at_frequency | Only Line 1 (every 6) | Right | None |
| YRT Sunday midday every 15 | routes_at_frequency, route_frequency | Only 20 Jane; explained why Viva misses | Right | None |
| Agencies around Hamilton (asked twice) | list_agencies (Ontario) | Picked the nearby ones from all of Ontario's | Right, but the nearness was the assistant's own | Fix: find agencies near a place or another agency |

## 2026-11-17: Ryan's extra probes, same chat

Chat: `_reports/mcp-tests/2026-11-17-round3.jsonl` (from "Which TTC routes run every 10 minutes or better between 11 PM and 2 AM"). Version 0.4.0.

| Question | Tools used | Answer | Right? | Gap or fix |
|---|---|---|---|---|
| TTC routes every 10 or better, Saturday 11 PM–2 AM | routes_at_frequency | 34 of 151, by subway, streetcar and bus | Right | None |
| Chicago Blue Line, Sunday evenings, O'Hare to Clark/Lake | route_frequency, trip_time | Every 10; 39 min, with a note that the trip time comes from an older schedule (to Nov 30) | Right after a retry | "Blue" first matched the 60 Blue Island bus. Fix: prefer the route whose name is the match ("Blue Line"). CTA's schedule file on this Mac is older than the map's |
| TTC route 999 | route_frequency (3 days) | No such route | Right | None |
| (extra) How has Cleveland's HealthLine changed over time | schedule_changes, route_frequency | Said Atlas has no history, gave today's figures, then history from memory marked unchecked | Admitted the gap | Atlas's History data covers Cleveland. Fix: the route-history tool |
| Is the 29 running late right now | Web fetch of TTC alerts | Said Atlas has schedules only; the alerts page didn't load | Right | None |
| TTC fare | Web search | $3.30 PRESTO, $3.35 cash, with sources | Right, from the TTC's site, not Atlas | Atlas has no fares; it said where the answer came from |
| Is GO's schedule up to date | None (from an earlier answer) | Runs to Nov 27, 2026 | Right | None |
| MiWay every 15 or better all weekday 6 AM–7 PM | routes_at_frequency (3 periods) | 12 routes, with each period's figure | Right | None |
| 504 from King Station to Dufferin Gate | trip_time | About 26 min, 23–28 by hour; said only one branch goes there | Right, but from the October schedule | The server kept the schedule it had read before the new TTC file arrived. Fix: reread a schedule when a newer file appears |

## 2026-11-17: round 4, first run (stopped)

Version 0.5.1, one headless chat. Stopped about 8 minutes in, before the first answer finished. Each buses_needed call started Studio's whole calculation on TTC's schedule (8+ minutes at 35–50% CPU). Two ran at once, alongside Studio's own work, and the chat retried. Fix in 0.5.2: buses_needed reads Studio's buses-needed file and never runs the calculation itself. Round 4 runs again on 0.5.2.

## 2026-11-17: round 4, on 0.5.2

Chat: `_reports/mcp-tests/2026-11-17-round4.jsonl`. One headless chat, 4.5 minutes. All 15 questions went in at once and were answered in one reply.

| Question | Tools used | Answer | Right? | Gap or fix |
|---|---|---|---|---|
| TTC 29 on Saturday | route_frequency | Busiest and quietest figures by period; 5:46 AM to 2:08 AM | Right | None |
| 29 branches | route_frequency | Dufferin Gate Loop and Princes' Gates, from Wilson | Right | None |
| Buses for the 29, AM peak, and with 10% | buses_needed | Said Atlas has no TTC figures yet and didn't estimate | Right to decline | TTC's buses-needed file isn't built; the 10% option is gone in 0.5.2. Build TTC's file once, at low priority |
| Other routes, Dufferin to Wilson | combined_frequency | The 929; every 4–6 together on weekdays; the 329 has no daytime trips | Right | None |
| 929 vs 29 | trip_time | 4 min faster typical, 8 in the morning rush | Right (weekday) | None |
| US bus peers of HSR | rank_agencies | Lubbock 6, LADOT DASH 5, Grand Rapids 4 … | Right | None |
| Routes near Bathurst and Bloor | routes_near | Line 2, 7, 511, 300, 307 | Right | None |
| The 504 since 2019 | route_history | Roughly halved, with a table by period | Right, except it called 2026 late night "every 61" a counting error | That is Atlas's rule for service ending partway through a period. Fixed in 0.5.3 |
| HealthLine over time | route_history | 7–9 in 2015, 10 in 2018, 15 from 2021 | Right | None |
| The Cherry streetcar | route_frequency, routes_near | No route by that name; the 504's Distillery branch | Right | route_frequency listed a branch with no stops. Fixed in 0.5.3 |
| Agencies around Hamilton | list_agencies near | 12 within 60 km, nearest first | Right | None |
| Blue Line, Sunday evening | route_frequency, trip_time | Every 10; 39 min, older schedule noted | Right | None |
| TTC 999 | route_frequency | No such route | Right | None |
| Is the 29 late now | None | Schedules only, no live positions | Right | None |
| 504 King Station to Dufferin Gate | trip_time | The 504 no longer goes to Dufferin Gate (December schedule) | Right | None |
