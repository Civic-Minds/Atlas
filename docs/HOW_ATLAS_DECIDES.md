# How Atlas decides

Every rule here is already settled. Read this before asking Ryan anything, and do not re-ask what it answers. If a rule has no new evidence against it, it stands.

Each rule has what it does, why, and where it came from. "Linear CIV-nnn, comment of date" means a decision by Ryan recorded in Linear. "Working notes" means the local, uncommitted AGENTS.md at the repo root.

## How a route's frequency is decided

- **Every direction must pass**
  - What: a route's value is its worst direction's; a direction with stray trips but no real service voids the route.
  - Why: a route that is frequent one way only is not frequent.
  - Source: [FREQUENCY_RULES.md](product/FREQUENCY_RULES.md) rule 4
- **Branches count only when they run steadily, and the slower one decides**
  - What: a branch counts in a period only if it runs steadily through it; stray trips and bursts never set the value.
  - Why: a straggler or a rare short turn is not service a rider can plan around.
  - Source: [FREQUENCY_RULES.md](product/FREQUENCY_RULES.md) rules 1, 3 and 5
- **A value needs 3 departures, not a percentage**
  - What: 3 departures (2 gaps) is the minimum to read a pattern; after an edge allowance it is 4.
  - Why: 2 trips cannot show a cadence; 4 would reject real half-hourly service. Riders feel frequency, not share of trips.
  - Source: [methodology INDEX](engineering/pipeline-studies/frequency-tier-methodology-2026-10/INDEX.md) (Minimum evidence), [#571](https://github.com/Civic-Minds/Atlas/issues/571), Linear CIV-321, comment of 2026-10-18
- **Frequency tolerances are settled**
  - What: 10% near misses for the 5 to 15 minute tiers, 5% for 20 to 60, cap of 3 gaps, one 10-minute allowance per true service edge.
  - Why: chosen from a census of 1,160 feeds and a review of example routes. Check these before asking.
  - Source: [FREQUENCY_RULES.md](product/FREQUENCY_RULES.md) (Thresholds), [#567](https://github.com/Civic-Minds/Atlas/issues/567), [#568](https://github.com/Civic-Minds/Atlas/issues/568), [#570](https://github.com/Civic-Minds/Atlas/issues/570), [#571](https://github.com/Civic-Minds/Atlas/issues/571), PR [#584](https://github.com/Civic-Minds/Atlas/pull/584)
- **One gap reads "no regular service during this period"**
  - What: when a number is only one gap between a few departures, the row says this instead of the number, everywhere.
  - Why: the old short wording read as if the route never has regular service.
  - Source: Linear CIV-296, comments of 2026-10-17; [#954](https://github.com/Civic-Minds/Atlas/issues/954), [#955](https://github.com/Civic-Minds/Atlas/issues/955)
- **A route with no all-day value stays without one**
  - What: a direction that does not run at midday is "limited" and gets no all-day value; a busy stretch alone never passes a route.
  - Why: a peak-only route is not all-day service.
  - Source: [FREQUENCY_RULES.md](product/FREQUENCY_RULES.md) rules 7, 8 and 11, [#899](https://github.com/Civic-Minds/Atlas/issues/899)
- **The route grade follows the existing branch and steady filter rule**
  - What: the route's grade comes from the same branch and steady rules above, with no second rule for grading.
  - Why: one rule means the map, cards and filter always agree.
  - Source: Linear CIV-321 (decision 2026-10-18: "we break it down based on branch and provide a range"); [FREQUENCY_RULES.md](product/FREQUENCY_RULES.md) rules 1 to 3
- **No fixed cut-offs**
  - What: never summarize an agency or area by a fixed threshold such as "every 15 min or better"; show the real waits per period.
  - Why: many agencies have no routes that frequent, so a cut-off hides them.
  - Source: [STYLE.md](STYLE.md) (Frequencies), Linear CIV-296, comment of 2026-10-17 ("no fixed frequency cut-off")

## What the map shows and never shows

- **Understate rather than overstate**
  - What: when evidence is thin, show less or say there is not enough; never a plausible number that is not backed.
  - Why: overstating service is worse than understating it, because riders plan around it.
  - Source: Working notes (Narrow fixes), [DECISIONS.md](product/DECISIONS.md) (2026-07-25, report unrepresentative frequency honestly), [DATA_PRINCIPLES.md](data/DATA_PRINCIPLES.md)
- **No paratransit**
  - What: eligibility-only service (ADA or pre-approved riders) is never drawn.
  - Why: the map shows service anyone can use.
  - Source: Working notes; [ON_DEMAND_PUBLICATION.md](research/north-america-flex-and-on-demand-2026-09/ON_DEMAND_PUBLICATION.md)
- **A line section follows the route rules**
  - What: a section needs at least 3 departures in a period for a value, then the same filter and "Hide limited service" behaviour as a whole route, with no new thresholds.
  - Why: one rule for routes and sections, so nothing special-cases a mode.
  - Source: Linear CIV-321, comment of 2026-10-18 (question 1)
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
  - Source: [STYLE.md](STYLE.md) (Agencies), [DATA_PRINCIPLES.md](data/DATA_PRINCIPLES.md)

## Data and pipeline fixes

- **Data integrity first**
  - What: never show wrong or misleading information; hide or hold first, fix after.
  - Why: a wrong number on the map costs more trust than a missing one.
  - Source: Ryan, standing rule (data integrity first: "never show wrong or misleading info"); [DATA_PRINCIPLES.md](data/DATA_PRINCIPLES.md) (Why this matters)
- **Narrow fixes, and stop after two rule attempts**
  - What: write pass criteria first, count every change outside the target, hand-check all day types, then stop and report after two rule attempts.
  - Why: broad fixes built from one case regressed other agencies (#263, 32 routes in 18 cities).
  - Source: Working notes (Narrow fixes, Fix Scope and Validation), [FIXING_PIPELINE_ISSUES.md](engineering/FIXING_PIPELINE_ISSUES.md), [#263](https://github.com/Civic-Minds/Atlas/issues/263)
- **A shared fix is checked on six other agencies in two countries**
  - What: regression and legitimate-case tests, a before and after diff, and six more agencies spanning two countries, all recorded.
  - Why: three spot checks missed 5.2% newly empty values (#279).
  - Source: [FIXING_PIPELINE_ISSUES.md](engineering/FIXING_PIPELINE_ISSUES.md), [FIXING_UI_ISSUES.md](engineering/FIXING_UI_ISSUES.md), [#279](https://github.com/Civic-Minds/Atlas/issues/279)
- **The headway validation gate**
  - What: a commit touching shared headway or filter files needs a pipeline test or a "Validated:" line.
  - Why: a written record beats an ephemeral chat; never bypass with --no-verify.
  - Source: [commit-msg hook](../.githooks/commit-msg), [#263](https://github.com/Civic-Minds/Atlas/issues/263), [#279](https://github.com/Civic-Minds/Atlas/issues/279)
- **One frequency filter function, every direction must pass**
  - What: the map expression in shared/tileFilterExprs.ts is the single definition; the app reads the same one.
  - Why: the app and the map can never disagree.
  - Source: [FREQUENCY_RULES.md](product/FREQUENCY_RULES.md) (Where the rule lives)
- **New-country gate**
  - What: the first agency of a country with no live agency stays on --dry-run until Ryan authorizes the country launch.
  - Why: hiding an agency does not stop a real write to the live bucket.
  - Source: [ADDING_AGENCIES.md](data/ADDING_AGENCIES.md), [countryLaunchGate.ts](../pipeline/countryLaunchGate.ts), Working notes (Production Data Rules)
- **R2 writes need an explicit go**
  - What: refresh, process, build-pmtiles, publish-data-release and reprocess with --write each need a fresh yes; a past write or a clean validation is not approval.
  - Why: data goes public with no deploy gate; Metz went live unapproved in 2026-07.
  - Source: Working notes (Production Data Rules)
- **No changelog entry for data adds**
  - What: adding an agency, zone or feed, or a refresh that fixes numbers with no code change, gets no changelog line.
  - Why: the product's code did not change.
  - Source: Working notes (Changelog Style, 2026-08-08)

## How Live reads

- **Math explanations stay visible**
  - What: text that explains a number or threshold stays on screen, not hover-only; text that only restates a label can go.
  - Why: the explanation is what makes the figure trustworthy.
  - Source: Linear CIV-293, comments of 2026-10-17 (14:42 and 14:56 UTC)
- **Understood at a glance, no scrolling or collapsing in sidebars**
  - What: both sidebars show everything at once; if it does not fit, show less rather than cram.
  - Why: Ryan: "I shouldn't need to scroll in the sidebar." (He never asked for collapsible cards.)
  - Source: Linear CIV-293, comments of 2026-10-17 (14:17, 14:20 and 14:27 UTC)
- **Late has one shared wording and one threshold**
  - What: "Late: more than 5½ min behind the timetable: the TTC's 5-minute standard, plus 30 seconds because we see each vehicle about once a minute."
  - Why: two different numbers had been used for the same threshold.
  - Source: Linear CIV-293, comment of 2026-10-17 (15:00 UTC); [LIVE_METHOD.md](product/LIVE_METHOD.md) (the 5½ wording is already fixed on `feature/live-tool-v2`, commit 30e61431; `main` gets it when that branch merges, so main's LIVE_METHOD.md may still say 5.5 until then)
- **Only days with good recordings count**
  - What: every Live surface uses good days only, and names the left-out days ("Excluding Oct 11"), shown only when a day is left out.
  - Why: the same figure must match everywhere, and a day with a gappy recording misleads.
  - Source: Linear CIV-284, comment of 2026-10-17; Linear CIV-293, comment of 2026-10-18; [LIVE_METHOD.md](product/LIVE_METHOD.md) (Good days only)
- **Rolling 7 days only**
  - What: the agency report shows the last 7 days, with no 24-hour or yesterday option.
  - Why: one day is noisy, and 7 days matches the "vs last week" lines.
  - Source: Linear CIV-293, comment of 2026-10-17 (14:45 UTC)
- **The strip is the model for Live visuals**
  - What: stops as dots on a line, a 3-step colour scale, the marked stretch as a bracket, "less exact" stops hatched.
  - Why: Ryan liked it; reach for it before bar charts or prose.
  - Source: [STYLE.md](STYLE.md) (Live)

## How we talk to riders and planners

- **New UI text needs Ryan's word-for-word OK**
  - What: no new wording, note or label, including an existing note shown in a new situation, without his yes on that exact text.
  - Why: a proposal in Linear or an issue is not approval; "you decide" on data does not cover what users see.
  - Source: [STYLE.md](STYLE.md) (New wording needs a yes), Working notes (Ryan's UI requirements)
- **Removing something Ryan approved needs his OK**
  - What: taking out an approved element or wording is a UI change like any other.
  - Why: he approved it on purpose.
  - Source: Working notes (Ryan's UI requirements)
- **Every UI change is shown on localhost before it merges**
  - What: a running localhost URL plus one line on what to check; a reviewer's approval is not design approval.
  - Why: Ryan signs off on how Atlas looks.
  - Source: [STYLE.md](STYLE.md) (top)
- **Plain words, no all-caps, no dark fills**
  - What: labels a non-expert understands at once ("Part-time", not "Time-limited"); selected states are pale, never solid dark.
  - Why: settled look and voice; the glossary lists the UI word for each internal term.
  - Source: [STYLE.md](STYLE.md), [GLOSSARY.md](GLOSSARY.md)
- **Frequencies are written by one function, in minutes**
  - What: "every 10 min", "about every 16 min", ranges with an en dash; never hours, never typed by hand.
  - Why: the same frequency reads the same on every surface, and columns never mix units.
  - Source: [STYLE.md](STYLE.md) (Frequencies), [#938](https://github.com/Civic-Minds/Atlas/issues/938)

## Who decides what

- **Ryan decides how Atlas looks, what it says, new countries and R2 writes**
  - What: data questions can be decided by the manager; anything users see, any launch, any live write goes to Ryan once.
  - Why: his standing rules above; one question, asked once, by the manager.
  - Source: [STYLE.md](STYLE.md), Working notes (Working rules, Production Data Rules)
- **Workers never push or merge; Linear first**
  - What: workers commit locally and report; the manager reviews, pushes and merges; every request is logged in Linear first.
  - Why: each push costs a deploy, and per-PR merging hit the deploy limit.
  - Source: Working notes (Working rules)
- **Atlas changes only for Atlas's reasons**
  - What: a request that only changes one consumer's presentation belongs in that consumer, not in Atlas's canonical data.
  - Why: downstream tools need stable data, and Atlas stays the shared platform.
  - Source: [DECISIONS.md](product/DECISIONS.md) (2026-07-15, shared data platform and operational consumers)
