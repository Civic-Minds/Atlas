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
| 0.5.4 | 2026-11-17 | A time window can run past midnight (10 PM to 4 AM); route_frequency names routes with the same name (510 and its night 310); rows with no stop list (night rows) show where they head |
| 0.6.0 | 2026-11-17 | trip_time and combined_frequency read an agency's supplemental schedules too (LA Metro's rail lines) and take also_agencies, matching a place on another agency's stops within a 500 m walk (downtown LA to Santa Monica: E Line, 720, 20 and Big Blue Bus R10 together) |
| 0.6.1 | 2026-11-17 | routes_by_hours (routes that end early or start late); the newest schedule file is picked by the date in its name, not when it was copied; buses_needed says not to work out other frequencies |
| 0.6.2 | 2026-11-17 | Instructions sent at start: answer from the tools, say where anything else comes from, don't estimate unasked, no shell work-arounds |

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

## 2026-11-17: Ryan's probe, day route to night route (510 and 310)

Ryan asked how Atlas Studio handles the hand-over from a day route to its night route, since the 510 and 310 follow the same street ("Mostly - 510 half them turn back"). Checked by calling the tools directly on 0.5.3:

| Check | Answer | Right? | Gap or fix |
|---|---|---|---|
| 510, weekday | Every 5–10 (busiest part, where the short turns overlap), every 10 late, last 1:47 AM; branches to Union, Queens Quay and King | Right | It didn't mention the 310. Fixed in 0.5.4: same-name routes listed with their hours |
| 310, weekday | Every 20 from 2 to 6 AM, first 1:23 AM | Right | Its branches were dropped (night rows have no stop list). Fixed in 0.5.4 |
| Spadina Station to Union, 10 PM to 4 AM | Refused "10 PM" to "4 AM"; "22:00" to "28:00" worked: 510, 310 and Line 1 counted together, waits up to 20 | Right once asked as 28:00 | Fixed in 0.5.4: a window may cross midnight. Only trips that go on to Union count, so the 510's short turns are left out |

## 2026-11-17: Ryan's probe, LA across agencies

Ryan: "Might be interesting to ask questions about somewhere like LA, where service by multiple agencies can sometimes overlap depending on where you're headed. For example, between DTLA and Santa Monica." Checked by calling the tools directly on 0.5.4:

| Check | Answer | Right? | Gap or fix |
|---|---|---|---|
| 7th Street / Metro Center to Downtown Santa Monica, LA Metro | No stop matching | Wrong | LA Metro's rail lines are only in its supplemental schedule (lacmta--supplemental-1), which the tools never read. Fixed in 0.6.0 |
| Same, Big Blue Bus | No stop matching | Wrong | Big Blue Bus names its stops "4TH NB & COLORADO (Downtown SM Station)". Fixed in 0.6.0: a place matched on one agency is found on another by stops within 500 m |
| Same, both agencies, 0.6.0 | E Line every 10 at midday, 720 every 15, together every 7; R10 3 PM trips only; E Line 47 min, R10 46–66, 720 about 88 | Right | LA's rail schedule on this Mac ended Oct 21; the answer says so |

## 2026-11-17: final round, on 0.6.0

Ryan: "This next round of questions can be the last round for now", and "Not all our questions need to be about Toronto too". 32 questions, one headless chat, asked one at a time (each waits for the answer before the next goes in), 22 minutes. The round-5 trick questions, LA across agencies, and planners' questions. Chat: `_reports/mcp-tests/2026-11-17-final-round.jsonl`; questions in `2026-11-17-final-round-questions.txt`.

