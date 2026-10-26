# Changes since the 2026-10-11 run

Previous: release `release-mv0iozy4` (2026-10-09), rule code #601. Now: release `release-mvislmj9` (2026-10-22), rule code `8a33431e`.

## Counts

- Agencies: 538 before, 548 now. Added 11, removed 1.
- Route-km weighted share at weekday AM peak: 6.2% to 9.9%. Sunday evening: 2.4% to 2.4%.
- With the old rule code on the new data: 6.4% and 1.2%. At AM peak the data release alone moved the total little and the rule code moved it most. The Sunday figure is not a clean baseline (see below).
- Agencies with a move of more than 5 points at AM peak or Sunday evening: 66 (59 of them with at least 50 route-km).

## How the cause was assigned

Each agency was scored twice on the new data: with the old rule code (#601, commit `8681db71`) and with the release's own code. The gap between the old CSV and the old-rule score is the data release; the gap between the two scores on the new data is the rule code. Data causes are read from signals: Sunday service appearing or vanishing, the old run showing Sunday evening above AM peak (a day-type symptom), the route set changing, route-km changing on the same routes (likely shape fix #1062), agency config commits since 2026-10-09 that touch eight or fewer agencies, and the feed date. These are likely causes, not traced fixes. Caution: the old rule code cannot read the stretch-selector values the release now carries, so where the old-rule score moves the opposite way to the current rule (common on Sunday evening) no split is given, only the data signals.

## Agencies that moved more than 5 points

### At least 50 route-km

| Agency | Route-km (before, now) | AM peak (before, now) | Sun evening (before, now) | Likely cause |
|---|---:|---:|---:|---|
| Arlington Transit (ART) (`art`) | 10, 135 | 0.0%, 36.9% | 100.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 16 pts); data release (about 100 pts): old run had Sunday evening above AM peak and this one does not (likely a day-type or reference-date fix); route set changed (+13 routes); route-km +1196% |
| MTA NYCT Subway (`nyct-subway`) | 630, 706 | 39.1%, 85.4% | 65.2%, 69.8% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: old run had Sunday evening above AM peak and this one does not (likely a day-type or reference-date fix); same routes, route-km +12% (likely shape fix #1062 or other shape changes) |
| exo (Vallée du Richelieu) (`exo-vallee-richelieu`) | 88, 124 | 0.0%, 44.1% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 44 pts) |
| GTrans (Gardena Municipal Bus Lines) (`gtrans`) | 128, 92 | 0.0%, 41.7% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 42 pts) |
| REM (Montréal) (`rem`) | 121, 121 | 37.7%, 76.8% | 76.8%, 76.8% | rule code since #601: coverage pool and stretch selector (about 38 pts) |
| Regional Municipality of Wood Buffalo Transit (`fort-mcmurray`) | 89, 106 | 0.0%, 32.9% | 0.0%, 0.0% | data release (about 33 pts): route set changed (+2 routes); route-km +20% |
| Chicago Transit Authority (CTA) (`cta`) | 1,843, 2,004 | 35.8%, 68.0% | 16.7%, 31.1% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+14 routes); route-km +9% |
| MTA NYCT Bus (Staten Island) (`nyct-bus-si`) | 520, 1,563 | 19.4%, 50.4% | 7.5%, 2.5% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+32 routes); route-km +200%; new feed (2026-09-07 to 2026-10-19) |
| Massachusetts Bay Transportation Authority (`mbta`) | 2,275, 2,384 | 0.6%, 15.2% | 41.1%, 13.3% | rule code since #601: coverage pool and stretch selector (about 2 pts); data release (about 28 pts): old run had Sunday evening above AM peak and this one does not (likely a day-type or reference-date fix); route set changed (+6 routes); new feed (2026-10-07 to 2026-10-19) |
| DASH (Alexandria) (`dash`) | 139, 139 | 0.0%, 23.7% | 0.0%, 1.5% | data release (about 24 pts): same feed date and network size, so most likely the day-type or reference-date fixes (which day's timetable is read) |
| NCSU Wolfline (`ncsu-wolfline`) | 64, 74 | 15.9%, 38.5% | 0.0%, 0.0% | data release (about 23 pts): route set changed (+2 routes); route-km +17%; agency-specific fix: `61c0d8c1` Read NCSU Wolfline as of the run date so the semester timetable shows (#774); new feed (2026-08-10 to 2026-10-19) |
| MTA NYCT Bus (Brooklyn) (`nyct-bus-brooklyn`) | 727, 784 | 46.1%, 67.3% | 13.3%, 14.4% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+2 routes); route-km +8%; new feed (2026-09-07 to 2026-10-19) |
| MTA NYCT Bus (Bronx) (`nyct-bus-bronx`) | 430, 434 | 57.8%, 77.7% | 27.0%, 33.8% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+1 routes); new feed (2026-09-07 to 2026-10-19) |
| University of Michigan Transit Services (Ann Arbor) (`um-transit`) | 74, 79 | 46.9%, 66.4% | 6.3%, 5.9% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+1 routes); route-km +6% |
| WMATA (Washington, DC) (`wmata`) | 1,830, 2,441 | 10.2%, 27.9% | 9.3%, 13.2% | rule code since #601: coverage pool and stretch selector (about 8 pts); data release (about 10 pts): route set changed (+21 routes); route-km +33%; new feed (2026-10-07 to 2026-10-19) |
| METRO Houston (`metrohouston`) | 2,278, 2,923 | 18.1%, 34.9% | 4.4%, 1.8% | rule code since #601: coverage pool and stretch selector (about 6 pts); data release (about 11 pts): route set changed (+19 routes); route-km +28%; new feed (2026-10-07 to 2026-10-12) |
| MTA NYCT Bus (Queens) (`nyct-bus-queens`) | 410, 508 | 53.2%, 69.8% | 34.4%, 23.0% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+3 routes); route-km +24%; new feed (2026-09-07 to 2026-10-19) |
| Foothill Transit (`foothill`) | 685, 955 | 0.0%, 15.1% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 15 pts) |
| MiWay (Mississauga) (`miway`) | 854, 938 | 21.7%, 36.5% | 3.1%, 2.8% | rule code since #601: coverage pool and stretch selector (about 17 pts) |
| Big Blue Bus (Santa Monica) (`bigbluebus`) | 219, 219 | 21.2%, 34.9% | 0.0%, 0.0% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split |
| DDOT (Detroit) (`ddot`) | 766, 778 | 6.2%, 19.8% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 14 pts) |
| Minnesota Valley Transit Authority (MVTA) (`mvta`) | 397, 512 | 0.0%, 13.0% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 13 pts) |
| UGA Campus Transit (`uga`) | 155, 206 | 12.9%, 0.0% | 0.0%, 0.0% | data release (about 13 pts): Sunday service now published (day-type or reference-date fix, or a new feed); route set changed (+3 routes); route-km +32% |
| Bay Area Rapid Transit (BART) (`bart`) | 787, 787 | 13.7%, 26.4% | 1.3%, 1.3% | rule code since #601: coverage pool and stretch selector (about 13 pts) |
| Metropolitan Transit System (San Diego MTS) (`sdmts`) | 1,576, 1,626 | 16.7%, 28.5% | 4.3%, 7.2% | rule code since #601: coverage pool and stretch selector (about 7 pts); data release (about 5 pts): route set changed (+3 routes); new feed (2026-10-03 to 2026-10-12) |
| Toronto Transit Commission (`ttc`) | 2,663, 2,944 | 30.7%, 42.2% | 17.1%, 22.7% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+17 routes); route-km +11% |
| MTA NYCT Bus (Manhattan) (`nyct-bus-manhattan`) | 331, 343 | 40.6%, 51.1% | 24.9%, 33.1% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+1 routes); new feed (2026-09-07 to 2026-10-19) |
| Burlington Transit (`burlington`) | 170, 173 | 34.2%, 44.6% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 11 pts) |
| Los Angeles County Metropolitan Transportation Authority (LA Metro) (`lacmta`) | 3,036, 3,302 | 17.2%, 27.4% | 1.0%, 3.9% | rule code since #601: coverage pool and stretch selector (about 7 pts); data release (about 3 pts): route set changed (+9 routes); route-km +9%; agency-specific fix: `98e185c7` Read LA Metro rail day types from real dates after the run date; new feed (2026-10-07 to 2026-10-19) |
| STM (Montréal) (`stm`) | 2,372, 2,646 | 0.0%, 10.1% | 3.0%, 2.4% | rule code since #601: coverage pool and stretch selector (about 6 pts); data release (about 4 pts): route set changed (+21 routes); route-km +12%; new feed (2026-08-24 to 2026-10-19) |
| Santa Clara Valley Transportation Authority (VTA) (`vta`) | 998, 1,094 | 8.6%, 18.7% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 11 pts) |
| San Mateo County Transit District (samTrans) (`samtrans`) | 575, 614 | 2.9%, 12.5% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 10 pts) |
| NJ Transit Rail (`njt-rail`) | 80, 914 | 12.3%, 2.8% | 0.0%, 0.0% | data release (about 11 pts): route set changed (+12 routes); route-km +1040%; agency-specific fix: `3622aa55` Merge NJ Transit Rail's per-trip shapes so commuter rail is drawn (#616); new feed (2026-08-10 to 2026-10-12) |
| Saint John Transit (`saint-john`) | 145, 152 | 9.4%, 0.0% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 9 pts) |
| Blacksburg Transit (`blacksburg`) | 209, 257 | 0.0%, 9.2% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 9 pts) |
| TransLink (Vancouver) (`translink`) | 2,846, 3,190 | 22.3%, 31.4% | 11.7%, 12.9% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+12 routes); route-km +12%; new feed (2026-10-07 to 2026-10-19) |
| Halifax Transit (`halifax`) | 669, 1,146 | 3.5%, 12.5% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 6 pts); data release (about 3 pts): route set changed (+22 routes); route-km +71% |
| CyRide (Ames) (`cyride`) | 142, 142 | 9.0%, 0.0% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 5 pts); data release (about 4 pts): same feed date and network size, so most likely the day-type or reference-date fixes (which day's timetable is read) |
| Santa Fe Trails (`santafetrails`) | 128, 68 | 8.9%, 0.0% | 0.0%, 0.0% | data release (about 9 pts): route set changed (-5 routes); route-km -47% |
| Metro Transit (Minneapolis) (`metro-transit`) | 1,663, 2,109 | 5.3%, 14.2% | 1.0%, 5.5% | rule code since #601: coverage pool and stretch selector (about 2 pts); data release (about 7 pts): route set changed (+14 routes); route-km +27%; new feed (2026-10-07 to 2026-10-19) |
| OC Transpo (Ottawa) (`octranspo`) | 1,175, 1,557 | 0.0%, 8.8% | 2.7%, 3.8% | rule code since #601: coverage pool and stretch selector (about 3 pts); data release (about 6 pts): route set changed (+16 routes); route-km +32%; new feed (2026-10-03 to 2026-10-19) |
| Madison Metro Transit (`madison-metro`) | 374, 425 | 0.0%, 8.5% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 8 pts) |
| STLévis (`stlevis`) | 343, 322 | 8.5%, 0.0% | 0.0%, 0.0% | data release (about 8 pts): route set changed (-1 routes); route-km -6% |
| Nashville MTA WeGo Public Transit (`nashvillemta`) | 522, 560 | 11.1%, 16.7% | 8.3%, 0.0% | rule code since #601: coverage pool and stretch selector (about 6 pts); data release (about 8 pts): route set changed (+1 routes); route-km +7% |
| Sound Transit (Seattle) (`soundtransit`) | 127, 203 | 56.4%, 62.3% | 51.5%, 59.3% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+1 routes); route-km +60%; agency-specific fix: `ddfdac7a` Bundle: Sound Transit game-day Sundays + History v2 publish tooling and CT aliases (#1052), `da8c9ab2` Fix Sound Transit weekend light rail (#1035) and Humboldt/GPTC weekday (#1038) (#1047); new feed (2026-10-07 to 2026-10-19) |
| Winnipeg Transit (`winnipeg`) | 895, 991 | 29.3%, 37.0% | 0.0%, 0.0% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+10 routes); route-km +11% |
| Capital Metro (Austin) (`capmetro`) | 836, 836 | 12.6%, 19.6% | 0.0%, 0.0% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: new feed (2026-09-07 to 2026-10-12) |
| NYC Ferry (`nyc-ferry`) | 180, 133 | 0.0%, 6.9% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 7 pts) |
| Brampton Transit (`brampton`) | 698, 709 | 15.7%, 22.5% | 3.0%, 2.9% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+1 routes); agency-specific fix: `4aab5b02` Exclude Brampton's not-in-service deadhead trips; new feed (2026-08-27 to 2026-10-19) |
| Transit Windsor (`windsor`) | 337, 337 | 6.7%, 0.0% | 0.0%, 0.0% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: new feed (2026-10-03 to 2026-10-19) |
| Vail Transit (`vail-transit`) | 88, 88 | 18.8%, 18.8% | 0.0%, 6.4% | rule code since #601: coverage pool and stretch selector (about 6 pts) |
| San Francisco Municipal Transportation Agency (SFMTA - Muni) (`sfmta`) | 740, 763 | 31.8%, 38.0% | 21.6%, 18.4% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: route set changed (+1 routes); agency-specific fix: `c3815447` Point SF Muni, FAST and PATH at their current feeds (#612) |
| exo (Sud-Ouest) (`exo-sudouest`) | 319, 424 | 0.0%, 6.0% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 6 pts) |
| DeKalb Public Transit (`dekalb`) | 156, 169 | 6.0%, 0.0% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 6 pts) |
| GoTriangle (Raleigh-Durham) (`gotriangle`) | 312, 414 | 0.0%, 5.7% | 0.0%, 0.0% | data release (about 6 pts): route set changed (+3 routes); route-km +33%; agency-specific fix: `62fecd99` GoTriangle: point the feed URL at the https zip it redirects to; new feed (2026-08-10 to 2026-10-14) |
| StarMetro (Tallahassee) (`starmetro`) | 331, 331 | 5.6%, 0.0% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 6 pts) |
| Akron Metro Regional Transit Authority (`akron`) | 396, 396 | 5.2%, 0.0% | 0.0%, 0.0% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split |
| Community Transit (Everett) (`communitytransit`) | 695, 1,023 | 3.9%, 9.0% | 0.0%, 2.9% | rule code since #601: coverage pool and stretch selector (about 3 pts); data release (about 5 pts): route set changed (+11 routes); route-km +47% |
| MAX Transit (Birmingham) (`max-transit`) | 317, 317 | 0.0%, 5.1% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 5 pts) |

