# Frequent-Service Research Pilot

**Status:** Initial five-agency pilot  
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

## Findings

1. There is no single universal agency definition. The pilot includes a strict 10-minute network, a 15-minute corridor network, a 2–12-minute two-tier bus product, a 15-minute map category, and a negative publication result.
2. “Frequent” often describes corridors or a customer-facing network, not an entire route in both directions. Atlas’s route-level terminal test is therefore a useful comparable metric but not a direct reproduction of every agency’s definition.
3. The service span matters as much as the threshold. The sample ranges from 6am–8pm to 6am–1am, with different weekend rules.
4. STM is the first concrete sign that the current endpoint-based comparison can undercount an agency’s official frequent network. It needs a stop/corridor comparison before the metric is used for qualitative conclusions.
5. The Frequent Service research view should distinguish two concepts:
   - **Official frequent network:** what the agency publishes.
   - **Atlas comparable metric:** the same rule applied consistently across agencies.

## Next step

Before expanding to all agencies, add an agency-specific research record with source URL, definition type, threshold, span, days, mode scope, and geography scope. Then test the official STM list and TransLink corridors against stop-level or corridor-level Atlas results. Only after that should the five-agency method be scaled.
