# Agency Pain Points & Problem Statements

Research synthesis informing Atlas NextGen's product direction. Sources are transit industry publications, FTA reports, APTA data, and academic literature.

---

## 1. On-Time Performance Metrics Are Broken

Standard OTP measures the percentage of *services* that depart timepoints on schedule — not the percentage of *riders* served on time. Because delayed routes carry more passengers, aggregate OTP systematically overstates reliability from the passenger's perspective.

For high-frequency routes (≤10 min headway), schedule adherence is the wrong metric entirely. What matters is headway consistency. A bus running 10 minutes late on a 10-minute headway route is indistinguishable from on-time service to the rider waiting at a stop — but shows 0% OTP under standard measurement.

There is also a documented **vicious cycle**: operators are penalized for leaving timepoints early, so they wait. Schedulers see that early departures are rare and conclude running times are appropriate. Padding accumulates. Routes get slower and more expensive. What's happening *between* timepoints — where lateness actually originates — is invisible without segment-level data.

Sparse timepoint placement compounds this: a route can show 93%+ on-time performance while departing early from intermediate stops three out of four times.

**What this means for Atlas:** Headway-based OTP and segment-level analysis aren't nice-to-haves — they're the correction to a metric agencies know is broken but are trapped using. Atlas surfaces what the standard metric hides.

