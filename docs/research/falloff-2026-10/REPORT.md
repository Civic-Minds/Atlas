# Frequent-service fall-off: weekday AM peak vs Sunday evening

This is the re-run of the 2026-10-11 study. It is based on release `release-mvislmj9` and covers scheduled service only.

Data: live Atlas release `release-mvislmj9`, generated 2026-10-22 00:22 UTC (2026-10-21 evening, Eastern), read-only, fetched 2026-10-23. Built from code `8a33431e`, the same commit this rerun evaluates with. Scheduled service from GTFS, not actual/real-time service. The previous run (release `release-mv0iozy4`, generated 2026-10-09) is compared in `CHANGES.md`.

## The question

Per agency: what share of route-kilometres has service every 15 minutes or better at about 9 AM Monday, versus about 9 PM Sunday, and how big is the drop?

## Headline

- 548 agencies analysed, 228,539 route-km, 12,135 routes. The previous run had 538, 210,362 and 11,363; the larger route-km total (+8.6%) comes from new agencies, longer drawn shapes and more routes, and moves the denominator.
- Across all agencies (route-km weighted): **9.9%** of route-km is every-15-or-better at weekday AM peak, **2.4%** on Sunday evening. The previous run had 6.2% and 2.4%.
- The AM peak rise is mostly the rule code, not the feeds: the same new release judged with the old rule code (#601) gives 6.4% at AM peak (and 1.2% on Sunday evening, which understates Sunday because the old code cannot read the new stretch values; see `CHANGES.md`).
- 119 of 491 agencies with at least 50 route-km publish no Sunday service at all (they score 0% on Sunday). The previous run had 111 of 478.

## Top 10 by fall-off (points)

Agencies with at least 50 route-km and at least 10% frequent at AM peak.

| # | Agency | Route-km | Wkday AM peak ≤15 | Sun evening ≤15 | Fall-off (pts) | Fall-off (rel.) |
|---|---|---:|---:|---:|---:|---:|
| 1 | University of Michigan Transit Services (Ann Arbor) (`um-transit`) | 79 | 66.4% | 5.9% | 60.4 | 91.1% |
| 2 | MTA NYCT Bus (Brooklyn) (`nyct-bus-brooklyn`) | 784 | 67.3% | 14.4% | 53.0 | 78.7% |
| 3 | MTA NYCT Bus (Staten Island) (`nyct-bus-si`) | 1,563 | 50.4% | 2.5% | 47.9 | 95.1% |
| 4 | MTA NYCT Bus (Queens) (`nyct-bus-queens`) | 508 | 69.8% | 23.0% | 46.9 | 67.1% |
| 5 | Burlington Transit (`burlington`) | 173 | 44.6% | 0.0% | 44.6 | 100.0% |
| 6 | exo (Vallée du Richelieu) (`exo-vallee-richelieu`) | 124 | 44.1% | 0.0% | 44.1 | 100.0% |
| 7 | MTA NYCT Bus (Bronx) (`nyct-bus-bronx`) | 434 | 77.7% | 33.8% | 43.9 | 56.5% |
| 8 | GTrans (Gardena Municipal Bus Lines) (`gtrans`) | 92 | 41.7% | 0.0% | 41.7 | 100.0% |
| 9 | MTA Bus Company (`mta-bus-company`) | 1,605 | 44.9% | 3.7% | 41.2 | 91.7% |
| 10 | NCSU Wolfline (`ncsu-wolfline`) | 74 | 38.5% | 0.0% | 38.5 | 100.0% |

## Bottom 10 by fall-off (points)

Same pool. Smallest drop, or Sunday evening better than weekday AM peak.

| # | Agency | Route-km | Wkday AM peak ≤15 | Sun evening ≤15 | Fall-off (pts) | Fall-off (rel.) |
|---|---|---:|---:|---:|---:|---:|
| 1 | REM (Montréal) (`rem`) | 121 | 76.8% | 76.8% | 0.0 | 0.0% |
| 2 | Massachusetts Bay Transportation Authority (`mbta`) | 2,384 | 15.2% | 13.3% | 1.9 | 12.3% |
| 3 | Sound Transit (Seattle) (`soundtransit`) | 203 | 62.3% | 59.3% | 3.1 | 4.9% |
| 4 | RTC (Québec) (`rtc`) | 845 | 14.5% | 9.5% | 5.0 | 34.4% |
| 5 | Alameda-Contra Costa Transit District (AC Transit) (`actransit`) | 1,254 | 10.9% | 4.9% | 6.0 | 55.2% |
| 6 | STM (Montréal) (`stm`) | 2,646 | 10.1% | 2.4% | 7.7 | 76.4% |
| 7 | MARTA (Atlanta) (`marta`) | 1,668 | 14.1% | 6.2% | 7.9 | 56.0% |
| 8 | Metro Transit (Minneapolis) (`metro-transit`) | 2,109 | 14.2% | 5.5% | 8.7 | 61.2% |
| 9 | Pace Bus (Chicago suburbs) (`pace-bus`) | 2,647 | 11.2% | 1.4% | 9.8 | 87.9% |
| 10 | Los Angeles Department of Transportation (LADOT/DASH) (`ladot`) | 828 | 11.5% | 1.5% | 10.0 | 86.6% |

## GTHA

| Agency | Route-km | Wkday AM peak ≤15 | Sun evening ≤15 | Fall-off (pts) | Fall-off (rel.) |
|---|---:|---:|---:|---:|---:|
| Toronto Transit Commission (`ttc`) | 2,944 | 42.2% | 22.7% | 19.5 | 46.1% |
| MiWay (Mississauga) (`miway`) | 938 | 36.5% | 2.8% | 33.7 | 92.3% |
| York Region Transit (`yrt`) | 1,190 | 14.1% | 2.2% | 12.0 | 84.5% |
| Brampton Transit (`brampton`) | 709 | 22.5% | 2.9% | 19.5 | 86.9% |
| Durham Region Transit (`drt`) | 837 | 0.0% | 0.0% | 0.0 | – |
| GO Transit (`go`) | 3,192 | 1.5% | 0.0% | 1.5 | 100.0% |
| Hamilton Street Railway (`hamilton`) | 443 | 32.1% | 0.0% | 32.1 | 100.0% |
| Burlington Transit (`burlington`) | 173 | 44.6% | 0.0% | 44.6 | 100.0% |
| Oakville Transit (`oakville`) | 245 | 10.8% | 0.0% | 10.8 | 100.0% |

GTHA notes:
- GO Transit is mostly rail and regional coach. Its rail lines rarely run every 15, so a low score is expected and isn't comparable with the local bus systems.
- TTC includes subway (lines 1, 2 and 4) and streetcar. Bus-only figures for every agency are in the CSV (`bus_am_pct`, `bus_sun_eve_pct`).
- HSR's slug is `hamilton`.

## All agencies with at least 50 route-km, ranked by fall-off (points)

| # | Agency | Route-km | Wkday AM peak ≤15 | Sun evening ≤15 | Fall-off (pts) | Fall-off (rel.) |
|---|---|---:|---:|---:|---:|---:|
| 1 | University of Michigan Transit Services (Ann Arbor) (`um-transit`) | 79 | 66.4% | 5.9% | 60.4 | 91.1% |
| 2 | MTA NYCT Bus (Brooklyn) (`nyct-bus-brooklyn`) | 784 | 67.3% | 14.4% | 53.0 | 78.7% |
| 3 | MTA NYCT Bus (Staten Island) (`nyct-bus-si`) | 1,563 | 50.4% | 2.5% | 47.9 | 95.1% |
| 4 | MTA NYCT Bus (Queens) (`nyct-bus-queens`) | 508 | 69.8% | 23.0% | 46.9 | 67.1% |
| 5 | Burlington Transit (`burlington`) | 173 | 44.6% | 0.0% | 44.6 | 100.0% |
| 6 | exo (Vallée du Richelieu) (`exo-vallee-richelieu`) | 124 | 44.1% | 0.0% | 44.1 | 100.0% |
| 7 | MTA NYCT Bus (Bronx) (`nyct-bus-bronx`) | 434 | 77.7% | 33.8% | 43.9 | 56.5% |
| 8 | GTrans (Gardena Municipal Bus Lines) (`gtrans`) | 92 | 41.7% | 0.0% | 41.7 | 100.0% |
| 9 | MTA Bus Company (`mta-bus-company`) | 1,605 | 44.9% | 3.7% | 41.2 | 91.7% |
| 10 | NCSU Wolfline (`ncsu-wolfline`) | 74 | 38.5% | 0.0% | 38.5 | 100.0% |
| 11 | Winnipeg Transit (`winnipeg`) | 991 | 37.0% | 0.0% | 37.0 | 100.0% |
| 12 | Arlington Transit (ART) (`art`) | 135 | 36.9% | 0.0% | 36.9 | 100.0% |
| 13 | Chicago Transit Authority (CTA) (`cta`) | 2,004 | 68.0% | 31.1% | 36.9 | 54.2% |
| 14 | Big Blue Bus (Santa Monica) (`bigbluebus`) | 219 | 34.9% | 0.0% | 34.9 | 100.0% |
| 15 | MiWay (Mississauga) (`miway`) | 938 | 36.5% | 2.8% | 33.7 | 92.3% |
| 16 | METRO Houston (`metrohouston`) | 2,923 | 34.9% | 1.8% | 33.2 | 95.0% |
| 17 | Regional Municipality of Wood Buffalo Transit (`fort-mcmurray`) | 106 | 32.9% | 0.0% | 32.9 | 100.0% |
| 18 | Hamilton Street Railway (`hamilton`) | 443 | 32.1% | 0.0% | 32.1 | 100.0% |
| 19 | Fresno Area Express (FAX) (`fax`) | 378 | 25.8% | 0.0% | 25.8 | 100.0% |
| 20 | Bay Area Rapid Transit (BART) (`bart`) | 787 | 26.4% | 1.3% | 25.1 | 95.0% |
| 21 | Milwaukee County Transit System (MCTS) (`mcts`) | 794 | 24.8% | 0.0% | 24.8 | 100.0% |
| 22 | Los Angeles County Metropolitan Transportation Authority (LA Metro) (`lacmta`) | 3,302 | 27.4% | 3.9% | 23.5 | 85.8% |
| 23 | Anchorage People Mover (`anchorage`) | 198 | 22.4% | 0.0% | 22.4 | 100.0% |
| 24 | DASH (Alexandria) (`dash`) | 139 | 23.7% | 1.5% | 22.1 | 93.5% |
| 25 | Metropolitan Transit System (San Diego MTS) (`sdmts`) | 1,626 | 28.5% | 7.2% | 21.3 | 74.7% |
| 26 | DDOT (Detroit) (`ddot`) | 778 | 19.8% | 0.0% | 19.8 | 100.0% |
| 27 | Capital Metro (Austin) (`capmetro`) | 836 | 19.6% | 0.0% | 19.6 | 100.0% |
| 28 | San Francisco Municipal Transportation Agency (SFMTA - Muni) (`sfmta`) | 763 | 38.0% | 18.4% | 19.6 | 51.7% |
| 29 | Brampton Transit (`brampton`) | 709 | 22.5% | 2.9% | 19.5 | 86.9% |
| 30 | Toronto Transit Commission (`ttc`) | 2,944 | 42.2% | 22.7% | 19.5 | 46.1% |
| 31 | Chapel Hill Transit (`chapel-hill-transit`) | 202 | 18.8% | 0.0% | 18.8 | 100.0% |
| 32 | King County Metro (Seattle) (`kingcountymetro`) | 2,230 | 26.3% | 7.6% | 18.7 | 71.1% |
| 33 | Santa Clara Valley Transportation Authority (VTA) (`vta`) | 1,094 | 18.7% | 0.0% | 18.7 | 100.0% |
| 34 | TransLink (Vancouver) (`translink`) | 3,190 | 31.4% | 12.9% | 18.5 | 58.8% |
| 35 | MTA NYCT Bus (Manhattan) (`nyct-bus-manhattan`) | 343 | 51.1% | 33.1% | 18.0 | 35.2% |
| 36 | Nashville MTA WeGo Public Transit (`nashvillemta`) | 560 | 16.7% | 0.0% | 16.7 | 100.0% |
| 37 | Transfort (Fort Collins) (`transfort`) | 154 | 16.6% | 0.0% | 16.6 | 100.0% |
| 38 | Maryland Transit Administration (MTA Maryland) (`mta-maryland`) | 1,386 | 18.1% | 1.7% | 16.4 | 90.6% |
| 39 | Glendale Beeline (`glendalebeeline`) | 140 | 16.0% | 0.0% | 16.0 | 100.0% |
| 40 | MTA NYCT Subway (`nyct-subway`) | 706 | 85.4% | 69.8% | 15.6 | 18.3% |
| 41 | Calgary Transit (`calgary`) | 2,053 | 18.2% | 2.9% | 15.2 | 84.0% |
| 42 | Advance Transit (Lebanon, NH) (`advance-transit`) | 104 | 15.1% | 0.0% | 15.1 | 100.0% |
| 43 | Foothill Transit (`foothill`) | 955 | 15.1% | 0.0% | 15.1 | 100.0% |
| 44 | WMATA (Washington, DC) (`wmata`) | 2,441 | 27.9% | 13.2% | 14.7 | 52.7% |
| 45 | GoRaleigh (Capital Area Transit) (`goraleigh`) | 428 | 13.9% | 0.0% | 13.9 | 100.0% |
| 46 | Omaha Metro (`omahametro`) | 440 | 13.8% | 0.0% | 13.8 | 100.0% |
| 47 | Utah Transit Authority (UTA) (`uta`) | 1,873 | 13.8% | 0.0% | 13.8 | 100.0% |
| 48 | OmniTrans (San Bernardino) (`omnitrans`) | 744 | 13.7% | 0.0% | 13.7 | 100.0% |
| 49 | Spokane Transit Authority (`spokane`) | 587 | 13.6% | 0.0% | 13.6 | 100.0% |
| 50 | Ben Franklin Transit (Tri-Cities, WA) (`ben-franklin`) | 406 | 13.3% | 0.0% | 13.3 | 100.0% |
| 51 | Sacramento Regional Transit (SacRT) (`sacrt`) | 658 | 13.3% | 0.0% | 13.3 | 100.0% |
| 52 | Minnesota Valley Transit Authority (MVTA) (`mvta`) | 512 | 13.0% | 0.0% | 13.0 | 100.0% |
| 53 | Grand River Transit (Waterloo Region) (`grt`) | 615 | 17.7% | 4.9% | 12.9 | 72.6% |
| 54 | SEPTA (Philadelphia) (`septa`) | 3,082 | 14.9% | 2.2% | 12.7 | 85.2% |
| 55 | Halifax Transit (`halifax`) | 1,146 | 12.5% | 0.0% | 12.5 | 100.0% |
| 56 | San Mateo County Transit District (samTrans) (`samtrans`) | 614 | 12.5% | 0.0% | 12.5 | 100.0% |
| 57 | Vail Transit (`vail-transit`) | 88 | 18.8% | 6.4% | 12.5 | 66.1% |
| 58 | Greater Sudbury Transit (`sudbury`) | 288 | 12.2% | 0.0% | 12.2 | 100.0% |
| 59 | York Region Transit (`yrt`) | 1,190 | 14.1% | 2.2% | 12.0 | 84.5% |
| 60 | Regional Transportation District (RTD Denver) (`rtd-denver`) | 2,510 | 11.9% | 0.1% | 11.8 | 99.3% |
| 61 | Miami-Dade Transit (`miami-dade-transit`) | 2,439 | 11.6% | 0.1% | 11.6 | 99.3% |
| 62 | Stanford Marguerite Shuttle (SMS) (`stanford`) | 139 | 11.5% | 0.0% | 11.5 | 100.0% |
| 63 | exo (Le Richelain–Roussillon) (`exo-lrrs`) | 400 | 10.9% | 0.0% | 10.9 | 100.0% |
| 64 | Edmonton Transit Service (ETS) (`edmonton`) | 2,120 | 16.2% | 5.4% | 10.8 | 66.7% |
| 65 | Oakville Transit (`oakville`) | 245 | 10.8% | 0.0% | 10.8 | 100.0% |
| 66 | Mountain Metropolitan Transit (Colorado Springs) (`mountainmetro`) | 334 | 10.3% | 0.0% | 10.3 | 100.0% |
| 67 | TheRide (Ann Arbor) (`theride`) | 315 | 10.3% | 0.0% | 10.3 | 100.0% |
| 68 | TriMet (Portland, OR) (`trimet`) | 1,358 | 10.2% | 0.0% | 10.2 | 100.0% |
| 69 | Los Angeles Department of Transportation (LADOT/DASH) (`ladot`) | 828 | 11.5% | 1.5% | 10.0 | 86.6% |
| 70 | Pace Bus (Chicago suburbs) (`pace-bus`) | 2,647 | 11.2% | 1.4% | 9.8 | 87.9% |
| 71 | Blacksburg Transit (`blacksburg`) | 257 | 9.2% | 0.0% | 9.2 | 100.0% |
| 72 | Fairfax Connector (`fairfax`) | 1,543 | 9.3% | 0.1% | 9.2 | 99.0% |
| 73 | Valley Regional Transit (Boise) (`valley-regional-transit`) | 237 | 9.1% | 0.0% | 9.1 | 100.0% |
| 74 | GRTC Transit (Richmond, VA) (`grtc`) | 481 | 8.9% | 0.0% | 8.9 | 100.0% |
| 75 | Metro Transit (Minneapolis) (`metro-transit`) | 2,109 | 14.2% | 5.5% | 8.7 | 61.2% |
| 76 | Valley Metro (Phoenix) (`valleymetro`) | 2,328 | 8.9% | 0.3% | 8.6 | 96.3% |
| 77 | Madison Metro Transit (`madison-metro`) | 425 | 8.5% | 0.0% | 8.5 | 100.0% |
| 78 | BC Transit (Kelowna) (`kelowna`) | 333 | 8.4% | 0.0% | 8.4 | 100.0% |
| 79 | The Rapid (Grand Rapids) (`the-rapid`) | 540 | 8.2% | 0.0% | 8.2 | 100.0% |
| 80 | MARTA (Atlanta) (`marta`) | 1,668 | 14.1% | 6.2% | 7.9 | 56.0% |
| 81 | STM (Montréal) (`stm`) | 2,646 | 10.1% | 2.4% | 7.7 | 76.4% |
| 82 | Regional Transportation Commission of Southern Nevada (RTC) (`rtcsnv`) | 1,062 | 9.0% | 1.5% | 7.5 | 83.2% |
| 83 | Central Ohio Transit Authority (COTA) (`cota`) | 750 | 7.4% | 0.0% | 7.4 | 100.0% |
| 84 | VIA Metropolitan Transit (San Antonio) (`via`) | 1,680 | 7.0% | 0.0% | 7.0 | 100.0% |
| 85 | NYC Ferry (`nyc-ferry`) | 133 | 6.9% | 0.0% | 6.9 | 100.0% |
| 86 | exo (Terrebonne-Mascouche) (`exo-terrebonne`) | 374 | 6.8% | 0.0% | 6.8 | 100.0% |
| 87 | Saskatoon Transit (`saskatoon`) | 387 | 6.8% | 0.0% | 6.8 | 100.0% |
| 88 | IndyGo (Indianapolis) (`indygo`) | 609 | 6.4% | 0.0% | 6.4 | 100.0% |
| 89 | TheBus (Honolulu) (`thebus`) | 1,454 | 8.1% | 1.7% | 6.3 | 78.6% |
| 90 | Community Transit (Everett) (`communitytransit`) | 1,023 | 9.0% | 2.9% | 6.1 | 67.7% |
| 91 | Alameda-Contra Costa Transit District (AC Transit) (`actransit`) | 1,254 | 10.9% | 4.9% | 6.0 | 55.2% |
| 92 | Capital District Transportation Authority (`cdta`) | 734 | 6.0% | 0.0% | 6.0 | 100.0% |
| 93 | exo (Sud-Ouest) (`exo-sudouest`) | 424 | 6.0% | 0.0% | 6.0 | 100.0% |
| 94 | Guelph Transit (`guelph`) | 219 | 6.0% | 0.0% | 6.0 | 100.0% |
| 95 | Butler County Regional Transit Authority (`butler-county-rta`) | 253 | 5.8% | 0.0% | 5.8 | 100.0% |
| 96 | Kansas City Area Transportation Authority (KCATA) (`kcata`) | 565 | 7.6% | 1.7% | 5.8 | 76.9% |
| 97 | Pittsburgh Regional Transit (`port-authority-pa`) | 1,739 | 5.8% | 0.0% | 5.8 | 100.0% |
| 98 | GoTriangle (Raleigh-Durham) (`gotriangle`) | 414 | 5.7% | 0.0% | 5.7 | 100.0% |
| 99 | Pierce Transit (`piercetransit`) | 865 | 5.7% | 0.0% | 5.7 | 100.0% |
| 100 | Long Beach Transit (`longbeach`) | 578 | 5.6% | 0.0% | 5.6 | 100.0% |
| 101 | Cedar Rapids Transit (`cedar-rapids`) | 292 | 5.5% | 0.0% | 5.5 | 100.0% |
| 102 | Iowa City Transit (`iowa-city`) | 151 | 5.5% | 0.0% | 5.5 | 100.0% |
| 103 | Charlotte Area Transit System (CATS) (`cats`) | 795 | 5.3% | 0.0% | 5.3 | 100.0% |
| 104 | StarTran (Lincoln) (`lincoln`) | 228 | 5.3% | 0.0% | 5.3 | 100.0% |
| 105 | MAX Transit (Birmingham) (`max-transit`) | 317 | 5.1% | 0.0% | 5.1 | 100.0% |
| 106 | OC Transpo (Ottawa) (`octranspo`) | 1,557 | 8.8% | 3.8% | 5.0 | 56.7% |
| 107 | RTC (Québec) (`rtc`) | 845 | 14.5% | 9.5% | 5.0 | 34.4% |
| 108 | C-TRAN (Vancouver, WA) (`ctran`) | 387 | 4.9% | 0.0% | 4.9 | 100.0% |
| 109 | exo (Laurentides) (`exo-laurentides`) | 827 | 4.8% | 0.0% | 4.8 | 100.0% |
| 110 | Sun Metro (El Paso) (`sun-metro`) | 605 | 4.5% | 0.0% | 4.5 | 100.0% |
| 111 | Capital Area Transportation Authority (`cata-lansing`) | 364 | 4.2% | 0.0% | 4.2 | 100.0% |
| 112 | NJ Transit Bus (`njt-bus`) | 7,257 | 4.2% | 0.1% | 4.1 | 97.5% |
| 113 | Société de transport de Sherbrooke (`sherbrooke`) | 404 | 4.0% | 0.0% | 4.0 | 100.0% |
| 114 | Westchester County Bee-Line System (BeeLine) (`beeline`) | 782 | 3.8% | 0.0% | 3.8 | 100.0% |
| 115 | LYNX (Central Florida) (`lynx`) | 1,279 | 3.5% | 0.0% | 3.5 | 100.0% |
| 116 | Knoxville Area Transit (`knoxville`) | 244 | 3.4% | 0.0% | 3.4 | 100.0% |
| 117 | BC Transit (Victoria) (`victoria`) | 948 | 5.1% | 1.9% | 3.2 | 63.0% |
| 118 | Ride On (Montgomery County) (`rideon`) | 1,189 | 4.7% | 1.6% | 3.1 | 65.9% |
| 119 | Sound Transit (Seattle) (`soundtransit`) | 203 | 62.3% | 59.3% | 3.1 | 4.9% |
| 120 | Connect Transit (Bloomington-Normal) (`connect-transit`) | 141 | 3.0% | 0.0% | 3.0 | 100.0% |
| 121 | Palm Tran (West Palm Beach) (`palm-tran`) | 753 | 3.0% | 0.0% | 3.0 | 100.0% |
| 122 | Hillsborough Area Regional Transit (HART) (`hart`) | 652 | 2.9% | 0.0% | 2.9 | 100.0% |
| 123 | Pinellas Suncoast Transit Authority (PSTA) (`psta`) | 849 | 2.9% | 0.0% | 2.9 | 100.0% |
| 124 | RTS (Gainesville) (`rts`) | 300 | 2.9% | 0.0% | 2.9 | 100.0% |
| 125 | Hampton Roads Transit (`hrt`) | 986 | 2.8% | 0.0% | 2.8 | 100.0% |
| 126 | NJ Transit Rail (`njt-rail`) | 914 | 2.8% | 0.0% | 2.8 | 100.0% |
| 127 | Embark (Oklahoma City) (`embark`) | 608 | 4.0% | 1.3% | 2.7 | 68.3% |
| 128 | Visalia Transit (`visalia`) | 653 | 2.7% | 0.0% | 2.7 | 100.0% |
| 129 | BC Transit (Fraser Valley) (`bc-fraser-valley`) | 525 | 2.5% | 0.0% | 2.5 | 100.0% |
| 130 | GCRTA (Cleveland) (`gcrta`) | 947 | 7.0% | 4.4% | 2.5 | 36.6% |
| 131 | London Transit (`london`) | 508 | 2.5% | 0.0% | 2.5 | 100.0% |
| 132 | Regional Transportation Commission of Washoe County (RTC Washoe) (`rtcwashoe`) | 205 | 2.5% | 0.0% | 2.5 | 100.0% |
| 133 | CTtransit (`cttransit`) | 2,145 | 2.4% | 0.0% | 2.4 | 100.0% |
| 134 | Lextran (Lexington, KY) (`lexington`) | 268 | 3.7% | 1.4% | 2.3 | 61.5% |
| 135 | STO (Gatineau) (`sto`) | 795 | 4.5% | 2.4% | 2.1 | 47.1% |
| 136 | New Orleans Regional Transit Authority (NORTA) (`norta`) | 475 | 2.0% | 0.0% | 2.0 | 100.0% |
| 137 | Cincinnati Metro (SORTA) (`cincinnatimetro`) | 828 | 1.9% | 0.0% | 1.9 | 100.0% |
| 138 | Massachusetts Bay Transportation Authority (`mbta`) | 2,384 | 15.2% | 13.3% | 1.9 | 12.3% |
| 139 | Orange County Transportation Authority (OCTA) (`octa`) | 1,456 | 1.8% | 0.0% | 1.8 | 100.0% |
| 140 | Cherriots (Salem, OR) (`cherriots`) | 392 | 1.6% | 0.0% | 1.6 | 100.0% |
| 141 | Stanislaus Regional Transit Authority (The S) (`modesto`) | 623 | 1.6% | 0.0% | 1.6 | 100.0% |
| 142 | Rhode Island Public Transit Authority (RIPTA) (`ripta`) | 842 | 1.6% | 0.0% | 1.6 | 100.0% |
| 143 | Transit Authority of River City (Louisville) (`tarc`) | 294 | 1.6% | 0.0% | 1.6 | 100.0% |
| 144 | GO Transit (`go`) | 3,192 | 1.5% | 0.0% | 1.5 | 100.0% |
| 145 | Loudoun County Transit (`loudoun-transit`) | 666 | 1.5% | 0.0% | 1.5 | 100.0% |
| 146 | Metro St. Louis (`metrostlouis`) | 1,117 | 1.5% | 0.0% | 1.5 | 100.0% |
| 147 | Riverside Transit Agency (`riverside`) | 1,011 | 1.5% | 0.0% | 1.5 | 100.0% |
| 148 | RTL (Longueuil) (`rtl`) | 870 | 1.5% | 0.0% | 1.5 | 100.0% |
| 149 | San Joaquin RTD (`sjrtd`) | 625 | 1.5% | 0.0% | 1.5 | 100.0% |
| 150 | Charleston Area Regional Transportation Authority (CARTA) (`carta`) | 468 | 1.2% | 0.0% | 1.2 | 100.0% |
| 151 | Erie Metropolitan Transit Authority (`emta`) | 276 | 1.1% | 0.0% | 1.1 | 100.0% |
| 152 | County Connection (CCCTA) (`countyconnection`) | 551 | 1.0% | 0.0% | 1.0 | 100.0% |
| 153 | Roaring Fork Transportation Authority (RFTA) (`rfta`) | 232 | 0.9% | 0.0% | 0.9 | 100.0% |
| 154 | Dallas Area Rapid Transit (DART) (`dart`) | 1,778 | 0.8% | 0.0% | 0.8 | 100.0% |
| 155 | Jacksonville Transportation Authority (JTA) (`jta`) | 757 | 0.8% | 0.0% | 0.8 | 100.0% |
| 156 | Prince George's County (The Bus) (`pgc-the-bus`) | 414 | 0.8% | 0.0% | 0.8 | 100.0% |
| 157 | Summit Stage (`summit-stage`) | 253 | 0.8% | 0.0% | 0.8 | 100.0% |
| 158 | Greater Dayton RTA (`dayton`) | 624 | 0.6% | 0.0% | 0.6 | 100.0% |
| 159 | ABQ RIDE (Albuquerque) (`abqride`) | 419 | 0.0% | 0.0% | 0.0 | – |
| 160 | Akron Metro Regional Transit Authority (`akron`) | 396 | 0.0% | 0.0% | 0.0 | – |
| 161 | Charlottesville Area Transit (CAT) (`albemarle-county`) | 119 | 0.0% | 0.0% | 0.0 | – |
| 162 | All Points Transit (Montrose) (`all-points-transit`) | 163 | 0.0% | 0.0% | 0.0 | – |
| 163 | Amarillo City Transit (`amarillo`) | 122 | 0.0% | 0.0% | 0.0 | – |
| 164 | Annapolis Transit (`annapolis`) | 70 | 0.0% | 0.0% | 0.0 | – |
| 165 | Valley Transit (Appleton/Fox Cities) (`appleton`) | 156 | 0.0% | 0.0% | 0.0 | – |
| 166 | Asheville Rides Transit (`asheville`) | 198 | 0.0% | 0.0% | 0.0 | – |
| 167 | Area Transportation Authority (ATA) (`ata`) | 167 | 0.0% | 0.0% | 0.0 | – |
| 168 | Athens Clarke County Transit (`athens-acc`) | 183 | 0.0% | 0.0% | 0.0 | – |
| 169 | Athens Public Transit (`athens-oh`) | 166 | 0.0% | 0.0% | 0.0 | – |
| 170 | Augusta Transit (`augusta`) | 125 | 0.0% | 0.0% | 0.0 | – |
| 171 | Antelope Valley Transit Authority (AVTA) (`avta`) | 695 | 0.0% | 0.0% | 0.0 | – |
| 172 | B-Line (Corpus Christi RTA) (`b-line`) | 457 | 0.0% | 0.0% | 0.0 | – |
| 173 | Bangor Community Connector (`bangor`) | 120 | 0.0% | 0.0% | 0.0 | – |
| 174 | Barrie Transit (`barrie`) | 257 | 0.0% | 0.0% | 0.0 | – |
| 175 | BARTA (Reading) (`barta`) | 231 | 0.0% | 0.0% | 0.0 | – |
| 176 | Basin Transit (`basin-transit`) | 353 | 0.0% | 0.0% | 0.0 | – |
| 177 | Bay Area Transportation Authority (Traverse City, MI) (`bata`) | 254 | 0.0% | 0.0% | 0.0 | – |
| 178 | Bay Metro (Bay City) (`bay-metro`) | 250 | 0.0% | 0.0% | 0.0 | – |
| 179 | BC Ferries (`bc-ferries`) | 237 | 0.0% | 0.0% | 0.0 | – |
| 180 | Beaumont Transit (`beaumont-ca`) | 124 | 0.0% | 0.0% | 0.0 | – |
| 181 | Beaver County Transit Authority (`beaver-county`) | 114 | 0.0% | 0.0% | 0.0 | – |
| 182 | Belleville Transit (`belleville`) | 86 | 0.0% | 0.0% | 0.0 | – |
| 183 | Bettendorf Transit (`bettendorf`) | 87 | 0.0% | 0.0% | 0.0 | – |
| 184 | MET Transit (Billings) (`billings`) | 146 | 0.0% | 0.0% | 0.0 | – |
| 185 | Bis-Man Transit (Bismarck-Mandan) (`bis-man`) | 99 | 0.0% | 0.0% | 0.0 | – |
| 186 | Bloomington Transit (`bloomington`) | 128 | 0.0% | 0.0% | 0.0 | – |
| 187 | City of Bowling Green (`bowling-green`) | 97 | 0.0% | 0.0% | 0.0 | – |
| 188 | Brandon Transit (`brandon`) | 83 | 0.0% | 0.0% | 0.0 | – |
| 189 | Brantford Transit (`brantford`) | 169 | 0.0% | 0.0% | 0.0 | – |
| 190 | Brazos Transit District (`brazos`) | 269 | 0.0% | 0.0% | 0.0 | – |
| 191 | Breckenridge Free Ride (`breck-free-ride`) | 54 | 0.0% | 0.0% | 0.0 | – |
| 192 | Greater Bridgeport Transit (`bridgeport-gbt`) | 243 | 0.0% | 0.0% | 0.0 | – |
| 193 | Broome County Transit (`broome`) | 218 | 0.0% | 0.0% | 0.0 | – |
| 194 | Broward County Transit (`broward-transit`) | 81 | 0.0% | 0.0% | 0.0 | – |
| 195 | Basin Transit Service (BTS) (`bts-or`) | 94 | 0.0% | 0.0% | 0.0 | – |
| 196 | Bustang (CDOT) (`bustang`) | 822 | 0.0% | 0.0% | 0.0 | – |
| 197 | Butler Transit Authority (`butler-pa`) | 84 | 0.0% | 0.0% | 0.0 | – |
| 198 | Caltrain (`caltrain`) | 205 | 0.0% | 0.0% | 0.0 | – |
| 199 | BC Transit (Campbell River) (`campbell-river`) | 68 | 0.0% | 0.0% | 0.0 | – |
| 200 | CamTran (`camtran`) | 195 | 0.0% | 0.0% | 0.0 | – |
| 201 | Chattanooga Area Regional Transportation Authority (`carta-chattanooga`) | 140 | 0.0% | 0.0% | 0.0 | – |
| 202 | Cascades East Transit (Bend, OR) (`cascades-east`) | 378 | 0.0% | 0.0% | 0.0 | – |
| 203 | Casper Area Transit (`casper`) | 93 | 0.0% | 0.0% | 0.0 | – |
| 204 | Capital Area Transit (Harrisburg) (`cat-harrisburg`) | 319 | 0.0% | 0.0% | 0.0 | – |
| 205 | Chatham Area Transit (CAT) (`cat-savannah`) | 310 | 0.0% | 0.0% | 0.0 | – |
| 206 | Capital Area Transit System (Baton Rouge) (`cats-baton`) | 330 | 0.0% | 0.0% | 0.0 | – |
| 207 | CCTA / Green Mountain Transit (Burlington, VT) (`ccta`) | 94 | 0.0% | 0.0% | 0.0 | – |
| 208 | Centro (Syracuse) (`centro`) | 763 | 0.0% | 0.0% | 0.0 | – |
| 209 | Ride CK (`chatham-kent`) | 276 | 0.0% | 0.0% | 0.0 | – |
| 210 | Chemung County C-TRAN (`chemung-county`) | 280 | 0.0% | 0.0% | 0.0 | – |
| 211 | Citibus (Lubbock) (`citibus`) | 143 | 0.0% | 0.0% | 0.0 | – |
| 212 | Citilink (Fort Wayne, IN) (`citilink-fw`) | 235 | 0.0% | 0.0% | 0.0 | – |
| 213 | CityBus of Greater Lafayette (`citybus-lafayette`) | 152 | 0.0% | 0.0% | 0.0 | – |
| 214 | Kootenai County Citylink North (`citylink-north`) | 69 | 0.0% | 0.0% | 0.0 | – |
| 215 | CityLink (Peoria, IL) (`citylink-peoria`) | 274 | 0.0% | 0.0% | 0.0 | – |
| 216 | Clallam Transit System (`clallamtransit`) | 486 | 0.0% | 0.0% | 0.0 | – |
| 217 | COAST (Seacoast NH) (`coast-nh`) | 123 | 0.0% | 0.0% | 0.0 | – |
| 218 | Coast RTA (`coast-rta`) | 754 | 0.0% | 0.0% | 0.0 | – |
| 219 | Coast Transit Authority (`coast-transit-ms`) | 180 | 0.0% | 0.0% | 0.0 | – |
| 220 | CobbLinc (Marietta, GA) (`cobblinc`) | 260 | 0.0% | 0.0% | 0.0 | – |
| 221 | Codiac Transpo (Moncton) (`codiac`) | 361 | 0.0% | 0.0% | 0.0 | – |
| 222 | Collier Area Transit (Naples) (`collier`) | 326 | 0.0% | 0.0% | 0.0 | – |
| 223 | County of Lackawanna Transit System (COLTS) (`colts`) | 292 | 0.0% | 0.0% | 0.0 | – |
| 224 | Columbia Area Transit (`columbia-area-transit`) | 331 | 0.0% | 0.0% | 0.0 | – |
| 225 | The COMET (Columbia, SC) (`comet`) | 459 | 0.0% | 0.0% | 0.0 | – |
| 226 | BC Transit (Comox Valley) (`comox-valley`) | 242 | 0.0% | 0.0% | 0.0 | – |
| 227 | Rider Transit (`concord-kannapolis`) | 158 | 0.0% | 0.0% | 0.0 | – |
| 228 | Cornwall Transit (`cornwall`) | 67 | 0.0% | 0.0% | 0.0 | – |
| 229 | Corvallis Transit System (`corvallis`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 230 | BC Transit (Cowichan Valley) (`cowichan`) | 285 | 0.0% | 0.0% | 0.0 | – |
| 231 | CUE Bus (Fairfax) (`cue-bus`) | 89 | 0.0% | 0.0% | 0.0 | – |
| 232 | Culver City Bus (`culvercitybus`) | 104 | 0.0% | 0.0% | 0.0 | – |
| 233 | CyRide (Ames) (`cyride`) | 142 | 0.0% | 0.0% | 0.0 | – |
| 234 | DART First State (Wilmington, DE) (`dart-first-state`) | 1,033 | 0.0% | 0.0% | 0.0 | – |
| 235 | Davenport CitiBus (`davenport`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 236 | Denton County Transportation Authority (DCTA) (`dcta`) | 106 | 0.0% | 0.0% | 0.0 | – |
| 237 | Decatur Public Transit System (`decatur`) | 216 | 0.0% | 0.0% | 0.0 | – |
| 238 | DeKalb Public Transit (`dekalb`) | 169 | 0.0% | 0.0% | 0.0 | – |
| 239 | Des Moines Area Regional Transit Authority (DART) (`des-moines`) | 195 | 0.0% | 0.0% | 0.0 | – |
| 240 | Durham Region Transit (`drt`) | 837 | 0.0% | 0.0% | 0.0 | – |
| 241 | The Jule (Dubuque) (`dubuque`) | 96 | 0.0% | 0.0% | 0.0 | – |
| 242 | Duluth Transit Authority (`duluth-transit`) | 197 | 0.0% | 0.0% | 0.0 | – |
| 243 | Durango Transit (`durango-transit`) | 61 | 0.0% | 0.0% | 0.0 | – |
| 244 | Dutchess County Public Transit (`dutchess`) | 339 | 0.0% | 0.0% | 0.0 | – |
| 245 | ECAT (Escambia County) (`ecat`) | 374 | 0.0% | 0.0% | 0.0 | – |
| 246 | Core Transit (`eco-transit`) | 192 | 0.0% | 0.0% | 0.0 | – |
| 247 | Cape Ann Transportation Authority (CATA) (`essex-county`) | 93 | 0.0% | 0.0% | 0.0 | – |
| 248 | Lane Transit District (`eugene-ltd`) | 362 | 0.0% | 0.0% | 0.0 | – |
| 249 | METS (Evansville) (`evansville`) | 115 | 0.0% | 0.0% | 0.0 | – |
| 250 | Everett Transit (`everetttransit`) | 113 | 0.0% | 0.0% | 0.0 | – |
| 251 | exo (Trains) (`exo`) | 206 | 0.0% | 0.0% | 0.0 | – |
| 252 | exo (La Presqu'île) (`exo-presquile`) | 119 | 0.0% | 0.0% | 0.0 | – |
| 253 | EZ Rider (Midland/Odessa) (`ez-rider`) | 157 | 0.0% | 0.0% | 0.0 | – |
| 254 | Fayette Area Coordinated Transportation (`fact`) | 72 | 0.0% | 0.0% | 0.0 | – |
| 255 | Fayetteville Area System of Transit (`fast-nc`) | 234 | 0.0% | 0.0% | 0.0 | – |
| 256 | City of Fort Smith (`fort-smith`) | 101 | 0.0% | 0.0% | 0.0 | – |
| 257 | FXBGO! (Fredericksburg) (`fred-transit`) | 222 | 0.0% | 0.0% | 0.0 | – |
| 258 | Fredericton Transit (`fredericton`) | 232 | 0.0% | 0.0% | 0.0 | – |
| 259 | Freedom Transit (`freedom-transit`) | 84 | 0.0% | 0.0% | 0.0 | – |
| 260 | Golden Empire Transit District (GET) (`get`) | 346 | 0.0% | 0.0% | 0.0 | – |
| 261 | Greater Lynchburg Transit Company (`gltc`) | 147 | 0.0% | 0.0% | 0.0 | – |
| 262 | GoDurham (`godurham`) | 279 | 0.0% | 0.0% | 0.0 | – |
| 263 | Gold Coast Transit District (Oxnard) (`gold-coast`) | 257 | 0.0% | 0.0% | 0.0 | – |
| 264 | Golden Gate Transit (`goldengate`) | 130 | 0.0% | 0.0% | 0.0 | – |
| 265 | Gary Public Transportation Corporation (Gary, IN) (`gptc`) | 266 | 0.0% | 0.0% | 0.0 | – |
| 266 | Cities Area Transit (Grand Forks) (`grand-forks`) | 157 | 0.0% | 0.0% | 0.0 | – |
| 267 | Grand Valley Transit (`grand-junction`) | 292 | 0.0% | 0.0% | 0.0 | – |
| 268 | Greeley-Evans Transit (GET) (`greeley`) | 74 | 0.0% | 0.0% | 0.0 | – |
| 269 | Green Bay Metro (`green-bay`) | 104 | 0.0% | 0.0% | 0.0 | – |
| 270 | GreenLink (Greenville, SC) (`greenlink`) | 169 | 0.0% | 0.0% | 0.0 | – |
| 271 | Greenway Public Transportation (`greenway`) | 166 | 0.0% | 0.0% | 0.0 | – |
| 272 | Ride Connection (GroveLink) (`grovelink`) | 130 | 0.0% | 0.0% | 0.0 | – |
| 273 | Gwinnett County Transit (`gwinnett-transit`) | 270 | 0.0% | 0.0% | 0.0 | – |
| 274 | City of Hobbs Transit (`hobbs`) | 86 | 0.0% | 0.0% | 0.0 | – |
| 275 | City of Kokomo (`howard-county`) | 92 | 0.0% | 0.0% | 0.0 | – |
| 276 | Hub City Transit (`hub-city-transit`) | 118 | 0.0% | 0.0% | 0.0 | – |
| 277 | Hudson Link (`hudsonlink`) | 90 | 0.0% | 0.0% | 0.0 | – |
| 278 | Humboldt Transit Authority (`humboldt`) | 207 | 0.0% | 0.0% | 0.0 | – |
| 279 | Huntsville Shuttle (`huntsville`) | 295 | 0.0% | 0.0% | 0.0 | – |
| 280 | Imperial Valley Transit (`imperial-valley`) | 364 | 0.0% | 0.0% | 0.0 | – |
| 281 | Indian River Transit (`indian-river`) | 424 | 0.0% | 0.0% | 0.0 | – |
| 282 | IndiGO (`indigo`) | 145 | 0.0% | 0.0% | 0.0 | – |
| 283 | Intercity Transit (Olympia) (`intercitytransit`) | 406 | 0.0% | 0.0% | 0.0 | – |
| 284 | Island Transit (Whidbey Island) (`islandtransit`) | 366 | 0.0% | 0.0% | 0.0 | – |
| 285 | City of Jackson (JTRAN) (`jackson-ms`) | 151 | 0.0% | 0.0% | 0.0 | – |
| 286 | Jacksonville Transit (`jacksonville-nc`) | 121 | 0.0% | 0.0% | 0.0 | – |
| 287 | Janesville Transit System (`janesville`) | 110 | 0.0% | 0.0% | 0.0 | – |
| 288 | Jefferson Transit (`jeffersontransit`) | 483 | 0.0% | 0.0% | 0.0 | – |
| 289 | Jefferson City Transit (JeffTran) (`jefftran`) | 96 | 0.0% | 0.0% | 0.0 | – |
| 290 | Capital Transit (Juneau) (`juneau`) | 68 | 0.0% | 0.0% | 0.0 | – |
| 291 | Kalamazoo Metro Transit (`kalamazoo`) | 237 | 0.0% | 0.0% | 0.0 | – |
| 292 | BC Transit (Kamloops) (`kamloops`) | 180 | 0.0% | 0.0% | 0.0 | – |
| 293 | Kings Area Rural Transit (`kart`) | 214 | 0.0% | 0.0% | 0.0 | – |
| 294 | The Kauai Bus (`kaua-i-county`) | 411 | 0.0% | 0.0% | 0.0 | – |
| 295 | Kenosha Area Transit (`kenosha`) | 164 | 0.0% | 0.0% | 0.0 | – |
| 296 | Kern Transit (`kern-transit`) | 523 | 0.0% | 0.0% | 0.0 | – |
| 297 | Key West Transit (`key-west-transit`) | 95 | 0.0% | 0.0% | 0.0 | – |
| 298 | Kingston Transit (`kingston`) | 323 | 0.0% | 0.0% | 0.0 | – |
| 299 | Kitsap Transit (`kitsaptransit`) | 579 | 0.0% | 0.0% | 0.0 | – |
| 300 | City of Ellensburg Public Transit (Central Transit) (`kittitas-county`) | 53 | 0.0% | 0.0% | 0.0 | – |
| 301 | City of Galesburg (`knox-county`) | 164 | 0.0% | 0.0% | 0.0 | – |
| 302 | Lafayette Transit System (`lafayette-la`) | 317 | 0.0% | 0.0% | 0.0 | – |
| 303 | Lake Charles Transit (`lake-charles`) | 104 | 0.0% | 0.0% | 0.0 | – |
| 304 | Laketran (Lake County, OH) (`laketran`) | 212 | 0.0% | 0.0% | 0.0 | – |
| 305 | Red Rose Transit Authority (Lancaster, PA) (`lancaster`) | 344 | 0.0% | 0.0% | 0.0 | – |
| 306 | Lehigh and Northampton Transportation Authority (LANTA) (`lanta`) | 575 | 0.0% | 0.0% | 0.0 | – |
| 307 | El Metro (Laredo) (`laredo`) | 356 | 0.0% | 0.0% | 0.0 | – |
| 308 | RoadRUNNER Transit (Las Cruces) (`las-cruces`) | 190 | 0.0% | 0.0% | 0.0 | – |
| 309 | Livermore Amador Valley Transit Authority (`lavta`) | 165 | 0.0% | 0.0% | 0.0 | – |
| 310 | Lawrence Transit / KU on Wheels (`lawrence-ku`) | 164 | 0.0% | 0.0% | 0.0 | – |
| 311 | Luzerne County Transportation Authority (`lcta`) | 277 | 0.0% | 0.0% | 0.0 | – |
| 312 | LeeTran (Fort Myers) (`leetran`) | 537 | 0.0% | 0.0% | 0.0 | – |
| 313 | Lethbridge Transit (`lethbridge`) | 144 | 0.0% | 0.0% | 0.0 | – |
| 314 | L'Inter des Laurentides (`linter`) | 81 | 0.0% | 0.0% | 0.0 | – |
| 315 | MTA Long Island Rail Road (`lirr`) | 712 | 0.0% | 0.0% | 0.0 | – |
| 316 | City of Longview Transit (`longview`) | 151 | 0.0% | 0.0% | 0.0 | – |
| 317 | Atomic City Transit (`los-alamos-county`) | 67 | 0.0% | 0.0% | 0.0 | – |
| 318 | Metro Ride (`marathon-county`) | 82 | 0.0% | 0.0% | 0.0 | – |
| 319 | Marble Valley Transit (Rutland) (`marble-valley`) | 113 | 0.0% | 0.0% | 0.0 | – |
| 320 | MARC Train (MTA Maryland) (`marc`) | 123 | 0.0% | 0.0% | 0.0 | – |
| 321 | Marin Transit (`marintransit`) | 329 | 0.0% | 0.0% | 0.0 | – |
| 322 | Martin County Public Transit (`martin-county`) | 138 | 0.0% | 0.0% | 0.0 | – |
| 323 | Mason City Public Transit (`mason-city`) | 56 | 0.0% | 0.0% | 0.0 | – |
| 324 | Memphis Area Transit Authority (`mata`) | 692 | 0.0% | 0.0% | 0.0 | – |
| 325 | MATBUS (Fargo, ND) (`matbus`) | 180 | 0.0% | 0.0% | 0.0 | – |
| 326 | Mount Adams Transportation Service (`mats`) | 72 | 0.0% | 0.0% | 0.0 | – |
| 327 | Maui County Transit (`maui-county`) | 334 | 0.0% | 0.0% | 0.0 | – |
| 328 | Metro McAllen (`mcallen`) | 266 | 0.0% | 0.0% | 0.0 | – |
| 329 | Medicine Hat Transit (`medicine-hat`) | 117 | 0.0% | 0.0% | 0.0 | – |
| 330 | Merced County Transit (The Bus) (`merced`) | 389 | 0.0% | 0.0% | 0.0 | – |
| 331 | Metra (Chicago) (`metra`) | 725 | 0.0% | 0.0% | 0.0 | – |
| 332 | Metrobus (St. John's) (`metrobus`) | 219 | 0.0% | 0.0% | 0.0 | – |
| 333 | Metrolink (`metrolink`) | 628 | 0.0% | 0.0% | 0.0 | – |
| 334 | Milton Transit (`milton`) | 149 | 0.0% | 0.0% | 0.0 | – |
| 335 | Mountain Line (Missoula) (`missoula`) | 101 | 0.0% | 0.0% | 0.0 | – |
| 336 | Mid Mon Valley Transit (`mmvta`) | 235 | 0.0% | 0.0% | 0.0 | – |
| 337 | Metro-North Railroad (MNR) (`mnr`) | 614 | 0.0% | 0.0% | 0.0 | – |
| 338 | Montebello Bus Lines (`montebello`) | 163 | 0.0% | 0.0% | 0.0 | – |
| 339 | Montgomery Transit (The M) (`montgomery-transit`) | 434 | 0.0% | 0.0% | 0.0 | – |
| 340 | Moose Jaw Transit (`moose-jaw`) | 53 | 0.0% | 0.0% | 0.0 | – |
| 341 | Mountain Line Transit Authority (Morgantown) (`mountain-line`) | 283 | 0.0% | 0.0% | 0.0 | – |
| 342 | Mountain Transit (Big Bear Lake) (`mountain-transit-ca`) | 133 | 0.0% | 0.0% | 0.0 | – |
| 343 | Mountain Line (Flagstaff) (`mountainline`) | 115 | 0.0% | 0.0% | 0.0 | – |
| 344 | Monterey-Salinas Transit (MST) (`mst`) | 661 | 0.0% | 0.0% | 0.0 | – |
| 345 | Mass Transportation Authority (Flint) (`mta-flint`) | 325 | 0.0% | 0.0% | 0.0 | – |
| 346 | METRA (`muscogee-county`) | 192 | 0.0% | 0.0% | 0.0 | – |
| 347 | Muskegon Area Transit System (`muskegon`) | 94 | 0.0% | 0.0% | 0.0 | – |
| 348 | BC Transit (Nanaimo) (`nanaimo`) | 422 | 0.0% | 0.0% | 0.0 | – |
| 349 | Tar River Transit (`nash-county`) | 158 | 0.0% | 0.0% | 0.0 | – |
| 350 | North County Transit District (NCTD) (`nctd`) | 720 | 0.0% | 0.0% | 0.0 | – |
| 351 | New Castle Area Transit Authority (`new-castle`) | 284 | 0.0% | 0.0% | 0.0 | – |
| 352 | NFTA (Buffalo) (`nfta`) | 688 | 0.0% | 0.0% | 0.0 | – |
| 353 | Niagara Transit (`niagara`) | 1,004 | 0.0% | 0.0% | 0.0 | – |
| 354 | Nassau Inter-County Express (NICE Bus) (`nice`) | 664 | 0.0% | 0.0% | 0.0 | – |
| 355 | North Bay Transit (`north-bay`) | 161 | 0.0% | 0.0% | 0.0 | – |
| 356 | Norwalk Transit System (`norwalktransit`) | 126 | 0.0% | 0.0% | 0.0 | – |
| 357 | OmniRide (PRTC) (`omniride`) | 910 | 0.0% | 0.0% | 0.0 | – |
| 358 | Orillia Transit (`orillia`) | 65 | 0.0% | 0.0% | 0.0 | – |
| 359 | 10-15 Transit (`ottumwa`) | 106 | 0.0% | 0.0% | 0.0 | – |
| 360 | Putnam Area Rapid Transit (PART) (`part`) | 127 | 0.0% | 0.0% | 0.0 | – |
| 361 | Pasadena Transit (`pasadenatransit`) | 149 | 0.0% | 0.0% | 0.0 | – |
| 362 | Petaluma Transit (`petaluma`) | 61 | 0.0% | 0.0% | 0.0 | – |
| 363 | Pocatello Regional Transit (`pocatello`) | 138 | 0.0% | 0.0% | 0.0 | – |
| 364 | Blue Water Area Transit (Port Huron) (`port-huron`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 365 | Greater Portland Metro (`portlandme`) | 232 | 0.0% | 0.0% | 0.0 | – |
| 366 | Prince Albert Transit (`prince-albert`) | 75 | 0.0% | 0.0% | 0.0 | – |
| 367 | Pueblo Transit (`pueblo-transit`) | 130 | 0.0% | 0.0% | 0.0 | – |
| 368 | Palos Verdes Peninsula Transit Authority (PVPTA) (`pvpta`) | 62 | 0.0% | 0.0% | 0.0 | – |
| 369 | Pioneer Valley Transit Authority (`pvta`) | 704 | 0.0% | 0.0% | 0.0 | – |
| 370 | Redding Area Bus Authority (`raba`) | 124 | 0.0% | 0.0% | 0.0 | – |
| 371 | Ryde Racine (`racine`) | 156 | 0.0% | 0.0% | 0.0 | – |
| 372 | Radford Transit (`radford`) | 183 | 0.0% | 0.0% | 0.0 | – |
| 373 | Rapid Transit System (Rapid City, SD) (`rapid-city`) | 155 | 0.0% | 0.0% | 0.0 | – |
| 374 | Redwood Coast Transit (RCT) (`rct`) | 229 | 0.0% | 0.0% | 0.0 | – |
| 375 | Red Deer Transit (`red-deer`) | 148 | 0.0% | 0.0% | 0.0 | – |
| 376 | Regina Transit (`regina`) | 356 | 0.0% | 0.0% | 0.0 | – |
| 377 | REM (Montréal) (`rem`) | 121 | 76.8% | 76.8% | 0.0 | 0.0% |
| 378 | Rochester-Genesee Regional Transportation Authority (`rgrta`) | 314 | 0.0% | 0.0% | 0.0 | – |
| 379 | Richland County Transit (`richland-county-oh`) | 194 | 0.0% | 0.0% | 0.0 | – |
| 380 | RiverCities Transit (`rivercities`) | 167 | 0.0% | 0.0% | 0.0 | – |
| 381 | Beloit Transit System (`rock-county`) | 187 | 0.0% | 0.0% | 0.0 | – |
| 382 | Rockford Mass Transit District (`rockford`) | 417 | 0.5% | 0.5% | 0.0 | 0.0% |
| 383 | Rock Region Metro (Little Rock) (`rockregion`) | 216 | 0.0% | 0.0% | 0.0 | – |
| 384 | Roseville Transit (`roseville`) | 186 | 0.0% | 0.0% | 0.0 | – |
| 385 | Clear Creek County Transit (RoundAbout) (`roundabout`) | 61 | 0.0% | 0.0% | 0.0 | – |
| 386 | Rogue Valley Transportation District (RVTD) (`rvtd`) | 72 | 0.0% | 0.0% | 0.0 | – |
| 387 | Ville de Saint-Hyacinthe (`saint-hyacinthe`) | 110 | 0.0% | 0.0% | 0.0 | – |
| 388 | Saint John Transit (`saint-john`) | 152 | 0.0% | 0.0% | 0.0 | – |
| 389 | Sandy Area Metro (SAM) (`sam`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 390 | Concho Valley Transit (San Angelo) (`san-angelo`) | 186 | 0.0% | 0.0% | 0.0 | – |
| 391 | Sandusky Transit System (`sandusky`) | 138 | 0.0% | 0.0% | 0.0 | – |
| 392 | Santa Cruz METRO (`santa-cruz-metro`) | 605 | 0.0% | 0.0% | 0.0 | – |
| 393 | Santa Clarita Transit (`santaclarita`) | 411 | 0.0% | 0.0% | 0.0 | – |
| 394 | Santa Fe Trails (`santafetrails`) | 68 | 0.0% | 0.0% | 0.0 | – |
| 395 | Santa Rosa CityBus (`santarosa`) | 200 | 0.0% | 0.0% | 0.0 | – |
| 396 | Sarnia Transit (`sarnia`) | 205 | 0.0% | 0.0% | 0.0 | – |
| 397 | Stark Area Regional Transit Authority (`sarta`) | 369 | 0.0% | 0.0% | 0.0 | – |
| 398 | Santa Barbara Metropolitan Transit District (MTD) (`sbmtd`) | 220 | 0.0% | 0.0% | 0.0 | – |
| 399 | Suffolk County Transit (SCT) (`sct`) | 857 | 0.0% | 0.0% | 0.0 | – |
| 400 | Sunset Empire Transportation District (`setd`) | 137 | 0.0% | 0.0% | 0.0 | – |
| 401 | City of Gatlinburg Trolley (`sevier-county`) | 58 | 0.0% | 0.0% | 0.0 | – |
| 402 | Shoreline Metro (`sheboygan-county`) | 101 | 0.0% | 0.0% | 0.0 | – |
| 403 | City of Sierra Vista (`sierra-vista`) | 55 | 0.0% | 0.0% | 0.0 | – |
| 404 | Simcoe County LINX (`simcoe`) | 253 | 0.0% | 0.0% | 0.0 | – |
| 405 | Simi Valley Transit (`simi-valley`) | 69 | 0.0% | 0.0% | 0.0 | – |
| 406 | Sioux City Transit (`sioux-city`) | 148 | 0.0% | 0.0% | 0.0 | – |
| 407 | Sioux Area Metro (SAM) (`sioux-falls`) | 91 | 0.0% | 0.0% | 0.0 | – |
| 408 | Saint-Jean-sur-Richelieu (`sjsr`) | 166 | 0.0% | 0.0% | 0.0 | – |
| 409 | Skagit Transit (`skagittransit`) | 404 | 0.0% | 0.0% | 0.0 | – |
| 410 | San Luis Obispo Regional Transit Authority (SLORTA) (`slorta`) | 565 | 0.0% | 0.0% | 0.0 | – |
| 411 | City of San Luis Obispo Transit (`slotransit`) | 137 | 0.0% | 0.0% | 0.0 | – |
| 412 | SMART (Detroit suburbs) (`smart`) | 1,304 | 0.0% | 0.0% | 0.0 | – |
| 413 | Sonoma-Marin Area Rail Transit (SMART) (`smart-ca`) | 78 | 0.0% | 0.0% | 0.0 | – |
| 414 | South Metro Area Regional Transit (SMART) (`smart-or`) | 113 | 0.0% | 0.0% | 0.0 | – |
| 415 | San Miguel Authority for Regional Transportation (SMART) (`smart-telluride`) | 113 | 0.0% | 0.0% | 0.0 | – |
| 416 | Santa Maria Area Transit (`smat`) | 526 | 0.0% | 0.0% | 0.0 | – |
| 417 | Snoqualmie Valley Transportation (`snoqualmie-valley`) | 59 | 0.0% | 0.0% | 0.0 | – |
| 418 | SolTrans (Vallejo) (`soltrans`) | 290 | 0.0% | 0.0% | 0.0 | – |
| 419 | Sonoma County Transit (SCT) (`sonoma-county`) | 522 | 0.0% | 0.0% | 0.0 | – |
| 420 | South Bend Transpo (`south-bend`) | 185 | 0.0% | 0.0% | 0.0 | – |
| 421 | BC Transit (South Okanagan-Similkameen) (`south-okanagan`) | 108 | 0.0% | 0.0% | 0.0 | – |
| 422 | Space Coast Area Transit (`space-coast`) | 454 | 0.0% | 0.0% | 0.0 | – |
| 423 | SporTran (Shreveport) (`sportran`) | 523 | 0.0% | 0.0% | 0.0 | – |
| 424 | SMTD (Springfield IL) (`springfield-il`) | 284 | 0.0% | 0.0% | 0.0 | – |
| 425 | City Utilities Transit (Springfield) (`springfield-mo`) | 265 | 0.0% | 0.0% | 0.0 | – |
| 426 | BC Transit (Squamish) (`squamish`) | 54 | 0.0% | 0.0% | 0.0 | – |
| 427 | SunTran (St. George) (`st-george`) | 127 | 0.0% | 0.0% | 0.0 | – |
| 428 | St. Thomas Transit (`st-thomas`) | 58 | 0.0% | 0.0% | 0.0 | – |
| 429 | StarMetro (Tallahassee) (`starmetro`) | 331 | 0.0% | 0.0% | 0.0 | – |
| 430 | STL (Laval) (`stl`) | 727 | 0.0% | 0.0% | 0.0 | – |
| 431 | STLévis (`stlevis`) | 322 | 0.0% | 0.0% | 0.0 | – |
| 432 | Stratford Transit (`stratford`) | 81 | 0.0% | 0.0% | 0.0 | – |
| 433 | Streamline (Bozeman) (`streamline`) | 65 | 0.0% | 0.0% | 0.0 | – |
| 434 | SunLine Transit Agency (Coachella Valley) (`sunline`) | 439 | 0.0% | 0.0% | 0.0 | – |
| 435 | SunRail (Orlando) (`sunrail`) | 98 | 0.0% | 0.0% | 0.0 | – |
| 436 | Sunshine Bus Company (`sunshine-bus`) | 451 | 0.0% | 0.0% | 0.0 | – |
| 437 | T3 Transit (PEI) (`t3-transit`) | 74 | 0.0% | 0.0% | 0.0 | – |
| 438 | Transit Authority of Northern Kentucky (TANK) (`tank`) | 216 | 3.9% | 3.9% | 0.0 | 0.0% |
| 439 | TARTA (Toledo) (`tarta`) | 344 | 0.0% | 0.0% | 0.0 | – |
| 440 | Tompkins Consolidated Area Transit (`tcat`) | 214 | 0.0% | 0.0% | 0.0 | – |
| 441 | Texarkana T-Line (`texarkana`) | 150 | 0.0% | 0.0% | 0.0 | – |
| 442 | Thousand Oaks Transit (`thousand-oaks`) | 140 | 0.0% | 0.0% | 0.0 | – |
| 443 | Thunder Bay Transit (`thunder-bay`) | 143 | 0.0% | 0.0% | 0.0 | – |
| 444 | Tillamook County Transportation District (`tillamook`) | 465 | 0.0% | 0.0% | 0.0 | – |
| 445 | Timmins Transit (`timmins`) | 194 | 0.0% | 0.0% | 0.0 | – |
| 446 | Topeka Metro (`topeka`) | 148 | 0.0% | 0.0% | 0.0 | – |
| 447 | Transport of Rockland (TOR) (`tor`) | 250 | 0.0% | 0.0% | 0.0 | – |
| 448 | Torrance Transit (`torrance-transit`) | 219 | 0.0% | 0.0% | 0.0 | – |
| 449 | Tri Delta Transit (Antioch) (`tridelta`) | 173 | 0.0% | 0.0% | 0.0 | – |
| 450 | Trinity Transit (`trinity`) | 94 | 0.0% | 0.0% | 0.0 | – |
| 451 | Tulare County Area Transit (TCAT) (`tulare-county-transit`) | 374 | 0.0% | 0.0% | 0.0 | – |
| 452 | Tulsa Transit (MTTA) (`tulsa-transit`) | 459 | 0.0% | 0.0% | 0.0 | – |
| 453 | UGA Campus Transit (`uga`) | 206 | 0.0% | 0.0% | 0.0 | – |
| 454 | Union City Transit (`unioncity`) | 57 | 0.0% | 0.0% | 0.0 | – |
| 455 | Unitrans (Davis) (`unitrans`) | 136 | 0.0% | 0.0% | 0.0 | – |
| 456 | Valley Express (`valley-express`) | 85 | 0.0% | 0.0% | 0.0 | – |
| 457 | Valley Metro (Roanoke, VA) (`valley-metro-roanoke`) | 482 | 0.0% | 0.0% | 0.0 | – |
| 458 | Ventura County Transportation Commission (VCTC Intercity) (`vctc`) | 368 | 0.0% | 0.0% | 0.0 | – |
| 459 | VINE Transit (Napa) (`vine`) | 289 | 0.0% | 0.0% | 0.0 | – |
| 460 | Votran (Volusia County) (`votran`) | 450 | 0.0% | 0.0% | 0.0 | – |
| 461 | Virginia Railway Express (VRE) (`vre`) | 58 | 0.0% | 0.0% | 0.0 | – |
| 462 | Victor Valley Transit Authority (VVTA) (`vvta`) | 684 | 0.0% | 0.0% | 0.0 | – |
| 463 | Waco Transit System (`waco`) | 244 | 0.0% | 0.0% | 0.0 | – |
| 464 | Johnson City (`washington-county`) | 146 | 0.0% | 0.0% | 0.0 | – |
| 465 | Williamsburg Area Transit Authority (`wata`) | 173 | 0.0% | 0.0% | 0.0 | – |
| 466 | Watertown Citibus (`watertowncitibus`) | 65 | 0.0% | 0.0% | 0.0 | – |
| 467 | Waukesha Metro Transit (`waukesha-metro`) | 77 | 0.0% | 0.0% | 0.0 | – |
| 468 | Wave Transit (Mobile) (`wave-mobile`) | 152 | 0.0% | 0.0% | 0.0 | – |
| 469 | WestCAT (Pinole) (`westcat`) | 180 | 0.0% | 0.0% | 0.0 | – |
| 470 | Westmoreland Transit (`westmoreland`) | 450 | 0.0% | 0.0% | 0.0 | – |
| 471 | San Francisco Bay Area Water Emergency Transportation Authority (WETA) (`weta`) | 98 | 0.0% | 0.0% | 0.0 | – |
| 472 | Whatcom Transportation Authority (`whatcomtransit`) | 405 | 0.0% | 0.0% | 0.0 | – |
| 473 | BC Transit (Whistler) (`whistler`) | 87 | 0.0% | 0.0% | 0.0 | – |
| 474 | Whitehorse Transit (`whitehorse`) | 154 | 0.0% | 0.0% | 0.0 | – |
| 475 | City of Pullman (`whitman-county`) | 60 | 0.0% | 0.0% | 0.0 | – |
| 476 | Wichita Transit (`wichita`) | 274 | 0.0% | 0.0% | 0.0 | – |
| 477 | Wave Transit (Wilmington) (`wilmington-nc`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 478 | Transit Windsor (`windsor`) | 337 | 0.0% | 0.0% | 0.0 | – |
| 479 | Winston-Salem Transit Authority (WSTA) (`winston-salem`) | 254 | 0.0% | 0.0% | 0.0 | – |
| 480 | The Lift (`winter-park`) | 152 | 0.0% | 0.0% | 0.0 | – |
| 481 | Worcester Regional Transit Authority (`wrta`) | 326 | 0.0% | 0.0% | 0.0 | – |
| 482 | Washington State Ferries (`wsf`) | 440 | 0.0% | 0.0% | 0.0 | – |
| 483 | West Virginia University PRT (Morgantown, WV) (`wvu-prt`) | 52 | 0.0% | 0.0% | 0.0 | – |
| 484 | Yakima Transit (`yakima`) | 185 | 0.0% | 0.0% | 0.0 | – |
| 485 | Yamhill County Transit Area (`yamhill`) | 229 | 0.0% | 0.0% | 0.0 | – |
| 486 | Yolo County Transportation District (Yolobus) (`yolobus`) | 330 | 0.0% | 0.0% | 0.0 | – |
| 487 | Western Reserve Transit Authority (Youngstown) (`youngstown-wrta`) | 296 | 0.0% | 0.0% | 0.0 | – |
| 488 | Trinity Metro (Fort Worth) (`trinitymetro`) | 558 | 1.5% | 1.8% | -0.3 | -17.8% |
| 489 | Champaign-Urbana MTD (`mtd-champaign`) | 395 | 0.0% | 2.5% | -2.5 | – |
| 490 | CATA (State College) (`cata-state-college`) | 157 | 0.0% | 2.9% | -2.9 | – |
| 491 | Greensboro Transit Authority (`greensboro`) | 211 | 0.0% | 3.4% | -3.4 | – |

## Method

Same method as the 2026-10-11 run. The script that produced that run was not kept in the repo or the research bundle, so this is a reimplementation from the old report's method section (see Caveats for what that can change).

- **Periods (the project's own definitions in `shared/config.ts`).** "9 AM Monday" uses **AM Peak (6–9 AM) on Weekday** service. Strictly, 9:00 falls on the AM Peak/Midday boundary, and the app's hour lookup assigns 9 AM to Midday (9 AM–3 PM). The CSV includes a `weekday_midday_pct` column for that reading. "9 PM Sunday" uses **Evening (7–11 PM) on Sunday** service. Monday = Weekday.
- **Passing "every 15 or better".** Each route is tested with the repo's shared filter, `routePassesHeadwayFilter(features, period, day, 15)` from `shared/routeHeadwayFilter.ts`, after `normalizeRouteFilterFeatures` stamps worst-direction values over the whole agency file. That is the same normalisation the PMTiles build does (`pipeline/prepareAgencyRoutesForTiles.ts`). So a route passes here only if the map would draw it under "≤15 min" for that day and period. Worst direction decides (`docs/product/FREQUENCY_RULES.md`). The rule code is commit `8a33431e`, which is the release's own `codeVersion`, so these numbers match the live tiles by construction. Since the previous run the rule has changed: the coverage stamp now uses the same pattern pool as the period headway, and the filter reads the stretch selector's per-period value where a route has one (frequency focus steps 2a, 5a and 6, 2026-10-15).
- **Route unit.** Route short name (or route ID when there's no short name) plus route branch. This is the same grouping the worst-direction rule uses.
- **Route-km.** For each route, the length of its **longest single drawn pattern** (great-circle length of the LineString) across all days and directions. Both directions are never added together, and short-turns are never added on top. Branched routes are under-counted where their tails differ. Separately branched routes (1 branch groups across all agencies) can double-count a shared trunk.
- **Denominator.** One fixed set of routes per agency for both periods: every included route with Weekday or Sunday service. A route that doesn't run on Sunday stays in the denominator and counts as not frequent.
- **Exclusions.** On-demand zones and paratransit are not route features in Atlas, so they aren't counted. Patterns the map hides by default as irregular (`isHiddenByIrregularFilter` in `shared/irregularRoutes.ts`, matching the default "hide irregular" setting) are dropped from length and from passing. A route made up only of such patterns is excluded entirely (2,632 routes). Time-limited routes are **kept**. Routes the agency config excludes are already absent from the release.
- **Rail and ferry.** Included at the same weighting as bus. `rail_km` counts GTFS route types 0, 1, 2, 5, 6, 7, 12 and the extended rail ranges. Bus-only percentages use types 3 and 11 and the extended bus range; they are blank for agencies with no bus routes.
- **Sensitivity and diagnostic columns.** `sens_*`: the same shared code, but hidden irregular patterns are removed before stamping. `diag_*_cov_only_pct`: share of route-km that fails the filter even though the route-wide worst-direction cadence for the period is 15 min or better (diagnostic only, not used in ranking). Under the current rule a route can also fail on its stretch-selector value, so this column is now an upper bound on coverage-only failures, not an exact count.
- **Agency set and `feed_refreshed`.** The public catalog (`public/data/catalog-public.json`, unchanged between `8a33431e` and the research branch head, 548 agencies). `feed_refreshed` is the catalog's `lastRefreshedAt`, falling back to `lastFeedCheckAt`.

## Caveats

- **Scheduled, not actual.** Based on published GTFS schedules. Detours, short-turns on the day and missed trips aren't reflected.
- **Feed dates vary.** Each agency's `feed_refreshed` date is in the CSV. Seasonal schedules affect both periods.
- **Missing files:** none. Every agency in the public catalog returned a file.
- **Agencies missing last time (HTTP 404).** Back in this run: cobourg. Not in the public catalog, so not in this run: hocts, siskiyou, elmonte, roswell, tangipahoa-parish, fort-bend, mexico-city-metro.
- **Reimplemented, not rerun.** The original script was not kept. The old release's agency files are no longer published, so the reimplementation could not be checked against the old data directly. Instead, every agency was also scored with the old rule code (commit `8681db71`, #601) on the new data. Where the network did not change, the old-rule AM peak figures land close to the old CSV (Hamilton 37.3% vs 36.2%, TTC 29.2% vs 30.7%, MARTA 12.8% vs 12.8%), which suggests the reimplementation matches. Small differences in route counts and `irregular_routes_excluded` can still come from the reimplementation (how hidden patterns are counted), not the data.
- **The old-rule baseline is not clean on Sunday evening.** The release now carries stretch-selector values that the current filter reads first. The old rule code ignores them and reads only each pattern's own values, which in this release are often stricter on Sunday evening (Sound Transit 1 Line: one direction shows a 64-minute full-window gap on its own pattern, but passes on its stretch value). So old-rule Sunday figures on the new data are often lower than both runs. `CHANGES.md` flags those agencies instead of splitting the change.
- **Rule effect from the old report, revisited.** The old report flagged that one hidden irregular or occasional short-turn sibling could fail an otherwise frequent route through the coverage stamp (TTC 504 King, TTC 501 Queen, NYC Subway 1 and L). The rule code in this release uses the same pattern pool for coverage as for headway, and the `diag_*_cov_only_pct` columns are much lower for those agencies. Some coverage-only failures remain; they are in the CSV.
- **Alternating destinations count separately.** The rule scores each real destination on its own cadence, not the combined trunk. A corridor served by two patterns every 24 min each does not pass, even though the shared stretch is busier.
- **Small agencies.** Percentages for agencies under about 50 route-km swing on one route. They're in the CSV but not in the ranked tables.

## Files

- `falloff.csv`: one row per agency (all 548), sorted by route-km. `country` comes from the agency's region.
- The scripts for this run (`falloff.ts`, which scores every agency with both rule versions, and `build_outputs.py`, which writes these files) are not stored in the repo.
- `CHANGES.md`: agencies whose shares moved by more than 5 points since the 2026-10-11 run, with the likely cause, and agencies added or removed.
