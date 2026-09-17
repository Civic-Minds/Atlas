# Frequent-Service Research Pilot

**Status:** 132 of 200 agency reviews complete
**Checked:** 2026-09-16  
**Purpose:** Compare what agencies officially call “frequent” with what their current GTFS schedules provide.

## Method

The official definition is taken from an agency system map, frequent-network page, service guideline, or planning document. A map legend counts as evidence when it labels a route or corridor as frequent, but it does not automatically provide a numeric threshold.

Atlas comparison data was generated locally with the current pipeline in dry-run mode. No R2 or public agency data was changed. Counts below are **route-pattern/day units** keyed by route short name, direction, and headsign; they are not final unique-route counts and should not be presented as agency route totals.

The comparison columns mean:

- `daytime15`: no gap over 15 minutes from 7am–7pm
- `daytime30`: no gap over 30 minutes from 7am–7pm
- `extended15`: no gap over 15 minutes from 7am–midnight
- `extended30`: no gap over 30 minutes from 7am–midnight

The authoritative review tracker is the [structured agency catalog](frequent-service-catalog.json). It contains 132 completed records and 68 planned records. This is evidence-gathering work: the catalog documents the landscape and does not by itself change Atlas's production frequency definitions. A record may have an Atlas comparison marked `not_run` when the agency has no Atlas configuration or the comparison was not part of the source review.

## Results

| Agency | Official finding | Weekday Atlas comparison | Saturday | Sunday | Confidence |
|---|---|---:|---:|---:|---|
| TTC | 10-Minute Network; 6am–1am Monday–Saturday and all day Sunday | 122 / 316 / 86 / 276 | 91 / 285 / 85 / 269 | 15 / 54 / 15 / 52 | Explicit |
| Calgary Transit | No single frequent-network definition located in the reviewed system-map and service-guideline materials | 6 / 81 / 4 / 54 | 4 / 70 / 4 / 52 | 4 / 66 / 4 / 51 | Not found |
| TransLink Vancouver | Frequent Transit Network; 15 minutes or better on corridors, with daily starts at 6am weekdays, 7am Saturday, 8am Sunday, until 9pm | 36 / 156 / 17 / 100 | 17 / 120 / 12 / 87 | 4 / 84 / 4 / 65 | Explicit, corridor-based |
| STM Montréal | Frequent routes usually 2–12 minutes; separate all-day and peak-only categories; all-day span 6am–8pm weekdays | 0 / 0 / 0 / 0 | 8 / 47 / 8 / 31 | 8 / 32 / 8 / 23 | Explicit, but comparison mismatch |
| SEPTA Philadelphia | Frequent Red bus routes; 15 minutes or better, 6am–9pm weekdays, with enhanced weekend service | 28 / 99 / 5 / 50 | 4 / 45 / 4 / 32 | 3 / 25 / 3 / 16 | Explicit |

Column order is `daytime15 / daytime30 / extended15 / extended30`.

## Agency notes and sources

### TTC

The current TTC system map identifies a 10-Minute Network and distinguishes it from regular and limited service. The map describes a 6am–1am Monday–Saturday span, with all-day Sunday service. This is stricter than Atlas’s current 15-minute research threshold but has a broadly similar long-span concept.