Sources: [Swiftly — The Vicious Cycle of Timepoint Adherence](https://www.goswift.ly/blog/the-vicious-cycle-of-timepoint-adherence), [Human Transit — Beyond On-Time Performance](https://humantransit.org/2010/10/beyond-on-time-performance.html), [Peak Transit — Inaccurate Schedule Adherence](https://www.peaktransit.com/navigating-the-challenges-of-inaccurate-schedule-adherence-in-public-transit)

---

## 2. NTD Reporting Is a Manual Nightmare

The National Transit Database determines 20–50% of each agency's annual federal funding — roughly $5 billion distributed nationally. Agencies must report Vehicle Revenue Miles, Unlinked Passenger Trips, and related metrics on weekly and monthly cycles. For most agencies, this means staff manually sourcing data from CAD/AVL and APC systems in incompatible formats, running custom SQL or spreadsheets, and doing manual validation.

One transit planner's verbatim quote: *"Pulling data for the NTD is the bane of my existence. It's truly mind-numbing work."*

FTA itself acknowledges its NTD system "is not very user friendly" and that validation "is time consuming and a burden for transit agencies."

**What this means for Atlas:** Automated NTD-ready reporting is a concrete, budget-defensible value proposition with clear willingness to pay. It's the kind of thing a procurement manager can point to when justifying a subscription.

Sources: [Swiftly — NTD Reporting Just Got a Little Easier](https://www.goswift.ly/blog/ntd-reporting-just-got-a-little-easier), [FTA — Performance Management](https://www.transit.dot.gov/PerformanceManagement)

---

## 3. Agencies Don't Trust Their Own Data

AVL systems — the backbone of real-time operations — produce unreliable data at scale. Geofence-based OTP calculations can be up to 15% inaccurate. Terminal departure times can be off by up to 30%. Operator log-in rates to vehicle systems hover at 50–75%, meaning a significant share of trips have no real-time vehicle assignment — passengers see static schedules instead of live ETAs.

Different departments work from different data. Planning uses one dataset; operations uses another; the board gets a third. The result is "miscommunications across operations, planning, contractor, and operator teams."

**What this means for Atlas:** Feed health scoring and ghost bus detection aren't just product features — they address a trust problem agencies already feel acutely.

Sources: [Swiftly — Transforming Transit with High-Quality Data](https://www.goswift.ly/blog/transforming-transit-with-high-quality-data), [Swiftly — 3 Lessons from Data Therapy Sessions](https://www.goswift.ly/blog/3-lessons-from-hundreds-of-data-therapy-sessions)

---

## 4. Data Silos Block Analysis

AVL, APC (passenger counts), AFC (fare transactions), scheduling software, and GIS systems are almost universally siloed at transit agencies. Integrating them is described in FTA research as "non-trivial." Custom one-off connectors break when vendors update. There is no agreed standard for archived operational data — the very data most useful for planning.

GTFS handles published schedules. GTFS-RT handles real-time positions. There is no widely adopted standard for archived operational data. TIDES (Transit ITS Data Exchange Specification) has been proposed but not adopted.

**What this means for Atlas:** A unified layer that normalizes GTFS-RT data across agencies — and eventually connects to APC and AFC — is solving a real structural problem, not just adding another dashboard.

Sources: [FTA Report 0218 — Emerging Data Science for Transit](https://www.transit.dot.gov/research-innovation/emerging-data-science-transit-market-scan-and-feasibility-analysis-report-0218), [Oregon DOT — APC/AFC White Paper](https://www.oregon.gov/odot/RPTD/RPTD%20Document%20Library/APC-AFC-White-Paper-Trillium-2021.pdf)

---

## 5. Service Planning Without Evidence

Predicting how ridership will change when a route is added, cut, or restructured is extremely difficult. Standard approaches use travel demand models (STOPS, VISUM, TransCAD) that are expensive, slow, require specialist expertise, and often use data that is months or years out of date.

Most mid-sized agencies lack tools to do rigorous before/after analysis of service changes. They rely on informal judgment and whatever the scheduling vendor's software surfaces. When presenting to a board or council, planners struggle to produce defensible evidence.

Bus network redesigns are particularly fraught: they produce winners and losers by neighbourhood, and agencies rarely have the spatial tools to communicate this clearly to elected officials.

**What this means for Atlas:** Atlas's GTFS static analysis layer combined with live position data is a foundation for before/after service change analysis — something agencies currently can't do without expensive consultants.

Sources: [Eno Center — Bus Network Redesigns in the Modern Age](https://enotrans.org/article/bus-network-redesigns-in-the-modern-age-how-u-s-transit-agencies-adapt-to-evolving-travel/), [National Academies — Fixed-Route Transit Ridership Forecasting](https://nap.nationalacademies.org/catalog/14001/fixed-route-transit-ridership-forecasting-and-service-planning-methods)

---

## 6. Equity Analysis Is Mandated but Poorly Tooled

Title VI of the Civil Rights Act requires agencies receiving federal funding to demonstrate that service changes don't disproportionately harm minority and low-income populations. Most agencies do this in GIS manually, using Census data that may be 2–5 years out of date.

TransitCenter's research is blunt: "data programs at most public agencies lag behind industry best practice." Without internal data champions and resources, equity analysis becomes a checkbox exercise.

**What this means for Atlas:** The GTHA frequent transit coverage pipeline already does walkshed + population overlay. Demographic integration is an extension, not a new product.

Sources: [TransitCenter — What Transit Agencies Get Wrong About Equity](https://transitcenter.org/what-transit-agencies-get-wrong-about-equity-and-how-to-get-it-right/), [APTA — Transit Equity Report 2024](https://www.apta.com/wp-content/uploads/APTA-Transit-Equity-Report-202409-FINAL.pdf)

---

## 7. Agencies Can't Hire Data Analysts

92% of transit agencies report difficulty hiring, and the shortages extend beyond operators: maintenance (65%), dispatch (48%), and data/analytics roles. FTA's market scan identifies retaining in-house analysts as a persistent challenge.

This creates a specific product constraint: **software must be usable by planners without data science backgrounds.** Tools that require Python or SQL will not be adopted.

**What this means for Atlas:** Phase 3 frontend design is as important as the backend. No-code interfaces for planners, not dashboards built for analysts.

Sources: [APTA — Transit Workforce Shortage Report](https://www.apta.com/wp-content/uploads/APTA-Transit-Workforce-Shortage-Report.pdf), [FTA — Emerging Data Science for Transit](https://www.transit.dot.gov/research-innovation/emerging-data-science-transit-market-scan-and-feasibility-analysis-report-0218)

---

## 8. Budget Pressure and the Case for Data

About half of transit agencies expect severe budget problems through FY2028. Agencies need to make the case to city councils and state legislatures for sustained funding — which requires compelling, accessible performance data in non-technical formats.

Most agencies lack internal tools to produce board-ready dashboards, transparent public performance reports, or before/after service change analyses. They hire consultants, build reports manually in PowerPoint, or don't report clearly at all.

**What this means for Atlas:** Automated public-facing performance reporting is a trust and advocacy tool, not just an operations feature. Agencies under budget pressure need to *show* they're performing.

Sources: [McKinsey — Finding a Route to Fiscal Stability for US Transit Agencies](https://www.mckinsey.com/industries/infrastructure/our-insights/finding-a-route-to-fiscal-stability-for-us-transit-agencies), [APTA — 2025 Public Transportation Fact Book](https://www.apta.com/wp-content/uploads/APTA-2025-Public-Transportation-Fact-Book.pdf)

---

## Summary: What Atlas Addresses

| Pain Point | Atlas Capability |
|---|---|
| OTP metrics are broken for frequent routes | Headway-based OTP, segment-level analysis |
| NTD reporting takes weeks manually | Automated NTD-ready data extraction (future) |
| Agencies don't trust their own data | Feed health scoring, ghost bus detection |
| No before/after service change analysis | GTFS static + live data comparison (future) |
| Equity analysis is manual GIS work | Walkshed + demographic overlay (future) |
| No board-ready performance dashboards | Public performance reporting layer (future) |
| Can't hire data analysts | Planner-first UI — no code required (Phase 3 constraint) |
| Bus bunching is invisible until it's visible | Bunching detection + headway collapse alerts |

---

[Back to Roadmap](../ROADMAP.md)
