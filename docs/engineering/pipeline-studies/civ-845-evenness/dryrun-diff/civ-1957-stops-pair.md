# Dry-run diff report

- Baseline: c1957 (commit 0437649cc, runAt 2026-11-19T18:27:09Z)
- Candidate: c1957 (commit 0437649cc, runAt 2026-11-19T18:27:09Z)

## Headline

- Agencies compared: 526 (69183 route/day/direction rows); countries: United States 441, Canada 85.
- Excluding drt: 525 agencies in 2 countries (United States, Canada). "Six additional agencies in two countries" (not counting DRT): SATISFIED by coverage (coverage = compared, not necessarily affected; stop-level pooled values need the agencies input, see usage).
- Changed cells: 5566 total; value cells (figures, headlines, stops): 5566. Published -> none: 228. none -> published: 255. Changed value to value: 5083. Crossed a tier boundary: 4276.
- Focus (drt route 900) changed cells: 18. Collateral (everything else): 5548 cells (5548 value cells) in 21 agencies.
- Stop-level compared: 23 agencies, 1006964 stop tables.
- Agency status differences (report.json): none.

## Per agency

| Agency | Country | Routes | Rows | Changed cells | Value cells | Published->none | none->published | Tier changes | Delta min | median | max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| lacmta | United States | 115 | 1084 | 1416 | 1416 | 25 | 132 | 937 | -139 | +8 | +151 |
| septa | United States | 174 | 1191 | 1037 | 1037 | 26 | 84 | 824 | -99 | +11 | +126 |
| cta | United States | 132 | 988 | 757 | 757 | 33 | 11 | 651 | -234 | +6 | +157 |
| ttc | Canada | 230 | 1906 | 514 | 514 | 37 | 10 | 436 | -61 | +2 | +169 |
| translink | Canada | 237 | 1486 | 334 | 334 | 16 | 4 | 234 | -109 | +8 | +139 |
| nyct-bus-manhattan | United States | 41 | 308 | 268 | 268 | 11 | 0 | 180 | -42 | -5 | +205 |
| nyct-bus-brooklyn | United States | 68 | 507 | 257 | 257 | 32 | 10 | 212 | -107 | -7 | +156 |
| pace-bus | United States | 134 | 683 | 240 | 240 | 17 | 0 | 217 | -67 | +18 | +85 |
| kingcountymetro | United States | - | - | 205 | 205 | 9 | 2 | 193 | -102 | +6 | +93 |
| rtc | Canada | 143 | 494 | 106 | 106 | 0 | 0 | 85 | -11 | +19 | +65 |
| nyct-bus-bronx | United States | 46 | 361 | 102 | 102 | 14 | 0 | 73 | -45 | +15 | +58 |
| lanta | United States | 40 | 161 | 64 | 64 | 0 | 0 | 34 | -51 | -12 | -3 |
| the-rapid | United States | 30 | 160 | 54 | 54 | 0 | 0 | 54 | -28 | +13 | +41 |
| mbta | United States | 182 | 1121 | 52 | 52 | 0 | 0 | 33 | -61 | -9 | +46 |
| go | Canada | 44 | 412 | 37 | 37 | 0 | 2 | 33 | -71 | +5 | +95 |
| madison-metro | United States | 29 | 181 | 37 | 37 | 0 | 0 | 29 | +2 | +30 | +234 |
| rtcsnv | United States | 39 | 313 | 28 | 28 | 8 | 0 | 3 | -19 | +22 | +31 |
| hamilton | Canada | 33 | 238 | 22 | 22 | 0 | 0 | 19 | +1 | +18 | +29 |
| drt | Canada | 38 | 211 | 18 | 18 | 0 | 0 | 11 | -13 | +2 | +9 |
| cata-state-college | United States | 18 | 79 | 11 | 11 | 0 | 0 | 11 | +9 | +9 | +9 |
| portlandme | United States | 15 | 111 | 6 | 6 | 0 | 0 | 6 | +3 | +9 | +11 |
| t3-transit | Canada | 12 | 52 | 1 | 1 | 0 | 0 | 1 | +11 | +11 | +11 |

Delta columns are after minus before, value-to-value cells only.

## Top changed routes

| Agency | Route | Changed cells | Largest delta (min) | Published->none | none->published |
|---|---|---|---|---|---|
| lacmta | 115 | 307 | 118 | 0 | 0 |
| lacmta | 60 | 206 | 122 | 2 | 0 |
| septa | 70 | 168 | 43 | 0 | 0 |
| septa | 42 | 159 | 26 | 0 | 0 |
| lacmta | 33 | 120 | 69 | 0 | 0 |
| septa | 113 | 106 | 91 | 0 | 0 |
| kingcountymetro | 4 | 104 | 20 | 6 | 0 |
| nyct-bus-brooklyn | B41 | 104 | 148 | 8 | 0 |
| cta | 62 | 98 | 69 | 0 | 0 |
| pace-bus | 208 | 98 | 85 | 0 | 0 |
| ttc | 85 | 96 | 15 | 0 | 0 |
| lacmta | 40 | 94 | 67 | 9 | 48 |
| septa | 108 | 93 | - | 9 | 84 |
| cta | 87 | 92 | 47 | 0 | 0 |
| septa | 63 | 87 | 120 | 0 | 0 |
| ttc | 39 | 85 | 15 | 0 | 0 |
| rtc | 93 | 84 | 65 | 0 | 0 |
| lacmta | 251 | 81 | 141 | 0 | 21 |
| nyct-bus-manhattan | M101 | 81 | 205 | 0 | 0 |
| lacmta | 18 | 78 | 151 | 0 | 38 |
| lacmta | 20 | 72 | 42 | 0 | 12 |
| ttc | 395 | 72 | 27 | 36 | 0 |
| cta | 76 | 68 | 128 | 30 | 0 |
| cta | 146 | 67 | 234 | 0 | 0 |
| cta | 60 | 66 | 157 | 0 | 0 |

## Newly refused (published -> none) (228)