### Under 50 route-km (one route swings these)

| Agency | Route-km (before, now) | AM peak (before, now) | Sun evening (before, now) | Likely cause |
|---|---:|---:|---:|---|
| JFK AirTrain (`jfk-airtrain`) | 17, 17 | 100.0%, 100.0% | 0.0%, 100.0% | data release (about 100 pts): new feed (2026-10-07 to 2026-10-12) |
| QLine (Detroit) (`qline`) | 5, 5 | 0.0%, 0.0% | 0.0%, 100.0% | data release (about 100 pts): new feed (2026-10-08 to 2026-10-12) |
| PATH (Port Authority Trans-Hudson) (`path`) | 14, 44 | 0.0%, 75.6% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 31 pts); data release (about 44 pts): route set changed (+4 routes); route-km +215%; agency-specific fix: `c3815447` Point SF Muni, FAST and PATH at their current feeds (#612) |
| Roosevelt Island Tramway (`rioc-tram`) | 3, 10 | 100.0%, 59.4% | 0.0%, 59.4% | rule code since #601: coverage pool and stretch selector (about 10 pts); data release (about 50 pts): route set changed (+1 routes); route-km +188%; agency-specific fix: `61e6cf5c` Record release-mv8itiib: TARC new network, AVTA and Roosevelt Island Tramway, `72605286` Roosevelt Island Tramway: keep the aerial tram as gondola when the feed says tram; new feed (2026-08-10 to 2026-10-14) |
| Town of Mountain Village Transit (`mountain-village`) | 4, 4 | 22.3%, 22.3% | 0.0%, 22.3% | rule code since #601 and the data release both moved it; the old-rule baseline is not clean here, so no split; data signals: new feed (2026-10-07 to 2026-10-19) |
| Clemson Area Transit (CATbus) (`clemson-cat`) | 70, 27 | 13.4%, 34.8% | 0.0%, 0.0% | data release (about 21 pts): route set changed (-1 routes); route-km -62% |
| CAMBUS (University of Iowa) (`cambus`) | 46, 46 | 56.5%, 62.2% | 0.0%, 0.0% | rule code since #601: coverage pool and stretch selector (about 6 pts) |

## Added

`bowling-green`, `cobourg`, `fred-transit`, `howard-county`, `kittitas-county`, `knox-county`, `mckinley-county`, `mta-bus-company`, `ottumwa`, `sevier-county`, `sierra-vista`

## Removed

`glensfallstransit`
