# Product decisions

This is the one place for settled rules and the decisions behind them. Check "Settled rules" before asking Ryan anything, and do not re-ask what it answers; if a rule has no new evidence against it, it stands. New decisions go into the log below (newest first), and into the rules when they change how Atlas behaves.

Each rule gives what it does, why, and where it came from. "Linear CIV-nnn, comment of date" is a decision by Ryan recorded in Linear.

## Settled rules

### How a route's frequency is decided

- **Every direction must pass**
  - What: a route's value is its worst direction's; a direction with stray trips but no real service voids the route.
  - Why: a route that is frequent one way only is not frequent.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rule 4
- **Branches count only when they run steadily, and the slower one decides**
  - What: a branch counts in a period only if it runs steadily through it; stray trips and bursts never set the value.
  - Why: a straggler or a rare short turn is not service a rider can plan around.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rules 1, 3 and 5
- **A value needs 3 departures, not a percentage**
  - What: 3 departures (2 gaps) is the minimum to read a pattern; after an edge allowance it is 4.
  - Why: 2 trips cannot show a cadence; 4 would reject real half-hourly service. Riders feel frequency, not share of trips.
  - Source: [methodology INDEX](../engineering/pipeline-studies/frequency-tier-methodology-2026-10/INDEX.md) (Minimum evidence), [#571](https://github.com/Civic-Minds/Atlas/issues/571), Linear CIV-321, comment of 2026-10-18
- **Frequency tolerances are settled**
  - What: 10% near misses for the 5 to 15 minute tiers, 5% for 20 to 60, cap of 3 gaps, one 10-minute allowance per true service edge.
  - Why: chosen from a census of 1,160 feeds and a review of example routes. Check these before asking.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) (Thresholds), [#567](https://github.com/Civic-Minds/Atlas/issues/567), [#568](https://github.com/Civic-Minds/Atlas/issues/568), [#570](https://github.com/Civic-Minds/Atlas/issues/570), [#571](https://github.com/Civic-Minds/Atlas/issues/571), PR [#584](https://github.com/Civic-Minds/Atlas/pull/584)
- **One gap reads "no regular service during this period"**
  - What: when a number is only one gap between a few departures, the row says this instead of the number, everywhere.
  - Why: the old short wording read as if the route never has regular service.
  - Source: Linear CIV-296, comments of 2026-10-17; [#954](https://github.com/Civic-Minds/Atlas/issues/954), [#955](https://github.com/Civic-Minds/Atlas/issues/955)
- **A route with no all-day value stays without one**
  - What: a direction that does not run at midday is "limited" and gets no all-day value; a busy stretch alone never passes a route.
  - Why: a peak-only route is not all-day service.
  - Source: [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rules 7, 8 and 11, [#899](https://github.com/Civic-Minds/Atlas/issues/899)
- **The route grade follows the existing branch and steady filter rule**
  - What: the route's grade comes from the same branch and steady rules above, with no second rule for grading.
  - Why: one rule means the map, cards and filter always agree.
  - Source: Linear CIV-321 (decision 2026-10-18: "we break it down based on branch and provide a range"); [FREQUENCY_RULES.md](FREQUENCY_RULES.md) rules 1 to 3
- **No fixed cut-offs**
  - What: never summarize an agency or area by a fixed threshold such as "every 15 min or better"; show the real waits per period.
  - Why: many agencies have no routes that frequent, so a cut-off hides them.
  - Source: [STYLE.md](../STYLE.md) (Frequencies), Linear CIV-296, comment of 2026-10-17 ("no fixed frequency cut-off")

### What the map shows and never shows

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
  - Source: [STYLE.md](../STYLE.md) (Agencies), [DATA_PRINCIPLES.md](../data/DATA_PRINCIPLES.md)

### How Atlas is built

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

### Data and pipeline fixes

- **Data integrity first**
  - What: never show wrong or misleading information; hide or hold first, fix after.
  - Why: a wrong number on the map costs more trust than a missing one.
  - Source: Ryan, standing rule (data integrity first: "never show wrong or misleading info"); [DATA_PRINCIPLES.md](../data/DATA_PRINCIPLES.md) (Why this matters)
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
  - Source: [STYLE.md](../STYLE.md) (Live)

### How we talk to riders and planners

- **New UI text needs Ryan's word-for-word OK**
  - What: no new wording, note or label, including an existing note shown in a new situation, without his yes on that exact text.
  - Why: a proposal in Linear or an issue is not approval; "you decide" on data does not cover what users see.
  - Source: [STYLE.md](../STYLE.md) (New wording needs a yes)
- **Removing something Ryan approved needs his OK**
  - What: taking out an approved element or wording is a UI change like any other.
  - Why: he approved it on purpose.
  - Source: [STYLE.md](../STYLE.md) (New wording needs a yes)
- **Every UI change is shown on localhost before it merges**
  - What: a running localhost URL plus one line on what to check; a reviewer's approval is not design approval.
  - Why: Ryan signs off on how Atlas looks.
  - Source: [STYLE.md](../STYLE.md) (top)
- **Plain words, no all-caps, no dark fills**
  - What: labels a non-expert understands at once ("Part-time", not "Time-limited"); selected states are pale, never solid dark.
  - Why: settled look and voice; the glossary lists the UI word for each internal term.
  - Source: [STYLE.md](../STYLE.md), [GLOSSARY.md](../GLOSSARY.md)
- **Frequencies are written by one function, in minutes**
  - What: "every 10 min", "every 16 min", ranges with an en dash; never hours, never typed by hand.
  - Why: the same frequency reads the same on every surface, and columns never mix units.
  - Source: [STYLE.md](../STYLE.md) (Frequencies), [#938](https://github.com/Civic-Minds/Atlas/issues/938)

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

## Decision log

Dated, newest first. The rules above are the short form; this is the reasoning.

### 2026-10-18 — Line sections, the route grade and skipped stations follow the route rules

Ryan (Linear CIV-321, 2026-10-18): a route's grade follows the existing branch and steady rule ("we break it down based on branch and provide a range"); a line section needs 3 departures in a period, then the same filter and "Hide limited service" behaviour as a route; a line is coloured by every train along it, including trains that skip a stop, while the station card shows the station's own frequency. A value needs 3 departures (4 after an edge allowance), not a percentage. See the rules under "How a route's frequency is decided" and "What the map shows".

### 2026-10-18 — Live shows good days only and names the days it leaves out

Ryan (Linear CIV-284 of 2026-10-17 and CIV-293 of 2026-10-18): every Live surface counts only days with good recordings and names the left-out days ("Excluding Oct 11"), shown only when a day is left out. See "How Live reads".

### 2026-10-17 — Live wording and layout

Ryan (Linear CIV-293, 2026-10-17): late means more than 5½ minutes behind the timetable, with one shared wording; math explanations stay visible; the sidebars never scroll or collapse; the agency report is a rolling 7 days; the strip is the model for Live visuals. See "How Live reads".

### 2026-10-17 — One-gap rows, no fixed cut-offs, lettered variants

Ryan (Linear CIV-296 and CIV-115, 2026-10-17): a number that is only one gap between a few departures reads "no regular service during this period" ([#954](https://github.com/Civic-Minds/Atlas/issues/954), [#955](https://github.com/Civic-Minds/Atlas/issues/955)); never summarize an agency by a fixed frequency cut-off; lettered variants with no shared street stay separate ([#303](https://github.com/Civic-Minds/Atlas/issues/303)).

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