| Agency | Route | Day | Where | Period | Kind | Before | After |
|---|---|---|---|---|---|---|---|
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | evening | stop value | 22 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | overnight | stop value | 13 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | evening | stop value | 21 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | overnight | stop value | 13 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | evening | stop value | 21 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | overnight | stop value | 13 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | evening | stop value | 21 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | overnight | stop value | 13 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | evening | stop value | 22 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | overnight | stop value | 13 | none |
| cta | 9 | Saturday | 1 to North Ave & Clark Terminal, stop 6233 | overnight | stop value | 19 | none |
| cta | 9 | Sunday | 1 to North Ave & Clark Terminal, stop 6168 | overnight | stop value | 19 | none |
| cta | 9 | Sunday | 1 to North Ave & Clark Terminal, stop 6169 | overnight | stop value | 19 | none |
| kingcountymetro | 4 | Weekday | 0 to Central District, stop 12991 | amPeak | stop value | 10 | none |
| kingcountymetro | 4 | Weekday | 0 to Central District, stop 12991 | midday | stop value | 10 | none |
| kingcountymetro | 4 | Weekday | 0 to Central District, stop 12991 | pmPeak | stop value | 10 | none |
| kingcountymetro | 4 | Weekday | 0 to Central District, stop 12991 | evening | stop value | 30 | none |
| kingcountymetro | 4 | Weekday | 0 to Central District, stop 12991 | late | stop value | 32 | none |
| kingcountymetro | 4 | Weekday | 0 to Central District, stop 12991 | overnight | stop value | 39 | none |
| kingcountymetro | 160 | Weekday | 1 to Kent, stop 57900 | overnight | stop value | 45 | none |
| kingcountymetro | 160 | Weekday | 1 to Kent, stop 57910 | overnight | stop value | 45 | none |
| kingcountymetro | 160 | Weekday | 1 to Kent, stop 57912 | overnight | stop value | 45 | none |
| lacmta | 60 | Weekday | 1 to Artesia Station, stop 12212 | overnight | stop value | 42 | none |
| lacmta | 60 | Weekday | 1 to 1st / Pine, stop 12212 | overnight | stop value | 42 | none |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 899 | overnight | stop value | 39 | none |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 902 | overnight | stop value | 39 | none |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 903 | overnight | stop value | 39 | none |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 899 | overnight | stop value | 39 | none |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 902 | overnight | stop value | 39 | none |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 903 | overnight | stop value | 39 | none |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 899 | overnight | stop value | 39 | none |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 902 | overnight | stop value | 39 | none |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 903 | overnight | stop value | 39 | none |
| lacmta | 51 | Saturday | 1 to Avalon Station Layover, stop 7383 | overnight | stop value | 17 | none |
| lacmta | 51 | Saturday | 1 to Avalon Station Layover, stop 140944 | overnight | stop value | 17 | none |
| lacmta | 105 | Saturday | 0 to Marlton / King Layover, stop 10252 | midday | stop value | 30 | none |
| lacmta | 105 | Saturday | 0 to Marlton / King Layover, stop 10252 | amPeak | stop value | 15 | none |
| lacmta | 105 | Saturday | 0 to Marlton / King Layover, stop 10252 | pmPeak | stop value | 16 | none |
| lacmta | 105 | Saturday | 0 to Marlton / King Layover, stop 10252 | evening | stop value | 57 | none |
| lacmta | 105 | Saturday | 0 to Marlton / King Layover, stop 36575 | midday | stop value | 30 | none |
| lacmta | 105 | Saturday | 0 to Marlton / King Layover, stop 36575 | amPeak | stop value | 15 | none |
| lacmta | 105 | Saturday | 0 to Marlton / King Layover, stop 36575 | pmPeak | stop value | 16 | none |
| lacmta | 105 | Saturday | 0 to Marlton / King Layover, stop 36575 | evening | stop value | 57 | none |
| lacmta | 45 | Sunday | 0 to Broadway / Thomas, stop 3411 | overnight | stop value | 74 | none |
| lacmta | 45 | Sunday | 0 to Broadway / Thomas, stop 3421 | overnight | stop value | 74 | none |
| lacmta | 45 | Sunday | 0 to Broadway / Thomas, stop 11900 | overnight | stop value | 74 | none |
| lacmta | 45 | Sunday | 0 to Broadway / Thomas, stop 11903 | overnight | stop value | 74 | none |
| nyct-bus-bronx | Bx42 | Weekday | 1 to WESTCHESTER SQ, stop 102666 | overnight | stop value | 29 | none |
| nyct-bus-bronx | Bx42 | Weekday | 1 to WESTCHESTER SQ, stop 102667 | overnight | stop value | 29 | none |
| nyct-bus-bronx | Bx42 | Weekday | 1 to WESTCHESTER SQ, stop 104063 | overnight | stop value | 29 | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV, stop 102401 | overnight | stop value | 32 | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV, stop 102978 | overnight | stop value | 32 | none |
| nyct-bus-bronx | Bx36 | Weekday | 0 to LTD SOUNDVIEW via TREMONT AV, stop 103355 | overnight | stop value | 32 | none |
| nyct-bus-bronx | Bx28 | Saturday | 1 to FORDHAM CENTER 192 ST via GUNHILL, stop 101924 | overnight | stop value | 25 | none |
| nyct-bus-bronx | Bx28 | Saturday | 1 to FORDHAM CENTER 192 ST via GUNHILL, stop 101927 | overnight | stop value | 25 | none |
| nyct-bus-bronx | Bx28 | Saturday | 1 to FORDHAM CENTER 192 ST via GUNHILL, stop 902211 | overnight | stop value | 25 | none |
| nyct-bus-bronx | Bx12 | Sunday | 1 to SEDWICK AV via PELHAM PKY via FORDHAM RD, stop 100567 | overnight | stop value | 25 | none |
| nyct-bus-bronx | Bx12 | Sunday | 1 to SEDWICK AV via PELHAM PKY via FORDHAM RD, stop 100851 | overnight | stop value | 25 | none |
| nyct-bus-bronx | Bx12 | Sunday | 1 to SEDWICK AV via PELHAM PKY via FORDHAM RD, stop 104235 | overnight | stop value | 25 | none |
| nyct-bus-bronx | Bx9 | Sunday | 0 to 225 ST, stop 100560 | overnight | stop value | 50 | none |
| nyct-bus-bronx | Bx9 | Sunday | 0 to 225 ST, stop 100561 | overnight | stop value | 50 | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to LTD DWNTWN BKLYN CADMAN PLZ via FLATBUSH, stop 303254 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to LTD DWNTWN BKLYN CADMAN PLZ via FLATBUSH, stop 303258 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to LTD DWNTWN BKLYN CADMAN PLZ via FLATBUSH, stop 308962 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to LTD DWNTWN BKLYN CADMAN PLZ via FLATBUSH, stop 308987 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to LTD DWNTWN BKLYN CADMAN PLZ via FLATBUSH, stop 303254 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to LTD DWNTWN BKLYN CADMAN PLZ via FLATBUSH, stop 303258 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to LTD DWNTWN BKLYN CADMAN PLZ via FLATBUSH, stop 308962 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B41 | Weekday | 0 to LTD DWNTWN BKLYN CADMAN PLZ via FLATBUSH, stop 308987 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B24 | Weekday | 0 to GREENPOINT WEST ST, stop 302346 | overnight | stop value | 15 | none |
| nyct-bus-brooklyn | B24 | Weekday | 0 to GREENPOINT WEST ST, stop 302347 | overnight | stop value | 15 | none |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300898 | overnight | stop value | 39 | none |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300899 | overnight | stop value | 39 | none |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300900 | overnight | stop value | 39 | none |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300912 | overnight | stop value | 40 | none |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300913 | overnight | stop value | 40 | none |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300914 | overnight | stop value | 40 | none |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300915 | overnight | stop value | 40 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301064 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301066 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301067 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301069 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301070 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301071 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301072 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301073 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301074 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301075 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301076 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301077 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 301078 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 306343 | overnight | stop value | 19 | none |
| nyct-bus-brooklyn | B15 | Saturday | 1 to STUY WOODHULL HOSPITAL, stop 307990 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 401774 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 401775 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 401778 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 401780 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 401781 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 401782 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 401784 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 404105 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 404909 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 405336 | overnight | stop value | 19 | none |
| nyct-bus-manhattan | M15 | Weekday | 1 to PIKE ST -via 2 AV, stop 405341 | overnight | stop value | 19 | none |
| pace-bus | 230 | Weekday | 1 to Rosemont CTA Station - Bus Stop G, stop 230s0105 | amPeak | stop value | 42 | none |
| pace-bus | 230 | Weekday | 1 to Rosemont CTA Station - Bus Stop G, stop 230s0105 | pmPeak | stop value | 54 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0400 | pmPeak | stop value | 30 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0400 | amPeak | stop value | 18 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0400 | midday | stop value | 20 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0400 | evening | stop value | 19 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0400 | late | stop value | 30 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0401 | pmPeak | stop value | 30 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0401 | amPeak | stop value | 18 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0401 | midday | stop value | 20 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0401 | evening | stop value | 19 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0401 | late | stop value | 30 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0402 | pmPeak | stop value | 30 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0402 | amPeak | stop value | 18 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0402 | midday | stop value | 20 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0402 | evening | stop value | 19 | none |
| pace-bus | 381 | Saturday | 1 to 9900 Industrial Ave, stop 381w0402 | late | stop value | 30 | none |
| rtcsnv | 110 | Weekday | 1 to Eastern Southbound, stop 655 | overnight | stop value | 35 | none |
| rtcsnv | 110 | Weekday | 1 to Eastern Southbound, stop 6379 | overnight | stop value | 35 | none |
| rtcsnv | SX | Weekday | 1 to A Sahara Express Westbound, stop 2389 | overnight | stop value | 37 | none |
| rtcsnv | SX | Weekday | 1 to A Sahara Express Westbound, stop 6299 | overnight | stop value | 37 | none |
| rtcsnv | SX | Weekday | 1 to A Sahara Express Westbound, stop 6300 | overnight | stop value | 37 | none |
| rtcsnv | SX | Weekday | 1 to B Sahara Express Westbound, stop 2389 | overnight | stop value | 37 | none |
| rtcsnv | SX | Weekday | 1 to B Sahara Express Westbound, stop 6299 | overnight | stop value | 37 | none |
| rtcsnv | SX | Weekday | 1 to B Sahara Express Westbound, stop 6300 | overnight | stop value | 37 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 15053 | overnight | stop value | 34 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 19554 | overnight | stop value | 34 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 19556 | overnight | stop value | 34 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 19557 | overnight | stop value | 34 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 19572 | overnight | stop value | 42 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 19574 | overnight | stop value | 42 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 19576 | overnight | stop value | 42 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 19578 | overnight | stop value | 42 | none |
| septa | 108 | Weekday | 1 to 69th St Transit Center, stop 19579 | overnight | stop value | 42 | none |
| septa | NOR | Weekday | 1 to Center City Philadelphia, stop 90007 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Center City Philadelphia, stop 90008 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Center City Philadelphia, stop 90218 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Center City Philadelphia, stop 90219 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Center City Philadelphia, stop 90220 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Center City Philadelphia, stop 90221 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Center City Philadelphia, stop 90223 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Center City Philadelphia, stop 90224 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Penn Medicine Station, stop 90007 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Penn Medicine Station, stop 90008 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Penn Medicine Station, stop 90218 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Penn Medicine Station, stop 90219 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Penn Medicine Station, stop 90220 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Penn Medicine Station, stop 90221 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Penn Medicine Station, stop 90223 | pmPeak | stop value | 47 | none |
| septa | NOR | Weekday | 1 to Penn Medicine Station, stop 90224 | pmPeak | stop value | 47 | none |
| septa | MED | Weekday | 1 to Media, stop 90007 | pmPeak | stop value | 39 | none |
| translink | 301 | Weekday | 0 to Newton Exchange Express, stop 11247 | overnight | stop value | 19 | none |
| translink | 321 | Weekday | 0 to Scott Rd, stop 5446 | overnight | stop value | 12 | none |
| translink | 321 | Weekday | 0 to Scott Rd, stop 5447 | overnight | stop value | 12 | none |
| translink | 321 | Weekday | 0 to Scott Rd, stop 5448 | overnight | stop value | 12 | none |
| translink | 321 | Weekday | 0 to Scott Rd, stop 5449 | overnight | stop value | 12 | none |
| translink | 321 | Weekday | 0 to Scott Rd, stop 9083 | overnight | stop value | 12 | none |
| translink | 321 | Weekday | 0 to Scott Rd, stop 10437 | overnight | stop value | 12 | none |
| translink | 321 | Weekday | 0 to Scott Rd, stop 10445 | overnight | stop value | 12 | none |
| translink | 321 | Weekday | 0 to Scott Rd, stop 11313 | overnight | stop value | 12 | none |
| translink | 640 | Weekday | 0 to Scott Rd, stop 4908 | pmPeak | stop value | 21 | none |
| translink | 640 | Weekday | 0 to Scott Rd, stop 4908 | amPeak | stop value | 11 | none |
| translink | 640 | Weekday | 0 to Scott Rd, stop 4908 | midday | stop value | 14 | none |
| translink | 640 | Weekday | 0 to Scott Rd, stop 4908 | evening | stop value | 20 | none |
| translink | 640 | Weekday | 0 to Scott Rd, stop 4908 | late | stop value | 26 | none |
| translink | 640 | Weekday | 0 to Scott Rd, stop 4908 | overnight | stop value | 8 | none |
| translink | 746 | Weekday | 1 to Haney Place, stop 8006 | amPeak | stop value | 17 | none |
| ttc | 939 | Weekday | 1 to Finch West Stn via Finch Stn, stop 1317 | overnight | stop value | 12 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1044 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1044 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1046 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1046 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1048 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1048 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1051 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1051 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1052 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 1052 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 7698 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 7698 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 7702 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 7702 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 7704 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 7704 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 7711 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 7711 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 9468 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 9468 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 9469 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 9469 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10514 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10514 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10515 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10515 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10516 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10516 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10517 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10517 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10518 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10518 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10519 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10519 | overnight | stop value | 30 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10520 | amPeak | stop value | 17 | none |
| ttc | 395 | Sunday | 0 to Rouge Hill GO, stop 10520 | overnight | stop value | 30 | none |

