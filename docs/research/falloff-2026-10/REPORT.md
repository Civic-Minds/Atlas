# Frequent-service fall-off: weekday AM peak vs Sunday evening

**PRELIMINARY. Rerun after the next data release.**

Data: live Atlas release `release-mv0iozy4`, generated 2026-10-09 (read-only, fetched 2026-10-11). Scheduled service from GTFS, not actual/real-time service.

## The question

Per agency: what share of route-kilometres has service every 15 minutes or better at about 9 am Monday, versus about 9 pm Sunday, and how big is the drop?

## Headline

- 538 agencies analysed, 210,362 route-km, 11,363 routes.
- Across all agencies (route-km weighted): **6.2%** of route-km is every-15-or-better at weekday AM peak, **2.4%** on Sunday evening.
- 111 of 478 agencies with at least 50 route-km publish no Sunday service at all (they score 0% on Sunday).

## Top 10 by fall-off (points)

Agencies with at least 50 route-km and at least 10% frequent at AM peak.

| # | Agency | Route-km | Wkday AM peak ≤15 | Sun evening ≤15 | Fall-off (pts) | Fall-off (rel.) |
|---|---|---:|---:|---:|---:|---:|
| 1 | University of Michigan Transit Services (Ann Arbor) (`um-transit`) | 74 | 46.9% | 6.3% | 40.6 | 86.5% |
| 2 | Hamilton Street Railway (`hamilton`) | 457 | 36.2% | 0.0% | 36.2 | 100.0% |
| 3 | Burlington Transit (`burlington`) | 170 | 34.2% | 0.0% | 34.2 | 100.0% |
| 4 | MTA NYCT Bus (Brooklyn) (`nyct-bus-brooklyn`) | 727 | 46.1% | 13.3% | 32.7 | 71.1% |
| 5 | MTA NYCT Bus (Bronx) (`nyct-bus-bronx`) | 430 | 57.8% | 27.0% | 30.8 | 53.3% |
| 6 | Winnipeg Transit (`winnipeg`) | 895 | 29.3% | 0.0% | 29.3 | 100.0% |
| 7 | Milwaukee County Transit System (MCTS) (`mcts`) | 713 | 26.4% | 0.0% | 26.4 | 100.0% |
| 8 | Fresno Area Express (FAX) (`fax`) | 378 | 25.8% | 0.0% | 25.8 | 100.0% |
| 9 | Anchorage People Mover (`anchorage`) | 198 | 22.4% | 0.0% | 22.4 | 100.0% |
| 10 | Big Blue Bus (Santa Monica) (`bigbluebus`) | 219 | 21.2% | 0.0% | 21.2 | 100.0% |

## Bottom 10 by fall-off (points)

Same pool. Smallest drop, or Sunday evening better than weekday AM peak. REM and NYC Subway are rule artifacts (see Caveats). Their AM peak is understated.

| # | Agency | Route-km | Wkday AM peak ≤15 | Sun evening ≤15 | Fall-off (pts) | Fall-off (rel.) |
|---|---|---:|---:|---:|---:|---:|
| 1 | REM (Montréal) (`rem`) | 121 | 37.7% | 76.8% | -39.1 | -103.8% |
| 2 | MTA NYCT Subway (`nyct-subway`) | 630 | 39.1% | 65.2% | -26.1 | -66.7% |
| 3 | WMATA (Washington, DC) (`wmata`) | 1,830 | 10.2% | 9.3% | 0.8 | 8.3% |
| 4 | Nashville MTA WeGo Public Transit (`nashvillemta`) | 522 | 11.1% | 8.3% | 2.8 | 24.9% |
| 5 | RTC (Québec) (`rtc`) | 679 | 15.4% | 11.9% | 3.5 | 22.7% |
| 6 | Alameda-Contra Costa Transit District (AC Transit) (`actransit`) | 1,146 | 10.1% | 6.2% | 3.9 | 38.9% |
| 7 | Sound Transit (Seattle) (`soundtransit`) | 127 | 56.4% | 51.5% | 4.9 | 8.7% |
| 8 | MARTA (Atlanta) (`marta`) | 1,668 | 12.8% | 6.0% | 6.7 | 52.7% |
| 9 | Miami-Dade Transit (`miami-dade-transit`) | 2,272 | 11.0% | 2.6% | 8.4 | 76.7% |
| 10 | Edmonton Transit Service (ETS) (`edmonton`) | 1,820 | 14.9% | 6.3% | 8.6 | 58.0% |

## GTHA

| | Agency | Route-km | Wkday AM peak ≤15 | Sun evening ≤15 | Fall-off (pts) | Fall-off (rel.) |
|---|---:|---:|---:|---:|---:|
| Toronto Transit Commission (`ttc`) | 2,663 | 30.7% | 17.1% | 13.6 | 44.4% |
| MiWay (Mississauga) (`miway`) | 854 | 21.7% | 3.1% | 18.6 | 85.7% |
| York Region Transit (`yrt`) | 976 | 16.0% | 2.7% | 13.4 | 83.3% |
| Brampton Transit (`brampton`) | 698 | 15.7% | 3.0% | 12.8 | 81.0% |
| Durham Region Transit (`drt`) | 719 | 0.0% | 0.0% | 0.0 | – |
| GO Transit (`go`) | 3,047 | 0.0% | 0.0% | 0.0 | – |
| Hamilton Street Railway (`hamilton`) | 457 | 36.2% | 0.0% | 36.2 | 100.0% |
| Burlington Transit (`burlington`) | 170 | 34.2% | 0.0% | 34.2 | 100.0% |
| Oakville Transit (`oakville`) | 222 | 7.4% | 0.0% | 7.4 | 100.0% |

GTHA notes:
- GO Transit is mostly rail and regional coach. Its rail lines rarely run every 15, so a low score is expected and isn't comparable with the local bus systems.
- TTC includes subway (lines 1, 2 and 4) and streetcar. Bus-only figures for every agency are in the CSV (`bus_am_pct`, `bus_sun_eve_pct`).
- HSR's slug is `hamilton`.

## All agencies with at least 50 route-km, ranked by fall-off (points)