| # | Question (short) | Tools | Answer | Right? | Gap or fix |
|---|---|---|---|---|---|
| 1 | 29 "every 3 min all day", buses? | route_frequency, buses_needed | Corrected the premise (every 8, 16 per branch); worked out ~40 buses itself | Premise right; the bus count is its own arithmetic | buses_needed now says not to work out other frequencies (0.6.1) |
| 2 | How often does route 2 run? | route_frequency | Took the TTC from the chat; Line 2 every 3 | Right | None |
| 3 | Calgary 3 on Christmas | route_frequency | Schedule ends Dec 20, no holidays listed; Sunday figures as a likely guide | Right | None |
| 4 | Hamilton LRT open? | web | Not open; under construction, with sources | Right | Not Atlas data; said so |
| 5 | Chicago buses on the road now | None | No live positions; offered scheduled count | Right | None |
| 6 | Most frequent HSR route | routes_at_frequency | 2 Barton, every 6 midday | Right | Looked at weekday morning and midday only, and said so |
| 7 | Chicago every 4 at 3 AM | routes_at_frequency | None; Red Line every 15 is best; 19 of 132 run overnight | Right | None |
| 8 | MAX Blue, 6:30–7:15 AM | route_frequency (window) | Every 7–8 until 7, then 14–15 | Right, by hour | Hourly only; it said so |
| 9 | Best transit in Canada | rank_agencies | Toronto leads on frequency; said what frequency leaves out | Right | One line on reliability came from memory |
| 10 | 99 B-Line vs 52 | route_frequency, buses_needed | Every 5 both on the busiest stretch; 52's branches every 20; TransLink buses not built | Right | TransLink's buses file not built (by design) |
| 11 | 12 an hour = every 12? | None | No, every 5; and the 29 isn't 12 an hour | Right | None |
| 12 | Lakeshore West "on the TTC" | route_frequency | It's GO, not TTC; every 30 midday; schedule to Nov 27 | Right | None |
| 13 | 504 every 4 in 2017, still? | route_history | No; table 2017 vs now | Right | None |
| 14 | Is Edmonton 4 frequent? | route_frequency | Yes, every 15 or better 9 AM–11 PM, one 22-min gap at rush | Right | None |
| 15 | "So it's every 16?" | None | No; 16 was the TTC 29's branch figure | Right | None |
| 16 | Most frequent route in Canada | rank_agencies | Expo Line every 2 at the AM peak | Right | None |
| 17 | Calgary better than Edmonton? | compare_agencies | Edmonton more routes every 15 at every period checked | Right on frequency | Ridership claim from memory, labelled |
| 18 | "Dufferen station" | routes_near, route_frequency | Read as Dufferin; 29 and 929 every 8, about every 4 together | Right | Assumed even spacing instead of calling combined_frequency; said so |
| 19 | "Missisauga" every 10 at rush | routes_at_frequency | 2 and 66 at the PM peak only | Right | None |
| 20 | Wilson to Union on the 29 | trip_time | The 29 doesn't go there; Line 1, about 30 min | Right | None |
| 21 | Every route every 5 at midday | rank_agencies | 27 routes at 21 agencies; explained why famous lines drop out | Right | None |
| 22 | "Just estimate" RapidRide E crowding | route_frequency, web | Estimate from published boardings and trips, labelled as its own | Fair | Atlas has no crowding data; said so |
| 23 | DTLA to Santa Monica, every agency | combined_frequency + also_agencies | Every 7 together: E Line 10, 720 15; R10 none midday | Right | LA rail schedule on this Mac ended Oct 21; said so |
| 24 | E Line vs Big Blue Bus R10 | trip_time | E Line 47 min; R10 46–66, 3 trips | Right | None |
| 25 | Blue Line closure, shuttle buses | route_frequency, trip_time | ~19 buses at every 6, labelled as its own estimate, with a table | Fair | Atlas has no shuttle tool (no road travel time). Idea for later |
| 26 | 510 and 310 late at night | combined_frequency | They take turns; 10 then 20 min | Right | Can't list exact departures at the hand-over. Idea: a departures tool |
| 27 | OC Transpo routes ending before 10 PM Sunday | routes_at_frequency, 7 × route_frequency | 14 routes, unfinished; listed 138 as ending by 7 (it runs to 9:16) and missed 110 | Partly wrong | New tool routes_by_hours (0.6.1): 13 routes, exact last trips |
| 28 | Kingston 12 slowest hours | trip_time | 2–5 PM, 3–4 min longer | Right for the file it read | It read the Sep 13 file, not the Oct 8 one: files were picked by copy time. Fixed in 0.6.1. Kingston's current schedule (Nov 14) isn't on this Mac |
| 29 | Kingston routes worse in the last change | schedule_changes | 7B removed; 12 and 32 30 → 31 | Right | None |
| 30 | Kingston 12 buses at every 15 | buses_needed | 9 buses for 12 and 31 together, 4 now | Right | None |
| 31 | Kipling, subway to MiWay | routes_near, routes_at_frequency | Each MiWay route's frequency and typical wait | Right | Typical wait (half the gap) is its own arithmetic, labelled |
| 32 | TransLink stops near frequent routes | None | Can't from Atlas; listed the 11 frequent routes | Right to decline | Idea: a coverage tool (stops within a walk of frequent routes) |