## Newly published (none -> value) (255)

| Agency | Route | Day | Where | Period | Kind | Before | After |
|---|---|---|---|---|---|---|---|
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1597 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1598 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1599 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1602 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1603 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1604 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1605 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1607 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1609 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 16014 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 17243 | overnight | stop value | none | 19 |
| go | 30 | Weekday | 1 to U of Waterloo, stop 02875 | amPeak | stop value | none | 23 |
| go | 30 | Weekday | 1 to U of Waterloo, stop 02148 | amPeak | stop value | none | 23 |
| kingcountymetro | 160 | Weekday | 1 to Kent, stop 57915 | overnight | stop value | none | 44 |
| kingcountymetro | 160 | Weekday | 1 to Kent, stop 57920 | overnight | stop value | none | 44 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 847 | overnight | stop value | none | 13 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 859 | overnight | stop value | none | 13 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 862 | overnight | stop value | none | 13 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 880 | overnight | stop value | none | 13 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 915 | overnight | stop value | none | 13 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 4910 | overnight | stop value | none | 13 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 4911 | overnight | stop value | none | 13 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 4912 | overnight | stop value | none | 13 |
| lacmta | 210 | Weekday | 0 to Cahuenga / Yucca Layover, stop 25400151 | overnight | stop value | none | 13 |
| lacmta | 251 | Weekday | 0 to Avenue 28 / Idell, stop 7511 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Avenue 28 / Idell, stop 142071 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Avenue 28 / Idell, stop 142145 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Avenue 28 / Idell, stop 142321 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Avenue 28 / Idell, stop 142322 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Avenue 28 / Idell, stop 142338 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Avenue 28 / Idell, stop 142339 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 7511 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142071 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142145 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142321 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142322 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142338 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142339 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 7511 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142071 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142145 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142321 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142322 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142338 | overnight | stop value | none | 39 |
| lacmta | 251 | Weekday | 0 to Colorado / Eagledale, stop 142339 | overnight | stop value | none | 39 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 876 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 892 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 895 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 926 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2729 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2730 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2732 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2735 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2736 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2739 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2747 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2751 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2754 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 2756 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 11224 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Division 13 Layover, stop 25400178 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 876 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 892 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 895 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 926 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2729 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2730 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2732 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2735 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2736 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2739 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2747 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2751 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2754 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 2756 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 11224 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Patsaouras Transit Plaza, stop 25400178 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 876 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 892 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 895 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 926 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2729 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2730 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2732 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2735 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2736 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2739 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2747 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2751 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2754 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 2756 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 11224 | overnight | stop value | none | 38 |
| lacmta | 40 | Saturday | 0 to Broadway / 7th, stop 25400178 | overnight | stop value | none | 38 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16592 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16595 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16597 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16612 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16616 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16619 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16621 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16625 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16638 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to 6th / Oxford Terminal, stop 16945 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16592 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16595 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16597 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16612 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16616 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16619 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16621 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16625 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16638 | overnight | stop value | none | 33 |
| lacmta | 18 | Saturday | 1 to Wilshire / Vermont Station, stop 16945 | overnight | stop value | none | 33 |
| lacmta | 20 | Saturday | 0 to 6th / Main, stop 20004 | midday | stop value | none | 23 |
| lacmta | 20 | Saturday | 0 to 6th / Main, stop 20004 | evening | stop value | none | 125 |
| lacmta | 20 | Saturday | 0 to 6th / Main, stop 20004 | amPeak | stop value | none | 28 |
| lacmta | 20 | Saturday | 0 to 6th / Main, stop 20004 | pmPeak | stop value | none | 13 |
| lacmta | 20 | Saturday | 0 to 6th / Main, stop 20004 | late | stop value | none | 31 |
| lacmta | 20 | Saturday | 0 to 6th / Main, stop 20004 | overnight | stop value | none | 30 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8284 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8314 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8315 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8317 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8318 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8319 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8322 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8326 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 8328 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Whittier / Garfield, stop 16946 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Commerce Center, stop 8284 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Commerce Center, stop 8314 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Commerce Center, stop 8315 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Commerce Center, stop 8317 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Commerce Center, stop 8318 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Commerce Center, stop 8322 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Commerce Center, stop 8328 | overnight | stop value | none | 39 |
| lacmta | 18 | Sunday | 0 to Commerce Center, stop 16946 | overnight | stop value | none | 39 |
| lacmta | 45 | Sunday | 0 to Broadway / Thomas, stop 4767 | overnight | stop value | none | 73 |
| lacmta | 45 | Sunday | 0 to Broadway / Thomas, stop 4787 | overnight | stop value | none | 73 |
| lacmta | 45 | Sunday | 0 to Broadway / Thomas, stop 13227 | overnight | stop value | none | 73 |
| lacmta | 45 | Sunday | 0 to Broadway / Thomas, stop 16947 | overnight | stop value | none | 73 |
| lacmta | 20 | Sunday | 0 to 6th / Main, stop 20004 | midday | stop value | none | 23 |
| lacmta | 20 | Sunday | 0 to 6th / Main, stop 20004 | evening | stop value | none | 125 |
| lacmta | 20 | Sunday | 0 to 6th / Main, stop 20004 | amPeak | stop value | none | 28 |
| lacmta | 20 | Sunday | 0 to 6th / Main, stop 20004 | pmPeak | stop value | none | 13 |
| lacmta | 20 | Sunday | 0 to 6th / Main, stop 20004 | late | stop value | none | 31 |
| lacmta | 20 | Sunday | 0 to 6th / Main, stop 20004 | overnight | stop value | none | 30 |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300908 | overnight | stop value | none | 39 |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300909 | overnight | stop value | none | 39 |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300910 | overnight | stop value | none | 39 |
| nyct-bus-brooklyn | B8 | Weekday | 1 to V A HOSPITAL, stop 300911 | overnight | stop value | none | 39 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND, stop 303413 | overnight | stop value | none | 38 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND, stop 303417 | overnight | stop value | none | 38 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND, stop 303418 | overnight | stop value | none | 38 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND, stop 303420 | overnight | stop value | none | 38 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND, stop 303421 | overnight | stop value | none | 38 |
| nyct-bus-brooklyn | B44 | Sunday | 0 to FLUSHING AV via NOSTRAND, stop 303422 | overnight | stop value | none | 38 |
| septa | 108 | Weekday | 0 to UPS, stop 1150 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 1151 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 1152 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 1153 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 16998 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19615 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19618 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19620 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19622 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19623 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19624 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19626 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19627 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19628 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19629 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19630 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19631 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19632 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19633 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19634 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19635 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19636 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19637 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19638 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19639 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19640 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19641 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to UPS, stop 19642 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 1150 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 1151 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 1152 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 1153 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 16998 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19615 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19618 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19620 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19622 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19623 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19624 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19626 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19627 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19628 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19629 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19630 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19631 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19632 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19633 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19634 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19635 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19636 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19637 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19638 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19639 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19640 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19641 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to Airport, stop 19642 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 1150 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 1151 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 1152 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 1153 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 16998 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19615 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19618 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19620 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19622 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19623 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19624 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19626 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19627 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19628 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19629 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19630 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19631 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19632 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19633 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19634 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19635 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19636 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19637 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19638 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19639 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19640 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19641 | overnight | stop value | none | 34 |
| septa | 108 | Weekday | 0 to 67th-Elmwood, stop 19642 | overnight | stop value | none | 34 |
| translink | 210 | Weekday | 0 to Phibbs Exchange, stop 431 | evening | stop value | none | 21 |
| translink | 210 | Weekday | 0 to Phibbs Exchange, stop 437 | evening | stop value | none | 21 |
| translink | 210 | Weekday | 0 to Phibbs Exchange, stop 442 | evening | stop value | none | 21 |
| translink | 210 | Weekday | 0 to Phibbs Exchange, stop 450 | evening | stop value | none | 21 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 5387 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 5413 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 5415 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 7075 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 7077 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 7080 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 7094 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 7095 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 7101 | overnight | stop value | none | 9 |
| ttc | 79 | Weekday | 0 to Runnymede via St Clair, stop 15676 | overnight | stop value | none | 9 |

