# Product decisions

This is the one place for settled rules and the decisions behind them. Check "Settled rules" before asking Ryan anything, and do not re-ask what it answers; if a rule has no new evidence against it, it stands. New decisions go into the log below (newest first), and into the rules when they change how Atlas behaves.

Each rule gives what it does, why, and where it came from. "Linear CIV-nnn, comment of date" is a decision by Ryan recorded in Linear.

**Settled rules, by topic:**

- [How a route's frequency is decided](#how-a-routes-frequency-is-decided)
- [What the map shows and never shows](#what-the-map-shows-and-never-shows)
- [How Atlas is built](#how-atlas-is-built)
- [Licence fit](#licence-fit)
- [Data and pipeline fixes](#data-and-pipeline-fixes)
- [How Live reads](#how-live-reads)
- [How we talk to riders and planners](#how-we-talk-to-riders-and-planners)
- [Who decides what](#who-decides-what)
- [Decision log](#decision-log), newest first

## Settled rules

### How a route's frequency is decided

- **On-demand zones show only with no frequency filter, and the map opens with no filter**
  - What: under any frequency filter (every 10, 15, 20, 30 or 60) the map hides on-demand zones and stops; with no filter (all service) they show by their hours as before. One rule (shared/viewLayers.ts mapDrawsOnDemand), so the failed-to-load notice follows it too. The map's default filter is All (DEFAULT_MAX_HEADWAY), so zones show on a fresh map.
  - Why: on-demand service has no headway, so it can't pass a frequency filter; with an every-60 default, zones never showed on a fresh map.
  - Source: Ryan, 2026-11-24 (CIV-2898): "on demand doens't have deadways so why do they show up if i select 10 mins lol", then "1"; the All default 2026-11-27 (CIV-2898), "1"
- **Atlas is not a trip-planning tool; no booking info**
  - What: no on-demand booking info anywhere: no app names, booking links, phone numbers, call-centre hours or booking-ahead rules on zone cards, other UI or the MCP's on_demand_zones answer. The bookingInfo and bookingUrl fields are deleted from the data, and a guard test (noBookingInfo.test.ts) fails if a booking field or booking text comes back.
  - Why: Atlas shows how often service runs, not how to ride it.
  - Source: Ryan, 2026-11-24: "THis is like the 6th time i have said to remove the on demand booking info i fucking swear to god"; earlier (CIV-1784): "this isnt for ppl using it like google maps"
- **A zone card says nothing about whether the zone is running, unless its hours are unknown**
  - What: no "Running during …", "Running on …" or "Not running at this time" line on an on-demand zone card; the hours bars say when it runs. Only "Hours unavailable" stays, so the card never claims service it can't show (shared/onDemandAvailability.ts onDemandRunningNote).
  - Why: fixed routes have no such line, so zones match them.
  - Source: Ryan, 2026-11-24 (CIV-2900): "why do we need to say", "But on fixed routes we don't show a 'not running at this time' notice when they're not running, so why is this one special", then "1"
- **One frequency scale for every mode**
  - What: bus, rail and streetcar are all graded on one scale, 5, 8, 10, 15, 20, 30 and 60 minutes; no mode has bands of its own. Riders see 10, 15, 20, 30 and 60: the internal 5 and 8 count as 10.
  - Why: Ryan, "I do not know why I am repeating myself when I ask why there are any separate frequency bands between modes". Rail had no 20 and graded a train every 16-20 minutes 30.
  - Source: [decision log](#decision-log) (2026-11-17)
- **Trains are read like buses**
  - What: no rule rates, grades, filters, counts, draws or names a route differently because it is a train (or subway, light rail or ferry); the 25 train-only rules found in CIV-2025 are removed except one Ryan kept by name, the train destination reading (a train card reads every trip to its destination, whatever its shape; #1712, 2026-11-22), and no mode is guessed from agency or route names (an agency's listed modeOverrides still correct a feed's route_type).
  - Why: Ryan, "This is like the 6th way in which trains are fucking different - i was never told this, i never asked for them to be different".
  - Source: Ryan, 2026-11-21, "1", answering "Remove them all, so trains are read like buses (Recommended). It would be one data rebuild, with a full before-and-after comparison first. If the comparison shows a rule was actually protecting something, that one comes back to you instead of being removed."; [decision log](#decision-log) (2026-11-21)
- **Every direction must pass**
  - What: a route's value is its worst direction's; a direction with stray trips but no real service voids the route.
  - Why: a route that is frequent one way only is not frequent.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rule 4
- **Branches count only when they run steadily, and the slower one decides**
  - What: a branch counts in a period only if it runs steadily through it; stray trips and bursts never set the value.
  - Why: a straggler or a rare short turn is not service a rider can plan around.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rules 1, 3 and 5
- **A card's range runs to the slowest far end with regular service, for every agency**
  - What: where the trunk sets the card's headline, the card's range runs to the slowest far end that has regular service (up to an hour), whether the far end is a fork, a branch or a short-turn tail. Cards only: the headline, filter and map colour don't change.
  - Why: the route list, the map colour and the filter already count these tails, so the card was the only place that disagreed. Rare short turns stay out through the rule above (3 or more evenly spaced trips).
  - Source: [decision log](#decision-log) (2026-11-27, #1775, CIV-3080)
- **A value needs 3 departures, not a percentage**
  - What: 3 departures (2 gaps) is the minimum to read a pattern; after an edge allowance it is 4.
  - Why: 2 trips cannot show a cadence; 4 would reject real half-hourly service. Riders feel frequency, not share of trips.
  - Source: [methodology INDEX](../engineering/pipeline-studies/frequency-tier-methodology-2026-10/INDEX.md) (Minimum evidence), [#571](https://github.com/Civic-Minds/Atlas/issues/571), Linear CIV-321, comment of 2026-10-18
- **Frequency tolerances are settled**
  - What: 10% near misses for the 5 to 15 minute tiers, 5% for 20 to 60, cap of 3 gaps, one 10-minute allowance per true service edge. A period's first and last waits count as gaps under these tolerances (2026-11-19).
  - Why: chosen from a census of 1,160 feeds and a review of example routes. Check these before asking.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) (Thresholds), [#567](https://github.com/Civic-Minds/Atlas/issues/567), [#568](https://github.com/Civic-Minds/Atlas/issues/568), [#570](https://github.com/Civic-Minds/Atlas/issues/570), [#571](https://github.com/Civic-Minds/Atlas/issues/571), PR [#584](https://github.com/Civic-Minds/Atlas/pull/584)
- **A period with no regular cadence reads "Irregular"**
  - What: when a number is only one gap between a few departures, or the filter finds no regular cadence though the route runs, the row says so instead of the number, everywhere: "Runs irregularly in this period" on cards, "Irregular" in tight spots (table cells, list values). Both come from src/content/noticeCopy.ts.
  - Why: the earlier "no regular service during this period" read as if nothing runs in the period.
  - Source: Ryan, 2026-10-31 (Linear CIV-1238), superseding the 2026-10-17 wording; [#954](https://github.com/Civic-Minds/Atlas/issues/954), [#955](https://github.com/Civic-Minds/Atlas/issues/955)
- **A card row with a wait over an hour needs 4 of its own trips for a number**
  - What: a route card row whose period wait is over an hour and that has fewer than 4 of its own trips in the period (`MIN_CARD_ROW_DEPARTURES`) reads "Runs irregularly in this period", on every row, branch rows included (#1827). A row whose words say when its service starts or stops ("every 60 min until 5:14 PM") keeps its number. Card wording only; the map colour and the filter are unchanged.
  - Why: 2 or 3 trips are not a pattern a rider can plan around, even when evenly spaced.
  - Source: Ryan, 2026-11-24, on CIV-2232: "1" to "Need at least 4 trips in the period to show a number; 2–3 trips read Irregular", then "1" to "Apply the 4-trip minimum only when the card has no 'from …' or 'until …' words"
- **A direction running every 60 min or better always has a card row**
  - What: when every line of a direction is a branch that stops partway through the period (hidden by #1115) and no branch reading gives one back, a direction whose main stretch runs every 60 min or better (the last public grade, `PUBLIC_TIER_MAXES`) keeps one row, read as its main stretch. The row needs a destination name and a number of its own.
  - Why: a card that shows one direction only reads as a one-way route (Winnipeg 31 weekday PM showed only "to Riverbend" while The Forks runs every 28).
  - Source: [decision log](#decision-log) (2026-11-26, #1857)
- **A route with no all-day value stays without one**
  - What: a direction that does not run at midday is "limited" and gets no all-day value; a busy stretch alone never passes a route. The all-day value is internal (the map has no All day option); riders see only the "limited".
  - Why: a peak-only route is not all-day service.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rules 7, 8 and 11, [#899](https://github.com/Civic-Minds/Atlas/issues/899)
- **The route grade follows the existing branch and steady filter rule**
  - What: the route's grade comes from the same branch and steady rules above, with no second rule for grading.
  - Why: one rule means the map, cards and filter always agree.
  - Source: Linear CIV-321 (decision 2026-10-18: "we break it down based on branch and provide a range"); [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rules 1 to 3
- **No fixed cut-offs**
  - What: never summarize an agency or area by a fixed threshold such as "every 15 min or better"; show the real waits per period.
  - Why: many agencies have no routes that frequent, so a cut-off hides them.
  - Source: [TEXT.md](../style/TEXT.md) (Frequencies), Linear CIV-296, comment of 2026-10-17 ("no fixed frequency cut-off")
- **Two trips of one name leaving together count once, where that repeats**
  - What: two trips of one route, direction, service and headsign that leave the same first stop in the same minute, one serving a strict subset of the other's stops, count as one departure (the subset trip is left out), only when, within that route, direction and service, more than 50% of departure slots are paired and at least 3 slots are paired.
  - Why: an express and a local leaving together read as a busy branch (Metro-North buses, CyRide 812 Saturday); a one-off pair must not change a route's reading (the first version failed at rtc, port-authority-pa, pvpta, petaluma and mtd-champaign).
  - Source: Ryan, 2026-11-21 (Atlas Questions chat), "CIV-1098 1", answering "1. Ship it as built (Recommended). You'd be approving the rule as written: more than half paired, at least 3 pairs."; Linear CIV-1098, comment of 2026-11-21
- **Times are read in whole minutes, except routes an agency lists as running to the second**
  - What: every feed time drops its seconds before it is read, except on the routes an agency's config lists in `secondsRoutes`, whose timetable runs to the second; today only TTC Lines 1 and 4. An agency-specific fix, not a rule for trains.
  - Why: whole minutes read TTC Line 4 (every 5½ min) as every 5, and Line 1's 2:40–3:29 and 3:53–4:25 gaps as every 4 and 5.
  - Source: [decision log](#decision-log) (2026-11-26), [#1824](https://github.com/Civic-Minds/Atlas/issues/1824), Linear CIV-2959

### What the map shows and never shows

- **Intercity service is in scope, like Bustang**
  - What: intercity bus and rail agencies (Ontario Northland, Brightline) are added like any other agency, hidden in production until checked, then shown on Ryan's go. Their routes are graded on the same scale as everything else (most read "infrequent"), and a route's mode is the feed's own (Ontario Northland's Northlander stays as its feed publishes it).
  - Why: Atlas already shows Bustang, an intercity coach service.
  - Source: Ryan, 2026-11-26 (CIV-2239): "For Intercity we already have Bustang is my point", then "1" (add them like the rest), then "1" on visibility (new ones hidden until checked)
- **A list's range has no width cap where its slow line has its own number**
  - What: a route list, agency page or MCP answer shows a range up to 4× wide as before. A wider one shows when the slow line gets its own number (3 or more evenly spaced trips); a slow end that is only the shared stretch keeps 4×. Cards, grades and map colours don't change. A list with a range drops the line's "from"/"until" words (the card keeps them).
  - Why: Ryan: "No cap. A range shows when its slow line runs regularly enough to get its own number (3 or more evenly spaced trips)" (RTD 31 weekday PM read "every 60 min until 5:14 PM" while Federal Blvd runs every 10).
  - Source: [decision log](#decision-log) (2026-11-26, CIV-2909)
- **A card row leads with the plain route number beside a lettered row**
  - What: a route card row leads with the branch ID the agency's data gives (TTC 504C, GO 41G). Where another row in the same direction has one, a row without a letter leads with the plain route number ("504C · to Roncesvalles", then "504 · to Dundas West"). Display only: no grouping, figure or grade changes. A direction with no lettered row is unchanged.
  - Why: Ryan: "For the 504 why do some destinations now have a route like 504C but then below it none".
  - Source: [decision log](#decision-log) (2026-11-26, CIV-3036)

- **A list's range keeps the card's one-gap note**
  - What: where a route list shows a range and the card row at its slow end names one gap, the list keeps the note after the range: AC Transit 60 weekday AM peak reads "every 26–45 min, with one 45 min gap", as the card does. "From"/"until" words still drop (the rule above).
  - Why: the list read "every 26–45 min" beside a card saying "every 26 min, with one 45 min gap".
  - Source: [decision log](#decision-log) (2026-11-26, CIV-3023, #1856)
- **A one-piece direction is one colour on the map**
  - What: where the same trips run a direction's whole length (a trunk and no branch), every stop takes the stretch's figure for the period, whether its own count reads faster or slower. A stop with no service in the period stays uncoloured. Where the stretch has no figure for the period (its trips aren't evenly spaced), every stop takes the card's figure; if the card has none either, each stop keeps its own. Map colours only: each stop's card and published figures keep their own count. For one-piece directions this replaces B2's "a stop that breaks off keeps its own colour", including its rule that an Infrequent stop (over 60) breaks off. No new number.
  - Why: each stop counts its buses by its own clock, so stops on one stretch drew different colours for the same buses.
  - Source: [decision log](#decision-log) (2026-11-26, CIV-2994; 2026-11-27, CIV-2994 B for the card's figure; supersedes #1839's "A slower stop keeps its colour … It can only understate")
- **One entry per agency or region, everywhere**
  - What: an agency split across feeds (MTA New York, exo, Maryland Transit Administration, Bustang) is one entry wherever agencies are listed, counted, ranked or compared: the map's agency picker, search and In view list, the count pills, the agency index and pages, Studio (Coverage included) and the Atlas Studio MCP tools (list_agencies, rank_agencies, compare_agencies). A route in two of its feeds (same name, mode and long name) counts once. The feeds stay separate in the data; the grouping happens when it is read, in the one shared module `shared/agencyGroups.ts`, and a guard test fails if a list skips it.
  - Why: the site listed MTA New York as nine feeds on some screens and one agency on others.
  - Source: [decision log](#decision-log) (2026-11-19), Linear CIV-1963
- **A feed with several operators is one regional entry**
  - What: a single feed that carries several operators (Embark's feed with EMBARK, EMBARK Norman, Citylink Edmond, OU's CART and the Oklahoma River Cruises ferry; Metro Transit's with six) stays one agency in Atlas under the feed's agency, not split by agency_id into one agency per operator.
  - Why: Ryan, 2026-11-19, choosing between one entry per feed and a split by operator: "1 but then by this logic we should combine the NYC MTA agencies right?" (the MTA half is CIV-1963).
  - Source: Linear CIV-1944

- **Understate rather than overstate**
  - What: when evidence is thin, show less or say there is not enough; never a plausible number that is not backed.
  - Why: overstating service is worse than understating it, because riders plan around it.
  - Source: the narrow-fixes rule below, [decision log](#decision-log) (2026-07-25, report unrepresentative frequency honestly), [DATA_PRINCIPLES.md](../data/DATA_PRINCIPLES.md)
- **No paratransit**
  - What: eligibility-only service (ADA or pre-approved riders) is never drawn.
  - Why: the map shows service anyone can use.
  - Source: Ryan, standing product scope; [ON_DEMAND_PUBLICATION.md](../research/north-america-flex-and-on-demand-2026-09/ON_DEMAND_PUBLICATION.md)
- **A line section follows the route rules**
  - What: a section needs at least 3 departures in a period for a value, then the same filter and "Hide limited service" behaviour as a whole route, with no new thresholds.
  - Why: one rule for routes and sections, so nothing special-cases a mode.
  - Source: Linear CIV-321, comment of 2026-10-18 (question 1)
- **A short slow end keeps the route's own number on the card**
  - What: with section colours, a row whose line has a slower end under the tail minimum (FREQUENCY_RULES rule 3, D1: 5 stops and 1 km) reads the route's own number, as the route list and chooser do; the map's section colours show the slow end. It replaces CIV-1595's range ("every 10–20 min") and single slow number (TTC 927 midday "every 306").
  - Why: one calculation per fact, so card, list and chooser agree, and one big slow number doesn't read as the whole route.
  - Source: Ryan, CIV-1579 (2026-11-15, option 1)
- **A stretch's colour changes only where the branches split**
  - What: on the filtered map, a drawn stretch changes colour only where the patterns serving its stops change (a branch split, merge or short turn). Each section between splits takes its worst stop's value; the piece joining two sections takes the worse one. Within an end section, an end stop a public tier worse than every other stop there colours only its own end piece (the end-piece rule kept), so one slow end stop never paints the stretch. A stop that reads slower only because its nearest opposite stop is past the opposite direction's split reads the opposite trunk instead. Map periods only; no published value, stop card or filter result changes. No new number.
  - Why: one piece between two stops in a different colour looked odd, and was mostly the piece where branches split, not a slow stop. Painting a whole stretch with one slow end stop drew service far worse than it runs (sample check, #1093). No piece is ever better than its own stops' values.
  - Source: Ryan, 2026-11-24 (CIV-1565, [#1093](https://github.com/Civic-Minds/Atlas/issues/1093)): "1", build "the colour changes exactly where the branches split"; replaces the end-piece rule (V0)
- **A selected route obeys the map's filters**
  - What: a selected route is drawn only when it passes the map's filters, the same on every site (useIntervalStats.ts:85, 64db443e2; #1504).
  - Why: beta's section colours drew a selected route the public map hid (GO Barrie and Stouffville at weekday midday, every 60 or less).
  - Source: Ryan, CIV-1595 (#1504, option 1)
- **The line is the track**
  - What: a line is coloured by every train running along it, including trains that skip a stop; the station's own stopping frequency shows on its card.
  - Why: the track really carries those trains; the stop's wait is a different fact.
  - Source: Linear CIV-321, comment of 2026-10-18 (skipped stations)
- **Lettered variants with no shared street stay separate**
  - What: routes that split at a hub with no shared stretch (Citilink 1N/1W, AC Transit 51A/51B) are not grouped.
  - Why: in practice they are two different routes; there is nothing to combine a headway over.
  - Source: Linear CIV-115, comment of 2026-10-17; [#303](https://github.com/Civic-Minds/Atlas/issues/303)
- **Expired feeds stay visible with a notice**
  - What: an agency with an expired feed is never hidden without Ryan's explicit yes.
  - Why: people can still find the agency, and the notice tells them the schedule may be old.
  - Source: [VISUAL.md](../style/VISUAL.md) (Agencies), [DATA_PRINCIPLES.md](../data/DATA_PRINCIPLES.md)
- **The History route chart needs 3 dates**
  - What: a History route card draws its chart only when 3 or more dates have a value in the period; with 1 or 2 the chart is left out and the rows below stay. The chart itself follows CIV-1026: a line through every snapshot, dots by priority (first and latest, then each year's last, then other changes) at least 24 px apart, the latest value labelled, expand for the wide view.
  - Why: with two dates the chart repeats the two rows below it.
  - Source: Linear CIV-1144, comment of 2026-10-29; Linear CIV-471 (`MIN_CHART_VALUES` in `src/apps/History.tsx`); Linear CIV-1026

### How Atlas is built

- **The MCP leaves out agencies whose terms bar an API**
  - What: an agency on the exclusion list (`shared/rules/redistribution.ts`: WMATA; DART, NYC Ferry and Bee-Line, whose terms bar sharing; and 15 agencies that need written permission first) is answered for by no Atlas Studio MCP tool, local or hosted, and any data download Atlas adds reads the same list. It stays on the map and in History. Asked about it, the MCP says Atlas can't serve that agency here; the Status page's MCP cell shows "Removed", with the reason on hover.
  - Why: WMATA's Transit Data Terms of Use bar "creating an application programming interface that enables access to Transit Data". Ryan: "Then remove it from MCP and note this somewhere internally".
  - Source: [decision log](#decision-log) (2026-11-22, twice; C-TRAN removed from the list 2026-11-26), [#1693](https://github.com/Civic-Minds/Atlas/issues/1693), CIV-2124, CIV-2125, CIV-3051, CIV-3100
- **The MCP may say more than the map, never something different**
  - What: the MCP may hold and give more detail than the map, cards and lists show end users, but it must never contradict them: the same question gets the same answer, and a different answer is a bug.
  - Why: Ryan asked "can the MCP use info if we don't show it to end users", and picked 1 over keeping the MCP to what end users see.
  - Source: [decision log](#decision-log) (2026-11-26)
- **The hosted MCP deploys with every push to main**
  - What: when CI passes on main, a workflow (`.github/workflows/mcp-deploy.yml`) deploys that commit's hosted MCP Worker, so the site and the MCP run the same code, then checks the live MCP answers with that commit and at least 500 agencies. A failed deploy or check fails the run.
  - Why: pushes deployed the site but not the MCP, so MCP fixes sat undeployed (CIV-3100, CIV-3102, CIV-3103 after fd05fd6).
  - Source: [decision log](#decision-log) (2026-11-27), CIV-3111
- **Modes come from GTFS route_type**
  - What: a route's mode is the feed's route_type; known mistakes are listed per-route overrides in the agency config, never guessed from names.
  - Why: one shared definition keeps the map menu, pages and counters agreeing.
  - Source: [decision log](#decision-log) (2026-10-13), `shared/modes.ts`, [#827](https://github.com/Civic-Minds/Atlas/issues/827), [#811](https://github.com/Civic-Minds/Atlas/issues/811)
- **History is curated, not backfilled**
  - What: History is on for selected agencies where archived feeds show real service change; snapshots stay immutable and missing periods stay unavailable.
  - Why: a duplicated or inferred period would show service that is not documented.
  - Source: [decision log](#decision-log) (2026-07-29), [History coverage](../data/DATA_HISTORY.md#archive-policy)
- **Fares V2 first, V1 as fallback, base fare only**
  - What: a route's base fare is the lowest adult Fares V2 product, then V1, then a manual override; Atlas does not claim a rider's full fare.
  - Why: base fares are what the feeds support reliably.
  - Source: [decision log](#decision-log) (2026-07-02)
- **Corridors is hidden from navigation**
  - What: the two-stop comparison tool is not a primary mode; it was later retired (2026-10-13), see [ROADMAP.md](../roadmap/ROADMAP.md).
  - Why: its purpose was not clear to ordinary users.
  - Source: [decision log](#decision-log) (2026-07-15), [ROADMAP.md](../roadmap/ROADMAP.md)
- **A shared field gets a parallel field, never a wider type**
  - What: new information on a published or persisted field goes in a new same-named field; the original's value type never changes.
  - Why: a file can declare its own copy of the type, so `tsc` misses it, and persisted snapshots cannot be fixed afterwards.
  - Source: [decision log](#decision-log) (2026-07-25), [#281](https://github.com/Civic-Minds/Atlas/issues/281)
- **Atlas Studio is a section of Atlas, local only**
  - What: Studio lives in the Atlas code as its own section behind its own feature flag, on only in local dev until the demo is ready.
  - Why: one codebase shares the map's data and rules; the agency tier isn't ready to show.
  - Source: [decision log](#decision-log) (2026-11-15), Linear CIV-1680

### Licence fit

- **Sources has one line above the agency credits: "Licences and attributions."**
  - What: About > Sources puts exactly that text above the agency pills, in the page's intro style. It claims nothing about which agencies are listed (the list is the agencies whose licence requires credit, plus MBTA's MassDOT credit).
  - Why: Ryan approved it word for word. He rejected the three drafted sentences ("Feel like all those options sound gossipy") and "Agencies that ask for a credit" ("sounds bad tho"), and wants wording that doesn't imply every agency is listed.
  - Source: [decision log](#decision-log) (2026-11-26), CIV-3096

- **Atlas adds a layer; it doesn't change the agency's data**
  - What: Atlas's readings (frequencies, grades, map colours, cards, History) are a layer on the agency's data, not changes to it, so licence clauses against modification or derivative works don't bar the map, cards or History. A fix that restores what the agency meant (a cut-off or garbled stop name, a wrong route type) is also a layer. Giving something a new name of Atlas's choosing is not. Licence fit is judged separately for the MCP, which passes figures on to other AIs: clauses on redistribution or API-style sharing are judged for it on their own, as the WMATA entry does.
  - Why: Ryan: "Because we don't change the data - we just "add" a layer on to it". On fixes: "But those "small" corrections - like fixing a stop name (not renaming it!) I think would be fine". On the MCP: "So then we should treat the MCP as separate".
  - Source: [decision log](#decision-log) (2026-11-26; extends 2026-11-22 "MTA and NJ Transit readings are reads, not changes"), CIV-3066

- **Purpose-limit, non-commercial and LA Metro picks (2026-11-27, CIV-3066)**
  - What: map, cards and History fit, and the MCP fits, for Madison, VIA, Green Bay, CTA, CUMTD and TheRide (purpose limit); Fairfax is on the MCP only with its credit line "Visit fairfaxconnector.com for more information" in the answers. NICE and Pace fit the map, and the MCP while Studio is free; they come off it or get permission before Studio charges or ads run (CIV-3112). LA Metro fits the MCP. Bee-Line stays on the map, cards and History by Ryan's override ("Honestly that seems dumb so I am ok overriding that one"), not because its terms allow it; its MCP exclusion stays.
  - Why: Ryan picked Strategy's verdicts for groups 1, 3 and 5; credit lines go in the map's info panel (CIV-3003).
  - Source: [decision log](#decision-log) (2026-11-27), CIV-3066

- **Published studies name agencies with restrictive terms**
  - What: a published study (the coverage study, CIV-3110 C) counts and names the agencies with restrictive licence terms. No agency is excluded or anonymised.
  - Why: Ryan: "But naming them is just journalism is it not?"
  - Source: [decision log](#decision-log) (2026-11-27), CIV-3110 C

### Data and pipeline fixes

- **Data integrity first**
  - What: never show wrong or misleading information; hide or hold first, fix after.
  - Why: a wrong number on the map costs more trust than a missing one.
  - Source: Ryan, standing rule (data integrity first: "never show wrong or misleading info"); [DATA_PRINCIPLES.md](../data/DATA_PRINCIPLES.md) (Why this matters)
- **A row's trip count counts every trip of the row, wherever it ends**
  - What: a row's whole-day trip count adds its trips that end without reaching its end stop (running at least two thirds of its line); a trip reaching another row's end stop stays with that row (CIV-1069). Hour counts, first/last times and frequencies still read the end stop.
  - Why: RTD FreeRide showed 255 of 296 weekday trips; 41 end at Union Station Loop.
  - Source: [decision log](#decision-log) (2026-11-26, CIV-2233, #1776)
- **A route is booked when its boarding stops are booked**
  - What: a route reads as on-demand when at least 85% of the stop events where riders can board (pickup_type other than 1) need a booking (pickup_type 2); drop-off-only stops don't count. An agency can still force a route either way by short name.
  - Why: taxibuses written as a booked pickup plus a drop-off-only stop read 50% booked and showed as fixed buses (Drummondville's 68 Secteur routes).
  - Source: [decision log](#decision-log) (2026-11-27, CIV-3002, #1829)
- **Manual corrections only fix errors inside the feed**
  - What: a manual correction only fixes an error inside the agency's GTFS file, and Atlas adds no note carrying information that is only on the agency's website.
  - Why: Ryan: "The GTFS is live. It is the truth."
  - Source: Ryan, 2026-10-27 (Linear CIV-1060, the FXBGO! note)
- **Narrow fixes, and stop after two rule attempts**
  - What: write pass criteria first, count every change outside the target, hand-check all day types, then stop and report after two rule attempts.
  - Why: broad fixes built from one case regressed other agencies (#263, 32 routes in 18 cities).
  - Source: [FIXING_PIPELINE_ISSUES.md](../engineering/FIXING_PIPELINE_ISSUES.md) (enforced for every chat since 2026-10-12), [#263](https://github.com/Civic-Minds/Atlas/issues/263)
- **A shared fix is checked on six other agencies in two countries**
  - What: regression and legitimate-case tests, a before and after diff, and six more agencies spanning two countries, all recorded.
  - Why: three spot checks missed 5.2% newly empty values (#279).
  - Source: [FIXING_PIPELINE_ISSUES.md](../engineering/FIXING_PIPELINE_ISSUES.md), [FIXING_UI_ISSUES.md](../engineering/FIXING_UI_ISSUES.md), [#279](https://github.com/Civic-Minds/Atlas/issues/279)
- **The headway validation gate**
  - What: a commit touching shared headway or filter files needs a pipeline test or a "Validated:" line.
  - Why: a written record beats an ephemeral chat; never bypass with --no-verify.
  - Source: [commit-msg hook](../../.githooks/commit-msg), [#263](https://github.com/Civic-Minds/Atlas/issues/263), [#279](https://github.com/Civic-Minds/Atlas/issues/279)
- **One frequency filter function, every direction must pass**
  - What: the map expression in shared/tileFilterExprs.ts is the single definition; the app reads the same one.
  - Why: the app and the map can never disagree.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) (Where the rule lives)
- **New-country gate**
  - What: the first agency of a country with no live agency stays on --dry-run until Ryan authorizes the country launch.
  - Why: hiding an agency does not stop a real write to the live bucket.
  - Source: [ADDING_AGENCIES.md](../data/ADDING_AGENCIES.md), [countryLaunchGate.ts](../../pipeline/countryLaunchGate.ts) (the gate is enforced in code); Metz, 2026-07-19
- **R2 writes need an explicit go**
  - What: refresh, process, build-pmtiles, publish-data-release and reprocess with --write each need a fresh yes; a past write or a clean validation is not approval.
  - Why: data goes public with no deploy gate; Metz went live unapproved in 2026-07.
  - Source: Ryan, standing rule; [ADDING_AGENCIES.md](../data/ADDING_AGENCIES.md); Metz, 2026-07-19
- **No changelog entry for data adds**
  - What: adding an agency, zone or feed, or a refresh that fixes numbers with no code change, gets no changelog line.
  - Why: the product's code did not change.
  - Source: Ryan, 2026-08-08

- **Rebuilds run in the cloud**
  - What: full rebuilds run through `rebuild-release.yml` (dry run first, then publish); local runs are only for same-zip before and after checks and small checks.
  - Why: a local full rebuild is slow and heats the laptop, and the cloud run leaves a reviewable report.
  - Source: Ryan, 2026-10; [DATA_REPROCESSING.md](../operations/DATA_REPROCESSING.md)
- **Test on localhost only**
  - What: test on the local dev servers (5180 public mode, 5181 beta mode, plus the Live ports); never against the live sites.
  - Why: testing live pollutes real analytics and can hit live data.
  - Source: [BRANCH_WORKFLOW.md](../engineering/BRANCH_WORKFLOW.md)

### How Live reads

- **Fleet's "Not on a trip" says how many are parked at garages**
  - What: the count stays whole and nothing is hidden; beside it, how many of those vehicles are at a garage ("622, of which 521 at garages"). A vehicle with no trip is at a garage when it stands still (under 1 m/s, or no speed reported) in a group of 5 or more such vehicles within 100 m. No garage list: a garage is where parked vehicles gather.
  - Why: Ryan: "Well those 622 buses aren't operating technically right so I have no clue"; most of the TTC's evening count is buses pulled in for the night.
  - Source: [decision log](#decision-log) (2026-11-26, CIV-2990)
- **Live report pages stay local**
  - What: the Live report pages are on only on the local dev server, not on Beta or Public, until the GTFS-RT archive restarts and the page design is approved.
  - Why: their data is not being refreshed, and the design is still in progress.
  - Source: [decision log](#decision-log) (2026-11-15)
- **Desktop only, one top bar**
  - What: Live's tool page and Studio are hidden on phones (they fall back to the map, like History and Compare), and every switcher sits in the one top bar (in Studio's Live, Measure sits with the filters: Agency, Route, Time of day; Ryan, 2026-11-19), with the map key as a card floating at the map's bottom left (since CIV-1821).
  - Why: the panels need a desktop's room, and controls in two places read as clutter.
  - Source: [decision log](#decision-log) (2026-11-16)
- **Timetable measures are "Lateness"; the speed view is "Speed"**
  - What: the measure once called "Falls behind" / "Delays start", then "Schedule adherence", and its section (once "Where delays start") read "Lateness"; Studio's Measure menu has one entry for it, "Lateness" (the "Falls behind" measure), and "Delays start" leaves that menu. "Typical delay" reads "Typical deviation". The new positions-only view is named "Speed" (average speed, no baseline), not "Delay".
  - Why: Ryan: ""delays start" and "behind schedule" sounds fucking stupid in a professional product"; then "Ideally those would all be 1 word though" / "Lateness might work"; "Delay" implies a baseline the picked method doesn't have.
  - Source: [decision log](#decision-log) (2026-11-25, CIV-2924; 2026-11-26, CIV-2917; 2026-11-27, CIV-2924)
- **Speed's minimums are starting values, to be checked**
  - What: Speed shows a stretch's average speed (total distance over total time of its recorded weekday trips, per time-of-day slot) only when the stretch is at least 400 m long, has at least 7 weekdays recorded, at least 30 trips in total and at least 10 trips in that slot; below any of them it shows no figure ("Not measured"). The numbers live in SPEED_MINIMUMS (shared/rules/live.ts).
  - Why: 400 m, 30 and 10 are untested prototype guesses and 7 weekdays is Strategy's proposal; Ryan took them as starting values, to be tested on TTC, HSR and MBTA routes, with counts of how many stretches go blank, before anything ships.
  - Source: [decision log](#decision-log) (2026-11-26, CIV-2919)
- **Studio is split by time: now, past, plan**
  - What: Live and Fleet (now) stay map panels; Performance (past) and Schedules (plan) are full pages. Live's weekly late figures move into Performance, so no figure shows in two places.
  - Why: trip time showed in three places and lateness in two.
  - Source: [decision log](#decision-log) (2026-11-26, CIV-2917)
- **Math explanations stay visible**
  - What: text that explains a number or threshold stays on screen, not hover-only; text that only restates a label can go.
  - Why: the explanation is what makes the figure trustworthy.
  - Source: Linear CIV-293, comments of 2026-10-17 (14:42 and 14:56 UTC)
  - Exception (Ryan to the manager in chat, 2026-11-19: "1", then "Might be better actually" when asked "Bunching is XYZ then learn more?"; logged on CIV-1828): in Studio's Live view the week table's two explanation lines (what Bunching's two figures are, and what grey means) live in Studio's About panel, Live part. The side panel keeps the short bunching definition with a Learn more link that opens it, and the map key keeps its short definition.
- **Understood at a glance, no scrolling or collapsing in sidebars**
  - What: both sidebars show everything at once; if it does not fit, show less rather than cram.
  - Why: Ryan: "I shouldn't need to scroll in the sidebar." (He never asked for collapsible cards.)
  - Source: Linear CIV-293, comments of 2026-10-17 (14:17, 14:20 and 14:27 UTC)
- **Late has one shared wording and one threshold**
  - What: "Late: more than 5½ min behind the timetable: the TTC's 5-minute standard, plus 30 seconds because we see each vehicle about once a minute."
  - Why: two different numbers had been used for the same threshold.
  - Source: Linear CIV-293, comment of 2026-10-17 (15:00 UTC); [LIVE_METHOD.md](LIVE_METHOD.md) (the 5½ wording is fixed on `feature/live-tool-v2`, commit 30e61431; until it merges, main's LIVE_METHOD.md says "5.5 or more", and the code (`shared/liveDelayStatus.ts`) uses 5.5 or more)
- **Only days with good recordings count**
  - What: every Live surface uses good days only, and names the left-out days ("Excluding Oct 11"), shown only when a day is left out.
  - Why: the same figure must match everywhere, and a day with a gappy recording misleads.
  - Source: Linear CIV-284, comment of 2026-10-17; Linear CIV-293, comment of 2026-10-18; [LIVE_METHOD.md](LIVE_METHOD.md) (Good days only)
- **Rolling 7 days only**
  - What: the agency report shows the last 7 days, with no 24-hour or yesterday option.
  - Why: one day is noisy, and 7 days matches the "vs last week" lines.
  - Source: Linear CIV-293, comment of 2026-10-17 (14:45 UTC)
- **The strip is the model for Live visuals**
  - What: stops as dots on a line, a 3-step colour scale, the marked stretch as a bracket, "less exact" stops hatched.
  - Why: Ryan liked it; reach for it before bar charts or prose.
  - Source: [VISUAL.md](../style/VISUAL.md) (Live)
- **Share changes read with an arrow; Live shows no "figures updated" date**
  - What: a share before and after reads "10% → 41%" (was "10% to 41%"); where a summary lacks both shares, nothing shows (the "+31 pt" points fallback is gone). No "Figures updated" or "Live figures updated" date shows anywhere: not on About's Measurements page, not in the Live status pill's hover. The route card's "Right now · last updated <time>" stays, shown only when the data is stale. About > Measurements is one row per measure ("Bunching ›"); the grey key stays only under the Live week table.
  - Why: Ryan, 2026-11-21: "Why would we not put +31%", "10% arrow 31%?", then "1" to "Use the arrow, "10% → 41%"". Ryan, 2026-11-26: "in live what does the updated date even mean idgi", "Is the date of it not confusing" (the date is when the summary figures were built, not the bus positions, so it reads as stale live data), "Grey within normal is a legend thing not a about page thin".
  - Source: Linear CIV-3055 (supersedes the 2026-11-21 "build time sits in About" line, CIV-1814 item 41, and CIV-2084's date in the pill hover), CIV-2038
- **Live's list always matches the map**
  - What: the Live list shows every route with a vehicle on screen, from every agency the map draws there. Picking a place in the zoomed-out list only flies the map to it; it no longer narrows the list to that agency.
  - Why: Ryan, 2026-11-26: "I'm confused here too because are these HSR routes not Live-enabled? They're showing on the Live map but not in this list." Picking Burlington Transit kept the list to Burlington in the Hamilton view while the map drew HSR. He picked option 1, "The list always matches the map (Recommended)".
  - Source: [decision log](#decision-log) (2026-11-26, CIV-3049, #1879)
- **Studio's cities, and the same Live cities in Studio and the main app**
  - What: Studio's Schedules and vehicles-needed agencies are Kingston, Hamilton, RTD Denver, Guelph, TTC, YRT and the MBTA (TransLink and OC Transpo out). Studio's Live and the main app's Live list the same cities from one shared list; a city without recordings shows the no-data note.
  - Why: Ryan, 2026-11-21: "I think Live in Studio and Live in main app should have the same cities available", and "1" to the four focus agencies plus TTC, YRT and the MBTA.
  - Source: Linear CIV-2046

### How we talk to riders and planners

- **New UI text needs Ryan's word-for-word OK**
  - What: no new wording, note or label, including an existing note shown in a new situation, without his yes on that exact text.
  - Why: a proposal in Linear or an issue is not approval; "you decide" on data does not cover what users see.
  - Source: [TEXT.md](../style/TEXT.md) (New wording needs a yes)
- **Removing something Ryan approved needs his OK**
  - What: taking out an approved element or wording is a UI change like any other.
  - Why: he approved it on purpose.
  - Source: [TEXT.md](../style/TEXT.md) (New wording needs a yes)
- **Every UI change is shown on localhost before it merges**
  - What: a running localhost URL plus one line on what to check; a reviewer's approval is not design approval.
  - Why: Ryan signs off on how Atlas looks.
  - Source: [STYLE.md](../STYLE.md) (top)
- **The hidden route class is "Occasional"**
  - What: school runs, routes with a few trips a day and on-demand service (code class `irregular`) are "Occasional" to riders, and the setting reads "Hide occasional routes". "Irregular" means only a period with no regular cadence.
  - Why: "one-off" read as once a day, and "irregular" is the period wording.
  - Source: Ryan, 2026-10-31 (Linear CIV-1238), replacing #720's "one-off"
- **Plain words, no all-caps, no dark fills**
  - What: labels a non-expert understands at once ("Part-time", not "Time-limited"); selected states are pale, never solid dark.
  - Why: settled look and voice; the glossary lists the UI word for each internal term.
  - Source: [TEXT.md](../style/TEXT.md), [VISUAL.md](../style/VISUAL.md), [GLOSSARY.md](../GLOSSARY.md)
- **Frequencies are written by one function, in minutes**
  - What: "every 10 min", "every 16 min", ranges with an en dash; never hours, never typed by hand.
  - Why: the same frequency reads the same on every surface, and columns never mix units.
  - Source: [TEXT.md](../style/TEXT.md) (Frequencies), [#938](https://github.com/Civic-Minds/Atlas/issues/938)
- **Notice wording: one source, one style**
  - What: every notice, empty state, error and explainer text lives in src/content/noticeCopy.ts with a permanent code (N1, N2… for notices, E1, E2… for explainers; codes are never reused), and each "Learn more" notice is paired with one explainer. Notices lead with what the rider sees ("This route…", "This agency's…"), never "Atlas…"; one sentence where possible; no "so"; a notice about the chosen time of day names the times ("from 6–9 AM"), never "the selected period"; a beta-only feature says "only available on Atlas beta. View →" and never points to the preview site. Explainers (the "Learn more" side panels) use three short paragraphs: the issue in plain English, what we are doing about it, and what the reader can do; a date-bound notice switches tense on the date ("ends" before, "ended" from that day). An explainer says enough to explain the thing and no more.
  - Explainer layout (title plus three paragraphs, paragraph 2 in the "We…" voice) is now kept in [TEXT.md](../style/TEXT.md) (Card notices); Ryan confirmed the "We…" voice for X16 on 2026-11-20 (CIV-1978) and agreed the layout belongs in the style guide. Paragraph 3 is left out when the reader has nothing to do ([decision log](#decision-log), 2026-11-25, CIV-2222).
  - Why: the same situation should read the same everywhere, and a notice must match its explainer.
  - Source: Ryan, 2026-10-27 (Linear CIV-1045): "I think overall we don't use "Atlas..." to start notices", "one single page where the entire site pulls from", "the erros on the route cards/agency cards/etc need to match up to the "explainer""; times rule on N35; explainer paragraphs ("first the issue in plain english. then in second para what we are doing abt it. then third para what they can do abt it"); tense ("ended is past but ends is upcomming"); explainer length ("The trick is these explainers should contain enough information to explain the thing without containing too much info.").

- **Agency names: the agency's own short name, never a city or a made-up code**
  - What: lists and rows use a bracketed brand code from the official name ("Chicago Transit Authority (CTA)" → CTA), or a short name stored in the agency's config (TTC, Muni); a row name longer than 24 characters uses the stored short name if there is one, otherwise the full name. A city or bracketed place is never the short name ("Capital Metro", not "Austin"). The agency card always shows the full name. Short names are stored only for names riders actually use; no new codes are coined (the 18 proposed ones such as GPTC and SETD were dropped).
  - Why: a short name has to be one people recognise; an unfamiliar code is worse than the full name.
  - Source: Linear CIV-998 and CIV-967; Ryan, 2026-10-27 ("That second one might be an issue", then "I think 1 is sound"); `agencyNames` in src/utils/format.ts

- **Ryan's UI requirements are logged in his own words**
  - What: record his words verbatim, label AI suggestions as suggestions, and never put AI details under his name.
  - Why: a paraphrase drifts into a rule he never made.
  - Source: Ryan, 2026-10-17 (Atlas manager sessions)

### Who decides what

- **Ryan decides how Atlas looks, what it says, new countries and R2 writes**
  - What: data questions can be decided by the manager; anything users see, any launch, any live write goes to Ryan once.
  - Why: his standing rules above; one question, asked once, by the manager.
  - Source: [STYLE.md](../STYLE.md); the R2 and new-country rules above
- **Workers never push or merge; Linear first**
  - What: workers commit locally and report; the manager reviews, pushes and merges; every request is logged in Linear first.
  - Why: each push costs a deploy, and per-PR merging hit the deploy limit.
  - Source: Ryan, 2026-10-10 (manager and worker chats)
- **Atlas changes only for Atlas's reasons**
  - What: a request that only changes one consumer's presentation belongs in that consumer, not in Atlas's canonical data.
  - Why: downstream tools need stable data, and Atlas stays the shared platform.
  - Source: [decision log](#decision-log) (2026-07-15, shared data platform and operational consumers)

- **A route's first and last times are read where its trips start**
  - What: the first time is the first trip's start and the last time the last trip's start, over the trips of the direction's representative weekday (CIV-2229, #1791). A night service's trip written as 0:xx counts as the night it ends, and a route that runs all night (the Night Service verdict) shows no exact last time.
  - Why: the reference stop's times are when a bus passes the middle of the route, not when a rider can first or last board.
  - Source: [decision log](#decision-log) (2026-11-24, CIV-2229 first times; 2026-11-26, CIV-2963 last times)
- **A feed with a placeholder end date shows no end date, and a warning once its timetable is 12 months unchanged**
  - What: where a feed's calendar runs to a placeholder (2099, 2050) and feed_info gives no end that wins, the agency page says "Based on the agency’s published schedule, which has no end date." Once the timetable (its trips and stop times) hasn't changed for TIMETABLE_STALE_MONTHS (12), it adds "The agency hasn’t changed its timetable since February 2022, so it may be out of date." with the stored month and year.
  - Why: "today + 2 years" was a made-up date that moved with every refresh, so these feeds could never read as outdated.
  - Source: [decision log](#decision-log) (2026-11-27, CIV-3115)
## Decision log

Dated, newest first. The rules above are the short form; this is the reasoning.

### 2026-11-27 — The map opens with no frequency filter (All), so on-demand zones show on a fresh map (CIV-2898; extends 2026-11-24, replaces CIV-1812 item 8's every-60 default)
Ryan, 2026-11-27 (Studio chat). He first picked "Hide when tighter than 60", then asked "But the same issue would still exist right" (zones would still show at the default 60 although they don't run every 60) and "So should the default be "all" then". Offered "1. Make "All" the default and hide zones under any filter (Recommended)", with the trade-off that a fresh map also shows routes slower than every 60 min, in the slowest tier colour. His words: "1". The 2026-11-24 rule (zones hidden under any frequency filter) stays. The saved filter moves to a new key, so returning viewers, whose old every-60 default had been saved automatically, open on All once; a filter picked after that is kept.

### 2026-11-27 — No "from"/"until" on a card row where buses keep the same spacing across the period's edge (CIV-3121, #1906)
Ryan, 2026-11-27, on TransLink R2 toward Park Royal ("every 8 mins from 310 but the period begins at 3 pm lol so"), then in the manager window: "Why are we saying "until" or "from" if the frequency doesn't change here". In the data chat he said "Please ask Manager then decide"; the manager found no rule against it (CIV-1241 and CIV-1411 cover real starts and stops only) and the data chat kept both sides.
- The rule: a row's "from" ("until") words are dropped when the departure before the period's start (after its end) keeps the existing steadiness test (isSustainedHeadway) with the gap across the edge added. Service that really starts, stops or changes spacing in the period keeps its words. Card wording only: the filter value and map colour are unchanged. No new number.
- Counts (same-zip local dry run, base vs fix, Spokane, TTC, MBTA, TransLink, SEPTA, OC Transpo, RTD): 72 card rows lose their words, 28 "from" and 44 "until" (the "until" side was not asked for). 21 of them then read "Runs irregularly in this period" under the 4-trip minimum (2026-11-24, CIV-2232: a wait over 60 min and 1–3 own trips; its exception is only for service that starts or ends in the period, which these rows don't). Rows list: Linear CIV-3121, comment of 2026-11-27.
- Related, not settled here: "from"/"until" means both "service starts or stops" and "frequency changes" (CIV-3135).

### 2026-11-27 — Booked-route detection counts only stops where riders can board (CIV-3002, #1829)
Ryan, 2026-11-27, asked in the Studio chat whether it should ship, picked "Ship it". The 85% rule (CIV-1006) now counts only boarding stop events (pickup_type other than 1), not every stop event.
- Counts (sweep of every local feed, 50 agencies with booked stops, plus Drummondville's current feed): 8 routes gain the on-demand reading (Cascades East A and B; Dial-A-Ride and Paratransit in the mountain-village, smart-telluride and telluride feeds) plus Drummondville's 68 Secteur routes. None lose it. Rio Vista 50 stays a bus (81.8%); exo and Bay Transit are unchanged.
- Drummondville's hand list of 68 routes (CIV-2244) is removed: the rule now finds exactly those 68.

### 2026-11-27 — A one-piece direction with no reading in the period is coloured by the card's figure (CIV-2994 B, #1907)
Ryan, 2026-11-27 (Questions chat, logged on CIV-2994), picked "1" on: "BC Transit Nanaimo 40, weekday PM peak toward Downtown: the map shows the Woodgrove end orange (every 30) and the rest green (every 15), only because a bus reaches one stop a minute earlier than the next, while the card shows every 15. Should the map colour the whole line with the card's figure? 1. Yes, one colour, the card's figure; if the card has no figure, each stop keeps its own (Recommended) 2. No, keep each stop's own colour". Counts (release-mwzhdf3r, 564 agencies, every day, AM peak to late): 10,038 stops faster, 21,603 slower, at 332 agencies (2,735 direction-periods; 82,558 stops in them already matched the card's colour). In every case the card had a figure. Extends the 2026-11-26 one-piece rule, which skipped a piece whose period had no reading ("limited"). Map colours only; no stop card, published figure or rebuild changes.

### 2026-11-27 — No end date for placeholder feeds, and "may be out of date" after 12 months with no timetable change (CIV-3115)
Ryan, 2026-11-27: "Have Manager look into it - why 2 years?", "Well obviously we can't trust 2099 but my point is that +2 years from today is equally as arbitrary" and "But \"no end date\" might not be ideal either". After Strategy's revised verdict and the mock-up: "I don't like the wording of any of those explanations", then "I lied I didn't realize what I was looking at - I choose 1" (option 1: "No end date given" plus a warning after 12 months with no timetable change; picking it OKs the 12 months). He then approved this wording word for word (relayed by the manager): "Based on the agency's published schedule, which has no end date. The agency hasn't changed its timetable since February 2022, so it may be out of date." The month and year come from the stored date; with no warning, only the first sentence.
- The rule: a feed gives no end date when its calendar runs past today + 2 years and no feed_info end wins (isPlaceholderFeedEnd, recorded as noFeedEnd). The "today + 2 years" cap (#680, 2026-10-10, never Ryan's decision) stays in lastFeedExpiry for the date checks only and is never shown. "Timetable last changed" is Strategy's definition: the day the trips and stop times last changed (timetableContentKey over trips.txt, stop_times.txt and frequencies.txt), not a re-download or re-zip; the first reading starts from the day Atlas first obtained the current file. 12 months is TIMETABLE_STALE_MONTHS in shared/config.ts.
- Counts (published agencies, 2026-11-27): 39 show no end date (e.g. LADOT, Knoxville, Greensboro); 7 of them carry the warning: Yakima (Feb 2022), Indian River (Jan 2024), Space Coast (Apr 2024), CUE Bus (Apr 2024), EZ Rider (Jan 2025), Prince Albert (Jan 2025), Concord-Kannapolis (May 2025). For the other 32 the true change date before Atlas tracked it is unknown, so their clock starts at tracking (late 2026).
- Not changed: feeds whose feed_info end is itself far out (JeffTran 2035, Gaston 2030) still show that date; the "more than 2 years past today" line is Strategy's backlog item.

### 2026-11-27 — A card's range runs to the slowest far end with regular service, for every agency, short-turn tails included (#1775, CIV-3080; extends 2026-11-24 / CIV-2232, which covered RTD)
Ryan, 2026-11-27, answering the Questions chat after Strategy's critique, picked "1": keep the fix, so any far end with regular service counts in the card's range, matching the route list. He did not pick option 2, a size minimum (far end of at least 5 stops and 1 km). Earlier the same day, on whether to keep the fix for every agency or limit it to true branches, he said: "I think we need to have a chat do more research, exploration, and thinking about this"; the research (Data 2) and Strategy's critique followed.
- The rule: where the trunk sets the card's headline, the card's range runs to the slowest far end with regular service, up to an hour (a wait over an hour keeps its own row, 2026-11-24). It applies to every agency, and short-turn tails count like branches.
- Counts (cloud dry-run pair, 9 agencies in 3 countries, only the card range changes, no range lost): 129 routes outside RTD in 8 agencies (TTC 39, SEPTA 36, OC Transpo 16, TransLink 12, MBTA 11, STM 7, CTA 6, AC Transit 2), plus RTD's 7. 17 cells that already had a range get wider.
- Examples: RTD 15 weekday midday 10–30 (Ryan's 2026-11-24 pick); TTC 102 weekday midday 5–10 becomes 5–30 (102D to Major Mackenzie), matching the route list's 10–30.
- Why: Strategy found the route list, the map colour and the filter already count these tails (TTC 102's list reads "every 10–30", its wait is 30), so only the card disagreed. No rule built from the schedule data separates the flagged short turns (TTC 102D, CTA Blue, SEPTA 26) from RTD 15 and 31 without also dropping one of Ryan's picks. The 5-stop / 1 km minimum he called "an arbritrary number for branches" (CIV-1959) stays out. D2 would have dropped 140 card ranges, 85 of them TTC.
- Supersedes nothing: it extends the 2026-11-24 entry from RTD to every agency. The data change goes out with the next rebuild batch.
- Separate: #1902 (the card's fast end doesn't match the route list: TTC 102 midday card 5, MCP "busiest part" 10). It is true before and after this fix and doesn't block it.

### 2026-11-27 — The hosted MCP deploys automatically with every main push (CIV-3111)
Ryan, 2026-11-27, picked "1": "Add a GitHub Actions step that deploys the MCP automatically whenever main is pushed and CI passes, so the site and the MCP always run the same code." And: "ideally the MCP never gives information that differs from the website". Before this, pushes deployed the site (Vercel) but not the hosted MCP Worker, so CIV-3100, CIV-3102 and CIV-3103 sat undeployed after fd05fd6. The workflow deploys the Worker's code (it reads the release itself) and then checks the live MCP reports that commit and at least 500 agencies.

### 2026-11-27 — Published studies name agencies with restrictive terms; no exclusion, no anonymising (CIV-3110 C)
Ryan, 2026-11-27, on the coverage study (CIV-3110 C), picked "2": "But naming them is just journalism is it not?". In a published study, Atlas counts and names the agencies whose licence terms are restrictive. None is left out and none is anonymised.

### 2026-11-27 — Licence fit, group 1 (purpose limit): map and MCP fit; Fairfax needs its credit line (CIV-3066)
Ryan, 2026-11-27 (Questions chat): "Well we can have the credit line in the one screen in the info panel right then option 1?" He picked option 1, Strategy's verdict.
- The rule: the map, cards and History fit for Madison, VIA, Green Bay, CTA, CUMTD and TheRide, and so does the MCP. Fairfax Connector is on the MCP only once its answers carry "Visit fairfaxconnector.com for more information". Credit lines go in the map's info panel (CIV-3003).
- Open: MCP answers don't pass through the info panel, so Fairfax's line must also be in MCP answers; whether the MCP carries agency credits today is unconfirmed (Strategy's issue b).

### 2026-11-27 — Licence fit, group 3 (non-commercial): NICE and Pace fit the map; the MCP while Studio is free (CIV-3066, CIV-3112)
Ryan, 2026-11-27 (Questions chat): "Honestly I think even if we did have adds technically we would still be fine as long as it's not a enterprise". Offered "1. Strategy's version: map OK. MCP OK while Studio is free. Ads count as commercial too, so NICE and Pace come off or need permission before either starts" or "2. Your version", he picked "1".
- The rule: NICE and Pace fit the map, cards and History, and the MCP while Studio is free. NICE and Pace come off the MCP, or Atlas gets their permission, before Studio charges or Atlas runs ads. NICE bans any "profit-making use"; Pace allows "non commercial use". Trigger: CIV-3112.

### 2026-11-27 — Licence fit, group 5: LA Metro fits the MCP (CIV-3066)
Ryan, 2026-11-27 (Questions chat): "1". Strategy's verdict: LA Metro's "limited to accessing and displaying or otherwise making available the Transport Information" covers MCP answers, and there is no WMATA-style API ban.
- The rule: LA Metro is on the MCP, as well as the map, cards and History.

### 2026-11-27 — Bee-Line stays on the map, cards and History by Ryan's call; its MCP exclusion stays (CIV-3066)
Ryan, 2026-11-27 (Questions chat), on Bee-Line's terms, which allow only US-located persons and companies authorized to do business in New York: "Honestly that seems dumb so I am ok overriding that one".
- The rule: Bee-Line stays on the map, cards and History by Ryan's override, not because its terms allow it. Its MCP exclusion (its terms bar sharing) stays as is.
- Unanswered: whether Civic Minds is US-based. Ryan did not answer it.

### 2026-11-27 — Live's timetable measure reads "Lateness"; Studio's Measure menu has one entry for it (CIV-2924; supersedes 2026-11-25 "Schedule adherence")
Ryan, 2026-11-27, in the Questions chat: "Ideally those would all be 1 word though" and "Lateness might work", then confirmed option 1. "Schedule adherence" becomes "Lateness" everywhere: the measure, Live's section (once "Where delays start") and the stretch it marks. Studio's Measure menu has one entry, "Lateness" (the "Falls behind" measure); "Delays start" leaves Studio's menu (it stays as Live's map toggle, named "Lateness"). This also settles the open Studio menu question in the 2026-11-25 entry. "Typical deviation" is unchanged. The label lives once in shared/liveWording.ts (`LATENESS_LABEL`); the style guard bans "Schedule adherence" as it does "Delays start".

### 2026-11-26 — Live's list always matches the map; picking a place only flies there (CIV-3049, #1879)
Ryan, 2026-11-26: "I'm confused here too because are these HSR routes not Live-enabled? They're showing on the Live map but not in this list.", then option 1, "The list always matches the map (Recommended)": picking a place only flies the map there, and the list shows every route with a bus on screen. This replaces the place filter's design (picking an agency kept the list to it until you left its area or zoomed out, because Toronto's and York Region's areas overlap). Options not picked: 2, the map shows only the picked agency; 3, keep the filter with an "only" chip.

### 2026-11-26 — Live shows no "figures updated" date; Measurements is one row per measure (CIV-3055, #1822; supersedes CIV-1814 item 41 and CIV-2084's pill-hover date)
Ryan, 2026-11-26, on About > Measurements and the Live pill: "Grey within normal is a legend thing not a about page thin", "in live what does the updated date even mean idgi", "Is the date of it not confusing", then "1". The date was when Live's summary figures were built, not when bus positions came in, so it read as stale live data. Now: no "Figures updated" line on the Measurements page, none in the Live status pill's hover (the per-agency "positions last came in" lines and the retry countdown stay), the grey key only under the Live week table, and one row per measure ("Bunching ›") on Measurements. The route card's "Right now · last updated <time>" stays, shown only when data is stale.

### 2026-11-26 — Sources intro reads "Licences and attributions." (CIV-3096)
Ryan, 2026-11-26, on CIV-3096: "Feel like above the agency names here we need a lilttle sentence or para too". He rejected the manager's three drafted sentences: "Feel like all those options sound gossipy"; rejected "Agencies that ask for a credit": "sounds bad tho"; on the plainer drafts: "But like that doesnt include all of them so shouldnt say it does so i think 3 might be best? idk" and "remove the word "below" maybe? idk". Approved word for word: "Licences and attributions." Rejected wordings: the three drafted sentences ("These agencies' data licences ask us to credit them...", "Some agencies require credit for their schedules...", "Agencies whose schedule data comes with a credit requirement...") and "Agencies that ask for a credit".

### 2026-11-26 — Licence fit: Atlas adds a layer; fixes count; the MCP is judged separately (CIV-3066; extends 2026-11-22 "MTA and NJ Transit readings are reads, not changes")
Ryan, 2026-11-26, three rulings on CIV-3066:
1. "Because we don't change the data - we just "add" a layer on to it".
2. "But those "small" corrections - like fixing a stop name (not renaming it!) I think would be fine".
3. "So then we should treat the MCP as separate".
- The rule: (1) Atlas's readings (frequencies, grades, map colours, cards, History) are a layer on the agency's data, not changes to it, so licence clauses against modification or derivative works don't bar the map, cards or History. (2) A fix that restores what the agency meant (a cut-off or garbled stop name, a wrong route type) also counts as a layer; giving something a new name of Atlas's choosing does not. (3) Licence fit is judged separately for the MCP, since it passes figures on to other AIs: clauses on redistribution or API-style sharing are judged for it on their own, as the WMATA entry already does.
- Extends, not supersedes: the 2026-11-22 "MTA and NJ Transit readings are reads, not changes" entry (and its Foothill Transit line) stands; this covers every agency's readings and adds the stop-name and route-type fixes. The WMATA and exclusion-list entries stand as written.
- Why: the terms that bar modification or derivative works are about altering the published data; a reading or a restoring fix leaves the feed's meaning as published. The MCP's outside-AI sharing is a different act, so redistribution and API clauses still decide it.

### 2026-11-26 — A row's trip count counts every trip of the row, wherever it ends (CIV-2233, #1776)
Ryan, 2026-11-26 (Questions chat, logged on CIV-2233): picked option 1, "Count every trip of the row, wherever it ends (Recommended)". Keeps the CIV-1069 guard.
- The rule: a row's whole-day trip count (the count the MCP gives as a branch's trips) adds the trips of its route, direction and day that reach no row's end stop but run at least two thirds of its line, each going to the one row it covers best. A trip that reaches any row's end stop stays in that row's count only (CIV-1069: a row never takes another pattern's trips). The hour counts, first and last times and every frequency value still read the end stop.
- Why: the count was read only at the row's end stop, so a trip ending anywhere else was counted nowhere. RTD FreeRide toward Union Station showed 255 of its 296 weekday trips; the other 41 end at Union Station Loop.
- Counts before the change (release `release-mwxp2myj` against local feeds, weekday, read-only): 1,592 route-directions in 296 agencies were short 5,342 trips for certain (52,797 counted of 58,139); up to 2,706 route-directions and 21,912 trips where the feed or date may differ. The cloud dry-run diff gives the counts after.

### 2026-11-26 — A one-piece direction is one colour on the map (CIV-2994; supersedes #1839's "can only understate")
Ryan, 2026-11-26, picked "1": "Colour the whole stretch one colour on the map; each stop's own card keeps its own number", over "2" (every stop counts by one middle stop's clock; changes stop cards; new rebuild). He then picked "1. OK as written" for this rule text, word for word: "A one-piece direction is one colour on the map: where the same trips run a direction's whole length (a trunk and no branch), every stop takes the stretch's figure for the period, whether its own count reads faster or slower, because each stop counts its buses by its own clock. A stop with no service in the period stays uncoloured. Map colours only: each stop's card and published figures keep their own count. For one-piece directions this replaces B2's "a stop that breaks off keeps its own colour", including its rule that an Infrequent stop (over 60) breaks off. It supersedes #1839's "A slower stop keeps its colour … It can only understate". B2's aim is accuracy. No new number." Counts (release-mwvbser2 with its sections files, every day and period): 228,002 of 6,395,890 stop colour cells in one-piece directions change, in 15,323 route-periods at 442 agencies, all to the stretch's colour and all faster (#1839 had already lifted the stops faster than their stretch); most at LA Metro 770, TransLink 641, SEPTA 585. No stop card, published figure or rebuild changes.

### 2026-11-26 — C-TRAN is back in the MCP, crediting its required notice (CIV-3051)
Ryan, 2026-11-26: "1 but need to work on credit wording", then "1" to where it shows.
- The rule: C-TRAN comes off the MCP exclusion list. Its credit is the notice its licence requires word for word, shown when its pill opens in About → Schedule sources; the map's pill shows only "C-TRAN", as for other agencies.
- Why: C-TRAN's GTFS Data License Agreement (https://www.c-tran.com/about-c-tran/business/c-tran-gtfs-data, read 2026-11-26 in the CIV-3014 licence review) grants "use, reproduce, create derivative works of and redistribute" the data, accepted by using it ("By accessing or using the Data, Licensee indicates that it has read, understands and agrees"). It needs no written permission. It requires that "All Data derivative versions prepared by the Licensee shall bear the following notice: Reproduced with permission granted by C-TRAN. The information has been provided by means of a nonexclusive, limited, and revocable license granted by C-TRAN." It also bars C-TRAN's logos. CIV-2124 had grouped it with agencies needing consent before the page could be read.

### 2026-11-26 — A zone card drops its running line; only "Hours unavailable" stays (CIV-2900)
Ryan, 2026-11-24, on "Running during Saturday evening" above a zone's hours bars: "why do we need to say", then "But on fixed routes we don't show a 'not running at this time' notice when they're not running, so why is this one special"; he picked "1": drop the line for every state except "Hours unavailable" (his wording, 2026-10-27). The hours bars are unchanged. Noted, not asked for: a fixed route card does say "No trips from …" on a direction with no service in the period (CIV-1251), so a zone outside its hours now says less than such a route does.

### 2026-11-26 — The MCP says when a route runs all night, in place of first and last times (CIV-3032, #1867)
Ryan, 2026-11-26: "1, OK as written", his word-for-word OK on the MCP's all-night wording. Earlier: "if you ask 'what time is the first trip on the red line' is that different than 'does the red line run all night'" and "If a route runs 24/7 then should it say that". For a route that passes the Night Service rule, route_frequency gives this in place of first and last times:
- "Runs all night: every 30 min overnight (2–6 AM)" (his examples: the Red Line and AC Transit 800).
- "Runs 24 hours, 7 days a week", only when every hour has service in both directions on all three day types.
- Partial days name the days, e.g. "Runs 24 hours on weekdays and Saturdays".
No new number: the test is the existing Night Service rule.

### 2026-11-26 — TARC's held refresh is let through with the slowest-piece rule applied (CIV-3029)
Ryan, 2026-11-26, answering the Questions chat, picked "1": "Let it through: the next rebuild publishes TARC with the rule applied, like every other agency". Not chosen: 2, keep TARC held on its old figures. TARC had been held by the release check since at least 2026-11-24: 6 of its 12 routes read slower, because the CIV-2040 rule (approved 2026-11-21: a route's grade uses its slowest piece, since the trunk never covers the whole route) reached TARC for the first time. It is not a timetable change: the source zip is unchanged. Example: route 1 goes from every 15 to about every 62–64 min. The rebuild passes `--allow tarc:headway-shift`; his pick is the go-ahead for that R2 write.

### 2026-11-26 — The MCP may hold more detail than the map, but never contradicts it
Ryan, 2026-11-26: "can the MCP use info if we don't show it to end users", then picked "1": the MCP may hold more detail than the map (cards, lists), but must never contradict it. The same question gets the same answer, and a different answer is a bug. Not chosen: 2, the MCP shows no more than end users see.

### 2026-11-26 — A row without a letter shows the plain route number beside a lettered row (CIV-3036, #1871)
Ryan, 2026-11-26, asked "For the 504 why do some destinations now have a route like 504C but then below it none", then picked "1": a row without a letter shows the plain route number when another row in the same direction has one (e.g. "504 · to Dundas West"), display only. The TTC feed names the King replacement bus 504C (581 trips to Roncesvalles), while the streetcar rows mix plain 504 with a few 504A or 504B trips (362 and 27 to Dundas West), so under CIV-1456 they carry no letter. Over release-mwxd9t4l, after the card's per-period rows: 125 route-directions in 12 agencies gain the plain number (NJ Transit 25, TTC 30, CTtransit 20, GO 19, Brampton 10, Miami-Dade 9, London 5, Hamilton 3, TCAT, MiWay, RTC and Westmoreland 1 each).

### 2026-11-26 — A list's range keeps the card's one-gap note (CIV-3023, #1856)
Ryan, 2026-11-26, picked "1": "Keep the gap note after the range, so the list reads "every 26–45 min, with one 45 min gap" and matches the card", over "2. Leave it as it is". No new number. Counts (release-mwvbser2): 207 list cells at 78 agencies gain the note (most at NJ Transit 18, LA Metro 10, OC Transpo 10); the question's 209 included 2 cells whose list reads "Irregular" and shows no range (GO 21 weekday PM peak, MTA Bus BxM1 weekday late), which don't change. Where several rows at the slow end name a gap, the list names the longest, as a list row is the route's slowest showing (#1771).

### 2026-11-26 — A route's last time is its last boarding where trips start (CIV-2963, #1791)
Ryan, 2026-11-26, picked "1": "Merge it", over "2. Keep last times as they are". It completes his CIV-2229 pick of 2026-11-24 ("1": first times move to where trips start, last times stay at the reference stop for now). The last time is the last trip start of the direction's representative weekday; a night service's 0:xx trip counts as the night it ends; a route that runs all night shows no exact last time. Cloud dry-run pair (530 agencies, 14,527 weekday routes): 13,762 routes get an earlier last time (median 29 min, 90% within an hour), 175 a later one (late-night trips after midnight, trips that never reach the reference stop), 223 lose an exact last time (221 run all night; CDTA 93 and Coast RTA), 12 gain one (night routes); first times unchanged.

### 2026-11-26 — Fleet's "Not on a trip" is split out by vehicles parked at garages (CIV-2990, #1832)
Ryan, 2026-11-26, answering the Questions chat on #1832 ("Well those 622 buses aren't operating technically right so I have no clue"), after a plain-words recap (521 at garages, about 71 standing still elsewhere, about 30 moving without a trip), picked option 1: show it split, "Not on a trip: 622, of which 521 at garages" (the count stays, nothing hidden). He then gave his word-for-word OK on the rule's three numbers: under 1 m/s, groups of 5 or more, within 100 m (GARAGE_STANDING_SPEED_MS, GARAGE_MIN_VEHICLES, GARAGE_RADIUS_M in shared/rules/live.ts). The cloud recorder counts it in each snapshot. TTC check with the rule, 2026-11-26 04:42 UTC: 704 on a trip, 516 with none, 459 of them at garages.

### 2026-11-26 — Where an agency's file gives only a street, a direction reads its last stop (RTC first; CIV-2999, #1846)
Ryan, 2026-11-26, picked "1": "Name the end of the line where an agency's file only gives a street: for RTC, show each direction's last stop instead (for example "to South Strip Transit Terminal")". The manager settled the form on Ryan's "RTC first": an agency setting (`headsignFromLastStop`), not an automatic rule, since Atlas can't tell a street from a destination by itself (both directions sharing a name matched 617 routes at 176 agencies, most of them loops and real terminals).
- What: a headsign that carries a direction word ("101 Rainbow Northbound") takes the last stop most of its trips end at, tidied: a leading EB/NB/SB/WB and a trailing "Bay N" go, and "X before/after Y" reads "X & Y". RTC's Red Line reads "to Wellness & Willow" and "to South Strip Transit Terminal".
- Counts (RTC dry run against main without the setting): 73 of 77 weekday route-directions on 37 routes change name; 300 → 300 drawn patterns (only the name changes: a headsign's trips stay one row, and a headsign whose stop another already took keeps the feed's name; manager, 2026-11-26: Ryan asked for the destination name, not more rows); no map wait changes (702 route-day-periods compared).

### 2026-11-26 — A direction running every 60 min or better always has a card row (#1857, CIV-3022)
Ryan, 2026-11-26, answering the Questions chat, picked "1": "Add the missing row, for directions running every 60 min or better". He asked "Why 60 though": 60 is the last public grade (10/15/20/30/60), his own CIV-1959 words "if it is less than hourly then it is infrequent", and the cut-off the first count used. He confirmed 1 with 60.
- Built on release-mwvbser2 (226,564 card rows): 191 rows added in 110 routes of 58 agencies (Winnipeg 31 weekday PM "to The Forks every 28"); 5 of them read "Runs irregularly in this period" (the row's own trips fall under the 4-trip minimum). RTC 212's 7 rows lose their "to Direction 2" label, since the card now shows both directions under their own headings. No other row changes. A direction whose hidden branch has no name or no number of its own still gets no row.

### 2026-11-26 — Intercity agencies are added like the rest, hidden until checked (CIV-2239)
Ryan, 2026-11-26: "For Intercity we already have Bustang is my point", then "1" on adding Ontario Northland and Brightline hidden like the CIV-2237 agencies, then "1" on visibility: new ones go in hidden until checked.
- What: Ontario Northland (22 routes, intercity bus plus the Northlander) and Brightline (1 rail line) are added with hiddenInProduction; the Northlander keeps the feed's route type. Counts: 2 agencies, 23 routes.
- Earlier, the CIV-2237 brief said to flag intercity agencies rather than add them; that instruction is superseded.

### 2026-11-26 — A list's range has no width cap where its slow line has its own number (CIV-2909, #1786; supersedes Ryan's 2026-11-25 "up to 6 times")
Ryan, 2026-11-26, answering the Questions chat, picked "1": "No cap. A range shows when its slow line runs regularly enough to get its own number (3 or more evenly spaced trips)", over "2. Keep 4×". It replaces his 2026-11-25 pick "Allow up to 6 times" (logged here for the first time; superseded by 2026-11-26 / CIV-2909). The asked counts: 285 more ranges, 62 stay blocked (the slow line's trips aren't evenly spaced, mostly service that changes partway: CTA 36 "every 16 min until 5:07 PM, then every 61 min"), and the 6 routes whose slow end is the shared stretch keep 4×. RTD 31 weekday PM peak's list reads "every 10–60 min"; "until 5:14 PM" stays on the card only. Built on release-mwvbser2 (160,965 list cells): 288 cells gain a range past 4× and 2 more read a range within 4× once their words drop, in 57 agencies (NJ Transit 53, TTC 30, SEPTA 17); 27 of them lose "from"/"until" words in the list. Cards, grades and map colours are unchanged.

### 2026-11-26 — Speed's minimums: starting values, checked after the first build (CIV-2919)
Ryan, 2026-11-26, answering the Questions chat, asked "How did we come up with these numbers?" and picked option 1: "Use them as starting values and check later". Speed's minimums: a stretch at least 400 m long, at least 7 weekdays of data, at least 30 trips in total, at least 10 trips in each time-of-day slot; below that it shows no figure ("Not measured"). 400 m, 30 and 10 are untested prototype guesses (CIV-2919's M2 prototype); 7 weekdays is Strategy's proposal. After the first build they are tested on TTC, HSR and MBTA routes, and Ryan gets the counts of how many stretches go blank before anything ships. Method (CIV-2919, Ryan): average speed by time of day, no baseline.
Checked 2026-11-26 after the first build (local runs, nothing uploaded): TTC 504 shows 45 of 62 stretches (the 17 blank are short-turn patterns seen on 1 or 2 weekdays); HSR 5 (169 stretches) and MBTA 66 (46) are all blank only because their recordings don't yet reach 7 weekdays (without that minimum, 164 of 169 and 31 of 46 would show). Ryan picked "1": "Keep the minimums as they are; HSR shows once it has 7 recorded weekdays (around Nov 27) and MBTA a few days later", over "2. Lower the weekday minimum to 4 now".

### 2026-11-26 — Studio splits into now, past and plan; the new view is "Speed" (CIV-2917; supersedes CIV-2924's "Delay is kept for the clear-street measure")
Ryan, 2026-11-26, answering the Questions chat on Strategy's layout review (screens checked on 5182, compared with Swiftly, Optibus and Remix), picked "1": "This split, with Speed", over "2. Keep Performance as a separate tab next to Live, as planned" (trip time and lateness then appear twice). Studio splits into now (Live, Fleet: map panels), past (Performance: a full page) and plan (Schedules: a full page, starting from Studio's mock-up, option 5 on CIV-2182). Live's weekly late figures move into Performance; today trip time shows in three places and lateness in two. The new view is "Speed": the method picked on CIV-2919 is average speed with no baseline, and "Delay" implies one. It shows average speed by stretch and time of day, plus recorded trip time beside the timetable's on the route card's chart. This replaces the 2026-11-25 picks of a "Performance" tab and a "Delay" view (CIV-2917's first comment).

### 2026-11-24 — A card row with a wait over an hour needs 4 of its own trips for a number (CIV-2232; logged 2026-11-25 with #1827)
Ryan, 2026-11-24, answering the Questions chat on CIV-2232. First, "1" to "Need at least 4 trips in the period to show a number; 2–3 trips read Irregular" (over "2. Keep 3 as today"). That changed 10,779 cards, not the 542 first shown, so it was re-asked, and he picked "1": "Apply the 4-trip minimum only when the card has no 'from …' or 'until …' words." Service that starts or ends in the period keeps its number (about 5,000 cards changed).
- The rule: a route card row whose period wait is over PERIOD_COVERAGE_MAX_HEADWAY (60 min), with fewer than `MIN_CARD_ROW_DEPARTURES` (4) of its own trips in the period and no "from …"/"until …" words, reads "Runs irregularly in this period". Card wording only: the colour and the filter are unchanged. Built in a08c19d (CIV-2232). The number had not been logged here until now.
- #1827 (2026-11-25): branch rows skipped it. A branch whose piece has no number took its own trips' reading back (SEPTA 20 Sunday evening to Frankford Transit Center: 3 trips, "every 171 min"). Branch rows now follow the same rule: 173 card rows in 57 agencies go from a number to "Runs irregularly in this period" (NJ Transit 32, SEPTA 13, MBTA 8), and no other row changes (release-mwvbser2, 226,564 card rows).

### 2026-11-26 — TTC Lines 1 and 4 keep their timetable's seconds; every other route reads whole minutes (#1824, CIV-2959)
Ryan, 2026-11-26, answering the Questions chat, picked "1": "Merge it for Lines 1 and 4" (branch fix-1824-ttc-seconds, 0535e5a18). Earlier, on whether this broke the no-train-rules rule: "That is not a special rule for trains - that is a agency-specific fix which I never said 'no' to." TTC's config lists the routes in `secondsRoutes`; their times keep seconds, and every other route in every agency drops them, as whole minutes always did. 12 figures change, all TTC, none crossing a frequency grade, nothing in any other agency: Line 4 every 5 → every 6 (the timetable runs every 5½ min); Line 1 weekday evening every 4 → every 3, Saturday evening and Sunday midday every 5 → every 4 (timetable gaps 2:40–3:29 and 3:53–4:25). Line 2 is left out: read to the second, its weekday morning (every 2:21) read every 6. Not picked: 2 (keep whole-minute readings), 3 (before/after page first). Earlier candidates not taken: seconds everywhere (545 cells read faster), "never faster" (4,248 cells one minute slower), and a 50%-of-timepoints detection rule (757 cells in 31 agencies).

### 2026-11-25 — The full-day chart's title line names the hovered hour, "5 AM: every 15 min" (#1820, CIV-2950)
Ryan, 2026-11-25, on CapMetro 801 Southbound's "Overnight every 15 min" ("Is this overnigth every 15 not wrong and/or bad"): "Actually 1" (the title names the hour, not its period), then "1" to "5 AM: every 15 min", with the colon, as the hourly hover reads ("2 PM: every 30 min"). The 801 has no overnight service; the 5 AM hour's 15 came from its one trip at 5:57 and the next at 6:12, and the title put the period's name beside it. The title is built by the hover's own function (formatHourTitle; trip time by formatTripTimeTitle), so the two can't drift. Across all published agencies 1,854 routes showed an overnight hour's figure in a period with none.

### 2026-11-25 — Zoomed out, the overnight and frequent-service views say "Zoom in to see the routes." (#1817, CIV-2946)
Ryan, 2026-11-25, on the overnight view's "Zoomed out. Some less frequent routes are hidden." ("feels funny here lol"), then "1". Below the detail zoom these views load no route data and draw no route at all, so both show "Zoom in to see the routes." (one line in noticeCopy). The overnight list had reused the frequency map's note (CIV-1337: "reuse this exact string"), which now stays only in the frequency map's export. The frequent-service view, which had shown nothing, gets the same line in a card under its info card.

### 2026-11-25 — Studio Fleet leads with right now (CIV-2182)
Ryan, 2026-11-25, after the review page: "That not is way the fuck too long but 1", then "Approved". Fleet's agency panel is the right-now design for everyone: "In service now" (the cloud recorder's whole-network count, CIV-2939; the row is left out where there is no count), "Scheduled now" (the vehicles the schedule runs, not those its frequencies would need: 1,790, not 1,819, for the TTC at the evening rush), then a chart of each time of day with the route card's hover. The caption is the route count with no date (Ryan: "the question was why the fuck is this date here at all"). A row with no figure is left out, never a dash; "Scheduled now" is left out on a Saturday or Sunday (the fleet file is weekday only, CIV-2941). Next, once Data counts only vehicles on a trip: "In service now" becomes vehicles on a trip, with a quieter "Not on a trip <n>" row only where the feed reports trip-less vehicles (manager, relaying Ryan).

### 2026-11-25 — Studio Live's map draws "Not measured" dashed, apart from "Under 0.5 min" (CIV-2912)
Ryan, 2026-11-25, answering the Questions chat after seeing the review page (TTC 504, before and two options), picked "1": "Not measured" drawn dashed on Studio Live's map, so "Under 0.5 min" and "Not measured" look different. The two were the same grey on the map and near-identical greys in the key. A stretch with no figure now draws dashed (the page map's dash pattern for dashed route lines), and the key's swatch is the shared dashed swatch Studio Fleet uses for its earlier schedule. Step colours are unchanged. Option 2 (thinner and faded) and option 3 (keep as is) were not picked.

### 2026-11-25 — An explainer may skip its third paragraph when the reader has nothing to do; E11 "Late departures" (CIV-2222)
Ryan, 2026-11-25, on E11's body, word for word: "We check each vehicle's location once per minute. The departure times can be up to 30 seconds off, so we add a 30 second buffer to the limit to allow for this." That is the whole page. Asked whether it needs a third paragraph: "Do we need a third paragraph then", then "1" (no). Title, his pick: "Late departures". E11 opens from N133, line B: "<Agency> doesn't publish its on-time window, so Atlas counts late as more than 5½ min behind schedule.", shown under Live's week figures (Live map and Studio) for an agency with no published on-time window. The explainer layout rule in TEXT.md (Card notices) now says paragraph 3 is left out when the reader has nothing to do.

### 2026-11-25 — Live's timetable measures read "Schedule adherence" and "Typical deviation"; "Delay" is kept for the clear-street measure (CIV-2924; supersedes CIV-1602's "Delays start")
Superseded in part by 2026-11-26 (CIV-2917): the clear-street view is named "Speed", not "Delay".
"Schedule adherence" superseded by 2026-11-27 / CIV-2924: the label is "Lateness".
Ryan, 2026-11-25, picking "1" after rejecting "Behind schedule" (""delays start" and "behind schedule" sounds fucking stupid in a professional product"), and on the section: "Why not just Schedule adherence wtf does by stretch mean". The timetable measures "Falls behind" and "Delays start" become one label, "Schedule adherence"; "Typical delay" becomes "Typical deviation"; the Live section "Where delays start" becomes "Schedule adherence". CIV-1602's "Delays start" (never logged here; recorded in the code and the style guard) is superseded. Labels live once in shared/liveWording.ts. Open: Studio's Measure menu lists "Falls behind" and "Delays start" as two measures, so it keeps "Falls behind" until Ryan says whether Studio drops one (asked on CIV-2924).

### 2026-11-24 — E10 (Official data) drops "The agency's website has its current schedule." and its link
Settled by the no-booking-or-trip-planning rule ("Atlas is not a trip-planning tool; no booking info", 2026-11-24; Ryan: "this isnt for ppl using it like google maps"): Atlas never points riders elsewhere to plan or book. Only E10's paragraph 3 goes; the card lines stay as today (CIV-2896 tabled) and E2's own line is unchanged.

### 2026-11-24 — The Live route card's row for vehicles with no matched destination reads "No destination" (CIV-2901)
Ryan, 2026-11-24: "No Destination might be better", then "1" (sentence case). Replaces "Not matched to a destination" on the Live route card's destination rows; the label lives once in noticeCopy.

### 2026-11-24 — A stretch's colour changes only where the branches split (CIV-1565, #1093; supersedes the 2026-11-19 end-piece rule, V0)
Ryan, 2026-11-24, to Strategy: "we shouldn't show *incorrect* info. But realistically we also shouldn't usually ever need to show those random sections of a different colour outside of branches or short turns." Answering the Questions chat: "1", build "the colour changes exactly where the branches split"; V0 stays until this replaces it. Then: "Just think it would look very odd if we have a single section between 2 stops where the colour is different".
- The rule: a drawn stretch (failing routes' shared stretches and passing routes' partial pieces) is cut only where the patterns pooled at its stops change, read from each pattern's shared stretches; a range end is a split stop when its own stretch ends there or its matched opposite stop ends an opposite shared stretch. Each section takes its worst stop's value; the joining piece takes the worse side. A range end whose nearest opposite stop is served by fewer opposite patterns than its neighbour's (past the opposite split, e.g. TTC 123 at North Queen / The East Mall) reads the neighbour's opposite value, never better than its own.
- Counts (release-mwurc2jb, 17 agencies in Canada and the US, every day type, period and public threshold, against V0): shared stretches 409,252 stop-to-stop pieces, 11,668 better, 1,723 worse (V0 end pieces away from a split going back to the stretch's worst stop), none better than this direction's own two stops. One-segment pieces in a worse colour: 388 before (74 away from any split), 311 after (none away from a split). Passing routes' partial pieces: 257,451, 12,636 better, 265 worse.
- Attempt 2 (2026-11-24, after the manager's sample check of attempt 1: 33 stretches painted whole by one slow end stop, 0 of 12 sampled fair, e.g. SEPTA 26 every 13-25 drawn as 51): the end-piece rule is kept inside each end section. Against V0: 11,744 pieces better, 1 worse (Hamilton 05, a 30/31 piece at a real split), 0 better than this direction's own stops; one-segment end pieces away from a split 75 (V0 74); passing partials 12,730 better, 1 worse.
- Still open for Ryan: those 75 end pieces away from a split remain (his "single section" concern), and one-minute tier-edge end stops (16 among 15s) keep their own piece; folding them in needs a number.

### 2026-11-24 — A full-window wait over 60 minutes reads "Runs irregularly in this period" on every route card row (#1766, CIV-2223; overrides CIV-1074 2a / #1239 "shown as is")
Ryan, 2026-11-24: "1", answering the option that any route-card row whose full-window wait is over 60 minutes reads "Runs irregularly in this period".
- The rule: a row whose full-window wait is over PERIOD_COVERAGE_MAX_HEADWAY (60 min) reads "Runs irregularly in this period" instead of "every N min", unless its start or end words explain the wait. Card and list wording only: the map colour and the filter are unchanged.
- Supersedes CIV-1074 2a / #1239, which let such waits print "as is" (313 shown as is); that rule lived in FREQUENCY_RULES.md and style/TEXT.md (both updated), with no log entry of its own to mark. Waits of 60 minutes or less keep their words.
- Count on the cached release (355,310 row-periods): 676 cards in 123 agencies change from "every N" over 60 to "Runs irregularly" (NJT 57, CTA 42, TTC 38). Example: TTC 101 to Wilson midday, two trips 320 minutes apart, read "every 320 min".
### 2026-11-24 — On-demand zones are hidden under any frequency filter (CIV-2898)
Ryan, 2026-11-24: "on demand doens't have deadways so why do they show up if i select 10 mins lol"; he picked "1": hide on-demand zones whenever a frequency filter is set, and show them only with no frequency filter (all service). Before, the filter checked only routes and zones showed by their hours alone. The MCP's on_demand_zones takes no frequency filter, so the rule doesn't apply there.

### 2026-11-24 — Atlas is not a trip-planning tool; no booking info (supersedes CIV-1784's partial removal)
Ryan, 2026-11-24: "THis is like the 6th time i have said to remove the on demand booking info i fucking swear to god". Earlier, CIV-1784: "this isnt for ppl using it like google maps". CIV-1784 (8e84819) removed only the booking link and kept the booking text. Now every booking field is deleted from config/on-demand (81 fields in 44 files) and src/data, the zone card's Booking section and the MCP's booking field are gone (MCP 0.24.0), and a guard test fails if a booking field or booking text (app names, phone numbers, booking-ahead wording) reappears in zone text.

### 2026-11-24 — The MCP's hourly rows list every branch running in the window, and an hour with a lone trip says so (#1788, CIV-2890)
Ryan, 2026-11-24 (relayed by Atlas Manager): "1", picking the periods' existing words for an hour with departures but no regular gap, plus the missing branch columns.
- The rule: route_frequency's hourly rows give a column to every branch with a trip in the asked window, and an hour with departures but no regular gap reads "some trips (N), but no regular frequency" instead of "no regular trips".
- Counts (529 agencies × route-days × the 6 period windows, 193,224 answers): 653 gain a column; 88,653 change wording.

### 2026-11-24 — When a period's service changes partway, the route list's number alone is the slower one (#1771, CIV-2228)
Ryan, 2026-11-24 (relayed by Atlas Manager): "1", picking option B of the side-by-side test: always the slower number. No new number.
- The rule: where the route list can't show the card's words and they name a change partway through the period ("every 4 min until 9:17 AM, then every 6 min"), the list's number is the slower of the two. STM 1 weekday midday reads "every 6 min" (was "every 4"), matching its wait and the schedule.
- Counts (published release, 8 agencies: STM, TTC, MBTA, TransLink, Hamilton, OC Transpo, CTA, YRT): 128 of 19,146 list cells change. CTA 53 Saturday late reads "every 20–31 min" (was "every 7–20").
### 2026-11-24 — A card's range still runs to the slowest branch when the trunk sets the headline (#1775, CIV-2232; extended to every agency by 2026-11-27 / CIV-3080)
Ryan (2026-11-24, relayed by the manager) picked option 1 for RTD 15: the card should say "every 10–30" (main stretch every 10, east branch past Colfax & Billings every 30), matching how 15L and 12 already show a branch (frequency rule 3).
- The rule: where CIV-1959 B1 reads a direction's headline from the trunk alone, the card's range still runs from the main stretch to the slowest branch that counts in the period (rule 3). A branch whose reading is only its wait to the period's edge (#1749) adds no range, and nor does a branch over an hour (PERIOD_COVERAGE_MAX_HEADWAY): it keeps its own row (Ryan on RTD 31, CIV-2232: "For the branch we wouldn't show 10-71"). A branch at exactly an hour does count: Ryan, 2026-11-27 (relayed by the manager, CIV-3080), picked "1": RTD 31 weekday PM reads "every 10–60", the same as RTD 15, over a new "60 or more" cut. This supersedes his CIV-2232 "1" to the card reading "every 10" with the far-north branch on its own line. The headline number, the filter and the map colour do not change.
- Why it was missing: B1 took the branches out of the value the range is built from, so the range's two ends were both the trunk's number and no range showed. B1's own guard (a rider never sees a branch hidden behind a faster trunk number) was not met.
- Counts (cloud dry-run pair for RTD, 2026-11-27, base f5b086bc2 against c60d64cb1): only the card range changes; 7 routes, 12 route-days and 37 cells gain a range, none lose one. 15 weekday 10–30 (evening 15–30); 31 weekday 10–60 (evening 30–60); JUMP, 65, 120, 121 and 15L gain ranges; 76 Sunday unchanged. No branch over an hour reaches a range.
- Low end (2026-11-27, #1902, CIV-3113; consistency pick by the manager inside CIV-3080, matching the route list, Strategy's clincher): when a branch sets the high end, the range starts at the trunk's value, the number the route list uses. TTC 102 weekday midday reads "every 10–30", not 5–30. An uneven trunk's typical gap (#1142) stays on the main stretch's own row ("every 5–10"). Counts (CIV-3080 sweep, 9 agencies): the 17 cells that already had a range and got wider (TTC 13, SEPTA 3, STM 1).

### 2026-11-23 — A branch's wait to the period's edge no longer sets the route's value (#1749, CIV-2196; overrides CIV-1241)
Ryan, 2026-11-23 (relayed by Atlas Manager New): "1", answering "Option 1: a branch whose only long wait is to the period's edge no longer sets the whole route's figure; its own row still says "until 0:53". No new number. [...] Trade-off: overrides CIV-1241 (on the branch after it stops there's no service, but the route reads the trunk's figure). 1. Apply option 1 (Recommended) 2. Keep CIV-1241 as is".
- The rule: a branch (tail) that starts or stops partway through a period, so its full-period wait is over the coverage cap while no gap between its buses is, is left out of the direction's value and filter. Its own row keeps its reading ("every 10 until 0:53"). A handover tail (#1072) still counts.
- This overrides the 2026-11-01 CIV-1241 entry below where it let such a branch's full-period wait set the route's value; the row wording from CIV-1241 is unchanged.
- Cloud dry-run pair (723680b vs 5bb572e): 704 of 160,630 route-periods change, all faster; 495 change public grade, in 467 routes across 141 agencies. TTC 501 Late 66 → 10, 504 Late 61 → 10, 939 Evening 63 → 18.

### 2026-11-23 — The Frequent service story's coverage section reads a weekday window the reader picks, 7 AM–7 PM by default (CIV-2013)
Ryan (2026-11-23, relayed by Atlas Manager New): "1", option: the chart uses the 7 AM–7 PM weekday window (window-frequent, run 45115615007), giving Canada 42→48 metros and US 151→169, and the chart label names the window. Then: "Thought we were going to let people choose between 7-7 or 7-10". His OK for this period-window change.
- The rule: the coverage figures judge a route across one weekday window, read as one period (the map's frequency test, a branched route by its shared middle), instead of each of AM peak, midday and PM peak, so a route need not run from 6 AM. A picker offers 7 AM–7 PM (rule 9's Frequent Service window, the default) and 7 AM–10 PM (the weekday grading window); the bounds come from pipeline/tripSets.ts CHART_WINDOWS.
- The picker switches the whole section, since the national pair is the chart's first row: the national figures, the cities, both screen-reader tables and the "about N times as many" sentence.
- Counts against the AM / midday / PM rule (run 45079795875): 7 AM–7 PM, Canada 42→48 metros (30-min 60.37%→66.1%, 15-min 29.04%→36.01%), US 151→169 (26.77%→29.84%, 13.88%→15.8%); 7 AM–10 PM, Canada 42→42 (60.37%→60.49%), US 151→120 (26.77%→22.64%, 13.88%→11.28%).
- The chart's metro rule is unchanged. London, Oshawa and Windsor leave the 7 AM–7 PM chart because they now have 15-minute service in the window, so the "nobody at 15 min" slot no longer picks them.

### 2026-11-23 — No route card names a gap over an hour; it reads "Runs irregularly in this period" (CIV-2171)
Ryan (2026-11-23, relayed by Atlas Manager New): "1", option: cap it at an hour, the same as #773's gap words, so no card names a gap over an hour; a longer gap reads "Runs irregularly in this period".
- The rule: a route card row whose words would name one gap over PERIOD_COVERAGE_MAX_HEADWAY (D6's one-gap words, "every 5 min, with one 169 min gap", and #1239's main-stretch gap words) reads "Runs irregularly in this period" instead, as #773's gap words already do (#962: a wait over an hour is no cadence). A gap of an hour or less keeps its words.
- Card wording only: the map colour and the filter do not change. No new number: PERIOD_COVERAGE_MAX_HEADWAY, imported from its one home.
- Counts (local, all 551 published agencies, 163,810 period cards, what the card shows): 879 cards change in 204 agencies (NJ Transit 43, BC Ferries 24), none in the shared row, and every one is a gap over an hour turning to "Runs irregularly". The 878 shown to Ryan missed one card whose gap is a fraction (Waco TL-8 weekday AM, "with one 80.9 min gap").

### 2026-11-23 — After "until …, then", one long wait is named as a gap, not read as the later cadence (#1724, CIV-2169)
Ryan (2026-11-23, relayed by Atlas Manager New): "1", option: after an "until…then", name one long gap ("then every 25 min, with one 37 min gap") only when exactly one wait after the slowdown is over 1.5× the typical wait and is an hour or less.
- The rule: in CIV-1913's slow-end reading, when exactly one wait after the time is over ROW_GAP_WORDS_RATIO times the typical (middle) wait of the slower part and that wait is PERIOD_COVERAGE_MAX_HEADWAY or less, the card says "then every M, with one G min gap". M is the longest of the other waits, rounded up, so the slower part still never reads better than it runs. Otherwise "then every N" keeps the longest wait.
- Brampton 1 eastbound weekday evening: every 12 until 7:42 PM, then 18–25 minutes apart with one 37 (10:16 to 10:53). Before: "then every 37"; now "then every 25 min, with one 37 min gap".
- Card wording only: the period's value, the map colour and the filter do not change. No new numbers: #773's gap words (ROW_GAP_WORDS_RATIO, PERIOD_COVERAGE_MAX_HEADWAY), imported from their one home.
- Counts: cloud dry-run pair (main c6cb444 run 45186394924 against 868d66966 run 45197514723, both run_at 2026-11-23T14:00:00Z): 101 cards (agency/route/day/period) in 44 agencies gain "with one N min gap"; 206 direction rows. Nothing else changed: no route or direction figures (map colour, filter), steadiness or other card words.

### 2026-11-22 — A card row's "limited" state reads the period, not the all-day grade; a long gap is named or reads irregular (#773)
Ryan (2026-11-22, relayed by Atlas Manager New), shown the per-period version with its counts and the TTC 43 and CTA 9 cases: "1", option "Use that version, but fix TTC 43 and CTA 9 first and bring back fresh counts before it merges (Recommended)". Earlier, on the all-day grade deciding: "Look into it more". On the gap choice that followed (gap words, or the existing 1.5× limit sending such rows to "Runs irregularly"): "I can't decide - ask Strategy to decide". Strategy picked gap words.
- The rule: on a period's route card, a row is limited (and stays out of the shared stretch) when, in that period, it has fewer than MIN_SCHEDULE_DEPARTURES of its own departures, no regular service (the card's "Runs irregularly in this period") or a value that is one gap between a few departures (#955). The all-day "infrequent" grade decides only the All day view.
- Kept regular: a row that starts late or ends early in the period (its own period edge, or its stretch's edge words that it carries, #934 / #1276: "every 30 min until 12:24 AM"), and a row that reads its stretch's words is not held to its own trip minimum.
- Gap words: a row the all-day grade called infrequent, with no words of its own, names its one long gap where it is at least ROW_GAP_WORDS_RATIO times its number (#1239): Halifax 54 evening "every 30 min, with one 60 min gap". A gap or full-window wait over PERIOD_COVERAGE_MAX_HEADWAY is no cadence (#962): the row reads "Runs irregularly in this period" (CTA 9 to Vincennes midday, two bursts 313 minutes apart; LA Metro 108 to Mesmer / Major PM, a 167 min gap).
- TTC 43: a row the all-day grade called infrequent that runs steadily keeps its own value where the stretch is materially better (SHARED_STRETCH_RATIO), unless it carries the stretch's words, so the card keeps "Shared stretch every 5" in the morning and "every 7" in the afternoon, with Village Green Square every 20.
- Why gap words (Strategy): its failures are cautious, a row with a long gap goes to "Runs irregularly" (CARTA 16 midday to Northgate, 8 trips every 40 with one 80 min gap), while the 1.5× limit's failures show false numbers (TriMet 76 Sunday evening to Meridian Park reads 60).
- No new numbers: every limit is an existing one (MIN_SCHEDULE_DEPARTURES, ROW_GAP_WORDS_RATIO, SHARED_STRETCH_RATIO, PERIOD_COVERAGE_MAX_HEADWAY), imported from its one home.
- Counts (local, all 551 published agencies, 163,810 period cards, what the card shows: words or the dot's colour): 2,258 cards change in 291 agencies, 221 of them in the shared row (2,159 when chosen, before the route lists were made to agree with the card). The 1.5× limit would have changed 900.

### 2026-11-22 — Trains keep one rule of their own: a train card reads every trip to its destination, whatever its shape (CIV-2025, #1712)
Ryan (2026-11-22, relayed by Atlas Manager New): "1", answering "Keep this one rule for trains only. Today's train numbers stay, and no bus rule changes (Recommended)". The other options were a version for every mode (built and tested: it broke 19 settled bus rules, e.g. TTC 40 to Dundas West read every 11 where each branch runs every 22) and more research on an every-mode rule. His explicit OK for this mode-specific rule; the other 24 train-only rules stay removed (his "1" of 2026-11-21).
- Why: with trains read like buses, a train card read only the trips on its drawn shape. Hand checks against timetables: NYC 1 to South Ferry read every 7 in the AM peak (really every 5: its short trips from 238 St and 207 St have shapes of their own), SEPTA's Girard trolley every 20 (really every 10, over three shapes), and MARC lost 15 of its 61 stations (nearly every train has its own shape). This one rule put 396 of the 524 changed train cards back.
- Rule (the train destination reading): a train line's stop data is read by its headsign first, with the converging origins of one headsign kept apart (CIV-1152, CTA Green to Harlem), and its pattern for pooling is its route and headsign. Every other route reads its shape first. process-core asks whether a route is a train for this rule only; pipeline/__tests__/trainOnlyRules.test.ts allows it by name.

### 2026-11-22 — The Live Full report groups each kind of figure together (CIV-284)
Ryan (2026-11-22, relayed by Atlas Manager New), shown the Full report regrouped as built: "1" (approved as built).
- The Full report's own parts, the Dashboard's and Full analysis's sit side by side by what they show: the week, along the route, late departures by hour, stops most often late, trip time, where delays start, extra wait, where bunching forms, service delivered, then "How this is measured".
- Content is only moved: nothing deleted or reworded, no new headings.

### 2026-11-22 — The Live Full report keeps one copy of each figure, no graphic removed (CIV-2128)
Ryan (2026-11-22, relayed by Atlas Manager New), on the review page's 11 questions: "Honestly you decide but don't remove any graphics/interactives yet if that makes sense". Picks: 1a keep Full analysis's week comparison and the Dashboard's note under its tiles, drop Explore's and the Dashboard's identical tiles; 2c, 3c, 5c, 6c, 7c, 8c, 9c keep all; 4a keep Explore's table and Full analysis's map, drop the Dashboard's five stops (the top 5 of Explore's table); 10a keep Explore's "How this is measured", drop the Dashboard's and Full analysis's; 11a leave the Time of day pick as it is.
- Why: the dropped parts repeat another copy exactly; no chart, strip, map or interactive is removed.

### 2026-11-22 — The MCP page's new words, dev server only (CIV-2155)
Ryan (2026-11-22, relayed by Atlas Manager New), shown the words not asked for with options 1 approve as proposed, 2 change: "1".
- Contents, one word each: Answers, Tools, Freshness, Connect, Testers.
- Tool groups: Find, Schedules, Changes, Planning, Live.
- Connect: "In Claude Code, the same link is one command, with nothing to install:" with `<your link>` in the command.
- Hosted only: Ryan, after approving, "I don't want people downloading MCP atlas though i only want them using the hosted version". The page's local setup (its line and the Claude Code, Claude Desktop and Antigravity commands) is gone, and scripts/mcp/README.md (the repo is public) no longer gives the local commands; they stay on this Mac outside git for our own test rounds.
- Why: Ryan, "in the table of contents the headings should be 1 word", "For the tools should we group them together at all on the page too", and "how was [a tester] able to add it to his claude code with a line of code".

### 2026-11-22 — The weekday-to-Sunday story's words, dev server only (#1074, CIV-770)
Ryan, 2026-11-22 (relayed by Atlas Manager): "1 yes like onlyl ocal right now". He was answering the word list for /research/weekday-to-sunday (_reports/1074/WORDS.md, 31 items).
- All 31 wordings are approved, with heading 1 changed to "Where does frequent service go on Sunday evening?": "night" becomes "evening", to match the period name.
- The page stays on the dev server only (FALLOFF_STORY_ENABLED follows RESEARCH_APPS_ENABLED).

### 2026-11-22 — Studio Live's route panel wording, items 3–8 (CIV-2021)
Ryan (2026-11-22, relayed by Atlas Manager New), shown the items still proposed with options 1 approve as proposed, 2 change: "1".
- 3. A route with no live reading: "No live reading for this route right now."
- 4. A held route's line: "Its delays are hidden because <reason>." or, when even gaps aren't trusted, "No figures: <reason>."
- 5. A stop pair's sample: "Based on 120 trips over 5 days".
- 6. A gap under a minute in seconds: "54 sec apart".
- 7. About, Live part, bunching: "Bunching is the share of gaps between vehicles at a stop that were under <bunched limit> (vehicles running together) or more than twice the scheduled gap (a long wait)."
- 8. The route's week table label: "Recorded past service, not live."
- Why: Ryan, on the earlier panel: "I'm confused what I am looking at here if live information is unavailable". Items 1, 2 and 3's second line were dropped when the panel took main Live's Right now card.

### 2026-11-22 — The first and last trips' waits keep counting on the map, cards and filter (CIV-2013)
Ryan (2026-11-22, relayed by Atlas Manager New), asked whether the filter should ignore the wait before a route's first trip of the day, or after its last: "You tell me but really think about this". Decided with Strategy: no. CIV-238 (2026-11-19) stands for the map, the route cards and the filter.
- Why: ignoring the first-trip wait would lift routes whose one direction has no service for the first hour of AM peak. BART Red toward Richmond (first train about 7:00), CTA 11 toward Howard and TTC 32 toward Renforth would read every 20, 18 and 8 for all of 6–9 AM, although that direction runs nothing from 6 to 7. The card already says "every N from 7:00" (CIV-1411, card wording only).
- Counts it rested on (cloud dry runs 45039609341 base, 45043094165, 45037720037): ignoring the first-trip wait changed 404 AM-peak results at every 30 and lifted 232 routes to every 30 all weekday (118 agencies). Ignoring both ends lifted 265.
- Side effect kept: 25 small metros whose buses start between 6:30 and 7:00 stay off the frequent-service city chart under its current test (every weekday period from 6 AM). Whether the chart should judge on a daytime window instead is a separate question for Ryan; it does not change the map.

### 2026-11-22 — MCP asks for a question ID; privacy line (CIV-2145)
Ryan (2026-11-22, relayed by Atlas Manager New), on the privacy line as drafted: "1".
- The rule: every Atlas Studio MCP tool asks for the question and a question ID the assistant makes up, both required in the schema; the hosted log keeps the ID so calls for one question group together.
- The privacy policy says: "Every tool also asks for your question, which is the assistant’s summary of what you asked, and a label the assistant makes up to group the calls made for one question. The assistant writes both, so the question may not match your words, and an assistant can still leave them out."

### 2026-11-22 — MTA and NJ Transit readings are reads, not changes (CIV-460 Q2, CIV-2123)
Ryan (2026-11-22, relayed by Atlas Questions), to keep Atlas's readings of MTA and NJ Transit data: "1".
- The rule: these readings stay. They are how Atlas reads the data, not changes to it, so they sit within MTA's "will not modify" and NJ Transit's "as-is" terms.
- The same holds for Foothill Transit (added by CIV-2125): its Developer License Agreement says "Licensee may not modify Data or create any derivative works based on Data", so Atlas's readings of its data stay and it stays in the MCP.
- The readings kept: NJ Transit light-rail classification, merging identical shapes, the alternate reading points, the NYC subway reference stop, and History's rename joins.
- Why: the terms bar altering the published data, and each reading leaves the feed as published while changing only how Atlas interprets it.

### 2026-11-22 — 15 more agencies left out of the MCP: terms that bar sharing or need written permission (CIV-2124)
Ryan (2026-11-22, on CIV-2124): "2 and update Coverage as "Removed" then have the reason when you hover over the Removed pill".
- Group A, terms that don't allow sharing the data with other tools: Des Moines DART, NYC Ferry, Bee-Line. NYC Ferry's bar is in its site Terms and Conditions (ferry.nyc/legal), which its Developer Terms are "Subject to": Item 3, "Any copying, redistribution, use or publication by you of any such content or any part of the Site is prohibited"; Item 5, a licence "solely for your own personal use … not for republication, distribution, assignment, sublicense, sale, preparation of derivative works, or other use" (re-read 2026-11-27, #1898, CIV-3103).
- Group C, terms that need the agency's consent, so each is left out until the agency gives written permission: NORTA, CATA Lansing, Spokane, TriMet, VRE, RTC Washoe, MTA Flint, MAX Birmingham, CityBus Lafayette, Topeka, Cherriots, C-TRAN (superseded 2026-11-26, CIV-3051: back in the MCP), and Whitehorse Transit (added by CIV-2125: the City of Whitehorse's open data terms allow internal and personal use only, with no publishing for commercial purposes without its written consent), and Embark, UTA and IndyGo (added by CIV-3100, 2026-11-27: their terms use TriMet's template, where site content may be used only as displayed and any other use needs express written consent, so the TriMet ruling applies; Strategy's CIV-3066 verdict, group 4. The map and History keep them by this ruling, not because the wording allows it).
- Each has its own reason in `shared/rules/redistribution.ts`, shown on hover over its "Removed" tag on the Status page. The clauses are in `_reports/civ-462/agencies-v2.tsv` (CIV-462 v2, from CIV-468).
- The map and History keep them, as with WMATA.

### 2026-11-22 — WMATA is left out of the MCP and any download (#1693, CIV-2121)
Ryan (2026-11-22, relayed by the manager): "Then remove it from MCP and note this somewhere internally". Also: the Status page shows WMATA's MCP cell as "Removed", with the reason on hover.
- Why: WMATA's Transit Data Terms of Use (https://developer.wmata.com/license) license redistribution only "within your Application" and bar "sharing (except with your Application's users)… or creating an application programming interface that enables access to Transit Data". The MCP answers WMATA questions for outside AI assistants, which is such an interface; a public download would be sharing beyond Atlas's users. The map and History show the data inside Atlas and stay.
- How: one exclusion list, `shared/rules/redistribution.ts`, with each agency's reason. The MCP's agency lists, ranking and lookups skip it; the hosted split release builds no files for it; a question about it gets "Atlas can't serve … here". Any future download must read the same list. No email to WMATA.
- Found in the CIV-460 legal research (`_reports/civ-460/`).

### 2026-11-21 — A shared stop whose combined trips are uneven shows a range (#1667, CIV-53)
Ryan (2026-11-21, relayed by Atlas Questions, to "Should we not be using a range then"): "1". A stop where several patterns of a route stop, whose combined departures fail the evenness test, shows the combined list's typical wait to its longest gap, in the route cards' range words, instead of the minor pattern's own value.
- MBTA 16 at Columbia Rd @ Seaver St, weekday PM peak: every 27 → every 11–21. SEPTA 63 at Oregon Av & 16th St, weekday midday: every 121 → every 12–30.
- The stop's published value is the range's top (the longest gap), and its low end is a sparse parallel field, only where the range applies. Route values, grades and the filter never read either (#690).
- Under worstWait's own conditions (CIV-1072): the merged list runs through the period, never overnight. Only where the merged list's typical wait differs from the own value the stop fell back to. A rush overlay that gives the stop a value wins. The range shows where the one range rule (headwayRangeShown) shows one.
- Same-zip counts: MBTA 604 stop values on 19 routes, SEPTA 6,260 on 43; no route value, grade or filter value changes.
### 2026-11-21 — A shared trunk sets a route's headline only; the filter and map colour use the slowest piece (#1665, narrows CIV-1959 B1)
Ryan, 2026-11-21 (relayed by Atlas Questions): "1". He was answering: "1. (Recommended) The trunk sets the card's headline number only; the filter and map colour still use the slowest piece (rule 11 wins). 2. Keep B1 as written (the trunk passes the whole route) and amend rule 11."
- The rule: with `ATLAS_HEADLINE_FROM_TRUNK` on, a direction's headline value still comes from its trunk (B1, 2026-11-20). Its filter value, which sets the frequency filter and the map colour, always reads every piece, and the slowest decides, as FREQUENCY_RULES rule 11 says: a shared stretch can pass on its own line but never makes the whole route pass. This narrows B1, which had put the filter value on the trunk too.
- Why: TARC 1, TTC 102 and rtcsnv 4743 passed "every 15 or better" on a trunk every 15 while their branches ran every 30-60.
- Counts he saw (8 agencies, all four CIV-1959 flags on, weekday routes passing): midday ≤15 151 → 117, AM ≤15 170 → 133, PM ≤15 172 → 135; TTC midday 97 → 73, TARC 3 → 1. No route starts passing.

### 2026-11-21 — Studio's Live files rebuild daily in the cloud, privately (CIV-2077)
Ryan, 2026-11-21 (relayed by the manager): picked option 1, "Add those two checks and switch on a daily automatic run for every Studio city, matching TTC", and wants it in the cloud, not on the Mac.
- The rule: every city Live records except the TTC gets its Studio Live files rebuilt daily by `studio-live-refresh.yml` into the private archive bucket (`studio-live/`), with counts-only logs and no artifact or cache, since the repository is public. This replaces the Mac-only refresh of CIV-1716 (2026-11-16) for Live; nothing goes public.
- The two checks: a run uploads to its own prefix and switches one pointer file, so a failed upload changes nothing; an agency whose either week has fewer than `LIVE_MIN_HEALTHY_DAYS_PER_WEEK` good days keeps its last files.
- The daily schedule stays off (repository variable `STUDIO_LIVE_DAILY`) until the first scheduled publish gets a go.

### 2026-11-21 — A period that slows down says when, then names the slower wait (CIV-1913)
Ryan (CIV-1913, relayed by Atlas Manager 2026-11-21): "We already have wording for this." The card uses the settled CIV-1241 "until" words and CIV-1411's tests (4+ departures in the steady run, no gap over 1.5x its typical gap): Kingston 701 weekday evening reads "every 15 min until 8:45 PM, then every 30 min" instead of "every 30 min".
- One new number, `SLOW_END_MIN_LATER_DEPARTURES` = 2 (`pipeline/tripSets.ts`): at least two trips after T before the card names a later cadence. Ryan, 2026-11-22 (relayed by Atlas Questions): "1", answering: "CIV-1913: how many trips after a slowdown before a route card says "then every M"? Cards would say things like "every 15 until 9:06 PM, then every 30." The question is how many trips need to come after the change before we call it a pattern. 1. 2 trips: a new limit, used on 2,113 cards. It catches the common late-evening drop to hourly service, for example Kingston 10 "every 30 until 8:44 PM, then every 60." (Recommended) 2. 4 trips: reuses a limit you already approved, used on 967 cards. Late drops to hourly service go back to today's wording. Only the card's wording changes; numbers, filters and map colours stay the same."
- Found in the dry-run hand check and fixed before he was asked: one trip after a long hole is not a slower cadence (CyRide midday read "then every 285"), and the wait after the day's last trip is not a cadence: it counts toward "then" only where service runs past the period (BART Grey late read "then every 61").
- The mirror of CIV-1411's slow start (`slowEndEdge`): steady from the period's start to T, slower after it (the middle wait over 1.5x the steady run's typical gap), and the period's value set after T. T is the last departure the steady run holds to, so the time is exact.
- Both numbers are longest waits rounded up, as CIV-1411 (Ryan, 2026-11-13: "never reads better than the service runs"); the slower one is the period's value. Card wording only: the filter value and the map colour are unchanged.
- Not asked for, listed for review: slowStartEdge's 2x test (value over UNEVEN_GAP_RATIO times the typical gap) is left out, since it drops every 15 then every 30, the pattern this is for; there is no midpoint test, since both parts are named. A period whose value is not its longest wait (CapMetro 300 northbound, 23) keeps its reading, and so does the METRO E Line weekday Late, whose service after midnight is one trip, not a slower pace.

### 2026-11-21 — Vehicles needed counts every route except intercity coach (CIV-2053)
Ryan, 2026-11-21 (relayed by Atlas Questions): "1". He was answering CIV-2053: keep the "local and regional bus only" wording and hide non-bus routes, or reword the rule to "no intercity coach" so rail and streetcars count. He picked the second; the bus-only option is rejected.
- The rule: Studio's vehicles-needed figures count every route of the seven Studio agencies except intercity coach (Bustang stays out, CIV-1806). Buses and streetcars count as vehicles; subway and light rail are shown in trains.
- Why it came up: Studio's list widened to TTC and the MBTA (CIV-2046), whose files include streetcars, subway and light rail, while shared/rules/focus.ts and STRATEGY.md still said "Local and regional bus only".
- Wording only: both now say "no intercity coach". The figures already counted every route of the seven agencies.

### 2026-11-21 — Trains are read like buses: the 25 train-only rules are removed (CIV-2025)
Ryan, 2026-11-21: "1", answering "Remove them all, so trains are read like buses (Recommended). It would be one data rebuild, with a full before-and-after comparison first. If the comparison shows a rule was actually protecting something, that one comes back to you instead of being removed." Earlier the same day: "This is like the 6th way in which trains are fucking different - i was never told this, i never asked for them to be different".
- Removed (CIV-2025's list): the 09:30-14:30 midday window for a train's grade, class, Weekday pick and stop grades; light rail guessed from agency and route names; no backup grade for a thin train sample; the rail pool lift; trains skipping the worst-stop rule, the worst-stop headline fallback and the limited mark; trains reading same-destination trips before their shape, the terminal's destination list, the headsign-and-origin stop split and destination-grouped shared stretches; the bus-only same-destination terminal pool, rush-hour pool and drop-off and sibling-terminal rules (now every mode); one-off event trips dropped from trains only; trains drawing only their longest shape; train shapes never cut at long jumps; the light-rail-only default of the equivalent-shape merge; no corridors for rail-only feeds; trip times for trains only; the MCP's rail tie-breaks and "one train route makes a rail agency"; rail stops shown at regional zoom and winning stop merges; rail, subway and ferry hiding numbers of three or more digits; the "Rail replacement bus" label.
- A rule the before-and-after shows was protecting something goes back to Ryan instead of being removed.

### 2026-11-21 — Two trips of one name leaving together count once, where that repeats (CIV-1098)
Ryan, 2026-11-21 (Atlas Questions chat): "CIV-1098 1". He was answering: "1. Ship it as built (Recommended). You'd be approving the rule as written: more than half paired, at least 3 pairs."
- The rule: within one route, direction and service, a trip that leaves the same first stop in the same minute as a trip of the same headsign, serving a strict subset of its stops, is left out, only when more than 50% of the group's departure slots hold such a pair and at least 3 slots do (`PAIRED_SLOT_SHARE_MIN`, `PAIRED_SLOTS_MIN` in pipeline/transforms/same-slot-subset-trips.ts).
- Evidence: cloud dry runs 44557735080 (rule) and 44570667434 (baseline), 528 agencies: only cyride changed (812 Saturday toward Mall via Hospital, AM peak 87 to 76, still above the real 20); rtc 1-93, port-authority-pa 51, pvpta 746, petaluma 311, mtd-champaign, MNR and eight others unchanged.
- MNR keeps its mnr-bus-pairs stopgap: its weekday pairs (CIV-1307) leave 28 minutes apart, so they are not same-minute pairs.

### 2026-11-21 — A branch piece with no feature of its own gets a card line, named from where it ends or starts (CIV-1959, #1636)
Not a new decision: #1636's option 1 (name the piece by its terminus, "to <place>", no change to the features), with the existing words only. Behind `ATLAS_BRANCH_READINGS` (pipeline) and `VITE_BRANCH_READINGS_ENABLED` (card); with both off nothing changes.
- A piece that follows the trunk reads "to <place>": the headsign of the pattern that ends inside the piece (RTD 15 Saturday: "to Tower Rd: every 30 min"), else its last stop's name.
- A piece that comes before the trunk is an origin leg, not a destination, so it reads in the existing "from A to B" form ("from Colfax Ave & Tower Rd to Union Station Downtown: every 30 min until 12:16 PM"). It is left out when the direction has a named branch row, which already speaks for its starting legs, so DRT 900 eastbound keeps its one row ("to Ritson every 13-24 min": the second starting leg runs every 24 as the first does; Atlas Issue Response, #1636 correction). A piece between trunk stops, or with no name to give, has no line.
- The piece is read where most of its trips pass, when that stop has more trips than the reference stop: RTD 15's Tower Rd trips run 12 stops until 11:47 AM and 24 after, and the reference stop sat in the 24-stop part, which read "from 12:17 PM" for a branch that runs every 30 all midday.
- A line whose words the card already has is left out, whatever its reading (CIV-2018, Atlas Manager approval 2026-11-21: "Drop an added row whenever its label is already on the card, whatever the reading"). Two rows to the same place with different numbers contradict each other: 249 such rows across 22 agencies (1,055 rows added in all) (RTD 31 "to Front Range Community College" read every 61 and every 67; RTD 15's two origin legs both start at "Colfax Ave & Tower Rd"). The row already on the card, or the first of two pieces, stands.
- Wording: the "to" row, `periodEdgeText` and the no-number words as before. No new string.

### 2026-11-20 — A branch or piece that starts or stops inside a period says when, as CIV-1411 and CIV-1241 settled (CIV-1959 B3 follow-up)
Not a new decision: CIV-1959 B3's first version let a piece or row that starts late, stops early or starts slowly read its full-window wait on the card. Brooklyn B35 to McDonald Av, weekday AM peak (nothing 6 to 7 AM, then buses from 7:17) went from "every 8-21" to "every 77". The settled rules say otherwise, and they win:
- CIV-1411 (Ryan, 2026-11-13, "dont we have a 'x mins from x time' fix for this laready"): "A slow start doesn't set the card's figure on its own. The card says "every N from <time>", where N is the longest wait from that time to the period's end, so it never reads better than the service runs." And: "Card wording only. The filter value, the map line colour and every other figure are unchanged (same as #1277)."
- CIV-1241 (Ryan, 2026-11-01, #1268, option 1): "a branch row that runs part of the period and then stops reads "every 30 until 12:12 PM" (AC Transit 22 Sunday midday), not the full-period wait it filters at (168, settled rule 3)."
- #1277 (Ryan, 2026-11-01, CIV-1248): "The time and frequency are read on every stretch that starts or ends in the period, and the slowest decides (D1)"; "The filter is unchanged".

So a piece or a card row that starts or stops inside a period reads "every N from HH:MM" / "until HH:MM" (both when it does both), with its in-service spacing, through the one test stretches already use (`periodEdge`, including CIV-1411's slow start) and the one set of words (`periodEdgeText`). The full-window wait stays the value for the colour and the filter only, which is what CIV-1411 says ("card wording only"); it is never the number on the card, and no tail sets a headline (B1). A row's own late start or early end is read from its own departures (`rowPeriodEdge`, ATLAS_BRANCH_READINGS=1), since a row's trips are not always its stretch's. A branch whose own trips are 3 or more and evenly spaced keeps its own number even where its piece has none (the no-floor decision: its own trips decide, not the piece's pooled list). This corrects the earlier B3 sentence "its full-window wait stays the value for colour and any headline" to colour and filter only. No new string, nothing to approve.

### 2026-11-20 — Rule D has no half-period floor, dropped (CIV-1959 B3)
Rule D's half-period floor (a piece's trips had to cover at least half of a period, `PIECE_MIN_PERIOD_COVER` = 0.5) is dropped: Ryan, on CIV-1959, "You decide but an arbitrary number like 2 hours seems not ideal". Decision: any piece with 3 or more evenly spaced trips (the existing 1.75 x mean + 5 min evenness test) gets a number, however short its run. A run that covers the period is a plain reading; one that starts or stops inside it reads "every N min from HH:MM" / "until HH:MM" (both when it does both, the same `periodEdgeText` words as CIV-1241), and its full-window wait stays the value for colour and the filter only (CIV-1411, "card wording only"; see the entry above), so nothing overstates. Only a piece with under 3 trips, or uneven trips, reads "Runs irregularly in this period". B4's per-period boundary test is the same rule D, so it has no floor either. No number is left to approve for B3.

### 2026-11-20 — Pieces are defined by the trips that serve them (CIV-1959 B4)
Ryan, on CIV-1959 (#1086), about the 5-stop minimum for a branch: "That seems like an arbritrary number for branches".

On how a branch should be decided (1 = by trips: any length counts if it gets regular service, and one-off trips get no number; 2 = no rule at all), Ryan, 2026-11-19, on CIV-1959 (Linear comment 73088010): "1 but need to look into it". Recorded as option 1 chosen, with a follow-up to look into it.

A route's pieces now come from which trips serve each stop: a change in the set of trips is a new piece, and a one-stop branch is a piece too. Only a regular pattern makes a boundary: rule D per period (3 or more evenly spaced trips that run the whole period, no half-period floor (a short burst still gets its own card line through B3, but is no boundary: counting bursts split M101's one piece per direction into 12-15), and a second regular pattern of that period does not serve the stops), so a one-off or irregular run splits nothing, and there is no stop-count or distance minimum for a boundary. The 5-stop / 1 km minimum still applies where it is not about pieces: pooling departures across routes, the trunk-value gate, the hub fallback, converging origins and the rush-hour express guard. The new pieces are card rows and boundaries only; no stop value, headline, all-day, Frequent Service or night value moves. It is behind `ATLAS_PIECES_BY_TRIPS`, default OFF. Switched on in the cloud 2026-11-21: Ryan signed off "1" on CIV-1959 for all four switches, and the repo variables were set that day. In the local dry run (11 agencies) 438 of 6,094 directions gained pieces and none lost any. No CHANGELOG entry while the flag is off.

### 2026-11-20 — Branch readings on the cards, with part-period tails (CIV-1959 B3) — wording settled by existing rules, no half-period floor
Ryan, on CIV-1959 (#1086): "like if we look at it as 'pieces' of a route", the core and then "the branches individually should be too".

A route card shows each piece of a direction as its own line: the trunk ("Shared stretch every 5 min") and each branch with its own reading ("to Pearson Airport: every 20 min"). A branch whose trips fall under rule D (fewer than 3, or uneven) gets no number: its line reads as any row with no number does, "Runs irregularly in this period" (`noNumberRowLabel`, `src/content/noticeCopy.ts`). A branch with 3 or more even trips that starts or stops inside a period reads "every N until HH:MM" ("from", or both), however short its run, and its full-window wait stays its colour and the filter's number, never the number on the card and never a headline. The pipeline publishes this as the new field `pieceReadings` (`ATLAS_BRANCH_READINGS`) and the cards read it only behind `VITE_BRANCH_READINGS_ENABLED`; both default OFF. Switched on in the cloud 2026-11-21: Ryan signed off "1" on CIV-1959 for all four switches, and the repo variables were set that day. (Since then: both on in production from 2026-11-21, #1620; since #1825 (2026-11-25) the client side is one constant, always on, so the MCP, agency pages and schedule_changes read the same rows as the card.) Wording settled by existing rules, CIV-1251 (the no-number row words) and CIV-1241 (the "every N until HH:MM" tail, DECISIONS:382), so no new string and nothing to approve. Rule D's 0.5 half-period floor is dropped (Ryan, "You decide but an arbitrary number like 2 hours seems not ideal"; see the entry above). 212 branch pieces in 7 agencies have no feature of their own to name them, so they get no line yet (#1636). No CHANGELOG entry while the flags are off.

### 2026-11-20 — One reading per piece, a drifting stop is ignored, not overwritten (CIV-1959 B2)
Ryan, on CIV-1959 (#1086): "Then we should ignore the 16". And on how: "Not overwrite it but ignore it". The principle he gave earlier: "when a portion of the route exists and isn't subject to short-turns or branching etc then a single stop being a little bit off (or even a couple stops) shouldn't fuck the entire thing up."

Each piece (a run of stops the same patterns pool at) gets one reading per period: the median of its stops' own readings (the upper one on an even count, because overstating is worse than understating; a stop with no reading does not vote). A stop whose own reading, and whose published own value, are each at most one public tier worse than the piece, and whose own list is even against it, is ignored for the piece and for the map colour (Arm A: the piece's reading is what the stretch colours as). Its own value is never overwritten: the stop card and the stop's published values keep what they read. A stop that breaks off keeps its own colour (for one-piece directions, superseded by 2026-11-26 / CIV-2994, Infrequent break-off included: every stop takes the piece's colour). (Follow-up 2026-11-20, Ryan: "if it is less than hourly then it is infrequent": a stop whose own value is in the Infrequent grade, past the last public tier in shared/rules/frequency.ts (over 60), never takes a piece reading of 60 or less, however close the tiers count; it breaks off with its own value and colour. Own 60 vs piece 45 is still one tier and ignored; own 61 vs piece 60 breaks off; both over 60 follows the usual rule. Also: the tier test is also run on the published own value, because the stop's re-read can differ from it, e.g. DRT 905 read 30 and published 90; the 617 cells of the first go-live run that were more than one tier apart now break off.) The reading is published as the parallel field `piecePeriodHeadways`, which the map overlay reads first. It is behind `ATLAS_PIECE_READING`, default OFF. Switched on in the cloud 2026-11-21: Ryan signed off "1" on CIV-1959 for all four switches, and the repo variables were set that day. In the local dry run (11 agencies) 8,151 cells were newly flagged as possibly overstated and 22,020 no longer flagged (accepted as the cost of "ignore the 16"), and islands of 1-2 stops fell from 5,214 to 1,787. No CHANGELOG entry while the flag is off.

### 2026-11-26 — A one-piece direction colours no stop faster than its piece (#1839, extends CIV-1959 B2)
Not a new rule: B2 applied to the map's period colours (Atlas Strategy verdict, relayed by the manager, 2026-11-26). Ryan's B2 principle: "when a portion of the route exists and isn't subject to short-turns or branching etc then a single stop being a little bit off (or even a couple stops) shouldn't fuck the entire thing up"; and the settled rule that overstating service is worse than understating it ("Understate rather than overstate" above).
- The rule: where a direction is one piece (the pipeline's pieceReadings: a trunk and no branch, so the same trips run its whole length), a stop whose period value is faster than the piece's reading is ignored for the section colour and takes the piece's reading. Not overwritten: the stop card and the stop's published values keep their own. ~~A slower stop keeps its colour (METRO 26's first stops, two tiers slower, stay as B2 breaks them off on purpose). It can only understate.~~ (superseded by 2026-11-26 / CIV-2994: in a one-piece direction every stop takes the piece's reading, slower or faster)
- Why: each stop is graded over its own departures, so a change in the schedule partway through a period lands inside the window at some stops and not others. CapMetro 801 weekday evening drew its last 8 northbound stops green (15) against the route's 20.
- Counts (release-mwvbser2, all published agencies, every day and period): 269,533 of 8,707,067 stop colour cells go slower, in 15,533 route-periods in 457 agencies; none go faster.

### 2026-11-20 — A route's headline comes from its trunk (CIV-1959 B1)
Ryan, on CIV-1959 (#1086): "The 900 because we keep using it like the core section should realistically be the same frequency/headway relatively across the entire thing then the branches individually should be too - like if we look at it as 'pieces' of a route". The principle he gave for the readings: "when a portion of the route exists and isn't subject to short-turns or branching etc then a single stop being a little bit off (or even a couple stops) shouldn't fuck the entire thing up."

A direction's headline (its value, coverage and filter value, and so the route's; the filter value was narrowed back to every piece on 2026-11-21, #1665) is read from its trunk, the main section every regular trip shares, never from a branch or a tail, so a slow branch no longer sets the route's number. Where there is no real shared core (the trunk is under the piece minimum, the regular trips share no stop, or the trunk is shorter than every branch it feeds, as on a hub) the slowest piece sets the headline as before. This reverses D1 (the slowest stretch decides) for the headline only; each branch keeps its own row, and the night, all-day and Frequent Service verdicts still read the branches. It is behind `ATLAS_HEADLINE_FROM_TRUNK`, default OFF, and stays off until B3 shows each branch's own reading on the cards, so a rider never sees a branch hidden behind a faster trunk number. Switched on in the cloud 2026-11-21: Ryan signed off "1" on CIV-1959 for all four switches, and the repo variables were set that day. In the local dry run (11 agencies) every changed headline moved to a lower or equal tier, none worse. No CHANGELOG entry while the flag is off.

### 2026-11-19 — One entry per agency or region, everywhere
CIV-1963 (#1610): Studio Coverage listed MTA New York's feeds as separate rows while the agency index and the map's picker showed one MTA New York. The rule is now one entry per agency or region on every screen and tool that lists, counts, ranks or compares agencies, with a route in two of a parent's feeds counted once (as its own page already counted them). Feeds are not merged in the pipeline; `shared/agencyGroups.ts` groups them at read time for the site and the MCP tools alike.

### 2026-11-19 — A slower end stop colours only its own end piece (superseded by 2026-11-24 CIV-1565)
Ryan, 2026-11-19 (CIV-845), choosing between #1093's options for a shared stretch whose end stop is one tier slower: "1" (V0, ungated, over the gated version and over keeping today's colouring). On a drawn stretch of 3 or more stops, an end stop strictly worse in public tier than every other stop colours only the piece between it and its neighbour; the rest of the stretch takes the worst of the remaining stops. Only one end can be peeled by this test, since it must be worse than the other end too. The all-day value keeps the one-colour rule. Display only: no published value, stop card, filter result or pipeline gate changes, and no piece is ever better than the worse of its own two stops.

### 2026-11-19 — A period's first and last waits count like any other gap
Ryan, 2026-11-19 (CIV-238), approving the counts: "1". The wait from a period's start to its first bus, and from its last bus to the period's end, counts like any gap between buses, under the settled near-miss allowance. A true start or end of service keeps its approved 10 minutes over the grade. This restores Ryan's #507 ruling (2026-09-12: the full wait counts). The 60-minute and 8× edge allowance (33758d8b, `PERIOD_COVERAGE_MAX_HEADWAY` read as an allowance) was never approved and no longer lets a period pass. Night Service keeps its own 60 (CIV-1198). Route cards keep their numbers; only the filter changes. Counts (cloud dry run 44448813459, route × day type × period cells that passed before): every 10, 121 of 3,045 no longer pass; every 15, 582 of 9,473; every 20, 831 of 15,351; every 30, 2,260 of 38,650. Hand-checked against CTA's timetable: 121 AM (first bus at the stretch about 6:53), 143 AM, 26 PM.

### 2026-11-19 — "Learn more" is only in the notice at the bottom
Ryan, 2026-11-19 (CIV-1142): "learn more is only in the notice at the bottom". He said this was decided long ago, but it was not written down anywhere. "Learn more" appears only in the notice at the bottom of a card. Rows never carry a Learn more link, so "No regular service during this period" stays a plain label with no explainer. Written into docs/style/TEXT.md (Card notices).

### 2026-11-18 — Research chart defaults
Ryan, 2026-11-18 (CIV-1173): picked 1A, 2A, 3A, 4A and 5A on the chart kit review page. Ranked bars for rankings; columns for spreads along a scale; a split bar for shares of a whole; dot pairs for two values compared; empty steps kept on a fixed scale (a 60-min row at 0 is shown, not dropped). He noted the A/B pairs are different chart types for different jobs, so each kind keeps the design its page already uses. Style rule: [VISUAL.md](../style/VISUAL.md), Charts, graphs and graphics.

### 2026-11-18 — One odd stop doesn't recolour a stretch (superseded)
Reverted (Ryan, 2026-11-19, "You decide"; decided by Claude on CIV-845: lone-stop could overstate about 700 of 74,000 stretches), 69ab37d86, in favour of the V0 end-piece rule (b76f1872c, merged 66671a126). V0 itself was then reverted at the 2026-11-20 preview merge (5f4167f02, CIV-1991) with no decision behind it: #1093 was not on that day's UI review, and the merge note called it the lone-stop recolour. V0 was re-applied, ungated, on 2026-11-23 (merge ce7819be3, CIV-1565) without an OK from Ryan; an earlier version of this line said it had his OK, which was wrong (corrected 2026-11-26, CIV-2992). On 2026-11-24 he chose to keep it live only until the branch-split rule replaced it, and it was the rule in the code until that rule superseded it (2026-11-24 entry, CIV-1565). Text kept below for history.

Ryan, 2026-11-18 (#1093), after the "end piece" option (V0): "If it's literally only 1 stop then I think we should figure out a way to make an exception", then "I don't know if the exception should be based on a % of stops the route has or what but 1 single stop seems like an oddity more than anything", then approved the proposal as written: "1". On the filtered map a drawn stretch of at least 3 stops (`LONE_STOP_MIN_STRETCH_STOPS`) normally takes its worst stop's colour. When exactly one stop is one public tier worse (`LONE_STOP_TIERS_WORSE`) than every other stop, the whole stretch, that stop's own segment included, takes the worst of the others. Two guards keep it from hiding real slower service: a lone end stop whose neighbour past the stretch is as slow is the start of a slower section; a lone stop whose longest gap is 2 or more tiers (`LONE_STOP_GAP_GUARD_TIERS`) worse than the others' is a real hole. A fixed one stop was chosen over a share of the stretch's stops because several separate slow stops could be real slow spots. Measured on release-mwl8qwjk (every cached agency, weekday, Saturday and Sunday, AM peak to evening, every public threshold): 696 stretches and 17,722 stop-to-stop segments get a better colour, about 1% of drawn stretches, none worse; most are one-minute differences (16 among 15s). Hand-checks: TTC 96 and TTC 52 recolour; Hamilton 35 (a slower section past the end) and LA Metro 33 (a 54-minute gap at the last stop) don't.

### 2026-11-21 — Pilot testers get the Live tools
Ryan, 2026-11-21: "turn on live vehicles for cloud too", after a pilot tester's "how many vehicles are running on the 504 right now?" got only the schedule's count. The hosted Atlas Studio MCP serves route_now, route_reliability and route_bunching (LIVE_TOOLS on). route_now reads the Live recorder's bucket read only through the Worker's binding; the weekly figures stay in the private bucket `atlas-mcp-live`. Studio agencies stay off the public site (CIV-1716); pilot testers can now ask about them.

### 2026-11-18 — The MCP answers bunching and gaps right now
Ryan, 2026-11-18 (CIV-1870): "I would like us to have Live added with real-time information available (like being able to ask about bunching for example, or gaps in service on a specific route)". route_now (local MCP first; Studio's view CIV-1893 calls the same shared/liveNow.ts) reads the Live recorder's last half hour of vehicle readings. Gaps are measured where vehicles pass stops, as the weekly figures count them, never guessed from speed. Each stop is judged against its own scheduled gap for the period (Atlas's figure for that stop, branches together), with the shared bunched and gapped cut-offs. A stop no vehicle passed in the half hour is named apart, not called a gap, since a diversion looks the same. Every answer gives the time of the reading; a reading older than 3 minutes means no current figures. The manager settled the plan and the one tool.

### 2026-11-18 — Planners can set their own late, early and bunching cut-offs
Ryan, 2026-11-18: "But should they be able to custimize thebunching threshold", then "How about late buses?", then picked "1": in Studio and the MCP a planner can ask with their own agency's cut-off for late (e.g. 3 minutes), early and bunched. This changes "one definition of late": more than 5½ minutes stays the default and the only cut-off used in rankings and comparisons between routes, and any answer using a custom cut-off names it beside the figure. Bunching follows the same rule (2-minute default), by the manager's call for consistency (Ryan was offered the same option for bunching and moved on to late). Needs Live's analysis to keep each departure's lateness and each gap's size. Built in CIV-1869: Live keeps them as counts in half-minute steps (and quarter steps of the scheduled gap), so a custom cut-off goes in those steps and is never rounded (the ranges allowed, in `shared/rules/live.ts`: late 0–30 and early 0–10 minutes, bunched ½–10 minutes, in half minutes; gapped 1–6 times the scheduled gap, in quarters; settled by the manager, 2026-11-18, not by Ryan); at custom cut-offs bunched and gapped come separately, with no combined share, since one gap could count as both.

### 2026-11-18 — The MCP answers Live questions for every recorded agency
Ryan, 2026-11-18 (CIV-1860): "Why not all Live agencies", then "Then just have it mention the limits right now if applicable for each one", then "So should we add Kingston now" / "Because then we can see how the MCP works with different levels of data availability too". The Atlas Studio MCP's Live tools cover every agency Live records. Each answer states that agency's limits (days recorded, routes covered, whether figures exist yet), and a route's figures switch on by themselves once its latest week has enough good days (`liveFiguresReady`). Studio agencies (Kingston) still never go public (CIV-1716): their MCP files are built in the cloud into the private bucket `atlas-mcp-live`, which only the hosted MCP reads, with logs that show counts only.

### 2026-11-17 — The MCP server is part of Atlas Studio
Ryan, 2026-11-17: "I think the MCP would be part of that right?", of Atlas Studio, the planner toolkit. The private MCP server (CIV-1650) is named Atlas Studio for the AI assistants that use it (`atlas-studio` in their settings). A public version still waits on the data licence (ROADMAP, Future).

### 2026-11-17 — One frequency scale for every mode
Ryan, 2026-11-17 (CIV-1813): "Fix it now then omfg why the fuck are there any separate freqeucnies between buses and rail", then "like we can have 5 mins or 8 mins or 12 mins or whatever and not expose it to th epublic and put it under the next highest one if we want but this is much different than that", then "I do not know why I am repeating myself when I ask why there are any separate frequency bands between modes". There are no mode-specific scales: every mode, bus, rail and streetcar, is graded on one scale, 5, 8, 10, 15, 20, 30, 60 (`TIER_MAXES`). The public scale is 10, 15, 20, 30, 60 (`PUBLIC_TIER_MAXES`); the internal 5 and 8 count as 10 (`publicTierOf`). Before this, buses graded on 10-60 and rail on 5-8-10-15-30-60, with no 20 since 75c2d8422 (2026-10-06, never approved). `modeTierOverrides` and `RAIL_TIER_MAXES` are gone, and `frequencyScales.test.ts` fails if a mode-specific scale or tier list appears.

### 2026-11-16 — Live and Studio are desktop only, with one top bar for every switcher
Ryan, 2026-11-16 (CIV-1732, through the manager, answering "1" twice): Live and Studio are desktop only and hidden on phones, the same way as History and Compare; a phone visiting one falls back to the map. Of three redesign options for the shared map-and-sidebar layout, he picked A, "one bar": the measures join the other switchers in the top bar, the map key is one pill with its definition (it floats at the bottom left of the map since CIV-1821), and the route list ends after its last row. Live's tool page and Studio share this layout (`src/components/MapApp/`).

### 2026-11-16 — The For Transit Planners page is at /planners
Ryan, 2026-11-16 (CIV-1744): "should it rlly be at /about/planners or should it be at another url", then picked "1": `/planners`, and later `/researchers` for the researchers page (CIV-1709). Audience pages get their own top-level address instead of sitting under About. The page had never been public, so the old address has no redirect.

### 2026-11-15 — The For Transit Planners page is local only
Ryan, 2026-11-15 (CIV-1704): asked "should we make a card for live mode too on the for transit plannres", heard that Live is local only, then: "then make the for planners page local only". The page, its footer link and its prerendered page are on only on the local dev server, off on beta and public; see [FEATURE_FLAGS.md](../FEATURE_FLAGS.md). It gets a Live card (CIV-1705).

### 2026-11-15 — Links to the map on pages read "Try Atlas"
Ryan, 2026-11-15 (CIV-1703): "'Open the map' needs to be fixed too we need to refactor this bc this isnt good term", then option 2, "Try Atlas". One constant (`MAP_LINK` in `src/content/noticeCopy.ts`) is the text of every link that sends people to the map: page heroes, empty and not-found pages. It replaces "Open the Atlas map" and "Open the map"; the style guard catches any of them typed by hand. The shared header keeps Ryan's own "Go to Atlas" (#1509, 2026-11-14).

### 2026-11-15 — Atlas Studio is a section of Atlas, local only for now
Ryan, 2026-11-15 ("Yes local only", CIV-1680): Atlas Studio, the paid agency tier in [STRATEGY.md](STRATEGY.md), lives in the same Atlas code as its own section behind its own feature flag, following [FEATURE_FLAGS.md](../FEATURE_FLAGS.md). The flag is off on public and beta and on only in local dev until the demo is ready. Studio tools (the before/after report, the vehicles calculator) get their UI there. The shell (sign-in, private per-agency views) waits until an agency says yes.

### 2026-11-15 — Live report pages stay local
Ryan, 2026-11-15: the Live report pages (`/apps/live/:agency` and below) stay local only until the GTFS-RT archive restarts and the page design is approved. Their data is not being refreshed (the `live-report-refresh.yml` schedule is commented out and the archive is paused), so `VITE_LIVE_REPORTS_ENABLED` was removed from Beta's Vercel settings; see [FEATURE_FLAGS.md](../FEATURE_FLAGS.md).

### 2026-11-15 — Live report data refreshes daily again
Ryan, 2026-11-15 ("Can rebuild daily", CIV-1690): `live-report-refresh.yml` runs every day at 09:17 UTC for TTC, the agency still being recorded, so the entry above's "not being refreshed" no longer holds. The pages stay local only: the design is not yet approved.

### 2026-11-15 — The Docs page is "Docs" again
Ryan, 2026-11-15 (CIV-1697): "Should we rename Documentation page back to Docs", then option 1, back everywhere. The page's one shared name (`PAGE_NAMES.docs`) is "Docs" on its links, heading and browser tab; this reverses the "Documentation" part of the entry below. The URL stays /about/docs.

### 2026-11-15 — One name per page, and title case for titles
Ryan, 2026-11-15, after a page-name audit: every page has one shared name (`shared/pageNames.ts`) that its heading, links, back and close links and browser tab use. "Documentation" replaces "Docs" on links (CIV-1610's split is retired); "What’s New" is the one name for the release notes (the /changelog URL stays), and the map's What’s New button shows a dot until the current release is opened; the footer's "About" column is "Atlas", with an "About" link. Titles (page and section headings, header and footer links, footer columns, browser tabs) are title case, replacing CIV-1160's sentence case for them; everything else stays sentence case. Tabs use one format, "<page name> | Transit Atlas", within 60 characters, and link previews say "Transit Atlas".

### 2026-11-15 — "Area" for metro areas, "region" for states and provinces
Ryan (Linear CIV-1614): page text and links call a metro area an "area" (/area/ pages); /region/ stays for states, provinces and territories, with no /province path and no redirects; an area still needs at least 2 agencies for its own page. The agency page names both, "Calgary, Alberta" (Ryan, follow-up: "Calgary area, Alberta" read oddly; a name with "Area" in it keeps it, "Greater Toronto and Hamilton Area, Ontario"), each linked when it has a page, and an area page links the states or provinces in its subtitle.

### 2026-11-13 — A period that starts slowly says when steady service starts
Ryan, 2026-11-13 (Linear CIV-1411), on TTC Line 5 westbound's AM peak (two 20-minute gaps at Laird before 7:27, then every 3.6): "dont we have a 'x mins from x time' fix for this laready". A slow start doesn't set the card's figure on its own. The card says "every N from <time>", where N is the longest wait from that time to the period's end, so it never reads better than the service runs. Without a steady run from that time, the period keeps its longest wait.
- A period starts slowly when its longest wait comes before the time, and from the time on there are at least 4 departures, no gap over 1.5 times their typical gap (to the period's end included), the earlier longest wait is over twice that typical gap, and the time is at or before the period's midpoint. The earliest time that passes is named.
- It replaces the one-gap reading (D6) where both apply: Halifax 1 weekday AM read "every 11, one 30-minute gap" and now reads "every 15 from 6:30". One hole in service that already ran at the steady pace before it is not a slow start and keeps the one-gap reading.
- Card wording only. The filter value, the map line colour and every other figure are unchanged (same as #1277).

### 2026-11-10 — A night belongs to the service day it starts on
Ryan, 2026-11-10 (#1416, Linear CIV-1384), on MiWay 2 and 17 (Sunday's last bus 0:32, Monday's first 2:19): "Technically, The gap would be "Sunday" because it is during the Sunday service day." Each day type's night is its own evening with the morning after it, whichever day the early trips are written on, and counts against that day (FREQUENCY_RULES.md rule 10).
- Friday evening into Saturday morning starts on a weekday, so it counts toward Weekday (Ryan, 2026-11-17, CIV-1814 item 2: "1"). MiWay 2 and 17 fail Weekday on it (their Saturday buses start at 4:40 to 5:26, after Friday's last at about 2:00); without it they would pass at 30, 60 and 90.

### 2026-11-01 — A route that starts late or ends early in a period shows its frequency with the time
Ryan, 2026-11-01 (#1277, Linear CIV-1248): a period the route covers only part of reads "every 30 from 7:52 AM" (TTC 110 Sunday AM) instead of "No frequency is shown".
- The time and frequency are read on every stretch that starts or ends in the period, and the slowest decides (D1), as for the filter value: TTC 110's trunk runs every 15 from 7:52, its branches every 30, so it reads every 30. A branch with under three trips in the period does not count.
- The filter is unchanged: a period the route covers only part of is still not regular service (D8), so it has no filter value.

### 2026-11-01 — A branch that stops partway through a period says when it stops
Ryan, 2026-11-01 (#1268, Linear CIV-1241), picked option 1: a branch row that runs part of the period and then stops reads "every 30 until 12:12 PM" (AC Transit 22 Sunday midday), not the full-period wait it filters at (168, settled rule 3).
- The edge (the start or stop time) is read on the row that sets the direction's value (D1). So a main row whose number comes from a slower branch no longer carries an edge (TTC 40 Saturday late).

### 2026-10-31 — "Irregular" for a period, "Occasional" for the hidden class

Ryan, 2026-10-31 (Linear CIV-1238): "'no regular service' is still deceptive and misleading bc it makes it sound like there is no service during that period not that there is little service during that period." His words: "Irregular" in tight spots (table cells, list values) and "Runs irregularly in this period" on cards. This supersedes the 2026-10-17 wording. The class hidden by default, which #720 named "one-off" and the Docs page called "Irregular", is now "Occasional" ("one-off sounds like it only runs once per day"); the setting reads "Hide occasional routes" with the same description. Code names (`serviceClass: 'irregular'`, `noRegular`) are unchanged.

### 2026-10-31 — The Overnight period reads the Night Service verdict

Ryan, 2026-10-31 (#1267, Linear CIV-1239): the map's Overnight value reads the night verdict's stretch value (rule 10), so Overnight and Night Service never disagree. They were calculated separately (2-6 AM by rules 4-5, 2-5 AM by rule 10) and disagreed on 135 of 646 route-days in 12 agencies: TTC 301 was Night Service every 30 but Overnight "every 71", because the 2-6 AM window took in the gap before day service.
- A direction's Overnight value is the smallest gap at which it passes rule 10, so it is 30 or less exactly when Night Service 30, and 60 or less exactly when Night Service 60. The route takes the worst direction.

Implementation choices, confirmed by Ryan on 2026-11-01:
- A direction where nothing runs at night (departures on both sides of 3:30) has no Overnight value: day service starting at 4:48 is not overnight service (TTC 102).
- A route card's Overnight row shows the route's Overnight number only on a row the Night view lights, of a direction that passes as a whole; every other row has no value (the card shows the shared irregular label). So a direction that passes only on its night path (NYC subway 3 to New Lots Av: every 20 on the night path, 220 minutes apart at the row's own stops) and a piece that stops at night (NYC subway S's 42 St shuttle) show none. The row never reads its own 2-6 AM trips.
- Overnight shows one number: no branch range, no typical-to-worst range, and no late-start, early-end or gap wording (those read 2-6 AM: CTA 35 read "every 20 min from 3:54 AM" with no Night Service).
- A direction that passes only at a gap over 60 has no Overnight value, as Night Service has no grade over 60 (TTC 504 had read "every 172").

### 2026-10-31 — The headline reads the rider's wait only where the route runs through that window

Ryan, 2026-10-31 (Linear CIV-1204 and CIV-1161): approved the run-shape gate, recommendations 1, 2 and 4 of the run-shape study. A row's headline is replaced by the wait a rider arriving at random faces on the main stretch (CIV-1161: the time-weighted median gap, in the headline's own window: midday, then PM peak, then all day) only when that wait is 10+ minutes longer than the headline, and only when the direction runs through that window at every boarding stop with a reading, by the settled verdicts.
- Midday: the midpoint and hole test (FREQUENCY_RULES rule 5) and the #899 midday test (rule 7).
- PM peak: the midpoint and hole test.
- All day (the internal 07:00-22:00 window, not a map option): the direction is not limited (rule 7).

Why: a peak route's last morning and first afternoon trips reaching into midday are not a five-hour wait. Examples are TTC 945 (every 10 to 9:28, then 14:40) and CAT Harrisburg 14 (five trips a day).
- A blocked row keeps its headline and tier. It is marked as having no regular cadence in the headline's window, so no fallback prints the headline as "every N". Route cards already read "Runs irregularly in this period" there (wording from CIV-1238).
- The tier can only get worse, never `span`. The filter values, map colour and feed-quality check are unchanged.
- Three-departure middays every 2-3 hours stay as they are (Collier 25 Saturday reads 183).
- The 8x hole test is unchanged, so clustered timetables (TransLink 620 Saturday) lose their replacement.

### 2026-10-30 — Night service: the wait for the first night bus is held to an hour

Ryan, 2026-10-30 (Linear CIV-1198, [#1219](https://github.com/Civic-Minds/Atlas/issues/1219)): approved the guarded night rule as written. A stretch that runs at night (departures on both sides of 3:30, D3) passes at 30 or 60 when every gap between its 2:00-5:00 departures is at most that, its first departure is by 3:00 and its last is from 4:00. Any other stretch keeps today's test. Why: TTC's night network starts when day service and the subway stop, about 2:30, so 13 of its 15 routes graded every 60 failed every 30 only on the wait for the first night bus (TTC 300, 304 King, 337, 373). Routes with a real gap between night buses still fail (TTC 352 and 384), and day service starting at 4:30 never passes. See [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rule 10.

### 2026-10-18 — Line sections, the route grade and skipped stations follow the route rules

Ryan (Linear CIV-321, 2026-10-18): a route's grade follows the existing branch and steady rule ("we break it down based on branch and provide a range"); a line section needs 3 departures in a period, then the same filter and "Hide limited service" behaviour as a route; a line is coloured by every train along it, including trains that skip a stop, while the station card shows the station's own frequency. A value needs 3 departures (4 after an edge allowance), not a percentage. See the rules under "How a route's frequency is decided" and "What the map shows".

### 2026-10-18 — Live shows good days only and names the days it leaves out

Ryan (Linear CIV-284 of 2026-10-17 and CIV-293 of 2026-10-18): every Live surface counts only days with good recordings and names the left-out days ("Excluding Oct 11"), shown only when a day is left out. See "How Live reads".

### 2026-10-17 — Live wording and layout

Ryan (Linear CIV-293, 2026-10-17): late means more than 5½ minutes behind the timetable, with one shared wording; math explanations stay visible; the sidebars never scroll or collapse; the agency report is a rolling 7 days; the strip is the model for Live visuals. See "How Live reads".

### 2026-10-17 — One-gap rows, no fixed cut-offs, lettered variants

Ryan (Linear CIV-296 and CIV-115, 2026-10-17): a number that is only one gap between a few departures reads "no regular service during this period" (wording superseded 2026-10-31, CIV-1238: "Runs irregularly in this period") ([#954](https://github.com/Civic-Minds/Atlas/issues/954), [#955](https://github.com/Civic-Minds/Atlas/issues/955)); never summarize an agency by a fixed frequency cut-off; lettered variants with no shared street stay separate ([#303](https://github.com/Civic-Minds/Atlas/issues/303)).

### 2026-10-15 — Frequency tolerances are settled

Ryan: the tier tolerances decided 2026-10-03 to 2026-10-06 in [#567](https://github.com/Civic-Minds/Atlas/issues/567), [#568](https://github.com/Civic-Minds/Atlas/issues/568), [#570](https://github.com/Civic-Minds/Atlas/issues/570) and [#571](https://github.com/Civic-Minds/Atlas/issues/571) (shipped in PR [#584](https://github.com/Civic-Minds/Atlas/pull/584)) stand without new evidence. Values: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) (Thresholds).

### 2026-10-13 — Modes come from GTFS route_type; known ambiguities are listed overrides

A route's mode is the agency's GTFS route_type, unchanged. Where a feed is ambiguous or wrong
(light rail published as tram, Miami Metrorail as commuter rail, QLine as rail, a streetcar
published as a bus), the correction is an explicit per-route `modeOverrides` entry in
`config/agencies/<slug>.json`, each with the route, the route_type being corrected, the right
mode and a short reason. Modes are never guessed from names. One shared definition in
`shared/modes.ts` sets mode order and plain-word labels (Subway/Metro, Light rail, Streetcar,
Commuter rail, Bus, Ferry, Gondola/aerial tram, On-demand) for the map menu, agency and area
pages, sentences and counters. Refs #827, #811.

### 2026-10-12 — Fix validation is enforced for every chat

The 2026-10 release shipped several broad pipeline rules that each regressed other agencies; every chat that writes a pipeline fix now reads [FIXING_PIPELINE_ISSUES.md](../engineering/FIXING_PIPELINE_ISSUES.md) first and reports a compliance line per fix (target and blast radius, tests, a quantified diff, six extra agencies in two countries, why not an agency override).

### 2026-10-10 — Workers never push or merge

Ryan: worker chats commit locally and report; the manager reviews, pushes and merges, because each push costs a deploy and per-PR merging hit the 24-hour deploy limit.

### 2026-08-08 — No changelog entry for data adds

Ryan: adding an agency, zone or feed, or a refresh that fixes numbers with no code change, is data upkeep and gets no changelog line.

### 2026-07-29 — Curate History around meaningful service change

Atlas History is intentionally enabled for selected agencies rather than
backfilled across every city. Selection should favor places where archived GTFS
feeds can reveal meaningful network or service changes. Official agency feeds
are preferred; MDB is a historical fallback.

Historical GTFS files remain immutable snapshots. Atlas may derive compact
route-level snapshots for each documented schedule period without duplicating
the raw ZIP. Normal history can remain change-only, while period-level
materialization is used when the UI needs every available schedule period to be
selectable. Missing or unusable periods remain unavailable rather than being
represented by a duplicate or inferred snapshot. Sacramento is the initial
prototype for this model.

### 2026-07-25 — Report unrepresentative frequency honestly instead of computing a plausible number anyway

When a time window (a period like Midday, or an hour like the sparkline's) doesn't have genuinely sustained service, Atlas should say so rather than compute a technically-valid statistic that looks like a real answer.

This came up twice independently in the same investigation: `headwayByPeriod` can report a clean-looking median for a window with a dominant internal gap and almost no real service ([#281](https://github.com/Civic-Minds/Atlas/issues/281)), and `headwayByHour` can only produce a number for a sparse hour by borrowing departures from a neighboring hour with a different frequency regime ([#282](https://github.com/Civic-Minds/Atlas/issues/282)). In both cases, every strategy tried for choosing which departures to include just prints a different plausible fiction — none of them make the underlying problem (this window has no representative frequency) go away. `headwayByPeriodSustained` and `maxGapByPeriod` flag and explain the first case without changing the median. The second is still open; the honest fix is a null or an unsustained flag, not a better-tuned window.

This does not mean every sparse window should go null — `sustainedMedianHeadwayInWindow` ([#279](https://github.com/Civic-Minds/Atlas/issues/279)) and `minDeps=3` throughout the pipeline exist specifically to rescue real, consistent service that happens to be sparse or fall outside a fixed window. The line is between "sparse but real" and "not enough evidence to claim a sustained pattern at all."

### 2026-07-25 — Extend a shared calculation field with a new parallel field, not by widening its value shape

When a published or persisted field (like `headwayByPeriod`) needs new information attached to it, add a new field alongside it rather than changing the original field's value type.

Consumers of a shared type are not fully visible to the type checker: a file can declare its own local shape for the same field name instead of importing the shared type, and `tsc` has no way to flag it as a consumer. While mitigating [#281](https://github.com/Civic-Minds/Atlas/issues/281), widening `headwayByPeriod` from a bare number to `{value, sustained}` type-checked cleanly (every consumer that imported the real type was fixed) but would have silently broken `pipeline/refresh.ts`, `pipeline/route-report.ts`, and Corridors, which each declare their own independent number-shaped type for the same field. One of those consumers writes the field into R2 history snapshots that already exist as bare numbers — a data-shape change there isn't something a consumer-side fix can retroactively address at all.

A same-named parallel field (`headwayByPeriodSustained`, later joined by `maxGapByPeriod`) leaves every existing reader untouched, typed or not, and sidesteps the persisted-data problem entirely. Before widening a shared type used by a published or persisted field, grep the whole repo for other independent declarations of a field with that name, not just `tsc`'s error list.

### 2026-07-19 — Never cite a past R2 write as precedent

Metz ended up live on R2 without approval, and a later session nearly repeated it for Rennes by citing Metz. A past write is not approval for a new one; see "R2 writes need an explicit go" and "New-country gate".

### 2026-07-15 — Atlas is the shared transit data platform

Atlas owns reusable transit-data capabilities for the Transit tool family:
GTFS/GTFS-RT configuration and normalization, static route and stop artifacts,
live snapshots, archives, replay/query access, and shared freshness metadata.
Downstream tools consume stable Atlas contracts rather than maintaining competing
copies of the same data-processing behavior.

Atlas may add an additive, versioned field, artifact, or API when it benefits
multiple consumers. A request that only changes one consumer’s presentation or
domain workflow belongs in that consumer or in an adapter outside Atlas.

Atlas must not change canonical data semantics merely to make one downstream
integration easier. This preserves Atlas as a dependable platform, in the same way
that a search provider does not reorder its canonical results for every client.

### 2026-07-15 — Operational consumers own operational decisions

Under review: Ryan, 2026-11-15, may be outdated ("'Atlas's decision log already says advice on day-to-day operations belongs in Bridge' is outdated" / "Potentially at least").

Atlas provides live and historical transit context but does not own product-specific
decisions such as dispatch recommendations, rider reroute choices, trip-prediction
UX, or research instrumentation. Those belong to Bridge, Reroute, Transit Stats,
Rocket, or an adapter that consumes Atlas data.

### 2026-07-15 — Hide Corridors from primary navigation

Corridors remains implemented but is hidden from the main header.

The current tool compares routes and frequency between two selected stops. That is a useful network-analysis capability, but its purpose is not clear enough to present as a primary app mode for ordinary Atlas users. Keep the implementation available for future refinement or contextual entry from a selected stop.

Superseded: Corridors was retired on 2026-10-13; its status is stated once in [ROADMAP.md](../roadmap/ROADMAP.md).

### 2026-07-02 — Support GTFS Fares V2 alongside V1

Atlas parses both GTFS Fares V2 and legacy Fares V1. When both are available,
route base fares use the lowest applicable adult V2 product; V1 fare attributes
and rules remain the fallback for older feeds, followed by an explicit manual
override when an agency’s feed does not provide usable fare data.

This is intentionally limited to deriving a route’s base fare for the Fares map.
It is not a claim that Atlas can calculate every rider’s complete fare, transfer,
zone, or concession outcome.
