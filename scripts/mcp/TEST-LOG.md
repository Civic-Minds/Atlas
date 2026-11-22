# Atlas Studio MCP: test log

What the Atlas Studio MCP server ([README](README.md)) answered to the questions in [QUESTIONS.md](QUESTIONS.md), round by round. Rerun all of them after every change to the server, and add a dated section with the results checked against Atlas data.

The quick check comes first: `npm run check:mcp-figures` (`node scripts/mcp/figureCheck.mjs`) asks the server a fixed set of questions and compares key figures with the hand-checked numbers below, in about 20 seconds (from a worktree, set `ATLAS_ROOT` to the main checkout; `--published-only` for the hosted version). A full round still follows any change to tool answers.

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
| 0.7.0 | 2026-11-18 | Hosted-version tool code (CIV-1840): schedule end date on every answer, map links, merged same-destination branches, midnight windows, routes_near hours, route_history ends with today's schedule, paged schedule_changes, ferries as their own kind, the optional question field |
| 0.8.0 | 2026-11-18 | Every tool has a title and read-only annotations, as the connector directories ask (CIV-1854); the hosted server also takes the tester's token as a header or ?key= |
| 0.10.0 | 2026-11-18 | route_reliability and route_bunching: how a route ran against its schedule and how evenly vehicles were spaced, from Atlas Live's published recordings (TTC streetcars), through shared/liveReliability.ts, which Studio shares (CIV-1860). 0.9.0 is Studio's CIV-1840 build |
| 0.11.0 | 2026-11-18 | Live tools cover every agency Live records: each answer states the agency's limits (days kept, routes covered, earliest date figures can appear); figures switch on by themselves once a route has 4 good days in a week (CIV-1860) |
| 0.11.1 | 2026-11-18 | One shared calculation with the app and Studio (CIV-1864): routes_near uses the map's 500 m nearby radius (was 250 m); route lookup uses the map's search rule ("1" finds route 01); right-now questions get a planner-shaped answer (no current figures yet, never a single vehicle); tool code split by job |
| 0.12.0 | 2026-11-18 | Planners' own cut-offs (CIV-1869): route_reliability takes late_after_min and early_before_min, route_bunching takes bunched_within_min and gapped_factor; each figure at a custom cut-off comes in atYourCutoffs with the cut-off in words beside it, the standard figures stay, rankings stay on the standard cut-offs |
| 0.13.0 | 2026-11-18 | route_now (CIV-1870, local server only): bunching and gaps on a route right now, from Live's last half hour of vehicle readings, measured at stops against each stop's scheduled gap, with the time of the reading; stops no vehicle passed are named apart, never called a gap |
| 0.13.1 | 2026-11-18 | Route lookup: a name holding the words typed beats one that only contains the letters ("E Line" is Metro Transit's E Line, not the Blue Line). Figure check 34 of 34, golden calls unchanged |
| 0.13.2 | 2026-11-19 | CIV-1910 round fixes: route_now for the MBTA (#1612); buses_needed finds Studio's built files, matches "1" to "01", drops the build command and names its summed times as sums (#1613, #1616-#1618); routes_near finds corners where no stop is named for both streets (#1614); route_history judges doubtful old figures against today's schedule (#1619) |
| 0.14.0 | 2026-11-19 | Schedule tools take "now" (#1627): the agency's local time, day type and part of the day, stated in the answer. Also route lookup names other routes of the same name (#1623), list_agencies include_parts (#1625), stale comparison note (#1624) |
| 0.15.0 | 2026-11-20 | "What changed" and bus counts for YRT, HSR, TransLink, MBTA and OC Transpo (CIV-1969); buses_needed finds routes by name (#1632); schedule_changes gives trips beside grades (#1633) |
| 0.15.1 | 2026-11-20 | buses_needed on the hosted server: Studio's file rides the split release (CIV-1977, #1634) |
| 0.15.2 | 2026-11-21 | Hosted reads find route files whose key is encoded (TransLink's Expo, Canada and Millennium lines, SeaBus); a failed read is read again instead of breaking the next call; rank_agencies lists 30 agencies at most (multi-tool chain test) |
| 0.18.0 | 2026-11-21 | list_agencies gives when each schedule was added; any answer whose schedule ends within 7 days says so (CIV-2081) |
| 0.19.0 | 2026-11-21 | on_demand_zones: an agency's on-demand zones, or those covering or near a place, worded as the map's zone card; reads the beta zones, marked as beta (CIV-2078); night_service: routes that run through the night by the Night Service rule, with Late and Overnight figures (CIV-2080) |
| 0.20.0 | 2026-11-22 | stop_frequency: how often each route comes at one stop, per destination and part of the day, as the map's stop card shows it, ranges included (#1667) (CIV-2060) |
| 0.21.0 | 2026-11-22 | stop_frequency: how often any route leaves the stop (allRoutes), per side of the street, on the local server; the hosted one says it has no such figure (CIV-2089) |

## Questions

The questions moved to [QUESTIONS.md](QUESTIONS.md), the one list any chat adds to (2026-11-18). Rounds run from it; the question numbers in the older sections below are those rounds' own.

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

## 2026-11-18: 0.7.0 (CIV-1840 at 1f641a90e), Claude both ways

The same 36 questions (the 32 standing plus the 4 held wow questions) on Studio's 0.7.0, locked down and normal; Gemini waits for its quota (see above). Chats and `.meta.json`: `_reports/mcp-tests/2026-11-18-v070-claude-*`. The figure check passed 34 of 34 on the same code.

- **Both runs:** all 36 answered from the tools. The locked run reached no figure from outside them. The normal run used one web search, for Seattle crowding (question 22, asked as an estimate), and labelled it.
- **Fixed since the split round:** the midnight window (510 and 310 hour by hour from 12 AM: every 9 combined from 1 to 2 AM, the hand-over around 1:23 to 1:47 AM); every answer names its end date.
- **TTC 29 branches:** `branches` now has one northbound row to Wilson (144 trips, starting at either loop), as Ryan described. The hourly figures still split northbound by the loop a trip starts from, so both runs printed two northbound columns (question 35). Sent to Studio: hourly northbound as one row too.
- **Question 13 (the 504 in 2017), normal run:** again answered without route_history and said Atlas has no 2017 schedules; the locked run called it and gave the Oct 2017 figures. Twice now in the normal setup. Fix to consider: route_frequency's description, or its answer, points history questions at route_history.

## 2026-11-18: the hosted test Worker (CIV-1851), Claude over HTTP

The pilot Worker on workers.dev (free plan), reached through a tester's private link over Streamable HTTP. This test deployment has eight agencies' files inside the Worker (TTC, Kingston, OC Transpo, York Region Transit, TransLink, MBTA, Hamilton Street Railway, RTD; the ranking index and History cover every agency). It reported 0.8.0 at the start and 0.9.0 by the end, because Studio redeployed it several times between 10:55 and 11:00, while the locked run was going. 21 questions those agencies can answer, plus one on Calgary to see how a missing agency reads. Chats, `.meta.json` and timings: `_reports/mcp-tests/2026-11-18-hosted-*` (the link itself is kept out of every file).

- **Timing** (42 direct calls, 14 tools × 3 rounds, about one call every 2 seconds): no errors, no CPU-limit failures, no 5xx. Median 170 ms, 90th percentile 441 ms, slowest 966 ms (the first call, a cold start).
- **Claude, locked down and normal:** all 21 answered from the tools, with no rate-limit or CPU errors. Each question took 9–26 seconds end to end. The figures match the local server's answers to the same questions. The normal run used no web search.
- **The 504 in 2017:** both runs now call route_history and give the Oct 2017 figures (0.9.0's route_frequency description points past years there).
- **Kennedy Station:** both runs answered with one routes_near and one routes_at_frequency call (18 routes running at midday), well inside the 30-a-minute limit.
- **Calgary (not in this deployment):** "No route data for calgary"; both runs said Atlas has no figures and pointed to the agency. For the pilot the message should say the pilot covers a set list of agencies, unless every agency's files are up by then.
- **Web clients:** Claude.ai and ChatGPT on the web can't be driven headlessly without signing in and adding a connector to an account, so they weren't tested. Claude Code over HTTP uses the same Streamable HTTP endpoint those clients call.

## 2026-11-18: Live reliability tools (CIV-1860, 0.10.0), Claude both ways

10 questions on route_reliability and route_bunching (local server on feat/civ-1860, Live's published TTC streetcar summaries, weeks Nov 3–9 and Nov 10–16). Chats: `_reports/mcp-tests/2026-11-18-live-claude-*`.

- **Both runs:** every answer came from the two tools. Figures not in the tool results were the tool's fractions written as percentages (0.093 as 9.3%) or simple sums, checked by hand.
- **Right:** 504 at rush hour (2.3% late in the AM peak, 9.3% in the PM peak, about 4 in 10 gaps bunched or gapped); the ranking (510 late most often at 16.5%, 504 worst spaced); the 505 improving (14.3% to 9.9%, mostly midday and evening); the 510's trip time against its schedule; and the 504 against the 501 at midday.
- **No Live data:** OC Transpo Line 1 and the TTC 29 were answered as "no Live recordings" with the recorded routes listed. The 29 answer also gave its schedule from route_frequency.
- **Right now:** "Is the 504 late right now?" was declined (past recordings only), and the past week was given instead.
- **Fixed after the round:** both runs wrote shares as "4 in 10", which Ryan's numbers rule rules out. The tools' definitions now say to give percentages, never "1 in N".

## 2026-11-18: Live limits for every recorded agency (CIV-1860, 0.11.0 before the earliest-date line), Claude both ways

8 questions on Kingston, Hamilton, the TTC and OC Transpo (local server on feat/civ-1860-all-live-agencies, reading a dry run of the private Live files: TTC figures, Kingston 3 days kept, Hamilton 1 day). Chats: `_reports/mcp-tests/2026-11-18-limits-claude-*`.

- **Both runs:** no invented figures. Kingston route 2, Kingston bunching and Hamilton's B-Line were answered as "no figures yet", with the days kept (Kingston Nov 16–18, Hamilton Nov 18) and the 4-good-day rule. The TTC 29 and OC Transpo answers said what isn't recorded; the TTC streetcar answers were unchanged (510 late most often at 16.4%, 504 worst spaced at 39.9%).
- **Fixed after the round:** the normal run guessed when figures would start and put Hamilton's at Nov 21, two days early. The limits now give the earliest date themselves (the first full days after recording began, built the next morning).

## 2026-11-18: shared calculations (CIV-1864, 0.11.1), golden comparison

No chat round: a refactor. 34 fixed tool calls (`scripts/mcp/goldenRun.mjs` with GOLDEN_EXTRA, which now also covers route lookup by name, routes_near, trip_time, buses_needed, combined_frequency, Kingston's changes and the Live tools), run against the disk store and the split store before and after each commit, with Live read from a fixed folder. Files: `_reports/mcp-tests/civ-1864/`.

- **Changed on purpose:** routes_near's default radius, 250 m to the map's 500 m (2 answers: Bathurst and Bloor, Union Station gain nearby stops and routes); the Live tools' source line now says past service, not how the route is running right now.
- **Unchanged:** every other answer, after each of the other steps (buses_needed through Studio's groupAtTarget, one protocol and file-reading helper for both servers, nearby stops and period trips from shared code, the shared route match, the shared schedule-change pairing, the tool-code split). The hosted Worker bundles to 80 KB gzipped.

## 2026-11-18: planners' own cut-offs (CIV-1869, 0.12.0), checked by hand

- Live's analysis keeps how late each trip-start departure was (half-minute steps) and how big each gap was (half-minute steps, and quarter steps of the scheduled gap), weeks only, about 1.6 KB per route file.
- Exactness: Kingston routes 2 and 702 rebuilt locally (no uploads). At the standard cut-offs the kept counts give the same late, bunched and gapped shares and counts as the stored figures in every week and part of the day: 60 checks, 0 differences.
- Tool calls on a local copy of the private Live files: 3-minute late and 1-minute early on one route return atYourCutoffs with the cut-off worded beside each figure; 4-minute bunched and 3 times gapped return both separately with no combined share; a ranking with a custom cut-off stays on the standard and says so; 5.3 minutes is refused ("in steps of 0.5"), never rounded.
- Files built before CIV-1869 have no counts: a custom cut-off then says Atlas has no figure at that cut-off yet.
- Golden comparison with no cut-offs given (34 calls, disk and split stores): 0 changed. The test questions CC1 to CC6 (QUESTIONS.md) run in the next locked-down and normal round, once the private Live files are rebuilt with counts.

## 2026-11-18: route_now (CIV-1870, 0.13.0), on saved readings

- Source: the Live recorder's position readings (one a minute), read from saved copies of the TTC 504 archive (positions/<slug>/<date>/<seconds>.json layout) with ATLAS_MCP_NOW_AT; the read-only R2 token isn't made yet, so no R2 reads.
- Five half hours (Nov 12 8 AM, Nov 13 4:30 and 6 PM, Nov 16 5 and 6 PM), disk and split stores alike:
  - 14 to 18 vehicles moving per direction, 2 to 6 standing.
  - Bunched over the half hour: 34% to 51% of gaps at stops (the 504's weekly PM peak is 30%, AM similar); the closest pairs were two distinct streetcars running together (checked by vehicle id).
  - Gapped over the half hour: 0% to 7% (weekly PM peak 10%).
  - Every half hour named 16 to 19 stops on Queen St West and Spadina where no vehicle passed: Atlas's 504 stop list runs that way, the recorded streetcars ran on King. Shown as noneSeen, not as a gap.
- Unit tests: two branches on a shared trunk, waits against each stop's own scheduled gap, no-vehicle stops, a stale reading, a feed with no direction, custom cut-offs.
- Not yet run: the RN1 to RN8 questions locked and normal (route_now needs the read-only token or a saved-readings server), and Hamilton (route ids differ from the route number; the B-Line check waits for real readings).

## 2026-11-18: RN1 to RN8, route_now on saved readings (CIV-1870, 0.13.0), Claude both ways

- Setup: one headless chat per question, locked down and normal, against a local server reading saved TTC streetcar readings (all 10 routes, Mon Nov 16, 5:30 to 6:01 PM) with "now" set to 6:01 PM. Hamilton had no saved readings in this set. The first run was redone: later questions leaked into each prompt through stdin, and answers called the Nov 16 reading "today". route_now now gives the reading's day as well as its time.
- 16 of 16 answered from the tools, every figure matching route_now's output, with the time of the reading on every answer.
- RN1: moving and standing by direction. The scheduled count (39) came from buses_needed, labelled as scheduled.
- RN2 and RN5: bunched stretches and the longest waits against each stop's scheduled gap.
- RN3: says route_now measures spacing, not lateness, and gives the spacing instead.
- RN4: declines one-vehicle lookups. Both runs named outside trackers, the TTC's own and others, as places to look.
- RN6: says there is no current B-Line reading. Locked gave the date figures start (Nov 23); normal offered the recorded week.
- RN7: the 4-minute cut-off named beside every bunched figure, with a note that it sits close to the scheduled gap.
- RN8: the Queen St West and Spadina stretch where no vehicle was seen, given as "none ran or a diversion", never as a gap. One locked answer called it "King/Queen west of Spadina", a loose place name.
- Every run noticed the reading was two days before today and said so. That is right for saved readings and won't arise on real ones.
- Hamilton separately: saved B-Line readings (Nov 18, 1:21 PM). Feed and Atlas route ids match (5829), and direction is worked out from the stops passed. 3 to 4 moving per direction, no bunching, longest waits 16 and 23 minutes against a scheduled 12.

## 2026-11-18: RN1 to RN8 locked on live readings (CIV-1870, 0.13.0), Claude

- Live at last: the local server reads the recorder's readings from atlas-live with the read-only token, which is loaded from its credentials file and never printed. Checked at 8:13 PM: the TTC reading was 25 to 40 seconds old and Hamilton's 49 to 60 seconds, against the 3-minute limit.
- route_now directly at 8:13 PM, weekday evening:
  - 504: 17 and 12 moving, 41% and 45% of gaps bunched over the half hour.
  - B-Line: 4 and 3 moving, no bunching; longest waits 19 and 22 minutes against a scheduled 12.
- 8 of 8 locked answers came from the tools, with the reading's day and time (8:13 to 8:15 PM, Wed Nov 18) on every one.
- RN1: 29 moving plus 2 standing against 31 scheduled (buses_needed, labelled as scheduled).
- RN2: the 510's two big northbound gaps (27 and 26 minutes against 10 and 5) and its bunched pairs.
- RN3: says route_now measures spacing, not lateness, and gives the spacing.
- RN4: declines one-vehicle lookups.
- RN5 and RN7: bunched shares named; RN7 names the 4-minute cut-off beside its figures.
- RN6, now on live B-Line readings: no stop over twice the scheduled 12 minutes; the closest was 22.7 minutes, described as just short of a gap.
- RN8: the Queen St West and Spadina stretch given as "none ran, or a detour", never as a gap.


## 2026-11-19: CC1 to CC6, planners' own cut-offs on live files (CIV-1910, 0.13.1), Claude both ways

- Setup: one headless chat per question, locked down and normal, against the local server on main (6af657cb6). The public TTC Live files carried `cutoffCounts` from the Nov 19 cloud run (504, 505 and 510 generated 18:21 to 18:23 UTC). Plus one route_now question on the TTC 29. Gemini not run: agy's quota is used up (resets in about five days). Chats: `_reports/mcp-tests/2026-11-19-cc-claude-*`.
- 14 of 14 answered from the tools, each custom figure with its cut-off named and the standard figure beside it.
- CC1: 504 late 8.1% at more than 3 minutes (standard 5.5: 3.5%). Locked noted the stop list is only at 5.5.
- CC2: 510 bunched 39.1% under 4 minutes (standard 16.3%), with a note that 4 minutes sits near the 510's normal spacing. No combined bunched-or-gapped share at 4 minutes.
- CC3: both said the ranking uses the standard, then fetched each streetcar at 3 minutes and ordered them by hand, each labelled (510 27.6% to 507 2.2%, 512 no data). Acceptable, though the good answer only needed per-route figures named.
- CC4: 505 early 12.7%; both said the tool counts "1 minute or more", against the planner's "more than 1".
- CC5: 504 gapped 0.1% at more than 3 times (standard twice: 2.1%).
- CC6: both said cut-offs go in half-minute steps and gave the 5 and 5.5 figures as a range (3.5 to 4.3%), never one rounded number.
- TTC 29 now: both said Atlas Live doesn't record the 29, so there's no current reading, and offered the schedule.

## 2026-11-19: planner-style rounds across agencies (CIV-1910, 0.13.1 to 0.13.2), Claude

- Setup: two sets of planner questions (12, then 13), with follow-ups and loose phrasing, across Ottawa, Kingston, Toronto, Vancouver, Hamilton, York Region, Calgary and Edmonton, Boston, Denver, Ohio, Montréal, Halifax, Guelph, Winnipeg and New York. Set 1 locked and normal on main; set 2 locked on main, normal on the branch. Failing cases re-run on the branch server in fresh chats. Chats: `_reports/mcp-tests/2026-11-19-planner*`, `-retest*`.
- Right: frequency at a time and hour by hour, routes ending early or starting late, comparisons and rankings, trip time, combined frequency, Live cut-offs, the "not recorded" notes, Winnipeg coverage. Every answer gave the schedule's end date.
- Wrong or weak, each a GitHub issue, fixed unless noted:
  - #1612: route_now errored for the MBTA (no time zone). Re-run: MBTA 57 gives a live reading.
  - #1614: routes_near found nothing at Yonge and Finch on YRT. Re-run: 17 routes, matched as a corner 278 m apart.
  - #1613, #1616, #1617, #1618: buses_needed returned a maintainer's build command, missed Studio's built HSR file, didn't match "1" to "01", and labelled summed times as a round trip, so both runs called Atlas's 12 buses wrong. Re-run: 12 buses against 19 now, explained, from the spring schedule.
  - #1619: route_history left Kingston 501's "every 3 min" unflagged. Data side is #1580.
  - #1621: route_now read paused STM, Halifax and Burlington recording as a quiet half hour.
  - Not fixed here: #1615, RTD 15 Saturday midday graded every 164 min (Data chat). The MTA comes back as seven agencies (logged on #1610, the shared grouping). schedule_changes and buses_needed cover only 5 agencies, so TransLink's changes get "not built".
- Gemini: not run, quota resets Nov 25.

## 2026-11-19: round 3, harder question types (CIV-1910, 0.13.2), Claude both ways

- Setup: 13 questions covering city against city, "better than last year", late-night and weekend service, vague places ("the hospital", "downtown", Jackson Square), a follow-up that switches agency, and questions Atlas can't answer (ridership, causes, future plans, busiest stop). Then 5 more on the parent-agency grouping (CIV-1963) and the lookup fix, on the branch server. Chats: `_reports/mcp-tests/2026-11-19-planner3*`.
- Right: Montréal against Vancouver, 505 against last year (with the late-night edge rule explained), Ottawa after midnight, Calgary Sunday evenings, Kingston's hospital and downtown, the switch to Hamilton, Edmonton against Winnipeg. Every can't-answer question said plainly that Atlas doesn't hold it and pointed to the agency. MTA New York now ranks and compares as one agency (89 of 392 routes at midday every 10, against CTA's 31).
- Wrong or weak:
  - #1623: "Lakeshore West" found GO's 18 bus, not the train, and "King" found the overnight 304, not the 504. Fixed (exact matches: short name, then rail, then daytime). route_frequency also names the other route of that name (alsoNamed: GO's 18 bus runs when the trains don't; the 304 is the King night streetcar), so the assistant can offer it. Re-run: both right.
  - #1624: schedule_changes gave Hamilton's spring comparison as the latest and called route 51 removed, though it runs every 10 today. Fixed with a note for comparisons over 45 days old; the rebuild is CIV-1969.
  - Weak, not filed: "Jackson Square" isn't a stop name, so both runs fell back to King and James. Locked, "which feeds make up MTA New York" was answered from a map link instead of include_parts.

## 2026-11-19: schedule "now" (#1627), Claude both ways

- SN1-SN3 in fresh chats on the branch server at 5:44 PM Thu Toronto time. All six passed "now" (none guessed a period) and stated what it used: "Thursday 5:44 PM Toronto time, weekday PM peak". SN1: 64 of 189 TTC routes every 10 or better. SN3: routes near Yonge and Finch with each one's service now. SN2: locked used route_frequency now plus route_now; normal used route_now alone (live bunching). Both are fine for "how often is it coming".
- Checked by direct calls with ATLAS_MCP_NOW_AT at 3 AM Monday: Sunday's overnight service, "no scheduled service now", next part of the day Weekday AM peak. rank_agencies refuses "now". compare_agencies notes when the agencies keep different time zones (TTC and TransLink).
- Hosted: the split meta.json needs a rebuild to carry each agency's time zone. Until then the hosted server falls back to Live's table, and says it has no time zone for other agencies.

## 2026-11-20: CIV-1969 pilot, "what changed" and buses needed for five more agencies, Claude both ways

- Built on this Mac (tmp/studio, no R2), one agency at a time with nice: before/after and buses-needed files for YRT, Hamilton (rebuilt), TransLink, MBTA and OC Transpo. "Before" schedules come from the Mobility Database: YRT Oct 7 against Nov 11, HSR Aug 19 against Nov 18, TransLink Jul 8 against Nov 18, MBTA Aug 19 against Nov 4, OC Transpo Aug 19 against Dec 9. The dates are inside the week the pipeline reads; other dates were refused until #1630's fix. The MDB files are named by their service end date, like the rest of `_feeds`, so the local tools treat the newest as current.
- 20 answers (10 questions, locked and normal): every "what changed" and bus count came from the tools, with the dates compared. Right: YRT (360 removed, 320 evenings every 81 to 11), HSR (51 back for the fall, 56 and 99 gone), TransLink (222 Willingdon Express gone, 116 changes), MBTA (465 new, 222 every 30), the 99 B-Line at every 15 needs 8 against 19 now, MBTA 1 needs 13, HSR 1 needs 12.
- Wrong or weak:
  - #1632: buses_needed didn't find "Viva Blue" (the file says "blue"). Fixed. Re-run: 29 buses on the first try.
  - #1633: OC Transpo's route 6 read as cut from every 15 to 38 though its trips went from 154 to 148. The assistant then called the bus count contradictory. Fixed: trips per day beside each change, plus a note that the figures are grades. Re-run: the gain on route 5 (123 to 139 trips) reads as real, and route 6's change as "probably one long gap".
  - #1631: HSR's X-IND renamed to "X IND" counts as one route removed and one added (comparison, for Data/Studio).
  - #1630: compare-feed-dates refused dates outside the pipeline's chosen week (fixed by Atlas Fixes, 56bf9f57e).

## 2026-11-21: chained tools on the hosted pilot (M1 to M10), Claude over HTTP

The new group "Questions that need several tools (CIV chain test)", asked of the hosted pilot (eight agencies, 13 tools: no trip_time or combined_frequency) through an internal tester's link, Claude Code on Sonnet, locked down (only atlas-studio, no built-in tools, no settings), one fresh chat per question. Chats: `_reports/mcp-tests/2026-11-21-chain-M*.jsonl` (the link is kept out of every file). Each chat used 2 to 9 tool calls in 6 to 21 seconds, so none came near the 30-a-minute limit: no "Too many requests" anywhere, and my direct checks stayed under 15 a minute.

- **Chains that joined cleanly:** M1 (schedule_changes then buses_needed: 51 University, 9 buses at every 10, 6 at every 15), M2 (routes_near then route_frequency for six routes), M3 (route_now's scheduled gap of 5, 8 or 10 sits inside route_frequency's 5–10 for Saturday evening), M8 (65 every 30, 3 buses), M9 (without combined_frequency it gave each route's own figure and said it had no combined one), M10 (needed list_agencies because "Denver RTD" matched nothing, then 11 routes in both lists).
- **Wrong or weak:**
  - **Expo Line, Canada Line, Millennium Line, SeaBus (TransLink):** routes_near and routes_at_frequency list them, but route_frequency says "No route data for translink." These are the routes with no short name (summary keys "id:30053" and so on). M7 could not get its frequency from route_frequency and used routes_at_frequency's two different numbers (every 12 shown, every 3 as the wait). Likely cause: the route's rows file is saved as `id%3A30053.json` (encodeURIComponent in shared/mcpSplitStore.ts's `rows` path), the static-assets lookup does not find it, `routeWithRows` (scripts/mcp/atlasData.ts) falls back to `routesOn`, and that needs `store.routeFeatures`, which the hosted store does not have. Pilot (assets) only until checked on R2.
  - **rank_agencies with a large limit:** limit 100 fails with "Too many subrequests by single Worker invocation" (one rank/labels file per agency, 82 agencies). The next call, whatever its limit, then fails with "This promise was created by a request that has since ended", and the one after works. Limits 5 to 20 are fine. Likely cause: the `memo` of promises per path in shared/mcpSplitStore.ts keeps a promise from a request that failed or ended, and the next request on the same Worker reads it. In M6 the assistant retried five times, found "more than 8 fails" (wrong, 10 and 20 work), and could not give York Region Transit's rank.
  - **routes_at_frequency against route_frequency (OC Transpo, Sunday midday):** the 34, 42, 58 and 67 show "every 30 min" with waitMinutes 30 in route_frequency but are not in routes_at_frequency's every-30 list (their filter has breaks 8, the map's rule for long edge waits; the 163 has none and is listed). M4 answered "only the 163" and said nothing about the four. The list's rule (figurePasses in atlasData.ts, readingPassesHeadwayFilter in shared/routeHeadwayFilter.ts) is on purpose; the output does not say why a route is left out.
  - **route_history and schedule_changes against route_frequency:** the first two use the map's grade (quietest part of the route), route_frequency's waitMinutes the typical wait. TTC 29, Nov 2026: history every 16 in every period, route_frequency 8 (shown 8–16). TTC 504, Nov 2026 Late: history every 61, route_frequency 10 ("every 10 min until 12:59 AM"). HSR 1: schedule_changes "every 15 to every 16" in the AM peak, route_frequency 8 (shown 8–16). M5 used both for the 504 and did not mix them up, but a question about the 29 would.
  - **MBTA 65, AM peak:** route_frequency has waitMinutes 28 beside "every 8–14 min" (and 30 midday); one tool, two numbers, no warning (the warning only fires when waitMinutes is better than "shown").
- **Not ours:** M8 never called schedule_changes (it said it could not confirm the "added" from the schedule alone). M6's claim that the tool "fails whenever I ask for more than 8" is the assistant's guess from the failures above.
- **Data moved since the standing figures:** compare_agencies now reads TTC 77 of 167 on weekday evenings (C4 says 64) and TransLink 33 (C4 says 32); routes_near at Bathurst and Bloor now also returns the 94 (P8 lists five routes). Not changed here.