## Collateral: changes outside drt route 900 (5548)

| Agency | Route | Day | Where | Period | Kind | Before | After |
|---|---|---|---|---|---|---|---|
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 152 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 153 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 154 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 155 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 356 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 357 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 358 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 359 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 360 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 361 | midday | stop value | 15 | 24 |
| cata-state-college | WL | Sunday | 1 to Out of Service, stop 563 | midday | stop value | 15 | 24 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 1113 | amPeak | stop value | 19 | 13 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 1115 | amPeak | stop value | 14 | 19 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 1122 | amPeak | stop value | 19 | 14 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 1123 | amPeak | stop value | 19 | 14 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 2354 | amPeak | stop value | 19 | 13 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 2355 | amPeak | stop value | 19 | 13 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 16140 | amPeak | stop value | 19 | 13 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 1113 | amPeak | stop coverage | 54 | 21 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 1115 | amPeak | stop coverage | 22 | 56 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 1122 | amPeak | stop coverage | 63 | 23 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 1123 | amPeak | stop coverage | 64 | 23 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 2354 | amPeak | stop coverage | 49 | 21 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 2355 | amPeak | stop coverage | 50 | 21 |
| cta | 146 | Weekday | 1 to Berwyn & Broadway, stop 16140 | amPeak | stop coverage | 48 | 21 |
| cta | 146 | Weekday | 1 to Marine Drive & Wilson, stop 1113 | amPeak | stop value | 21 | 13 |
| cta | 146 | Weekday | 1 to Marine Drive & Wilson, stop 1115 | amPeak | stop value | 14 | 22 |
| cta | 146 | Weekday | 1 to Marine Drive & Wilson, stop 1122 | amPeak | stop value | 23 | 14 |
| cta | 146 | Weekday | 1 to Marine Drive & Wilson, stop 1123 | amPeak | stop value | 23 | 14 |
| cta | 146 | Weekday | 1 to Marine Drive & Wilson, stop 2354 | amPeak | stop value | 21 | 13 |
| cta | 146 | Weekday | 1 to Marine Drive & Wilson, stop 2355 | amPeak | stop value | 21 | 13 |
| cta | 146 | Weekday | 1 to Marine Drive & Wilson, stop 16140 | amPeak | stop value | 21 | 13 |
| cta | 146 | Weekday | 1 to Foster & Broadway, stop 1113 | amPeak | stop value | 21 | 13 |
| cta | 146 | Weekday | 1 to Foster & Broadway, stop 1115 | amPeak | stop value | 14 | 22 |
| cta | 146 | Weekday | 1 to Foster & Broadway, stop 1122 | amPeak | stop value | 23 | 14 |
| cta | 146 | Weekday | 1 to Foster & Broadway, stop 1123 | amPeak | stop value | 23 | 14 |
| cta | 152 | Weekday | 1 to Lake Shore & Waveland, stop 12521 | pmPeak | stop value | 10 | 12 |
| cta | 152 | Weekday | 1 to Lake Shore & Waveland, stop 18651 | pmPeak | stop value | 12 | 9 |
| cta | 152 | Weekday | 1 to Lake Shore & Waveland, stop 12521 | pmPeak | stop coverage | 16 | 22 |
| cta | 152 | Weekday | 1 to Lake Shore & Waveland, stop 18651 | pmPeak | stop coverage | 22 | 15 |
| cta | 20 | Weekday | 1 to Columbus & Randolph, stop 1119 | overnight | stop value | 11 | 17 |
| cta | 20 | Weekday | 1 to Columbus & Randolph, stop 1119 | overnight | stop coverage | 166 | 176 |
| cta | 22 | Weekday | 0 to Clark & Harrison, stop 1826 | overnight | stop value | 19 | 30 |
| cta | 22 | Weekday | 0 to Clark & Harrison, stop 1827 | overnight | stop value | 19 | 30 |
| cta | 22 | Weekday | 0 to Clark & Harrison, stop 1828 | overnight | stop value | 19 | 30 |
| cta | 22 | Weekday | 0 to Clark & Harrison, stop 1830 | overnight | stop value | 19 | 30 |
| cta | 22 | Weekday | 0 to Clark & Harrison, stop 14895 | overnight | stop value | 19 | 30 |
| cta | 22 | Weekday | 0 to Clark & Harrison, stop 17751 | overnight | stop value | 19 | 30 |
| cta | 22 | Weekday | 1 to Paulina & Howard Terminal, stop 1875 | late | stop coverage | 30 | 131 |
| cta | 22 | Weekday | 1 to Paulina & Howard Terminal, stop 1876 | late | stop coverage | 30 | 130 |
| cta | 22 | Weekday | 1 to Paulina & Howard Terminal, stop 1877 | late | stop coverage | 30 | 130 |
| cta | 22 | Weekday | 1 to Paulina & Howard Terminal, stop 1880 | late | stop coverage | 30 | 128 |
| cta | 22 | Weekday | 1 to Paulina & Howard Terminal, stop 1882 | late | stop coverage | 30 | 127 |
| cta | 22 | Weekday | 1 to Paulina & Howard Terminal, stop 14508 | late | stop coverage | 30 | 129 |
| cta | 22 | Weekday | 1 to Paulina & Howard Terminal, stop 15895 | late | stop coverage | 30 | 132 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1597 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1598 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1599 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1602 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1603 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1604 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1605 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1607 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 1609 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 16014 | overnight | stop value | none | 19 |
| cta | 4 | Weekday | 0 to 95th Red Line Station, stop 17243 | overnight | stop value | none | 19 |
| cta | 60 | Weekday | 0 to 54th/Cermak Pink Line Station, stop 206 | evening | stop value | 18 | 11 |
| cta | 60 | Weekday | 0 to 54th/Cermak Pink Line Station, stop 207 | evening | stop value | 18 | 11 |
| cta | 60 | Weekday | 0 to 54th/Cermak Pink Line Station, stop 208 | evening | stop value | 18 | 11 |
| cta | 60 | Weekday | 0 to 54th/Cermak Pink Line Station, stop 6365 | evening | stop value | 12 | 19 |
| cta | 60 | Weekday | 0 to 54th/Cermak Pink Line Station, stop 6366 | evening | stop value | 18 | 11 |
| cta | 60 | Weekday | 0 to 54th/Cermak Pink Line Station, stop 15292 | evening | stop value | 18 | 11 |
| cta | 60 | Weekday | 0 to 54th/Cermak Pink Line Station, stop 15402 | evening | stop value | 18 | 11 |
| cta | 60 | Weekday | 0 to 54th/Cermak Pink Line Station, stop 18125 | evening | stop value | 12 | 19 |
| cta | 60 | Weekday | 1 to Washington & State, stop 6302 | evening | stop value | 14 | 22 |
| cta | 60 | Weekday | 1 to Washington & State, stop 6303 | evening | stop value | 14 | 22 |
| cta | 60 | Weekday | 1 to Washington & State, stop 6304 | evening | stop value | 14 | 22 |
| cta | 60 | Weekday | 1 to Washington & State, stop 6305 | evening | stop value | 14 | 22 |
| cta | 65 | Weekday | 1 to Navy Pier Terminal, stop 756 | amPeak | stop value | 12 | 13 |
| cta | 67 | Weekday | 0 to 69th Street & Damen, stop 10103 | amPeak | stop value | 12 | 20 |
| cta | 67 | Weekday | 0 to 69th Street & Damen, stop 10105 | amPeak | stop value | 12 | 20 |
| cta | 67 | Weekday | 0 to 69th Street & Damen, stop 10106 | amPeak | stop value | 12 | 20 |
| cta | 67 | Weekday | 0 to 69th Street & Damen, stop 10111 | amPeak | stop value | 12 | 20 |
| cta | 67 | Weekday | 0 to 69th Street & Damen, stop 10103 | amPeak | stop coverage | 19 | 63 |
| cta | 67 | Weekday | 0 to 69th Street & Damen, stop 10105 | amPeak | stop coverage | 19 | 64 |
| cta | 67 | Weekday | 0 to 69th Street & Damen, stop 10106 | amPeak | stop coverage | 19 | 65 |
| cta | 67 | Weekday | 0 to 69th Street & Damen, stop 10111 | amPeak | stop coverage | 19 | 66 |
| cta | 67 | Weekday | 0 to Ford City, stop 10103 | amPeak | stop value | 12 | 20 |
| cta | 67 | Weekday | 0 to Ford City, stop 10105 | amPeak | stop value | 12 | 20 |
| cta | 67 | Weekday | 0 to Ford City, stop 10103 | amPeak | stop coverage | 19 | 23 |
| cta | 67 | Weekday | 0 to Ford City, stop 10105 | amPeak | stop coverage | 19 | 23 |
| cta | 7 | Weekday | 0 to Harrison & Central Terminal, stop 75 | amPeak | stop value | 10 | 16 |
| cta | 7 | Weekday | 0 to Harrison & Central Terminal, stop 77 | amPeak | stop value | 10 | 16 |
| cta | 7 | Weekday | 0 to Harrison & Central Terminal, stop 4732 | amPeak | stop value | 10 | 16 |
| cta | 7 | Weekday | 0 to Congress & Kedzie, stop 75 | amPeak | stop value | 10 | 16 |
| cta | 7 | Weekday | 0 to Congress & Kedzie, stop 77 | amPeak | stop value | 10 | 16 |
| cta | 7 | Weekday | 0 to Congress & Kedzie, stop 207 | amPeak | stop value | 11 | 17 |
| cta | 7 | Weekday | 0 to Congress & Kedzie, stop 208 | amPeak | stop value | 11 | 17 |
| cta | 7 | Weekday | 0 to Congress & Kedzie, stop 210 | amPeak | stop value | 11 | 17 |
| cta | 7 | Weekday | 0 to Congress & Kedzie, stop 4732 | amPeak | stop value | 10 | 16 |
| cta | 73 | Weekday | 0 to Grand & Latrobe Terminal, stop 4125 | amPeak | stop value | 10 | 15 |
| cta | 73 | Weekday | 0 to Grand & Latrobe Terminal, stop 4126 | amPeak | stop value | 10 | 15 |
| cta | 73 | Weekday | 0 to Grand & Latrobe Terminal, stop 4125 | amPeak | stop coverage | 16 | 20 |
| cta | 73 | Weekday | 0 to Grand & Latrobe Terminal, stop 4126 | amPeak | stop coverage | 16 | 20 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11057 | amPeak | stop value | 10 | 11 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11060 | amPeak | stop value | 10 | 11 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11064 | amPeak | stop value | 10 | 11 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11065 | amPeak | stop value | 10 | 11 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11069 | amPeak | stop value | 10 | 11 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 17530 | amPeak | stop value | 10 | 11 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 18734 | amPeak | stop value | 10 | 11 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11057 | amPeak | stop coverage | 16 | 19 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11060 | amPeak | stop coverage | 16 | 19 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11064 | amPeak | stop coverage | 16 | 19 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11065 | amPeak | stop coverage | 16 | 19 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11069 | amPeak | stop coverage | 16 | 18 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11069 | overnight | stop coverage | 116 | 196 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11073 | overnight | stop coverage | 118 | 198 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11075 | overnight | stop coverage | 119 | 199 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11077 | overnight | stop coverage | 120 | 200 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11078 | overnight | stop coverage | 121 | 201 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11079 | overnight | stop coverage | 122 | 202 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 11081 | overnight | stop coverage | 123 | 203 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 17530 | amPeak | stop coverage | 16 | 19 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 18639 | overnight | stop coverage | 117 | 197 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 18734 | amPeak | stop coverage | 16 | 18 |
| cta | 76 | Weekday | 0 to Diversey & Neva Terminal, stop 18734 | overnight | stop coverage | 115 | 195 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11057 | amPeak | stop value | 10 | 15 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11060 | amPeak | stop value | 10 | 15 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11064 | amPeak | stop value | 10 | 16 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11065 | amPeak | stop value | 10 | 16 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11069 | amPeak | stop value | 10 | 16 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11091 | amPeak | stop value | 18 | 11 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 17530 | amPeak | stop value | 10 | 15 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 18734 | amPeak | stop value | 10 | 16 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11057 | amPeak | stop coverage | 16 | 133 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11060 | amPeak | stop coverage | 16 | 135 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11064 | amPeak | stop coverage | 16 | 138 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11065 | amPeak | stop coverage | 16 | 139 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 11069 | amPeak | stop coverage | 16 | 144 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 17530 | amPeak | stop coverage | 16 | 136 |
| cta | 76 | Weekday | 0 to Diversey & Central, stop 18734 | amPeak | stop coverage | 16 | 142 |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | evening | stop value | 22 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10974 | overnight | stop value | 13 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | evening | stop value | 21 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10979 | overnight | stop value | 13 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | evening | stop value | 21 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 10980 | overnight | stop value | 13 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | evening | stop value | 21 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 17994 | overnight | stop value | 13 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | midday | stop value | 26 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | amPeak | stop value | 7 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | pmPeak | stop value | 12 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | evening | stop value | 22 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | late | stop value | 24 | none |
| cta | 76 | Weekday | 1 to Logan Square Blue Line Station, stop 18337 | overnight | stop value | 13 | none |
| cta | 82 | Weekday | 1 to Devon & Kedzie Terminal, stop 11280 | evening | stop value | 11 | 17 |
| cta | 82 | Weekday | 1 to Devon & Kedzie Terminal, stop 11283 | evening | stop value | 11 | 17 |
| cta | 82 | Weekday | 1 to Devon & Kedzie Terminal, stop 11284 | evening | stop value | 11 | 17 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9363 | evening | stop value | 19 | 18 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9480 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9481 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9484 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9486 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9489 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9491 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9493 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9494 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9504 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9505 | amPeak | stop value | 22 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9506 | amPeak | stop value | 22 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9508 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9509 | amPeak | stop value | 22 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9510 | amPeak | stop value | 22 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9523 | evening | stop value | 19 | 18 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9528 | evening | stop value | 19 | 18 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9530 | evening | stop value | 19 | 18 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9532 | evening | stop value | 19 | 18 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 17949 | amPeak | stop value | 21 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9480 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9481 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9484 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9486 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9489 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9491 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9493 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9494 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9504 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9505 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9506 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9508 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9509 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 9510 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Cicero Terminal, stop 17949 | amPeak | stop coverage | 26 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9480 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9481 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9484 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9486 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9489 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9491 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9493 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9494 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9504 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9505 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9506 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9508 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9509 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9510 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 17949 | amPeak | stop value | 17 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9480 | amPeak | stop coverage | 41 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9481 | amPeak | stop coverage | 42 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9484 | amPeak | stop coverage | 44 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9486 | amPeak | stop coverage | 46 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9489 | amPeak | stop coverage | 47 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9491 | amPeak | stop coverage | 48 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9493 | amPeak | stop coverage | 49 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9494 | amPeak | stop coverage | 50 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9504 | amPeak | stop coverage | 58 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9505 | amPeak | stop coverage | 58 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9506 | amPeak | stop coverage | 59 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9508 | amPeak | stop coverage | 60 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9509 | amPeak | stop coverage | 61 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 9510 | amPeak | stop coverage | 62 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Western Terminal, stop 17949 | amPeak | stop coverage | 60 | 15 |
| cta | 87 | Weekday | 0 to 87th Street & Vincennes, stop 9480 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Vincennes, stop 9481 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Vincennes, stop 9484 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Vincennes, stop 9486 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Vincennes, stop 9489 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Vincennes, stop 9491 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Vincennes, stop 9493 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Vincennes, stop 9494 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 1 to 87th Street & Vincennes, stop 9363 | evening | stop value | 19 | 30 |
| cta | 87 | Weekday | 0 to 87th Street & Halsted, stop 9480 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Halsted, stop 9481 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Halsted, stop 9484 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Halsted, stop 9486 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Halsted, stop 9489 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Halsted, stop 9491 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Halsted, stop 9493 | amPeak | stop value | 15 | 9 |
| cta | 87 | Weekday | 0 to 87th Street & Halsted, stop 9494 | amPeak | stop value | 15 | 9 |
| cta | 9 | Weekday | 1 to Ravenswood (west Leg) & Leland, stop 6274 | overnight | stop coverage | 107 | 173 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30033 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30075 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30131 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30222 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30296 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30383 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40170 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40380 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40680 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41160 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41510 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41700 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30033 | amPeak | stop coverage | 29 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30075 | amPeak | stop coverage | 23 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30131 | amPeak | stop coverage | 22 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30222 | amPeak | stop coverage | 26 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30296 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30383 | amPeak | stop coverage | 22 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40170 | amPeak | stop coverage | 29 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40380 | amPeak | stop coverage | 23 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40680 | amPeak | stop coverage | 22 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41160 | amPeak | stop coverage | 26 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41510 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41700 | amPeak | stop coverage | 22 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30033 | amPeak | stop value | 18 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30075 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30131 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30222 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30296 | amPeak | stop value | 18 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30383 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40170 | amPeak | stop value | 18 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40380 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40680 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41160 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41510 | amPeak | stop value | 18 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41700 | amPeak | stop value | 17 | 9 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30033 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30075 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30131 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30222 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30296 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 30383 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40170 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40380 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 40680 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41160 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41510 | amPeak | stop coverage | 27 | 15 |
| cta | Green Line | Weekday | 1 to Harlem-Green, stop 41700 | amPeak | stop coverage | 27 | 15 |
| cta | X4 | Weekday | 1 to Columbus & Randolph, stop 76 | amPeak | stop coverage | 19 | 53 |
| cta | X4 | Weekday | 1 to Columbus & Randolph, stop 14485 | amPeak | stop coverage | 19 | 52 |
| cta | 147 | Saturday | 0 to Congress Plaza & Michigan, stop 73 | evening | stop value | 10 | 16 |
| cta | 147 | Saturday | 0 to Congress Plaza & Michigan, stop 74 | evening | stop value | 10 | 16 |
| cta | 147 | Saturday | 0 to Congress Plaza & Michigan, stop 1110 | evening | stop value | 10 | 16 |
| cta | 36 | Saturday | 1 to Clark & Arthur Terminal, stop 1908 | late | stop value | 20 | 32 |
| cta | 36 | Saturday | 1 to Clark & Arthur Terminal, stop 5405 | late | stop value | 29 | 18 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 1877 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 1880 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 1881 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 1882 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 1884 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 1885 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 1887 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 2361 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 5385 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 5423 | midday | stop value | 14 | 22 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 5424 | midday | stop value | 14 | 22 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 5426 | midday | stop value | 14 | 22 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 14442 | midday | stop value | 14 | 22 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 14456 | midday | stop value | 14 | 22 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 14508 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 15399 | midday | stop value | 12 | 19 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 17578 | midday | stop value | 18 | 11 |
| cta | 36 | Saturday | 1 to Devon & Clark, stop 18613 | midday | stop value | 12 | 19 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 1603 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 1605 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 1606 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 1607 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 1608 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 1609 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 1610 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 2533 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 2534 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 2535 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 2536 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 7686 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 7687 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 115th Street Metra Station, stop 15520 | late | stop value | 19 | 30 |
| cta | 4 | Saturday | 0 to 95th Red Line Station, stop 2548 | amPeak | stop value | 21 | 13 |
| cta | 4 | Saturday | 0 to 95th Red Line Station, stop 2551 | amPeak | stop value | 21 | 13 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 9073 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 9076 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 9084 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 9091 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 14630 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 14632 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 15022 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 15280 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 15447 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 17212 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 17213 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 17214 | late | stop value | 25 | 40 |
| cta | 53 | Saturday | 1 to Irving Park & Keystone Terminal, stop 18577 | late | stop value | 25 | 40 |
| cta | 55 | Saturday | 0 to Midway Orange Line Station, stop 10603 | late | stop coverage | 27 | 32 |
| cta | 55 | Saturday | 0 to Midway Orange Line Station, stop 10605 | late | stop coverage | 27 | 31 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6382 | late | stop coverage | 30 | 102 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6384 | late | stop coverage | 30 | 101 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6386 | late | stop coverage | 30 | 100 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6389 | late | stop coverage | 30 | 98 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6390 | late | stop coverage | 30 | 97 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6391 | late | stop coverage | 30 | 97 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6393 | late | stop coverage | 30 | 96 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6397 | late | stop coverage | 30 | 94 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6399 | late | stop coverage | 30 | 93 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6400 | late | stop coverage | 30 | 92 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6402 | late | stop coverage | 30 | 91 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6405 | late | stop coverage | 30 | 89 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 6861 | late | stop coverage | 30 | 103 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 14849 | late | stop coverage | 30 | 90 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 15955 | late | stop coverage | 30 | 99 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 16186 | late | stop coverage | 30 | 104 |
| cta | 60 | Saturday | 0 to Cicero & 24th Place Terminal, stop 17269 | late | stop coverage | 30 | 105 |
| cta | 60 | Saturday | 1 to Harbor Drive & Randolph, stop 200 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Harbor Drive & Randolph, stop 201 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Harbor Drive & Randolph, stop 6346 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Harbor Drive & Randolph, stop 6347 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Harbor Drive & Randolph, stop 18661 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Harbor Drive & Randolph, stop 6310 | overnight | stop coverage | 32 | 188 |
| cta | 60 | Saturday | 1 to Harbor Drive & Randolph, stop 6312 | overnight | stop coverage | 32 | 189 |
| cta | 60 | Saturday | 1 to Washington & State, stop 200 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Washington & State, stop 201 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Washington & State, stop 6346 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Washington & State, stop 6347 | late | stop value | 29 | 46 |
| cta | 60 | Saturday | 1 to Washington & State, stop 18661 | late | stop value | 29 | 46 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4381 | late | stop value | 19 | 30 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4382 | late | stop value | 19 | 30 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4383 | late | stop value | 19 | 30 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4384 | late | stop value | 19 | 30 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4386 | late | stop value | 19 | 30 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4389 | late | stop value | 19 | 30 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4392 | late | stop value | 19 | 30 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4393 | late | stop value | 19 | 30 |
| cta | 62 | Saturday | 1 to State & Marina City, stop 4394 | late | stop value | 19 | 30 |

