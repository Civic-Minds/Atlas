# History backfill candidates with major service changes

Research date: 2026-10-27

## Scope and method

This is a targeted research pass over Atlas agencies with fewer than 10 distinct years in the current production `atlas/history-config.json`. Year counts are from the live catalog queried on 2026-10-27; they are not inferred from agency age or the availability of a current feed.

The candidates below were selected because an agency or public authority source documents a material service increase, decrease, redesign, or network expansion. A service-change story makes the agency more valuable for History, but does not by itself prove that a usable historical GTFS archive exists. Archive feasibility remains a separate backfill check.

## Recommended candidates

| Priority | Agency | Atlas slug | Current History years | Change signal | Backfill view |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Caltrain | `caltrain` | 4 | Electrified timetable launched with 20% more train service overall, half-hourly weekend service, and shorter trips in September 2024. | Highest-value candidate; major, quantified timetable change and an MDB/archive lead already exists. |
| 2 | WMATA | `wmata` | 2 | 2025 Better Bus Network added 30% more routes to the Frequent Service Network and weekend service for 20,000 more residents; every Metrobus route changed in June 2025. | Highest-value network redesign candidate; archive depth still needs confirmation. |
| 3 | SacRT | `sacrt` | 5 | 2024 plan introduced 15-minute Gold Line service to Folsom, added first-ever Folsom weekend bus service, and reduced/eliminated some low-ridership service. | Strong mixed increase/decrease story; local historical archive work is already partially prepared. |
| 4 | NORTA | `norta` | 7 | Winter 2024 change reduced fixed-route bus service by an additional 20%; the Title VI report documents route-level headway increases. | Strong decrease story; RIDE/New Orleans archive provides a plausible historical source. |
| 5 | Brampton Transit | `brampton` | 9 | 2024 service changes adjusted Züm Queen frequencies, while the 2023–2027 plan reports 77,000 added service hours and new/expanded Züm corridors. | Near threshold and highly actionable; one additional usable year would qualify it. |
| 6 | AC Transit | `actransit` | 2 | Realign changes increased frequency and hours on several lines, while reducing frequency on Line 65 and eliminating some early-morning trips on Line 73. | Strong route-level before/after candidate; MDB/current-source limitations need resolution. |
| 7 | Edmonton Transit Service | `edmonton` | 1 | ETS added approximately 1,000 weekly hours in 2025, including frequency increases on overloaded routes; its 2025/26 plan reports 50,000 annual service hours added. | Strong expansion story; Valley Line opening also creates a major network-change boundary. |
| 8 | Transfort | `transfort` | 2 | The August 2026 optimization plan introduced a simpler grid network and more frequent service on key routes, while reducing Sunday Dial-A-Ride service. | Strong recent redesign; Transitland archive access is the main feasibility question. |
| 9 | BART | `bart` | 3 | BART reports increased nights/weekends service in 2023, alongside other frequency changes including 15-to-20-minute reductions on some branches and increased midday Yellow Line service. | Valuable mixed-change case; requires careful route/branch identity matching. |
| 10 | NFTA-Metro | `nfta` | 3 | NFTA’s official 2022 performance report says fixed-route weekday service was 20% below pre-pandemic levels and describes a system-wide redesign to match demand and available resources. | Strong decrease/redesign story; MDB historical coverage already reaches multiple older years. |

## Evidence notes

### Caltrain — `caltrain`

Caltrain’s official electrification announcement says the September 21, 2024 schedule was faster and more frequent, with 20–15 minute peak service at 16 stations, half-hourly weekend trains, and 20% more train service overall. This is an unusually clear before/after boundary for route-level historical comparison.