| # | Agency | Route-km | Wkday AM peak ≤15 | Sun evening ≤15 | Fall-off (pts) | Fall-off (rel.) |
|---|---|---:|---:|---:|---:|---:|
| 1 | University of Michigan Transit Services (Ann Arbor) (`um-transit`) | 74 | 46.9% | 6.3% | 40.6 | 86.5% |
| 2 | Hamilton Street Railway (`hamilton`) | 457 | 36.2% | 0.0% | 36.2 | 100.0% |
| 3 | Burlington Transit (`burlington`) | 170 | 34.2% | 0.0% | 34.2 | 100.0% |
| 4 | MTA NYCT Bus (Brooklyn) (`nyct-bus-brooklyn`) | 727 | 46.1% | 13.3% | 32.7 | 71.1% |
| 5 | MTA NYCT Bus (Bronx) (`nyct-bus-bronx`) | 430 | 57.8% | 27.0% | 30.8 | 53.3% |
| 6 | Winnipeg Transit (`winnipeg`) | 895 | 29.3% | 0.0% | 29.3 | 100.0% |
| 7 | Milwaukee County Transit System (MCTS) (`mcts`) | 713 | 26.4% | 0.0% | 26.4 | 100.0% |
| 8 | Fresno Area Express (FAX) (`fax`) | 378 | 25.8% | 0.0% | 25.8 | 100.0% |
| 9 | Anchorage People Mover (`anchorage`) | 198 | 22.4% | 0.0% | 22.4 | 100.0% |
| 10 | Big Blue Bus (Santa Monica) (`bigbluebus`) | 219 | 21.2% | 0.0% | 21.2 | 100.0% |
| 11 | Chapel Hill Transit (`chapel-hill-transit`) | 202 | 19.3% | 0.0% | 19.3 | 100.0% |
| 12 | Transfort (Fort Collins) (`transfort`) | 154 | 19.2% | 0.0% | 19.2 | 100.0% |
| 13 | Chicago Transit Authority (CTA) (`cta`) | 1,843 | 35.8% | 16.7% | 19.1 | 53.4% |
| 14 | Vail Transit (`vail-transit`) | 88 | 18.8% | 0.0% | 18.8 | 100.0% |
| 15 | MTA NYCT Bus (Queens) (`nyct-bus-queens`) | 410 | 53.2% | 34.4% | 18.8 | 35.4% |
| 16 | MiWay (Mississauga) (`miway`) | 854 | 21.7% | 3.1% | 18.6 | 85.7% |
| 17 | Advance Transit (Lebanon, NH) (`advance-transit`) | 88 | 17.8% | 0.0% | 17.8 | 100.0% |
| 18 | Maryland Transit Administration (MTA Maryland) (`mta-maryland`) | 1,220 | 17.0% | 0.0% | 17.0 | 100.0% |
| 19 | Los Angeles County Metropolitan Transportation Authority (LA Metro) (`lacmta`) | 3,036 | 17.2% | 1.0% | 16.2 | 94.3% |
| 20 | Glendale Beeline (`glendalebeeline`) | 73 | 16.0% | 0.0% | 16.0 | 100.0% |
| 21 | NCSU Wolfline (`ncsu-wolfline`) | 64 | 15.9% | 0.0% | 15.9 | 100.0% |
| 22 | MTA NYCT Bus (Manhattan) (`nyct-bus-manhattan`) | 331 | 40.6% | 24.9% | 15.7 | 38.7% |
| 23 | Sacramento Regional Transit (SacRT) (`sacrt`) | 643 | 15.2% | 0.0% | 15.2 | 100.0% |
| 24 | exo (Le Richelain–Roussillon) (`exo-lrrs`) | 200 | 14.4% | 0.0% | 14.4 | 100.0% |
| 25 | GoRaleigh (Capital Area Transit) (`goraleigh`) | 428 | 13.9% | 0.0% | 13.9 | 100.0% |
| 26 | METRO Houston (`metrohouston`) | 2,278 | 18.1% | 4.4% | 13.7 | 75.6% |
| 27 | Toronto Transit Commission (`ttc`) | 2,663 | 30.7% | 17.1% | 13.6 | 44.4% |
| 28 | Clemson Area Transit (CATbus) (`clemson-cat`) | 70 | 13.4% | 0.0% | 13.4 | 100.0% |
| 29 | York Region Transit (`yrt`) | 976 | 16.0% | 2.7% | 13.4 | 83.3% |
| 30 | Ben Franklin Transit (Tri-Cities, WA) (`ben-franklin`) | 406 | 13.3% | 0.0% | 13.3 | 100.0% |
| 31 | Grand River Transit (Waterloo Region) (`grt`) | 615 | 17.7% | 4.9% | 12.9 | 72.6% |
| 32 | UGA Campus Transit (`uga`) | 155 | 12.9% | 0.0% | 12.9 | 100.0% |
| 33 | Spokane Transit Authority (`spokane`) | 516 | 12.8% | 0.0% | 12.8 | 100.0% |
| 34 | Los Angeles Department of Transportation (LADOT/DASH) (`ladot`) | 577 | 15.9% | 3.1% | 12.8 | 80.6% |
| 35 | Brampton Transit (`brampton`) | 698 | 15.7% | 3.0% | 12.8 | 81.0% |
| 36 | Capital Metro (Austin) (`capmetro`) | 836 | 12.6% | 0.0% | 12.6 | 100.0% |
| 37 | Calgary Transit (`calgary`) | 2,010 | 15.4% | 3.0% | 12.4 | 80.7% |
| 38 | Bay Area Rapid Transit (BART) (`bart`) | 787 | 13.7% | 1.3% | 12.4 | 90.4% |
| 39 | Metropolitan Transit System (San Diego MTS) (`sdmts`) | 1,576 | 16.7% | 4.3% | 12.3 | 73.9% |
| 40 | NJ Transit Rail (`njt-rail`) | 80 | 12.3% | 0.0% | 12.3 | 100.0% |
| 41 | MTA NYCT Bus (Staten Island) (`nyct-bus-si`) | 520 | 19.4% | 7.5% | 11.9 | 61.5% |
| 42 | SEPTA (Philadelphia) (`septa`) | 2,603 | 13.5% | 1.9% | 11.6 | 85.7% |
| 43 | Central Ohio Transit Authority (COTA) (`cota`) | 763 | 11.5% | 0.0% | 11.5 | 100.0% |
| 44 | Valley Regional Transit (Boise) (`valley-regional-transit`) | 176 | 11.3% | 0.0% | 11.3 | 100.0% |
| 45 | Regional Transportation District (RTD Denver) (`rtd-denver`) | 2,506 | 11.1% | 0.1% | 11.1 | 99.2% |
| 46 | TransLink (Vancouver) (`translink`) | 2,846 | 22.3% | 11.7% | 10.6 | 47.4% |
| 47 | King County Metro (Seattle) (`kingcountymetro`) | 1,932 | 21.4% | 11.0% | 10.4 | 48.7% |
| 48 | San Francisco Municipal Transportation Agency (SFMTA - Muni) (`sfmta`) | 740 | 31.8% | 21.6% | 10.2 | 32.1% |
| 49 | Omaha Metro (`omahametro`) | 376 | 10.2% | 0.0% | 10.2 | 100.0% |
| 50 | OmniTrans (San Bernardino) (`omnitrans`) | 744 | 9.8% | 0.0% | 9.8 | 100.0% |
| 51 | Saint John Transit (`saint-john`) | 145 | 9.4% | 0.0% | 9.4 | 100.0% |
| 52 | Utah Transit Authority (UTA) (`uta`) | 1,655 | 9.2% | 0.0% | 9.2 | 100.0% |
| 53 | TheRide (Ann Arbor) (`theride`) | 294 | 9.1% | 0.0% | 9.1 | 100.0% |
| 54 | CyRide (Ames) (`cyride`) | 142 | 9.0% | 0.0% | 9.0 | 100.0% |
| 55 | BC Transit (Kelowna) (`kelowna`) | 312 | 9.0% | 0.0% | 9.0 | 100.0% |
| 56 | Santa Fe Trails (`santafetrails`) | 128 | 8.9% | 0.0% | 8.9 | 100.0% |
| 57 | Edmonton Transit Service (ETS) (`edmonton`) | 1,820 | 14.9% | 6.3% | 8.6 | 58.0% |
| 58 | Santa Clara Valley Transportation Authority (VTA) (`vta`) | 998 | 8.6% | 0.0% | 8.6 | 100.0% |
| 59 | STLévis (`stlevis`) | 343 | 8.5% | 0.0% | 8.5 | 100.0% |
| 60 | Miami-Dade Transit (`miami-dade-transit`) | 2,272 | 11.0% | 2.6% | 8.4 | 76.7% |
| 61 | Greater Sudbury Transit (`sudbury`) | 288 | 8.1% | 0.0% | 8.1 | 100.0% |
| 62 | Kansas City Area Transportation Authority (KCATA) (`kcata`) | 564 | 7.6% | 0.0% | 7.6 | 100.0% |
| 63 | Stanford Marguerite Shuttle (SMS) (`stanford`) | 114 | 7.4% | 0.0% | 7.4 | 100.0% |
| 64 | Oakville Transit (`oakville`) | 222 | 7.4% | 0.0% | 7.4 | 100.0% |
| 65 | TriMet (Portland, OR) (`trimet`) | 1,306 | 8.3% | 1.1% | 7.3 | 87.3% |
| 66 | MARTA (Atlanta) (`marta`) | 1,668 | 12.8% | 6.0% | 6.7 | 52.7% |
| 67 | Transit Windsor (`windsor`) | 337 | 6.7% | 0.0% | 6.7 | 100.0% |
| 68 | Mountain Metropolitan Transit (Colorado Springs) (`mountainmetro`) | 338 | 6.2% | 0.0% | 6.2 | 100.0% |
| 69 | DDOT (Detroit) (`ddot`) | 766 | 6.2% | 0.0% | 6.2 | 100.0% |
| 70 | DeKalb Public Transit (`dekalb`) | 156 | 6.0% | 0.0% | 6.0 | 100.0% |
| 71 | London Transit (`london`) | 508 | 5.9% | 0.0% | 5.9 | 100.0% |
| 72 | Ride On (Montgomery County) (`rideon`) | 894 | 7.8% | 1.9% | 5.9 | 75.5% |
| 73 | exo (Laurentides) (`exo-laurentides`) | 679 | 5.8% | 0.0% | 5.8 | 100.0% |
| 74 | Pace Bus (Chicago suburbs) (`pace-bus`) | 2,574 | 7.1% | 1.4% | 5.7 | 80.5% |
| 75 | exo (Terrebonne-Mascouche) (`exo-terrebonne`) | 374 | 5.7% | 0.0% | 5.7 | 100.0% |
| 76 | Charlotte Area Transit System (CATS) (`cats`) | 747 | 5.7% | 0.0% | 5.7 | 100.0% |
| 77 | StarMetro (Tallahassee) (`starmetro`) | 331 | 5.6% | 0.0% | 5.6 | 100.0% |
| 78 | Long Beach Transit (`longbeach`) | 578 | 5.6% | 0.0% | 5.6 | 100.0% |
| 79 | Valley Metro (Phoenix) (`valleymetro`) | 2,097 | 5.5% | 0.0% | 5.5 | 100.0% |
| 80 | Cedar Rapids Transit (`cedar-rapids`) | 292 | 5.5% | 0.0% | 5.5 | 100.0% |
| 81 | Iowa City Transit (`iowa-city`) | 151 | 5.5% | 0.0% | 5.5 | 100.0% |
| 82 | The Rapid (Grand Rapids) (`the-rapid`) | 524 | 5.5% | 0.0% | 5.5 | 100.0% |
| 83 | Pittsburgh Regional Transit (`port-authority-pa`) | 1,476 | 5.3% | 0.0% | 5.3 | 100.0% |
| 84 | Akron Metro Regional Transit Authority (`akron`) | 396 | 5.2% | 0.0% | 5.2 | 100.0% |
| 85 | TheBus (Honolulu) (`thebus`) | 1,332 | 7.6% | 2.5% | 5.0 | 66.3% |
| 86 | Sound Transit (Seattle) (`soundtransit`) | 127 | 56.4% | 51.5% | 4.9 | 8.7% |
| 87 | VIA Metropolitan Transit (San Antonio) (`via`) | 1,630 | 6.1% | 1.2% | 4.9 | 80.7% |
| 88 | GCRTA (Cleveland) (`gcrta`) | 921 | 9.4% | 4.5% | 4.9 | 51.8% |
| 89 | Guelph Transit (`guelph`) | 288 | 4.6% | 0.0% | 4.6 | 100.0% |
| 90 | Sun Metro (El Paso) (`sun-metro`) | 609 | 4.5% | 0.0% | 4.5 | 100.0% |
| 91 | Saskatoon Transit (`saskatoon`) | 355 | 4.4% | 0.0% | 4.4 | 100.0% |
| 92 | Fairfax Connector (`fairfax`) | 926 | 4.6% | 0.2% | 4.4 | 96.6% |
| 93 | Regional Transportation Commission of Southern Nevada (RTC) (`rtcsnv`) | 1,062 | 5.9% | 1.5% | 4.4 | 74.2% |
| 94 | Metro Transit (Minneapolis) (`metro-transit`) | 1,663 | 5.3% | 1.0% | 4.3 | 82.0% |
| 95 | GRTC Transit (Richmond, VA) (`grtc`) | 495 | 6.7% | 2.4% | 4.3 | 64.3% |
| 96 | Société de transport de Sherbrooke (`sherbrooke`) | 398 | 4.0% | 0.0% | 4.0 | 100.0% |
| 97 | BC Transit (Victoria) (`victoria`) | 977 | 5.8% | 1.8% | 4.0 | 68.8% |
| 98 | Rochester-Genesee Regional Transportation Authority (`rgrta`) | 377 | 4.0% | 0.0% | 4.0 | 100.0% |
| 99 | Alameda-Contra Costa Transit District (AC Transit) (`actransit`) | 1,146 | 10.1% | 6.2% | 3.9 | 38.9% |
| 100 | Community Transit (Everett) (`communitytransit`) | 695 | 3.9% | 0.0% | 3.9 | 100.0% |
| 101 | Cherriots (Salem, OR) (`cherriots`) | 417 | 3.9% | 0.0% | 3.9 | 100.0% |
| 102 | Lextran (Lexington, KY) (`lexington`) | 264 | 3.8% | 0.0% | 3.8 | 100.0% |
| 103 | Pierce Transit (`piercetransit`) | 837 | 3.7% | 0.0% | 3.7 | 100.0% |
| 104 | Butler County Regional Transit Authority (`butler-county-rta`) | 253 | 3.6% | 0.0% | 3.6 | 100.0% |
| 105 | RTC (Québec) (`rtc`) | 679 | 15.4% | 11.9% | 3.5 | 22.7% |
| 106 | Halifax Transit (`halifax`) | 669 | 3.5% | 0.0% | 3.5 | 100.0% |
| 107 | Visalia Transit (`visalia`) | 511 | 3.4% | 0.0% | 3.4 | 100.0% |
| 108 | LYNX (Central Florida) (`lynx`) | 1,361 | 3.3% | 0.0% | 3.3 | 100.0% |
| 109 | Palm Tran (West Palm Beach) (`palm-tran`) | 716 | 3.2% | 0.0% | 3.2 | 100.0% |
| 110 | Pinellas Suncoast Transit Authority (PSTA) (`psta`) | 792 | 3.1% | 0.0% | 3.1 | 100.0% |
| 111 | San Mateo County Transit District (samTrans) (`samtrans`) | 575 | 2.9% | 0.0% | 2.9 | 100.0% |
| 112 | Connect Transit (Bloomington-Normal) (`connect-transit`) | 142 | 2.9% | 0.0% | 2.9 | 100.0% |
| 113 | Westchester County Bee-Line System (BeeLine) (`beeline`) | 681 | 2.9% | 0.0% | 2.9 | 100.0% |
| 114 | Embark (Oklahoma City) (`embark`) | 590 | 2.8% | 0.0% | 2.8 | 100.0% |
| 115 | Nashville MTA WeGo Public Transit (`nashvillemta`) | 522 | 11.1% | 8.3% | 2.8 | 24.9% |
| 116 | Regional Transportation Commission of Washoe County (RTC Washoe) (`rtcwashoe`) | 205 | 2.5% | 0.0% | 2.5 | 100.0% |
| 117 | IndyGo (Indianapolis) (`indygo`) | 609 | 6.4% | 4.0% | 2.4 | 37.2% |
| 118 | Cincinnati Metro (SORTA) (`cincinnatimetro`) | 807 | 2.0% | 0.0% | 2.0 | 100.0% |
| 119 | Capital District Transportation Authority (`cdta`) | 758 | 1.9% | 0.0% | 1.9 | 100.0% |
| 120 | StarTran (Lincoln) (`lincoln`) | 228 | 1.9% | 0.0% | 1.9 | 100.0% |
| 121 | Tompkins Consolidated Area Transit (`tcat`) | 264 | 1.8% | 0.0% | 1.8 | 100.0% |
| 122 | Orange County Transportation Authority (OCTA) (`octa`) | 1,440 | 1.8% | 0.0% | 1.8 | 100.0% |
| 123 | Stanislaus Regional Transit Authority (The S) (`modesto`) | 582 | 1.7% | 0.0% | 1.7 | 100.0% |
| 124 | Rhode Island Public Transit Authority (RIPTA) (`ripta`) | 855 | 1.6% | 0.0% | 1.6 | 100.0% |
| 125 | NJ Transit Bus (`njt-bus`) | 6,988 | 1.6% | 0.1% | 1.5 | 93.4% |
| 126 | Metro St. Louis (`metrostlouis`) | 1,106 | 1.5% | 0.0% | 1.5 | 100.0% |
| 127 | Riverside Transit Agency (`riverside`) | 1,010 | 1.5% | 0.0% | 1.5 | 100.0% |
| 128 | CTtransit (`cttransit`) | 2,213 | 1.5% | 0.0% | 1.5 | 100.0% |
| 129 | San Joaquin RTD (`sjrtd`) | 641 | 1.4% | 0.0% | 1.4 | 100.0% |
| 130 | County Connection (CCCTA) (`countyconnection`) | 419 | 1.4% | 0.0% | 1.4 | 100.0% |
| 131 | Loudoun County Transit (`loudoun-transit`) | 733 | 1.3% | 0.0% | 1.3 | 100.0% |
| 132 | Hampton Roads Transit (`hrt`) | 1,024 | 1.2% | 0.0% | 1.2 | 100.0% |
| 133 | Summit Stage (`summit-stage`) | 207 | 1.0% | 0.0% | 1.0 | 100.0% |
| 134 | WMATA (Washington, DC) (`wmata`) | 1,830 | 10.2% | 9.3% | 0.8 | 8.3% |
| 135 | Roaring Fork Transportation Authority (RFTA) (`rfta`) | 236 | 0.8% | 0.0% | 0.8 | 100.0% |
| 136 | Prince George's County (The Bus) (`pgc-the-bus`) | 414 | 0.8% | 0.0% | 0.8 | 100.0% |
| 137 | Dallas Area Rapid Transit (DART) (`dart`) | 1,716 | 0.8% | 0.0% | 0.8 | 100.0% |
| 138 | Jacksonville Transportation Authority (JTA) (`jta`) | 834 | 0.8% | 0.0% | 0.8 | 100.0% |
| 139 | Knoxville Area Transit (`knoxville`) | 251 | 0.7% | 0.0% | 0.7 | 100.0% |
| 140 | Greater Dayton RTA (`dayton`) | 624 | 0.6% | 0.0% | 0.6 | 100.0% |
| 141 | C-TRAN (Vancouver, WA) (`ctran`) | 395 | 4.8% | 4.3% | 0.5 | 10.4% |
| 142 | GO Transit (`go`) | 3,047 | 0.0% | 0.0% | 0.0 | – |
| 143 | SMART (Detroit suburbs) (`smart`) | 1,304 | 0.0% | 0.0% | 0.0 | – |
| 144 | DART First State (Wilmington, DE) (`dart-first-state`) | 1,033 | 0.0% | 0.0% | 0.0 | – |
| 145 | Niagara Transit (`niagara`) | 1,004 | 0.0% | 0.0% | 0.0 | – |
| 146 | Suffolk County Transit (SCT) (`sct`) | 874 | 0.0% | 0.0% | 0.0 | – |
| 147 | Victor Valley Transit Authority (VVTA) (`vvta`) | 850 | 0.0% | 0.0% | 0.0 | – |
| 148 | Bustang (CDOT) (`bustang`) | 822 | 0.0% | 0.0% | 0.0 | – |
| 149 | North County Transit District (NCTD) (`nctd`) | 794 | 0.0% | 0.0% | 0.0 | – |
| 150 | Pioneer Valley Transit Authority (`pvta`) | 780 | 0.0% | 0.0% | 0.0 | – |
| 151 | Centro (Syracuse) (`centro`) | 778 | 0.0% | 0.0% | 0.0 | – |
| 152 | Monterey-Salinas Transit (MST) (`mst`) | 761 | 0.0% | 0.0% | 0.0 | – |
| 153 | MTA Long Island Rail Road (`lirr`) | 730 | 0.0% | 0.0% | 0.0 | – |
| 154 | Durham Region Transit (`drt`) | 719 | 0.0% | 0.0% | 0.0 | – |
| 155 | STL (Laval) (`stl`) | 713 | 0.0% | 0.0% | 0.0 | – |
| 156 | NFTA (Buffalo) (`nfta`) | 711 | 0.0% | 0.0% | 0.0 | – |
| 157 | RTL (Longueuil) (`rtl`) | 706 | 0.0% | 0.0% | 0.0 | – |
| 158 | Memphis Area Transit Authority (`mata`) | 686 | 0.0% | 0.0% | 0.0 | – |
| 159 | Foothill Transit (`foothill`) | 685 | 0.0% | 0.0% | 0.0 | – |
| 160 | Hillsborough Area Regional Transit (HART) (`hart`) | 652 | 0.0% | 0.0% | 0.0 | – |
| 161 | Metra (Chicago) (`metra`) | 640 | 0.0% | 0.0% | 0.0 | – |
| 162 | Metro-North Railroad (MNR) (`mnr`) | 614 | 0.0% | 0.0% | 0.0 | – |
| 163 | Santa Cruz METRO (`santa-cruz-metro`) | 605 | 0.0% | 0.0% | 0.0 | – |
| 164 | San Luis Obispo Regional Transit Authority (SLORTA) (`slorta`) | 602 | 0.0% | 0.0% | 0.0 | – |
| 165 | Lehigh and Northampton Transportation Authority (LANTA) (`lanta`) | 599 | 0.0% | 0.0% | 0.0 | – |
| 166 | Nassau Inter-County Express (NICE Bus) (`nice`) | 555 | 0.0% | 0.0% | 0.0 | – |
| 167 | LeeTran (Fort Myers) (`leetran`) | 537 | 0.0% | 0.0% | 0.0 | – |
| 168 | Metrolink (`metrolink`) | 533 | 0.0% | 0.0% | 0.0 | – |
| 169 | Santa Maria Area Transit (`smat`) | 526 | 0.0% | 0.0% | 0.0 | – |
| 170 | Transit Authority of River City (Louisville) (`tarc`) | 522 | 0.0% | 0.0% | 0.0 | – |
| 171 | Sonoma County Transit (SCT) (`sonoma-county`) | 522 | 0.0% | 0.0% | 0.0 | – |
| 172 | New Orleans Regional Transit Authority (NORTA) (`norta`) | 521 | 0.0% | 0.0% | 0.0 | – |
| 173 | Trinity Metro (Fort Worth) (`trinitymetro`) | 518 | 1.7% | 1.7% | 0.0 | 0.0% |
| 174 | BC Transit (Fraser Valley) (`bc-fraser-valley`) | 514 | 0.0% | 0.0% | 0.0 | – |
| 175 | Charleston Area Regional Transportation Authority (CARTA) (`carta`) | 502 | 0.0% | 0.0% | 0.0 | – |
| 176 | SporTran (Shreveport) (`sportran`) | 477 | 0.0% | 0.0% | 0.0 | – |
| 177 | The COMET (Columbia, SC) (`comet`) | 476 | 0.0% | 0.0% | 0.0 | – |
| 178 | Valley Metro (Roanoke, VA) (`valley-metro-roanoke`) | 472 | 0.0% | 0.0% | 0.0 | – |
| 179 | Chemung County C-TRAN (`chemung-county`) | 463 | 0.0% | 0.0% | 0.0 | – |
| 180 | Tulsa Transit (MTTA) (`tulsa-transit`) | 459 | 0.0% | 0.0% | 0.0 | – |
| 181 | Erie Metropolitan Transit Authority (`emta`) | 456 | 0.0% | 0.0% | 0.0 | – |
| 182 | Space Coast Area Transit (`space-coast`) | 454 | 0.0% | 0.0% | 0.0 | – |
| 183 | Cascades East Transit (Bend, OR) (`cascades-east`) | 454 | 0.0% | 0.0% | 0.0 | – |
| 184 | Westmoreland Transit (`westmoreland`) | 450 | 0.0% | 0.0% | 0.0 | – |
| 185 | Coast RTA (`coast-rta`) | 447 | 0.0% | 0.0% | 0.0 | – |
| 186 | Clallam Transit System (`clallamtransit`) | 447 | 0.0% | 0.0% | 0.0 | – |
| 187 | SunLine Transit Agency (Coachella Valley) (`sunline`) | 439 | 0.0% | 0.0% | 0.0 | – |
| 188 | Lane Transit District (`eugene-ltd`) | 438 | 0.0% | 0.0% | 0.0 | – |
| 189 | Votran (Volusia County) (`votran`) | 426 | 0.0% | 0.0% | 0.0 | – |
| 190 | Indian River Transit (`indian-river`) | 424 | 0.0% | 0.0% | 0.0 | – |
| 191 | BC Transit (Nanaimo) (`nanaimo`) | 422 | 0.0% | 0.0% | 0.0 | – |
| 192 | Rockford Mass Transit District (`rockford`) | 417 | 0.5% | 0.5% | 0.0 | 0.0% |
| 193 | Montgomery Transit (The M) (`montgomery-transit`) | 417 | 0.0% | 0.0% | 0.0 | – |
| 194 | Kern Transit (`kern-transit`) | 413 | 0.0% | 0.0% | 0.0 | – |
| 195 | The Kauai Bus (`kaua-i-county`) | 412 | 0.0% | 0.0% | 0.0 | – |
| 196 | Intercity Transit (Olympia) (`intercitytransit`) | 406 | 0.0% | 0.0% | 0.0 | – |
| 197 | Whatcom Transportation Authority (`whatcomtransit`) | 405 | 0.0% | 0.0% | 0.0 | – |
| 198 | Mass Transportation Authority (Flint) (`mta-flint`) | 400 | 0.0% | 0.0% | 0.0 | – |
| 199 | Bustang Outrider (`bustang-outrider`) | 400 | 0.0% | 0.0% | 0.0 | – |
| 200 | ABQ RIDE (Albuquerque) (`abqride`) | 400 | 0.0% | 0.0% | 0.0 | – |
| 201 | Minnesota Valley Transit Authority (MVTA) (`mvta`) | 397 | 0.0% | 0.0% | 0.0 | – |
| 202 | B-Line (Corpus Christi RTA) (`b-line`) | 391 | 0.0% | 0.0% | 0.0 | – |
| 203 | Skagit Transit (`skagittransit`) | 377 | 0.0% | 0.0% | 0.0 | – |
| 204 | Kitsap Transit (`kitsaptransit`) | 376 | 0.0% | 0.0% | 0.0 | – |
| 205 | Dutchess County Public Transit (`dutchess`) | 375 | 0.0% | 0.0% | 0.0 | – |
| 206 | Madison Metro Transit (`madison-metro`) | 374 | 0.0% | 0.0% | 0.0 | – |
| 207 | ECAT (Escambia County) (`ecat`) | 374 | 0.0% | 0.0% | 0.0 | – |
| 208 | Merced County Transit (The Bus) (`merced`) | 371 | 0.0% | 0.0% | 0.0 | – |
| 209 | Tillamook County Transportation District (`tillamook`) | 370 | 0.0% | 0.0% | 0.0 | – |
| 210 | Stark Area Regional Transit Authority (`sarta`) | 369 | 0.0% | 0.0% | 0.0 | – |
| 211 | Capital Area Transit (Harrisburg) (`cat-harrisburg`) | 365 | 0.0% | 0.0% | 0.0 | – |
| 212 | Capital Area Transportation Authority (`cata-lansing`) | 364 | 0.0% | 0.0% | 0.0 | – |
| 213 | Island Transit (Whidbey Island) (`islandtransit`) | 363 | 0.0% | 0.0% | 0.0 | – |
| 214 | Ventura County Transportation Commission (VCTC Intercity) (`vctc`) | 360 | 0.0% | 0.0% | 0.0 | – |
| 215 | Collier Area Transit (Naples) (`collier`) | 357 | 0.0% | 0.0% | 0.0 | – |
| 216 | El Metro (Laredo) (`laredo`) | 356 | 0.0% | 0.0% | 0.0 | – |
| 217 | OmniRide (PRTC) (`omniride`) | 352 | 0.0% | 0.0% | 0.0 | – |
| 218 | Basin Transit (`basin-transit`) | 348 | 0.0% | 0.0% | 0.0 | – |
| 219 | Golden Empire Transit District (GET) (`get`) | 346 | 0.0% | 0.0% | 0.0 | – |
| 220 | Red Rose Transit Authority (Lancaster, PA) (`lancaster`) | 343 | 0.0% | 0.0% | 0.0 | – |
| 221 | TARTA (Toledo) (`tarta`) | 338 | 0.0% | 0.0% | 0.0 | – |
| 222 | Maui County Transit (`maui-county`) | 334 | 0.0% | 0.0% | 0.0 | – |
| 223 | New Castle Area Transit Authority (`new-castle`) | 334 | 0.0% | 0.0% | 0.0 | – |
| 224 | Mountain Line Transit Authority (Morgantown) (`mountain-line`) | 330 | 0.0% | 0.0% | 0.0 | – |
| 225 | Marin Transit (`marintransit`) | 329 | 0.0% | 0.0% | 0.0 | – |
| 226 | Capital Area Transit System (Baton Rouge) (`cats-baton`) | 328 | 0.0% | 0.0% | 0.0 | – |
| 227 | Worcester Regional Transit Authority (`wrta`) | 326 | 0.0% | 0.0% | 0.0 | – |
| 228 | Regina Transit (`regina`) | 320 | 0.0% | 0.0% | 0.0 | – |
| 229 | Tulare County Area Transit (TCAT) (`tulare-county-transit`) | 320 | 0.0% | 0.0% | 0.0 | – |
| 230 | exo (Sud-Ouest) (`exo-sudouest`) | 319 | 0.0% | 0.0% | 0.0 | – |
| 231 | Lafayette Transit System (`lafayette-la`) | 317 | 0.0% | 0.0% | 0.0 | – |
| 232 | MAX Transit (Birmingham) (`max-transit`) | 317 | 0.0% | 0.0% | 0.0 | – |
| 233 | Kingston Transit (`kingston`) | 313 | 0.0% | 0.0% | 0.0 | – |
| 234 | GoTriangle (Raleigh-Durham) (`gotriangle`) | 312 | 0.0% | 0.0% | 0.0 | – |
| 235 | Yolo County Transportation District (Yolobus) (`yolobus`) | 311 | 0.0% | 0.0% | 0.0 | – |
| 236 | Santa Clarita Transit (`santaclarita`) | 310 | 0.0% | 0.0% | 0.0 | – |
| 237 | Antelope Valley Transit Authority (AVTA) (`avta`) | 302 | 0.0% | 0.0% | 0.0 | – |
| 238 | Chatham Area Transit (CAT) (`cat-savannah`) | 301 | 0.0% | 0.0% | 0.0 | – |
| 239 | Huntsville Shuttle (`huntsville`) | 295 | 0.0% | 0.0% | 0.0 | – |
| 240 | Western Reserve Transit Authority (Youngstown) (`youngstown-wrta`) | 294 | 0.0% | 0.0% | 0.0 | – |
| 241 | County of Lackawanna Transit System (COLTS) (`colts`) | 292 | 0.0% | 0.0% | 0.0 | – |
| 242 | SolTrans (Vallejo) (`soltrans`) | 290 | 0.0% | 0.0% | 0.0 | – |
| 243 | VINE Transit (Napa) (`vine`) | 289 | 0.0% | 0.0% | 0.0 | – |
| 244 | BC Transit (Cowichan Valley) (`cowichan`) | 285 | 0.0% | 0.0% | 0.0 | – |
| 245 | Imperial Valley Transit (`imperial-valley`) | 285 | 0.0% | 0.0% | 0.0 | – |
| 246 | SMTD (Springfield IL) (`springfield-il`) | 284 | 0.0% | 0.0% | 0.0 | – |
| 247 | Blue Water Area Transit (Port Huron) (`port-huron`) | 283 | 0.0% | 0.0% | 0.0 | – |
| 248 | Wichita Transit (`wichita`) | 280 | 0.0% | 0.0% | 0.0 | – |
| 249 | Fredericton Transit (`fredericton`) | 279 | 0.0% | 0.0% | 0.0 | – |
| 250 | GoDurham (`godurham`) | 279 | 0.0% | 0.0% | 0.0 | – |
| 251 | Luzerne County Transportation Authority (`lcta`) | 277 | 0.0% | 0.0% | 0.0 | – |
| 252 | CityLink (Peoria, IL) (`citylink-peoria`) | 273 | 0.0% | 0.0% | 0.0 | – |
| 253 | Codiac Transpo (Moncton) (`codiac`) | 271 | 0.0% | 0.0% | 0.0 | – |
| 254 | Gwinnett County Transit (`gwinnett-transit`) | 270 | 0.0% | 0.0% | 0.0 | – |
| 255 | Barrie Transit (`barrie`) | 270 | 0.0% | 0.0% | 0.0 | – |
| 256 | Columbia Area Transit (`columbia-area-transit`) | 267 | 0.0% | 0.0% | 0.0 | – |
| 257 | Sarnia Transit (`sarnia`) | 266 | 0.0% | 0.0% | 0.0 | – |
| 258 | City Utilities Transit (Springfield) (`springfield-mo`) | 265 | 0.0% | 0.0% | 0.0 | – |
| 259 | Grand Valley Transit (`grand-junction`) | 261 | 0.0% | 0.0% | 0.0 | – |
| 260 | CobbLinc (Marietta, GA) (`cobblinc`) | 260 | 0.0% | 0.0% | 0.0 | – |
| 261 | Metro McAllen (`mcallen`) | 260 | 0.0% | 0.0% | 0.0 | – |
| 262 | RTS (Gainesville) (`rts`) | 260 | 0.0% | 0.0% | 0.0 | – |
| 263 | Redding Area Bus Authority (`raba`) | 258 | 0.0% | 0.0% | 0.0 | – |
| 264 | Gold Coast Transit District (Oxnard) (`gold-coast`) | 257 | 0.0% | 0.0% | 0.0 | – |
| 265 | Bay Area Transportation Authority (Traverse City, MI) (`bata`) | 254 | 0.0% | 0.0% | 0.0 | – |
| 266 | Winston-Salem Transit Authority (WSTA) (`winston-salem`) | 254 | 0.0% | 0.0% | 0.0 | – |
| 267 | Simcoe County LINX (`simcoe`) | 253 | 0.0% | 0.0% | 0.0 | – |
| 268 | Amarillo City Transit (`amarillo`) | 252 | 0.0% | 0.0% | 0.0 | – |
| 269 | Brazos Transit District (`brazos`) | 250 | 0.0% | 0.0% | 0.0 | – |
| 270 | Bay Metro (Bay City) (`bay-metro`) | 250 | 0.0% | 0.0% | 0.0 | – |
| 271 | Waco Transit System (`waco`) | 244 | 0.0% | 0.0% | 0.0 | – |
| 272 | Greater Bridgeport Transit (`bridgeport-gbt`) | 243 | 0.0% | 0.0% | 0.0 | – |
| 273 | BC Transit (Comox Valley) (`comox-valley`) | 242 | 0.0% | 0.0% | 0.0 | – |
| 274 | BC Ferries (`bc-ferries`) | 238 | 0.0% | 0.0% | 0.0 | – |
| 275 | Mid Mon Valley Transit (`mmvta`) | 235 | 0.0% | 0.0% | 0.0 | – |
| 276 | Citilink (Fort Wayne, IN) (`citilink-fw`) | 235 | 0.0% | 0.0% | 0.0 | – |
| 277 | Greater Portland Metro (`portlandme`) | 232 | 0.0% | 0.0% | 0.0 | – |
| 278 | BARTA (Reading) (`barta`) | 231 | 0.0% | 0.0% | 0.0 | – |
| 279 | Yamhill County Transit Area (`yamhill`) | 229 | 0.0% | 0.0% | 0.0 | – |
| 280 | Kalamazoo Metro Transit (`kalamazoo`) | 223 | 0.0% | 0.0% | 0.0 | – |
| 281 | Broome County Transit (`broome`) | 220 | 0.0% | 0.0% | 0.0 | – |
| 282 | Santa Barbara Metropolitan Transit District (MTD) (`sbmtd`) | 220 | 0.0% | 0.0% | 0.0 | – |
| 283 | Metrobus (St. John's) (`metrobus`) | 219 | 0.0% | 0.0% | 0.0 | – |
| 284 | Decatur Public Transit System (`decatur`) | 217 | 0.0% | 0.0% | 0.0 | – |
| 285 | Transit Authority of Northern Kentucky (TANK) (`tank`) | 216 | 3.9% | 3.9% | 0.0 | 0.0% |
| 286 | South Bend Transpo (`south-bend`) | 216 | 0.0% | 0.0% | 0.0 | – |
| 287 | Rock Region Metro (Little Rock) (`rockregion`) | 214 | 0.0% | 0.0% | 0.0 | – |
| 288 | Butler Transit Authority (`butler-pa`) | 214 | 0.0% | 0.0% | 0.0 | – |
| 289 | Kings Area Rural Transit (`kart`) | 214 | 0.0% | 0.0% | 0.0 | – |
| 290 | Timmins Transit (`timmins`) | 214 | 0.0% | 0.0% | 0.0 | – |
| 291 | Fayetteville Area System of Transit (`fast-nc`) | 212 | 0.0% | 0.0% | 0.0 | – |
| 292 | Laketran (Lake County, OH) (`laketran`) | 212 | 0.0% | 0.0% | 0.0 | – |
| 293 | Blacksburg Transit (`blacksburg`) | 209 | 0.0% | 0.0% | 0.0 | – |
| 294 | Torrance Transit (`torrance-transit`) | 209 | 0.0% | 0.0% | 0.0 | – |
| 295 | Transport of Rockland (TOR) (`tor`) | 207 | 0.0% | 0.0% | 0.0 | – |
| 296 | Santa Rosa CityBus (`santarosa`) | 200 | 0.0% | 0.0% | 0.0 | – |
| 297 | Ride CK (`chatham-kent`) | 198 | 0.0% | 0.0% | 0.0 | – |
| 298 | Asheville Rides Transit (`asheville`) | 198 | 0.0% | 0.0% | 0.0 | – |
| 299 | Duluth Transit Authority (`duluth-transit`) | 197 | 0.0% | 0.0% | 0.0 | – |
| 300 | Des Moines Area Regional Transit Authority (DART) (`des-moines`) | 195 | 0.0% | 0.0% | 0.0 | – |
| 301 | CamTran (`camtran`) | 195 | 0.0% | 0.0% | 0.0 | – |
| 302 | Richland County Transit (`richland-county-oh`) | 194 | 0.0% | 0.0% | 0.0 | – |
| 303 | Tri Delta Transit (Antioch) (`tridelta`) | 193 | 0.0% | 0.0% | 0.0 | – |
| 304 | METRA (`muscogee-county`) | 192 | 0.0% | 0.0% | 0.0 | – |
| 305 | Core Transit (`eco-transit`) | 192 | 0.0% | 0.0% | 0.0 | – |
| 306 | Athens Public Transit (`athens-oh`) | 191 | 0.0% | 0.0% | 0.0 | – |
| 307 | Beloit Transit System (`rock-county`) | 187 | 0.0% | 0.0% | 0.0 | – |
| 308 | BC Transit (South Okanagan-Similkameen) (`south-okanagan`) | 187 | 0.0% | 0.0% | 0.0 | – |
| 309 | Roseville Transit (`roseville`) | 186 | 0.0% | 0.0% | 0.0 | – |
| 310 | Thunder Bay Transit (`thunder-bay`) | 186 | 0.0% | 0.0% | 0.0 | – |
| 311 | Yakima Transit (`yakima`) | 185 | 0.0% | 0.0% | 0.0 | – |
| 312 | RiverCities Transit (`rivercities`) | 185 | 0.0% | 0.0% | 0.0 | – |
| 313 | Athens Clarke County Transit (`athens-acc`) | 183 | 0.0% | 0.0% | 0.0 | – |
| 314 | Radford Transit (`radford`) | 183 | 0.0% | 0.0% | 0.0 | – |
| 315 | Washington State Ferries (`wsf`) | 181 | 0.0% | 0.0% | 0.0 | – |
| 316 | MATBUS (Fargo, ND) (`matbus`) | 180 | 0.0% | 0.0% | 0.0 | – |
| 317 | Humboldt Transit Authority (`humboldt`) | 180 | 0.0% | 0.0% | 0.0 | – |
| 318 | NYC Ferry (`nyc-ferry`) | 180 | 0.0% | 0.0% | 0.0 | – |
| 319 | BC Transit (Kamloops) (`kamloops`) | 180 | 0.0% | 0.0% | 0.0 | – |
| 320 | Cities Area Transit (Grand Forks) (`grand-forks`) | 179 | 0.0% | 0.0% | 0.0 | – |
| 321 | North Bay Transit (`north-bay`) | 176 | 0.0% | 0.0% | 0.0 | – |
| 322 | Williamsburg Area Transit Authority (`wata`) | 173 | 0.0% | 0.0% | 0.0 | – |
| 323 | Concho Valley Transit (San Angelo) (`san-angelo`) | 172 | 0.0% | 0.0% | 0.0 | – |
| 324 | Sunshine Bus Company (`sunshine-bus`) | 172 | 0.0% | 0.0% | 0.0 | – |
| 325 | Brantford Transit (`brantford`) | 169 | 0.0% | 0.0% | 0.0 | – |
| 326 | Area Transportation Authority (ATA) (`ata`) | 167 | 0.0% | 0.0% | 0.0 | – |
| 327 | GreenLink (Greenville, SC) (`greenlink`) | 166 | 0.0% | 0.0% | 0.0 | – |
| 328 | Lawrence Transit / KU on Wheels (`lawrence-ku`) | 164 | 0.0% | 0.0% | 0.0 | – |
| 329 | Montebello Bus Lines (`montebello`) | 163 | 0.0% | 0.0% | 0.0 | – |
| 330 | Unitrans (Davis) (`unitrans`) | 160 | 0.0% | 0.0% | 0.0 | – |
| 331 | MET Transit (Billings) (`billings`) | 160 | 0.0% | 0.0% | 0.0 | – |
| 332 | Tar River Transit (`nash-county`) | 158 | 0.0% | 0.0% | 0.0 | – |
| 333 | Rider Transit (`concord-kannapolis`) | 157 | 0.0% | 0.0% | 0.0 | – |
| 334 | CATA (State College) (`cata-state-college`) | 157 | 0.0% | 0.0% | 0.0 | – |
| 335 | EZ Rider (Midland/Odessa) (`ez-rider`) | 157 | 0.0% | 0.0% | 0.0 | – |
| 336 | Caltrain (`caltrain`) | 156 | 0.0% | 0.0% | 0.0 | – |
| 337 | Greenway Public Transportation (`greenway`) | 156 | 0.0% | 0.0% | 0.0 | – |
| 338 | Ryde Racine (`racine`) | 156 | 0.0% | 0.0% | 0.0 | – |
| 339 | Valley Transit (Appleton/Fox Cities) (`appleton`) | 156 | 0.0% | 0.0% | 0.0 | – |
| 340 | Whitehorse Transit (`whitehorse`) | 154 | 0.0% | 0.0% | 0.0 | – |
| 341 | The Lift (`winter-park`) | 152 | 0.0% | 0.0% | 0.0 | – |
| 342 | CityBus of Greater Lafayette (`citybus-lafayette`) | 152 | 0.0% | 0.0% | 0.0 | – |
| 343 | City of Longview Transit (`longview`) | 151 | 0.0% | 0.0% | 0.0 | – |
| 344 | City of Jackson (JTRAN) (`jackson-ms`) | 151 | 0.0% | 0.0% | 0.0 | – |
| 345 | Texarkana T-Line (`texarkana`) | 150 | 0.0% | 0.0% | 0.0 | – |
| 346 | Wave Transit (Mobile) (`wave-mobile`) | 149 | 0.0% | 0.0% | 0.0 | – |
| 347 | Red Deer Transit (`red-deer`) | 149 | 0.0% | 0.0% | 0.0 | – |
| 348 | Citibus (Lubbock) (`citibus`) | 149 | 0.0% | 0.0% | 0.0 | – |
| 349 | Denton County Transportation Authority (DCTA) (`dcta`) | 148 | 0.0% | 0.0% | 0.0 | – |
| 350 | Corvallis Transit System (`corvallis`) | 148 | 0.0% | 0.0% | 0.0 | – |
| 351 | Marble Valley Transit (Rutland) (`marble-valley`) | 148 | 0.0% | 0.0% | 0.0 | – |
| 352 | Sioux City Transit (`sioux-city`) | 148 | 0.0% | 0.0% | 0.0 | – |
| 353 | Trinity Transit (`trinity`) | 147 | 0.0% | 0.0% | 0.0 | – |
| 354 | Kenosha Area Transit (`kenosha`) | 146 | 0.0% | 0.0% | 0.0 | – |
| 355 | Lethbridge Transit (`lethbridge`) | 146 | 0.0% | 0.0% | 0.0 | – |
| 356 | Johnson City (`washington-county`) | 146 | 0.0% | 0.0% | 0.0 | – |
| 357 | IndiGO (`indigo`) | 145 | 0.0% | 0.0% | 0.0 | – |
| 358 | Topeka Metro (`topeka`) | 145 | 0.0% | 0.0% | 0.0 | – |
| 359 | Livermore Amador Valley Transit Authority (`lavta`) | 142 | 0.0% | 0.0% | 0.0 | – |
| 360 | Coast Transit Authority (`coast-transit-ms`) | 142 | 0.0% | 0.0% | 0.0 | – |
| 361 | Putnam Area Rapid Transit (PART) (`part`) | 141 | 0.0% | 0.0% | 0.0 | – |
| 362 | Milton Transit (`milton`) | 141 | 0.0% | 0.0% | 0.0 | – |
| 363 | Pocatello Regional Transit (`pocatello`) | 141 | 0.0% | 0.0% | 0.0 | – |
| 364 | Thousand Oaks Transit (`thousand-oaks`) | 140 | 0.0% | 0.0% | 0.0 | – |
| 365 | DASH (Alexandria) (`dash`) | 139 | 0.0% | 0.0% | 0.0 | – |
| 366 | WestCAT (Pinole) (`westcat`) | 139 | 0.0% | 0.0% | 0.0 | – |
| 367 | Sandusky Transit System (`sandusky`) | 138 | 0.0% | 0.0% | 0.0 | – |
| 368 | Martin County Public Transit (`martin-county`) | 138 | 0.0% | 0.0% | 0.0 | – |
| 369 | City of San Luis Obispo Transit (`slotransit`) | 137 | 0.0% | 0.0% | 0.0 | – |
| 370 | Sunset Empire Transportation District (`setd`) | 137 | 0.0% | 0.0% | 0.0 | – |
| 371 | Pasadena Transit (`pasadenatransit`) | 135 | 0.0% | 0.0% | 0.0 | – |
| 372 | Greater Glens Falls Transit (`glensfallstransit`) | 134 | 0.0% | 0.0% | 0.0 | – |
| 373 | Mountain Transit (Big Bear Lake) (`mountain-transit-ca`) | 133 | 0.0% | 0.0% | 0.0 | – |
| 374 | Chattanooga Area Regional Transportation Authority (`carta-chattanooga`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 375 | Wave Transit (Wilmington) (`wilmington-nc`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 376 | Davenport CitiBus (`davenport`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 377 | Sandy Area Metro (SAM) (`sam`) | 132 | 0.0% | 0.0% | 0.0 | – |
| 378 | Pueblo Transit (`pueblo-transit`) | 130 | 0.0% | 0.0% | 0.0 | – |
| 379 | Saint-Jean-sur-Richelieu (`sjsr`) | 130 | 0.0% | 0.0% | 0.0 | – |
| 380 | Golden Gate Transit (`goldengate`) | 130 | 0.0% | 0.0% | 0.0 | – |
| 381 | GTrans (Gardena Municipal Bus Lines) (`gtrans`) | 128 | 0.0% | 0.0% | 0.0 | – |
| 382 | Bloomington Transit (`bloomington`) | 128 | 0.0% | 0.0% | 0.0 | – |
| 383 | SunTran (St. George) (`st-george`) | 127 | 0.0% | 0.0% | 0.0 | – |
| 384 | Norwalk Transit System (`norwalktransit`) | 126 | 0.0% | 0.0% | 0.0 | – |
| 385 | Augusta Transit (`augusta`) | 124 | 0.0% | 0.0% | 0.0 | – |
| 386 | COAST (Seacoast NH) (`coast-nh`) | 123 | 0.0% | 0.0% | 0.0 | – |
| 387 | MARC Train (MTA Maryland) (`marc`) | 123 | 0.0% | 0.0% | 0.0 | – |
| 388 | Jacksonville Transit (`jacksonville-nc`) | 121 | 0.0% | 0.0% | 0.0 | – |
| 389 | Beaumont Transit (`beaumont-ca`) | 121 | 0.0% | 0.0% | 0.0 | – |
| 390 | Mendocino Transit Authority (`mendocino`) | 121 | 0.0% | 0.0% | 0.0 | – |
| 391 | All Points Transit (Montrose) (`all-points-transit`) | 120 | 0.0% | 0.0% | 0.0 | – |
| 392 | Ride Connection (GroveLink) (`grovelink`) | 119 | 0.0% | 0.0% | 0.0 | – |
| 393 | Charlottesville Area Transit (CAT) (`albemarle-county`) | 119 | 0.0% | 0.0% | 0.0 | – |
| 394 | Bangor Community Connector (`bangor`) | 118 | 0.0% | 0.0% | 0.0 | – |
| 395 | Hub City Transit (`hub-city-transit`) | 118 | 0.0% | 0.0% | 0.0 | – |
| 396 | Lassen Rural Bus (LRB) (`lassen`) | 117 | 0.0% | 0.0% | 0.0 | – |
| 397 | Medicine Hat Transit (`medicine-hat`) | 117 | 0.0% | 0.0% | 0.0 | – |
| 398 | Green Bay Metro (`green-bay`) | 116 | 0.0% | 0.0% | 0.0 | – |
| 399 | Cape Ann Transportation Authority (CATA) (`essex-county`) | 116 | 0.0% | 0.0% | 0.0 | – |
| 400 | Beaver County Transit Authority (`beaver-county`) | 116 | 0.0% | 0.0% | 0.0 | – |
| 401 | METS (Evansville) (`evansville`) | 115 | 0.0% | 0.0% | 0.0 | – |
| 402 | Mountain Line (Flagstaff) (`mountainline`) | 115 | 0.0% | 0.0% | 0.0 | – |
| 403 | Everett Transit (`everetttransit`) | 113 | 0.0% | 0.0% | 0.0 | – |
| 404 | South Metro Area Regional Transit (SMART) (`smart-or`) | 113 | 0.0% | 0.0% | 0.0 | – |
| 405 | Ville de Saint-Hyacinthe (`saint-hyacinthe`) | 110 | 0.0% | 0.0% | 0.0 | – |
| 406 | Janesville Transit System (`janesville`) | 110 | 0.0% | 0.0% | 0.0 | – |
| 407 | exo (La Presqu'île) (`exo-presquile`) | 108 | 0.0% | 0.0% | 0.0 | – |
| 408 | Mount Adams Transportation Service (`mats`) | 107 | 0.0% | 0.0% | 0.0 | – |
| 409 | Redwood Coast Transit (RCT) (`rct`) | 106 | 0.0% | 0.0% | 0.0 | – |
| 410 | Culver City Bus (`culvercitybus`) | 104 | 0.0% | 0.0% | 0.0 | – |
| 411 | Lake Charles Transit (`lake-charles`) | 104 | 0.0% | 0.0% | 0.0 | – |
| 412 | exo (Trains) (`exo`) | 104 | 0.0% | 0.0% | 0.0 | – |
| 413 | Shoreline Metro (`sheboygan-county`) | 101 | 0.0% | 0.0% | 0.0 | – |
| 414 | Rapid Transit System (Rapid City, SD) (`rapid-city`) | 101 | 0.0% | 0.0% | 0.0 | – |
| 415 | Mountain Line (Missoula) (`missoula`) | 100 | 0.0% | 0.0% | 0.0 | – |
| 416 | San Francisco Bay Area Water Emergency Transportation Authority (WETA) (`weta`) | 98 | 0.0% | 0.0% | 0.0 | – |
| 417 | SunRail (Orlando) (`sunrail`) | 98 | 0.0% | 0.0% | 0.0 | – |
| 418 | The Jule (Dubuque) (`dubuque`) | 96 | 0.0% | 0.0% | 0.0 | – |
| 419 | Jefferson City Transit (JeffTran) (`jefftran`) | 96 | 0.0% | 0.0% | 0.0 | – |
| 420 | Key West Transit (`key-west-transit`) | 95 | 0.0% | 0.0% | 0.0 | – |
| 421 | Basin Transit Service (BTS) (`bts-or`) | 94 | 0.0% | 0.0% | 0.0 | – |
| 422 | CCTA / Green Mountain Transit (Burlington, VT) (`ccta`) | 93 | 0.0% | 0.0% | 0.0 | – |
| 423 | Muskegon Area Transit System (`muskegon`) | 92 | 0.0% | 0.0% | 0.0 | – |
| 424 | Sioux Area Metro (SAM) (`sioux-falls`) | 92 | 0.0% | 0.0% | 0.0 | – |
| 425 | Palos Verdes Peninsula Transit Authority (PVPTA) (`pvpta`) | 90 | 0.0% | 0.0% | 0.0 | – |
| 426 | Hudson Link (`hudsonlink`) | 90 | 0.0% | 0.0% | 0.0 | – |
| 427 | CUE Bus (Fairfax) (`cue-bus`) | 89 | 0.0% | 0.0% | 0.0 | – |
| 428 | Regional Municipality of Wood Buffalo Transit (`fort-mcmurray`) | 89 | 0.0% | 0.0% | 0.0 | – |
| 429 | exo (Vallée du Richelieu) (`exo-vallee-richelieu`) | 88 | 0.0% | 0.0% | 0.0 | – |
| 430 | Bettendorf Transit (`bettendorf`) | 87 | 0.0% | 0.0% | 0.0 | – |
| 431 | City of Hobbs Transit (`hobbs`) | 86 | 0.0% | 0.0% | 0.0 | – |
| 432 | Valley Express (`valley-express`) | 85 | 0.0% | 0.0% | 0.0 | – |
| 433 | Freedom Transit (`freedom-transit`) | 84 | 0.0% | 0.0% | 0.0 | – |
| 434 | Belleville Transit (`belleville`) | 84 | 0.0% | 0.0% | 0.0 | – |
| 435 | Capital Transit (Juneau) (`juneau`) | 83 | 0.0% | 0.0% | 0.0 | – |
| 436 | Brandon Transit (`brandon`) | 83 | 0.0% | 0.0% | 0.0 | – |
| 437 | Metro Ride (`marathon-county`) | 82 | 0.0% | 0.0% | 0.0 | – |
| 438 | Bis-Man Transit (Bismarck-Mandan) (`bis-man`) | 82 | 0.0% | 0.0% | 0.0 | – |
| 439 | Stratford Transit (`stratford`) | 81 | 0.0% | 0.0% | 0.0 | – |
| 440 | L'Inter des Laurentides (`linter`) | 81 | 0.0% | 0.0% | 0.0 | – |
| 441 | Broward County Transit (`broward-transit`) | 81 | 0.0% | 0.0% | 0.0 | – |
| 442 | Cornwall Transit (`cornwall`) | 78 | 0.0% | 0.0% | 0.0 | – |
| 443 | Sonoma-Marin Area Rail Transit (SMART) (`smart-ca`) | 78 | 0.0% | 0.0% | 0.0 | – |
| 444 | Petaluma Transit (`petaluma`) | 78 | 0.0% | 0.0% | 0.0 | – |
| 445 | RoadRUNNER Transit (Las Cruces) (`las-cruces`) | 77 | 0.0% | 0.0% | 0.0 | – |
| 446 | BC Transit (Whistler) (`whistler`) | 77 | 0.0% | 0.0% | 0.0 | – |
| 447 | Waukesha Metro Transit (`waukesha-metro`) | 77 | 0.0% | 0.0% | 0.0 | – |
| 448 | Prince Albert Transit (`prince-albert`) | 75 | 0.0% | 0.0% | 0.0 | – |
| 449 | Greeley-Evans Transit (GET) (`greeley`) | 74 | 0.0% | 0.0% | 0.0 | – |
| 450 | Rogue Valley Transportation District (RVTD) (`rvtd`) | 72 | 0.0% | 0.0% | 0.0 | – |
| 451 | Fayette Area Coordinated Transportation (`fact`) | 72 | 0.0% | 0.0% | 0.0 | – |
| 452 | Annapolis Transit (`annapolis`) | 70 | 0.0% | 0.0% | 0.0 | – |
| 453 | Streamline (Bozeman) (`streamline`) | 69 | 0.0% | 0.0% | 0.0 | – |
| 454 | Kootenai County Citylink North (`citylink-north`) | 69 | 0.0% | 0.0% | 0.0 | – |
| 455 | Casper Area Transit (`casper`) | 68 | 0.0% | 0.0% | 0.0 | – |
| 456 | BC Transit (Campbell River) (`campbell-river`) | 68 | 0.0% | 0.0% | 0.0 | – |
| 457 | Atomic City Transit (`los-alamos-county`) | 67 | 0.0% | 0.0% | 0.0 | – |
| 458 | Clear Creek County Transit (RoundAbout) (`roundabout`) | 61 | 0.0% | 0.0% | 0.0 | – |
| 459 | Durango Transit (`durango-transit`) | 61 | 0.0% | 0.0% | 0.0 | – |
| 460 | City of Pullman (`whitman-county`) | 60 | 0.0% | 0.0% | 0.0 | – |
| 461 | Arvin Transit (`arvin`) | 59 | 0.0% | 0.0% | 0.0 | – |
| 462 | St. Thomas Transit (`st-thomas`) | 58 | 0.0% | 0.0% | 0.0 | – |
| 463 | Union City Transit (`unioncity`) | 57 | 0.0% | 0.0% | 0.0 | – |
| 464 | Mason City Public Transit (`mason-city`) | 56 | 0.0% | 0.0% | 0.0 | – |
| 465 | Jefferson Transit (`jeffersontransit`) | 55 | 0.0% | 0.0% | 0.0 | – |
| 466 | Breckenridge Free Ride (`breck-free-ride`) | 54 | 0.0% | 0.0% | 0.0 | – |
| 467 | BC Transit (Squamish) (`squamish`) | 54 | 0.0% | 0.0% | 0.0 | – |
| 468 | Moose Jaw Transit (`moose-jaw`) | 53 | 0.0% | 0.0% | 0.0 | – |
| 469 | Orillia Transit (`orillia`) | 53 | 0.0% | 0.0% | 0.0 | – |
| 470 | West Virginia University PRT (Morgantown, WV) (`wvu-prt`) | 52 | 0.0% | 0.0% | 0.0 | – |
| 471 | STO (Gatineau) (`sto`) | 519 | 3.1% | 3.7% | -0.6 | -17.7% |
| 472 | Champaign-Urbana MTD (`mtd-champaign`) | 395 | 0.0% | 2.5% | -2.5 | – |
| 473 | OC Transpo (Ottawa) (`octranspo`) | 1,175 | 0.0% | 2.7% | -2.7 | – |
| 474 | STM (Montréal) (`stm`) | 2,372 | 0.0% | 3.0% | -3.0 | – |
| 475 | Greensboro Transit Authority (`greensboro`) | 211 | 0.0% | 3.4% | -3.4 | – |
| 476 | MTA NYCT Subway (`nyct-subway`) | 630 | 39.1% | 65.2% | -26.1 | -66.7% |
| 477 | REM (Montréal) (`rem`) | 121 | 37.7% | 76.8% | -39.1 | -103.8% |
| 478 | Massachusetts Bay Transportation Authority (`mbta`) | 2,275 | 0.6% | 41.1% | -40.5 | -7290.5% |

## Method

- **Periods (the project's own definitions in `shared/config.ts`).** "9 am Monday" uses **AM Peak (6–9 am) on Weekday** service, as the brief asked. Strictly, 9:00 falls on the AM Peak/Midday boundary, and the app's hour lookup assigns 9 am to Midday (9 am–3 pm). The CSV includes a `weekday_midday_pct` column for that reading. "9 pm Sunday" uses **Evening (7–11 pm) on Sunday** service. Atlas publishes weekday service as one "Weekday" day type (every agency in this release does), so Monday = Weekday.
- **Passing "every 15 or better".** Each route is tested with the repo's shared filter, `routePassesHeadwayFilter(features, period, day, 15)` from `shared/routeHeadwayFilter.ts`, after `normalizeRouteFilterFeatures` stamps worst-direction values over the whole agency file. That is the same normalisation the PMTiles build does (`pipeline/prepareAgencyRoutesForTiles.ts`). So a route passes here only if the map would draw it under "≤15 min" for that day and period. Worst direction decides, with the coverage check included (`docs/product/FREQUENCY_RULES.md`). Nothing was re-derived. The rule code is current `main` (#601, 2026-10-10). That is one day newer than the release, but #601 did not change the coverage stamp.
- **Route unit.** Route short name (or route ID when there's no short name) plus route branch. This is the same grouping the worst-direction rule uses.
- **Route-km.** For each route, the length of its **longest single drawn pattern** (great-circle length of the LineString) across all days and directions. Both directions are never added together, and short-turns are never added on top. Branched routes are under-counted where their tails differ. Separately branched routes (1 branch groups across all agencies) can double-count a shared trunk.
- **Denominator.** One fixed set of routes per agency for both periods: every included route with Weekday or Sunday service. A route that doesn't run on Sunday stays in the denominator and counts as not frequent. Without that, the fall-off would disappear.
- **Exclusions.** On-demand zones and paratransit are not route features in Atlas, so they aren't counted. Patterns the map hides by default as irregular (span/irregular service class, or `routeHasIrregularDirection`, matching the default "hide irregular" setting) are dropped from length and from passing. A route made up only of such patterns is excluded entirely (1894 routes). Time-limited routes (peak-only expresses, etc.) are **kept**, because losing them on Sunday is real fall-off. Routes the agency config excludes are already absent from the release.
- **Rail and ferry.** Rail (subway, light rail, commuter rail, streetcar/tram) and ferries are included at the same weighting as bus. `rail_km` and bus-only percentages are in the CSV.

## Caveats

- **Scheduled, not actual.** Based on published GTFS schedules. Detours, short-turns on the day and missed trips aren't reflected.
- **Feed dates vary.** Each agency's `feed_refreshed` date is in the CSV. Seasonal schedules (summer and school-term) affect both periods.
- **Not in this release:** cobourg, hocts, siskiyou, elmonte, roswell, tangipahoa-parish, fort-bend, mexico-city-metro (HTTP 404). These are omitted.
- **Known rule effect worth checking (possible bug, not changed here).** The route-wide coverage stamp in `shared/worstDirection.ts` takes the worst coverage of **every** sibling pattern in a direction, including hidden irregular (span) patterns and occasional `infrequent` short-turns. One such sibling can fail an otherwise frequent route. For example, TTC 504 King fails "≤15" at weekday AM peak because a sparse irregular "Distillery" pattern gives the route a coverage of 103 min. TTC 501 Queen fails on Sunday evening because an occasional "Roncesvalles" short-turn gives 159 min. The map currently shows the same result, so these numbers match the map. As a sensitivity check only, the CSV has `sens_am_pct` / `sens_sun_eve_pct`. These use the same shared code, but hidden irregular patterns are removed before stamping. That fixes the 504 case but not the 501 case. Owner decision on whether this matches FREQUENCY_RULES rules 2 and 3.
- **Rule effect, size of it.** The CSV columns `diag_am_cov_only_pct` / `diag_sun_eve_cov_only_pct` (diagnostic only, not a corrected figure, not used in ranking) give the share of route-km that fails **only** on the coverage check, where the worst-direction cadence is 15 min or better. Peak periods have more variant and short-turn patterns than Sunday evening, so this effect falls mostly on AM peak. That understates fall-off for networks with many branches or variant patterns, and in a few cases makes it negative.
- **Negative fall-off rows are rule artifacts, not real service.** NYC Subway shows Sunday evening "better" than AM peak because lines like the 1 and L fail at AM peak. On the 1, an occasional 215 St short-turn has a coverage value of 177 min. On the L, a rush-only Myrtle-Wyckoff pattern has 112 min. Both lines run every 4–8 min. REM's A3-A1 route fails at AM peak because one direction has no AM-peak value in the data. Read the REM and NYC Subway rows in the bottom 10 with that in mind.
- **Alternating destinations count separately.** The rule scores each real destination on its own cadence, not the combined trunk. A corridor served by two patterns every 24 min each (DRT 900 here) or a 15/16-min pair (HSR 01 at AM peak) does not pass, even though the shared stretch is busier. So "DRT 0%" means no DRT route passes the map's ≤15 test end to end. It does not mean DRT has no frequent stretches.
- **Live tiles vs current rule.** The live PMTiles were built on 2026-10-09, before #601. #601 changed how routes without a short name are grouped (MBTA, Metro-North, LA Metro rail, PATH). For those lines, these results match current `main`, and may differ from the live map until the next tile rebuild.
- **Small agencies.** Percentages for agencies under about 50 route-km swing on one route. They're in the CSV but not in the ranked tables.

## Files

- `falloff.csv`: one row per agency (all 538), sorted by route-km.