Ideas left for later (not built): shuttle buses for a closure (needs road travel times), a departures list at a stop, coverage within a walk of frequent routes.

## 2026-11-17: the final round on Gemini

Ryan approved running the same 32 questions through Gemini ("1"; "You need to use agy for Gemini"). Gemini 3.8 Flash (High) in Antigravity's CLI (`agy`), one conversation, one question at a time, on 0.6.1, with only the Atlas Studio tools allowed (a temporary `atlas-studio-test` server, removed after). Chat: `_reports/mcp-tests/2026-11-17-final-round-gemini.jsonl`.

| Compared with Claude | Questions |
|---|---|
| Same answer, same figures | 2, 6, 7, 8, 10, 11, 12, 14, 16, 19, 20, 23, 24, 28, 29, 30 |
| Gemini better | 1 (kept to Atlas's figures, didn't work out a 3-minute bus count); 27 (used routes_by_hours, new in 0.6.1, which Claude's run didn't have) |
| Gemini stricter, less useful | 25 (declined the shuttle question outright; Claude gave a labelled estimate) |
| Gemini worse | 3 (said as fact that Calgary runs a Sunday schedule on Christmas; didn't say the schedule ends Dec 20); 13 (gave a cause for the 504's cuts from memory); 9, 17, 22 (ridership and crowding from memory, not labelled); 31 (said the 3 Bloor runs every 20–30+, Atlas has 15); 26 (gaps "up to 12 minutes", not from a tool) |
| No answer | 5 and 21 (tried the shell, which was blocked, and returned nothing); 32 (Antigravity sign-in error) |

What it shows: the tools' answers read the same on both. The difference is what each model adds. Gemini follows "don't estimate" more strictly but adds unlabelled facts from memory and reaches for the shell. Fixed in 0.6.2: the server now sends instructions at the start (answer from the tools; say where anything else comes from; no estimates unless asked; no shell work-arounds). Not rerun on Gemini.

## 2026-11-18: standing questions, locked down and normal (CIV-1845)

Version 0.6.2, from the main checkout. The 16 standing questions above (question 13 is the same as 9, so it was asked once; "our size" named Hamilton Street Railway in the question). Each run is one headless chat from ~/Desktop, one question at a time, each waiting for the answer. Driver: `_reports/mcp-tests/run-round.py`; chats: `2026-11-18-locked.jsonl` and `2026-11-18-normal.jsonl`; a figure check (`judge-figures.py`) lists every number in an answer that appears in no tool result, and each was checked by hand.

- **Locked down**: `--bare` refuses to start without an API key (it never reads the Claude sign-in), so the run used the same lock-down without it: `--strict-mcp-config` with only atlas-studio, `--tools ""` (no built-in tools at all), `--allowedTools "mcp__atlas-studio__*"`, `--setting-sources ""` and auto-memory off. Checked before the round: the chat listed only the 12 Atlas tools and saw no CLAUDE.md or memory.
- **Normal**: the usual setup, permission mode auto. It used no web search, shell or files; only ToolSearch and the Atlas tools.

Where both runs called the same tool, they gave the same figures. They called different tools on 6 and 8 (the normal run made extra calls) and on K (only the locked run called route_frequency, which is why the normal run got K partly wrong). Every figure came from a tool, except those under "Added by the assistant". The # column is the standing list's number; the two weak spots and Kingston are W1, W2 and K.