Source: [Caltrain commences fully electrified service](https://www.caltrain.com/news/caltrain-commences-fully-electrified-service)

### WMATA — `wmata`

WMATA’s official Better Bus materials describe the June 29, 2025 launch as the first comprehensive Metrobus redesign in 50 years. The 2025 network added 30% more routes to the Frequent Service Network and gave 20,000 more DMV residents weekend service. WMATA also states that every Metrobus route changed at launch, making this a strong network-wide History case.

Sources: [Better Bus Network project](https://www.wmata.com/initiatives/plans-and-projects/better-bus/about-the-project.html), [2025 Annual Transformation Report](https://www.wmata.com/initiatives/strategic-plan/upload/2025-Annual-Transformation-report.pdf)

### SacRT — `sacrt`

SacRT’s 2024 service-modification material documents 15-minute Gold Line service between Sunrise and Historic Folsom on weekdays. The adopted plan also describes adding first-ever weekend bus service in Folsom while trimming service to some low-ridership stops and eliminating one minimally used route. This provides both an increase and a decrease in the same planning package.

Sources: [SacRT 2024 service modifications](https://www.sacrt.com/sacrt-proposed-2024-service-modifications-2/), [SacRT 2024 Final Plan and Title VI Analysis](https://iportal.sacrt.com/WebApps/SRTDBM/MeetingDocs/Archives/2024/SacRT%20Board%20of%20Directors%20-%20June%2010%2C%202024%20-%20Combined%20File.pdf)

### NORTA — `norta`

NORTA’s December 2023 rider bulletin states that the January 14, 2024 schedule reduced fixed-route bus service by an additional 20% because of vehicle-maintenance constraints. The accompanying Title VI analysis records route-level headway increases, including Route 27 changing from 35 to 53 minutes. This is a direct, quantified service-degradation case.

Sources: [RTA Rider’s Digest, December 2023](https://content.govdelivery.com/accounts/LANORTA/bulletins/38172bc), [Winter 2024 Service Change Title VI Analysis](https://norta.legistar.com/View.ashx?GUID=1FD15E61-8C70-450E-890F-5F5F59138518&ID=12702666&M=F)

### Brampton Transit — `brampton`

Brampton’s official September 2024 service notice records changed peak and midday frequencies on Züm Queen and Züm Queen West. The city’s 2025 service-plan material reports 77,000 added service hours, ongoing service-span expansion, and planned Züm corridor expansion. Brampton is already at nine Atlas years, so the archive search has a near-term payoff.

Sources: [September 2024 service changes](https://www.brampton.ca/EN/City-Hall/News/Pages/Service-and-Information-Update.aspx/531), [2025 Public Information Centre service-plan material](https://www.brampton.ca/EN/residents/transit/service-alerts/Documents/BramptonTransit_PICBoards_WEB_Feb2025.pdf)

### AC Transit — `actransit`

AC Transit’s Realign service-change page documents several material route-level changes: Line 12 increases to 20-minute weekday frequency with longer hours; Line 52 increases to 15-minute weekday frequency; Line 65 decreases to 45-minute weekday frequency; and Line 73 eliminates early-morning trips while extending other hours. This is a strong comparison dataset even though the current MDB history is shallow.

Source: [AC Transit Realign service changes](https://www.actransit.org/realign/service-changes)

### Edmonton Transit Service — `edmonton`

Edmonton’s 2024/25 service plan says ETS added approximately 1,000 weekly hours in 2025, prioritizing overloaded routes and conversion of one On Demand zone to conventional service. The 2025/26 plan reports 50,000 annual service hours added and increased frequency on Route 747. The Valley Line Southeast opening on November 4, 2023 is an additional major network boundary.

Sources: [2024/25 ETS Annual Service Plan](https://www.edmonton.ca/sites/default/files/public-files/documents/2024-2025-Edmonton-Transit-Service-Annual-Service-Plan.pdf), [2025/26 ETS Annual Service Plan](https://www.edmonton.ca/sites/default/files/public-files/documents/2025-2026-edmonton-transit-service-annual-service-plan.pdf), [Valley Line](https://www.edmonton.ca/projects_plans/transit/valley-line-lrt-mill-woods-to-lewis-farms)

### Transfort — `transfort`

Transfort’s October 2026 official explanation says Phase 1 of its Optimization Plan launched August 17, 2026. The updated network uses a simpler grid design and more frequent service on key routes, while Dial-A-Ride no longer operates Sundays. This is a recent, clearly dated redesign with both fixed-route increases and paratransit reductions.

Source: [What to Know About Transfort’s Service Changes](https://ridetransfort.com/what-to-know-about-transforts-service-changes/)

### BART — `bart`

BART’s official financial-crisis page documents a mixed post-pandemic service pattern: nights and weekends were increased as demand returned, some branches moved from 15-minute to 20-minute weekday frequencies, peak Yellow Line commute trains were eliminated, and Yellow Line midday service increased from 15 to 10 minutes. This combination makes BART useful for studying both reinvestment and retrenchment.

Source: [BART financial crisis and service history](https://www.bart.gov/about/financials/crisis)

### NFTA-Metro — `nfta`

NFTA-Metro’s official 2022 performance report says it provided 20% less fixed-route weekday service than pre-pandemic levels, primarily because of workforce challenges. It also says the agency implemented a system-wide network redesign to align service with demand and available resources. This is a strong documented decrease and redesign signal, though the report’s baseline is pre-pandemic rather than a single schedule date.

Source: [NFTA-Metro FY 2022 Annual Performance Report](https://metro.nfta.com/media/n1ihvike/metro-annual-performance-report-2022.pdf)

## Research order

1. Caltrain
2. Brampton Transit
3. SacRT
4. NORTA
5. WMATA
6. Edmonton Transit Service
7. AC Transit
8. Transfort
9. BART
10. NFTA-Metro

The first six combine a strong service-change story with either an identified archive route or a near-term eligibility payoff. The remaining four are worthwhile but need a separate archive-access check before any live backfill is authorized.