Source: [TTC System Map](https://cdn.ttc.ca/-/media/Project/TTC/DevProto/Images/Home/Routes-and-Schedules/Landing-page-pdfs/TTC_SystemMap.pdf?rev=88203dbcf60c47738cf9acc980c45cad).

### Calgary Transit

The reviewed [Calgary system map](https://www.calgarytransit.com/content/dam/transit/rider-information/System%20Map%20Dec%202025.pdf) and [Service Guidelines](https://www.calgarytransit.com/plans---projects/long-term-strategic-plans/service-guidelines.html) establish network and planning guidance, but no single rider-facing frequent-network threshold was located during this pass. This is a useful negative-control result: an agency can have frequent routes without publishing a named “frequent” product.

The GTFS still produces a small number of routes meeting Atlas’s strict 15-minute rule, so “no official definition found” must not be reported as “no frequent service exists.”

### TransLink

TransLink explicitly defines the Frequent Transit Network as corridors with service at least every 15 minutes throughout the day and evening, every day. The published span starts at 6am weekdays, 7am Saturdays, and 8am Sundays, and runs until 9pm. It may be supplied by buses, SkyTrain, or multiple modes.

Source: [TransLink Frequent Transit Network](https://www.translink.ca/plans-and-projects/projects/frequent-transit-network).

This is not directly equivalent to Atlas’s route-level terminal test: the agency definition is corridor-based and can combine modes.

### STM

STM publishes two frequent-route categories. Its all-day frequent routes operate in both directions from 6am–8pm Monday–Friday; its peak-only category operates roughly 6:30–9:30am and 3–6pm in the busiest direction. The published frequency is usually 2–12 minutes, with qualifying language rather than a strict guarantee.

Source: [STM Lignes fréquentes](https://www.stm.info/fr/infos/reseaux/le-reseau-des-bus-et-les-horaires-expliques/lignes-frequentes).

The local Atlas comparison found zero weekday route-pattern/day units under the current full-window terminal rule. That is a diagnostic result, not a conclusion that STM lacks frequent service. Next investigation: compare the STM list against stop-level or corridor-level headways and verify whether the feed’s route-direction terminal departures are the wrong unit for this agency.

### SEPTA

SEPTA’s current bus-network materials identify “Frequent Red” routes and define them as arriving every 15 minutes or better from 6am–9pm on weekdays, with enhanced weekend service. The designation is explicitly map-facing: the colour is used on maps, signs, and digital displays.

Sources: [SEPTA Maps](https://wwww.septa.org/maps/) and [New Maps and Signs for a New Bus Network](https://wwww.septa.org/initiatives/bus/maps-signs/).

This is close to Atlas’s 15-minute research rule, but the official span extends two hours later than the current 7am–7pm daytime window.

## Round 2: cataloguing every published tier

The second round deliberately records all service tiers shown in the agencies' materials. A tier is not reduced to a single “frequent” value when the agency publishes separate products, time bands, or map classes.

### Tier catalog

| Agency | Published tier / label | Official threshold or meaning | Span / days | Geography / mode | Confidence |
|---|---|---|---|---|---|
| BC Transit (Victoria) | RapidBus | ≤15 min | 7am–10pm, 7 days | Corridor/product; bus | Explicit |
| BC Transit (Victoria) | Frequent Route | ≤15 min | 7am–7pm, Monday–Friday | Route/product; bus | Explicit |
| BC Transit (Victoria) | Regional Route | 15–60 min; limited stops | Not specified in map legend | Route/product; bus | Explicit |
| BC Transit (Victoria) | Local Route | 20–120 min | Not specified in map legend | Route/product; bus | Explicit |
| Edmonton Transit Service | Frequent Route | ≤15 min most times of day | Not specified | Route category; bus | Explicit, soft span |
| Edmonton Transit Service | Rapid Route | Rapid service label; no numeric threshold in reviewed map legend | Not specified | Route category; bus | Label explicit; threshold not found |
| Edmonton Transit Service | Express Service | Express/limited-stop label; not a frequency tier | Not specified | Route category; bus | Explicit distinction |
| Winnipeg Transit | Rapid Transit Lines | 4–10 min peak; 5–10 min off-peak; 10–30 min nights/weekends | Period-based | Primary network; bus | Explicit |
| Winnipeg Transit | Frequent Express Lines | 5–15 min peak; 10–15 min off-peak; 10–30 min nights/weekends | Period-based | Primary network; bus | Explicit |
| Winnipeg Transit | Frequent Lines | 10–15 min peak/off-peak; 10–30 min nights/weekends | Period-based | Primary network; bus | Explicit |
| Winnipeg Transit | Direct Lines | 10–20 min peak; 10–20 min off-peak; 15–30 min nights/weekends | Period-based | Primary network; bus | Explicit |
| Winnipeg Transit | Connector Routes | 15–30 min peak/off-peak; 20–60 min nights/weekends | Period-based | Feeder network; bus | Explicit |
| Winnipeg Transit | Community Routes | 30–60 min | Period-based | Feeder network; bus | Explicit |
| Winnipeg Transit | Limited-Span Service | Service as needed; limited hours, often peak-only | Limited span | Route/product; bus | Explicit, non-frequency tier |
| King County Metro | Frequent all-day route | ≤15 min until 6pm Monday–Friday | Weekday daytime | Route/corridor; bus | Explicit |
| King County Metro | RapidRide | Rapid transit product; reviewed map distinguishes it from frequent all-day routes | Product-specific | Route/corridor; bus | Product explicit; threshold not normalized |
| King County Metro | Peak-only route | Peak-only service category | Peak periods | Route category; bus | Explicit, non-frequency tier |
| Miami-Dade Transit | 10 minutes or less | ≤10 min weekday midday | Map shows midday; peak and span are separate | Network map; bus | Explicit |
| Miami-Dade Transit | 15 minutes | ≤15 min weekday midday | Map shows midday; peak and span are separate | Network map; bus | Explicit |
| Miami-Dade Transit | 20 minutes | 20 min weekday midday band | Map shows midday | Network map; bus | Explicit |
| Miami-Dade Transit | 30 minutes | 30 min weekday midday band | Map shows midday | Network map; bus | Explicit |
| Miami-Dade Transit | 40–60 minutes | 40–60 min weekday midday band | Map shows midday | Network map; bus | Explicit |
| Miami-Dade Transit | MAX / Rapid | Limited-stop product; not itself a headway tier | Some routes all-day, others peak | Route/product; bus | Explicit distinction |

### Round 2 Atlas comparison

| Agency | Weekday | Saturday | Sunday | Feed / quality note |
|---|---:|---:|---:|---|
| BC Transit (Victoria) | 2 / 17 / 0 / 7 | 0 / 11 / 0 / 7 | 0 / 7 / 0 / 4 | 2,703 features; review 80/100 |
| Edmonton Transit Service | 6 / 124 / 4 / 35 | 6 / 36 / 6 / 35 | 6 / 26 / 6 / 26 | 7,225 features; review 90/100 |
| Winnipeg Transit | 15 / 55 / 1 / 24 | 1 / 27 / 0 / 19 | 1 / 13 / 0 / 6 | 4,213 features; review 90/100 |
| King County Metro | 0 / 0 / 0 / 0 | 7 / 64 / 1 / 46 | 4 / 60 / 0 / 47 | 7,147 features; degraded 25/100; feed expired |
| Miami-Dade Transit | 15 / 53 / 3 / 16 | 14 / 42 / 3 / 18 | 9 / 24 / 3 / 10 | 7,535 features; review 90/100 |

Column order is `daytime15 / daytime30 / extended15 / extended30`, using the same route-pattern/day unit as Round 1. These are dry-run results only; no agency data was published.

### Round 2 sources and interpretation

**BC Transit (Victoria).** The [Victoria Regional Guide](https://www.bctransit.com/wp-content/uploads/591/806/6983_VIC_RG-v5.pdf) explicitly separates RapidBus, Frequent Route, Regional Route, and Local Route. RapidBus and Frequent Route both use a 15-minute threshold but have different spans and days; Regional and Local are broader service bands, not frequent tiers.

**Edmonton.** The [ETS day map](https://www.edmonton.ca/sites/default/files/public-files/ETS-Day-Map-May-2025.pdf?cb=1750622712) labels “Frequent Route — 15 min. or better most times of the day” and separately labels Rapid Route and Express Service. The [Riding ETS guidance](https://www.edmonton.ca/ets/riding-ets/ets/riding-ets) provides supporting context of five-minute weekday peak service and roughly 10–15-minute off-peak service, but this should not be silently substituted for the map's route classification.

**Winnipeg.** The City’s current [Understanding the network](https://www.winnipeg.ca/services-programs/transportation-roads-parking/transit/understanding-network) page defines the Primary Network as Rapid Transit, Frequent Express, Frequent, and Direct lines, with separate Connector, Community, and Limited Span classes. Its period bands make clear that “frequent” does not mean one uniform number across the whole day.

**King County Metro.** The [Metro system map](https://kingcounty.gov/en/-/media/king-county/depts/metro/maps/system/09142024/metro-system-map-central) labels RapidRide, frequent all-day, all-day, and peak-only service. Its frequent all-day example is every 15 minutes or less until 6pm Monday–Friday; multiple routes can combine to create frequent service on a corridor. That is a corridor/service-map concept, not necessarily a route-level all-day guarantee.

**Miami-Dade.** The official [Better Bus Network report](https://www.miamidade.gov/transit/library/better-bus-network-resilence-plan.pdf) publishes weekday-midday bands of 10 minutes or less, 15, 20, 30, and 40–60 minutes. It separately identifies peak routes, Express Service, and MAX/Rapid products, so those labels should be catalogued alongside frequency bands rather than merged with them.

## Findings

1. There is no single universal agency definition. Across ten agencies, the pilot includes 10-, 12-, 15-, 20-, 30-, and 40–60-minute bands, period-specific ranges, and named products whose maps do not supply a numeric threshold.
2. “Frequent” often describes corridors or a customer-facing network, not an entire route in both directions. Atlas’s route-level terminal test is therefore a useful comparable metric but not a direct reproduction of every agency’s definition.
3. The service span matters as much as the threshold. The sample ranges from 6am–8pm to 6am–1am, with different weekend rules.
4. STM is the first concrete sign that the current endpoint-based comparison can undercount an agency’s official frequent network. It needs a stop/corridor comparison before the metric is used for qualitative conclusions.
5. Published tiers should be catalogued as first-class records rather than collapsed into one agency threshold. Each record should preserve the label, numeric threshold or qualitative meaning, hours, days, geography, mode, source URL, checked date, and confidence.
6. The Frequent Service research view should distinguish two concepts:
   - **Official frequent network:** what the agency publishes.
   - **Atlas comparable metric:** the same rule applied consistently across agencies.

## Next step

Review the 68 planned agencies using the catalog's fixed source and time boundary. Keep this memo as the qualitative summary and update the structured catalog after each agency. The result is intended to document that Atlas did the research; any change to Atlas's product definition is a separate decision. Continue the STM and TransLink stop/corridor follow-up separately because the route-pattern comparison alone is not enough for corridor-based definitions.