(5148 more not shown; rerun with --cap=N)

## Changes on drt route 900 (18)

| Agency | Route | Day | Where | Period | Kind | Before | After |
|---|---|---|---|---|---|---|---|
| drt | 900 | Weekday | 1 to Centennial Circle, stop 1602 | pmPeak | stop value | 24 | 11 |
| drt | 900 | Weekday | 1 to Centennial Circle, stop 1602 | pmPeak | stop coverage | 24 | 18 |
| drt | 900 | Weekday | 1 to Pickering Parkway Terminal, stop 1602 | pmPeak | stop value | 24 | 11 |
| drt | 900 | Weekday | 1 to Pickering Parkway Terminal, stop 1602 | pmPeak | stop coverage | 24 | 18 |
| drt | 900 | Weekday | 0 to Ritson, stop 412 | evening | stop value | 15 | 24 |
| drt | 900 | Weekday | 0 to Ritson, stop 413 | evening | stop value | 15 | 24 |
| drt | 900 | Weekday | 0 to Ritson, stop 434 | evening | stop value | 15 | 24 |
| drt | 900 | Weekday | 0 to Ritson, stop 1181 | evening | stop value | 15 | 24 |
| drt | 900 | Weekday | 0 to Ritson, stop 2220 | evening | stop value | 15 | 24 |
| drt | 900 | Weekday | 0 to Ritson, stop 2221 | evening | stop value | 15 | 24 |
| drt | 900 | Weekday | 0 to Ritson, stop 93747 | evening | stop value | 15 | 24 |
| drt | 900 | Weekday | 0 to Ritson, stop 412 | evening | stop coverage | 24 | 26 |
| drt | 900 | Weekday | 0 to Ritson, stop 413 | evening | stop coverage | 24 | 26 |
| drt | 900 | Weekday | 0 to Ritson, stop 434 | evening | stop coverage | 24 | 26 |
| drt | 900 | Weekday | 0 to Ritson, stop 1181 | evening | stop coverage | 24 | 26 |
| drt | 900 | Weekday | 0 to Ritson, stop 2220 | evening | stop coverage | 24 | 26 |
| drt | 900 | Weekday | 0 to Ritson, stop 2221 | evening | stop coverage | 24 | 26 |
| drt | 900 | Weekday | 0 to Ritson, stop 93747 | evening | stop coverage | 24 | 26 |