| # | Question (short) | Tools | Answer | Right? | Added by the assistant | Gap or fix |
|---|---|---|---|---|---|---|
| 1 | TTC 29, Saturday | route_frequency | 5:46 AM to 2:08 AM; every 5–16 midday, 10–20 early; the 329 covers 1:50–6 AM | Right | None | None |
| 2 | Saturday vs Sunday, 10 AM–6 PM | route_frequency (window) | Same before noon; Dufferin Gate branch every 5 south, 8 north on Sunday from 1 PM against 10 on Saturday | Right: Sunday's 29 leaves Dufferin Station northbound every 5 from 1 PM in the schedule file (13:04, 13:09, 13:14 …), which settles the 2026-11-17 check | None | None |
| 3 | Other routes, Dufferin to Wilson | combined_frequency (Sat, Sun) | 929; together every 3 Saturday (137 trips), every 5 Sunday (138 trips); 329 none | Right. Checked in the schedule file: on Sunday each 929 leaves a minute after a 29 (13:04 and 13:05, 13:14 and 13:15 …), so the wait stays about 5; on Saturday the 929 leaves between them (13:05, 13:08, 13:10), so it falls to 3 | Both runs guessed this (buses leaving together), labelled as a guess, and were right | The tool could say so itself when two routes leave together. List for the manager |
| 4 | How much faster is the 929 | trip_time | Saturday 37 vs 44 min (7 faster); Sunday 34–36 vs 40 | Right | The "take the 929 only if it leaves within 7 min" advice (locked run) is its own, from tool figures | None |
| 5 | 29 vs 929 through the day | None (reused question 4's call) | Flat through the day; Saturday 29 is 45 min at 11 AM | Right | None | None |
| 6 | OC Transpo, every 10, midday | routes_at_frequency | Only Line 1, every 6, of 76 running | Right | None | Normal run also listed every-15 routes unasked: the 12 shows "every 17" yet counts at 15. List for the manager (why the route list and the filter differ) |
| 7 | Five agencies, every 15, evenings | compare_agencies | TTC 64, CTA 34, MBTA 33, TransLink 32, SEPTA 10 | Right: same as 2026-11-17 | Shares of evening routes (38%, 37% …), labelled as its own | None |
| 8 | YRT, every 15, Sunday midday | routes_at_frequency, list_agencies "Viva" | Only 20 Jane of 31 running | Right | None | Both runs said they couldn't tell whether Viva is in Atlas. It is (Viva Blue every 10–21 at Sunday midday, inside YRT). List for the manager: list_agencies "Viva" should say it is part of YRT |
| 9 | Hamilton's spring schedule | schedule_changes | April 15 vs May 27: 51 University removed, 44 AM peak 15 → 30, 01 AM peak 16 → 15; none added | Right per Studio's current file | Why the 51 stopped (a term route), labelled as a guess | The 56 and 99 no longer show as added: Studio's comparison now reads the real week (#1581), which settles the earlier 56/99 question |
| 10 | Agencies around Hamilton | list_agencies near | 12 within 60 km, nearest first | Right | None | None |
| 11 | Mississauga, every 15, evenings | routes_at_frequency | 6 of 43: 2, 61, 66, 109, 1, 42 | Right: same as 2026-11-17 | None | None |
| 12 | Calgary, Edmonton, Winnipeg, Sunday midday | compare_agencies, routes_at_frequency | Edmonton 13, Calgary 2 (Red and Blue Lines, every 10), Winnipeg 0 | Right | None | None |
| 14 | US agencies HSR's size, every 10, midday | rank_agencies, routes_at_frequency | Lubbock 6, LADOT DASH 5, Grand Rapids 4 … of 153; HSR 2 (02 Barton, 51 University) | Right | Which leaders rely on campus routes, from route names | None |
| W1 | Routes near Bathurst and Bloor | routes_near | Line 2, 511, 7, 300, 307 | Right | Both runs called the 300 and 307 night buses from memory, labelled | routes_near gives no hours. List for the manager: say when each route runs (or mark night routes) |
| W2 | The 504 since 2019 | route_history | Table 2019 to 2026; AM peak 6 → 13; 2026 late "every 61" explained as the rule | Right | None | None |
| K | Kingston 12 since 2018 | route_history (+ route_frequency in the locked run) | Doubtful 3-minute figures left out; evening service gone | Locked: right. Normal: partly wrong | Both runs distrusted the Jan 2019 midday "every 5" on their own | (a) The normal run didn't call route_frequency and said the latest schedule has midday service only: History's newest Kingston snapshot (Aug 2026) has only a midday figure, but today's schedule runs every 30 from 6:30 AM to 6:26 PM. route_history should end with today's schedule when History is older, as it does for the 504. (b) The doubtful rule (3 min or less) misses the Jan 2019 "every 5". Both listed for the manager |

Not covered by the standing questions: buses_needed, routes_by_hours and also_agencies. The final round's trick questions are where models added figures of their own; they are worth adding to the standing set.

Fixes: none made in this round. Every gap is in `atlasData.ts` or `atlas-mcp.ts`, which the hosted-version work (CIV-1840) is rewriting, so they went to the manager as a list.

## 2026-11-18: the hosted version's tool code (CIV-1840), Claude both ways and Gemini

Studio's branch at 64a0f49e0 (feat/civ-1840-hosted-mcp; it gives the same answers as the split store), still labelled 0.6.2 though its answers changed (0.7.0 asked for). Data release-mwl8qwjk. The 32 standing questions plus the 4 held wow questions, one chat per client, one question at a time. Each run's version, commit and data release are in its `.meta.json` next to the chat (`_reports/mcp-tests/2026-11-18-split-*`).

- **Claude, locked down** (only atlas-studio, no built-in tools, settings or memory): all 36 answered from the tools. No figure from outside them.
- **Claude, normal** (usual setup, but only the branch's atlas-studio, so the main checkout's server could not answer instead): all 36 answered; no web, shell or file reads.
- **Gemini** (agy, Gemini 3.8 Flash High, only the Atlas tools allowed): 29 answered, then Gemini's quota ran out (resets in about 6½ days). Questions 30 to 36 (Kingston buses, Kipling, TransLink coverage and the 4 wow questions) have no Gemini answer.

The 9 tool answers that changed from 0.6.2, and how the chats used them:

| Change | Seen in | Verdict |
|---|---|---|
| rank_agencies and schedule_changes give each schedule's end date | 9, 16, 21, 29, 33, 36 | Right: every client now names the end dates, which 0.6.2 left out |
| Ferries are no longer bus peers (HSR's evening peers 179 → 177) | 33 | Right: BC Ferries is gone from HSR's peers |
| A last trip after midnight says so ("2:08 AM (after midnight)") | 13, 26 | Right |
| route_frequency adds trips by direction | 35 | The TTC 29 still shows two northbound "branches" with 144 trips each. Ryan: northbound 29s have one destination; only southbound branches. 144 is the direction's count; the tool should show one northbound row. Sent to Studio |
| routes_near gives each route's weekday hours | 18, 31 | Right: no client guessed night routes from memory this time |
| route_history ends with today's schedule when History is older (Kingston 12) | 13 | Right |
| schedule_changes gives clock hours and the end date, matches names regardless of capitals, and pages | 29, 36 | Right: RTD's Bound, FreeRide and MetroRide no longer show as removed and added |
| list_agencies "Viva" points to YRT | (wow only) | Right in the golden run; no chat asked |

Other findings:

| # | Client | Finding | Verdict |
|---|---|---|---|
| 26 | Claude normal | A combined_frequency window that starts at midnight (12 AM–3 AM) returns no figures; 11 PM–5 AM works. Same on main | Tool bug. Added to the figure check as a known gap |
| 13 | Claude normal | Said Atlas has no 2017 data without calling route_history; the locked run called it and gave the 2017 table | Model miss: the tool descriptions should point history questions at route_history |
| 26 | Gemini | "Evenly spaced… every 9 min" for 11 PM–2 AM. The tool says every 10 (21 departures), and its no-bunching list doesn't show even spacing | Wrong: a figure not from the tool |
| 4 | Gemini | "The LRT remains under construction", unlabelled | From memory, not Atlas |
| 10 | Gemini | Gave the 52's 20-minute branch figure as its "typical wait" | Misread the range |
| 22 | Both | Crowding estimates, labelled as their own | Fine (asked for) |
| 36 | Claude | Read RTD's FX routes as "FlexRide zones", unlabelled | Its own reading of the names |

Spot checks against the tools: Gemini's R4 every 3 at the AM peak and the 929 every 8 all day are right.

Gemini plan (manager, 2026-11-18): rounds run on Claude only until Gemini's quota resets (about 2026-11-25). Then the 7 missing Gemini questions (30 to 36 above) run on the same server code.
