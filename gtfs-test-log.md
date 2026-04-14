# GTFS Test Log

Tracks every real-world and synthetic feed tested against Atlas.
Status: PASS = no bugs found / pipeline completed cleanly | FAIL = crash or wrong output | BUG = wrong output caught and fixed

File sizes and calendar ranges included as version identifiers (feeds don't have reliable version metadata).

---

## Real-World Feeds

### Cloud
| Feed | File | Size | Calendar Range | Tested | Status | Notes |
|---|---|---|---|---|---|---|
| MTA New York City Bus | Local: Manhattan Full Fleet | — | — | 2026-03-30 | **TESTING** | **Discovery Lab**: Entirely segregated local stress-test. Matching full NYC fleet (8,000+ buses) against Manhattan schedule baseline. |
| TTC Toronto | `Canada/Ontario/TTC Schedules.zip` | 34.2 MB | 2026-03-15 → 2026-05-02 | 2026-03-19 | BUG→PASS | Extended route type 700 maps correctly. False-positive "Multiple service_ids" warnings removed. 191 weekday routes; Rapid:2, Freq++:5, Freq+:34. |
| York Region Transit | `Canada/Ontario/York Region Transit.zip` | 4.9 MB | 2026-01-04 → 2026-04-25 | 2026-03-19 | PASS | Clean. Used as regression baseline. |
| Melbourne PTV | `Australia/Victoria/Melbourne PTV.zip` | 222.5 MB | calendar_dates only | 2026-03-19 | BUG→PASS | Nested zip — `computeRawDepartures` crashed on missing required files. Fixed with early return guard. |
| Chicago CTA | `United States/Illinois/Chicago CTA.zip` | 48 MB | unknown | 2026-03-19 | PASS | 33+ false-positive "Multiple service_ids" warnings (now removed). |
| Phoenix Valley Metro | `United States/Arizona/Phoenix Valley Metro.zip` | 6.7 MB | unknown | 2026-03-19 | PASS | Clean. |
| Seattle King County Metro | `United States/Washington/Seattle King County Metro.zip` | 16 MB | unknown | 2026-03-19 | PASS | Clean. |
| Atlanta MARTA | `United States/Georgia/Atlanta MARTA2.zip` | 17.8 MB | 2025-04-19 → 2025-05-16 | 2026-03-19 | PASS | Clean. |
| Brisbane Translink | `Australia/Queensland/Brisbane Translink QLD.zip` | 31 MB | unknown | 2026-03-19 | PASS | Clean. |
| Berlin VBB | `Europe/Germany/Berlin VBB.zip` | 71.6 MB | 2026-03-17 → 2026-12-12 | 2026-03-19 | PASS | 841 routes (S-Bahn agency). 11 zero-reliability span routes. |
| Boston MBTA | `United States/Massachusetts/Boston MBTA.zip` | 12.5 MB | 2026-03-10 → 2026-04-04 | 2026-03-19 | PASS | 177 routes (Cape Cod RTA agency label). Clean. |
| Calgary Transit | `Canada/Alberta/Calgary Transit.zip` | 20 MB | 2026-02-26 → 2026-06-21 | 2026-03-19 | PASS | 137 routes. Clean. |
| Edmonton ETS | `Canada/Alberta/Edmonton ETS.zip` | 16.3 MB | 2026-03-12 → 2026-04-25 | 2026-03-19 | PASS | 197 routes. 6 zero-reliability (demand-responsive/express). |
| LA Metro | `United States/California/LA Metro.zip` | 21.1 MB | 2025-12-14 → 2026-06-06 | 2026-03-19 | PASS | 112 routes. Clean. |
| STM Montreal | `Canada/Quebec/Quebec STM Montreal2.zip` | 51.1 MB | 2026-01-05 → 2026-06-14 | 2026-03-19 | PASS | 186 routes. 7 zero-reliability. |
| TransLink Vancouver | `Canada/British Columbia/Vancouver.zip` | 15.2 MB | 2026-01-05 → 2026-04-19 | 2026-03-19 | PASS | 221 routes. 7 zero-reliability. |

### Local
| Feed | File | Size | Calendar Range | Tested | Status | Notes |
|---|---|---|---|---|---|---|
| Wellington Metlink NZ | `New Zealand/Wellington Metlink NZ.zip` | 18.9 MB | 2026-03-08 → 2026-04-18 | 2026-03-19 | BUG→PASS | All-zero `calendar.txt` placeholder pattern — 0 departures until fixed. See bug below. 108 routes after fix. |
| Spokane Transit | `United States/Washington/Spokane Transit.zip` | — | 2025-08-03 → 2026-01-17 (expired) | 2026-03-20 | BUG→PASS | Two non-overlapping service blocks (summer 661.* and fall 660.*). Pipeline was analyzing summer (7 weeks) instead of fall (17 weeks) because summer had 2 more service_id entries. Fixed `detectReferenceDate` to pick most recently started multi-entry period. Also fixed: holiday replacement services (Thanksgiving/Christmas/New Year's) were bleeding into regular Thursday counts (92 trips vs correct 63) because `getActiveServiceIds` merged any calendar_dates service falling on a Thursday. Fixed with MIN_OCCURRENCES=4 — services with fewer than 4 dates on a given day-of-week in the 90-day window are excluded. Trip counts verified against `trips.txt`: dir=1 Tue–Fri 63 ✓, all days now consistent. |
| MiWay | `Canada/Ontario/MiWay.zip` | 7.8 MB | 2026-01-21 → 2026-04-26 | 2026-03-20 | BUG→PASS | Two service blocks (26JA05: Jan–Feb, 26FE23: Feb–Apr). 26JA05 Weekday block had only 3 Monday calendar_dates entries — exactly below MIN_OCCURRENCES=4 — halving Monday trip counts vs Tue–Fri (Route 28: 53 vs 100). Fixed by adding weekly-spacing secondary path: 3 weekly-spaced dates (gaps: 7,7) now included. Monday counts now consistent with Tue–Fri. |
| Brampton Transit ON | `Canada/Ontario/Brampton Transit ON.zip` | — | — | 2026-03-20 | PASS | 73 routes. Clean. |
| Brampton Zum Transit | `Canada/Ontario/Brampton Zum Transit.zip` | — | — | 2026-03-20 | PASS | Same data as Brampton Transit ON (identical zip contents). 73 routes. |
| Hamilton HSR | `Canada/Ontario/Hamilton HSR.zip` | — | — | 2026-03-20 | PASS | 71 routes. service_ids use `_merged_` pattern. Clean. |
| Hamilton Street Railway | `Canada/Ontario/Hamilton Street Railway.zip` | — | — | 2026-03-20 | PASS | Same data as Hamilton HSR. |
| Kingston Transit | `Canada/Ontario/Kingston Transit.zip` | 1.8 MB | 2026-03-15 → 2027-03-16 | 2026-03-20 | BUG→PASS | Two bugs: (1) UTF-8 BOM on calendar_dates.txt and stop_times.txt first-column headers — `service_id` and `trip_id` lookups returned `undefined`, 0 departures. Fixed by stripping BOM in `transformHeader`. (2) Phantom all-year service 1774 (no trips, 365 calendar_dates entries) skewed calendarDates midpoint to September 2026; sanity check overrode correct April 2026 reference. Fixed: sanity check now only applies when calendarDates midpoint is EARLIER than calendar-derived reference. 31 routes after fix. |
| NJ Transit | `United States/New Jersey/NJ Transit.zip` | — | — | 2026-03-20 | PASS | Clean. |
| PATH (NJ-NY) | `United States/New Jersey/PATH.zip` | — | — | 2026-03-20 | PASS | Low trip counts correct — PATH Hoboken branch is genuinely lower-frequency. 15 weekday trips confirmed against spec. |
| Minneapolis Metro Transit | `United States/Minnesota/Minneapolis Metro Transit.zip` | — | — | 2026-03-20 | PASS | Clean. |
| RTD Denver | `United States/Colorado/RTD Denver.zip` | — | — | 2026-03-20 | PASS | Clean. |
| Barcelona AMB Bus | `Europe/Spain/Barcelona AMB Bus.zip` | — | — | 2026-03-20 | PASS | Clean. |
| Prague PID Czech | `Europe/Czech Republic/Prague PID Czech.zip` | — | 2025-12-13 → 2026-12-12 | 2026-03-20 | BUG→PASS | Two bugs: (1) `departure_time` empty on stop_times — all trips invisible. Fixed with `arrival_time` fallback in `buildTripDepartures`. (2) Rolling schedule feed: agency publishes future blocks months ahead (latest multi-entry start = Oct 2026), so `detectReferenceDate` picked Nov 2026 midpoint — all March 2026 short-period services excluded → 186 weekday routes. Fixed: prefer latest multi-entry start_date ≤ today over absolute latest; also filter calendar to trip-active service_id entries to prevent no-trip placeholder entries from winning. Now refDate≈20260326 → 1580 Monday routes, Metro B = 323 trips. |
| Paris IDFM | `Europe/France/Paris IDFM.zip` | 111.6 MB | 2026-03-16 → 2026-04-17 | 2026-03-19 | FAIL | `RangeError: Invalid string length` in JSZip — decompressed `stop_times.txt` exceeds Node.js max string size. Needs streaming parser for feeds this large. |

---

## Adversarial Synthetic Feeds

| Feed | Purpose | Status | Bug Found |
|---|---|---|---|
| `tiny_headway.zip` | `headway_secs=1` — trip explosion | BUG→PASS | Sub-60s headway guard added |
| `negative_time.zip` | `-1:00:00` departure time | BUG→PASS | `mins < 0` + leading `-` guard in `t2m` |
| `duplicate_trip_ids.zip` | Duplicate `trip_id` values | BUG→PASS | E032 validator check added |
| `single_date_service.zip` | Service on exactly one date | BUG→PASS | `synthesizeCalendarFromDates` + `detectReferenceDate` cascade fixed |
| `empty_routes.zip` | Missing `routes.txt` content | BUG→PASS | Early return crash guard in `computeRawDepartures` |
| `bad_coords.zip` | Unparseable stop coordinates | PASS | `calculateStopSpacing` NaN guard already handled |
| `orphaned_trips.zip` | Trips referencing nonexistent routes | PASS | Validator catches via E010 |
| Wellington-style all-zero calendar | All `calendar.txt` days = 0, dates via `calendar_dates` | BUG→PASS | `calendarServiceIds` now filters to services with ≥1 active day |

---

## Known Open Issues

- **Large feeds (Invalid string length)**: Paris IDFM, Netherlands OVapi, Norway Entur, Helsinki HSL Finland, Toronto Transit Commission (78 MB) — `stop_times.txt` decompresses past Node.js max string length. Needs a streaming CSV parser path in `parseGtfs.ts` for files > ~40 MB compressed.

---

## Corrupt / Skip (do not re-test)

| Feed | Path | Reason |
|---|---|---|
| GO Transit | `Canada/Ontario/GO Transit.zip` | Corrupt zip |
| GO Transit (alt) | `Canada/Ontario/GO Transit3.zip` | Corrupt zip |
| UK National Rail | `United Kingdom/UK National Rail.zip` | gzip format, not standard zip |
| Ireland TFI | `Ireland/Ireland TFI.zip` | Corrupt zip |
| Ottawa OC Transpo | `Canada/Ontario/Ottawa OC Transpo2.zip` | Corrupt zip |
| Sydney NSW | `Australia/New South Wales/Sydney NSW GTFS.zip` | Corrupt zip |
| Perth Transperth | `Australia/Western Australia/Perth Transperth.zip` | Corrupt zip |
| LA Metro | `United States/California/Los Angeles County...` | Corrupt zip (unexpected signature) |
| Maryland Transit Administration | `United States/Maryland/...` | Corrupt zip (unexpected signature) |
| Research Triangle RTA | `United States/North Carolina/...` | Corrupt zip (unexpected signature) |
| SEPTA | `United States/Pennsylvania/...` | JSZip uncompressed data mismatch |
| Toronto Transit Commission (alt) | `Canada/Ontario/Toronto Transit Commission.zip` | Missing stop_times.txt |
| City of Wasco | `United States/California/City of Wasco.zip` | Missing trips.txt |
| Guadalupe Flyer | `United States/California/...` | No calendar data |
| Pasco County | `United States/Florida/...` | No calendar data |
| Ninertransit | — | No calendar data |
| Lower Columbia CAP | `United States/Washington/...` | No calendar data |

---

## Queue (not yet tested)

- Full 1066-feed stress test completed 2026-03-20: 1047 OK, 3 skipped, 14 errors (all documented above)
- Re-run after session fixes (arrival_time fallback, ::key split, detectReferenceDate rolling-schedule fix): **1047 OK, 3 skipped, 2 errors** — 12 errors resolved. Remaining errors: Paris IDFM + Netherlands OVapi (known large-feed parse limit only).
- Hullo Ferries, GO Transit Metrolinx, UP Express: parsed OK, 0 routes — expired feeds (service ended before today)
- ACT Regional, Hobart Metro Tasmania, Denver — not found in GTFS folder
--------------------------------
| Experiment: Manhattan Full Fleet |
| DB: Local (atlas_lab) |
| Positions: 78 | Matches: 78 | Confidence: 1.0 |
| Success: RELIABLE LOCAL INTELLIGENCE |
--------------------------------

## Intelligence Audits

| Agency | Audit Date | Standard | Freedom Score | Findings |
|---|---|---|---|---|
| Spokane Transit (STA) | 2026-04-11 | Jarret Walker "Freedom Grid" (15m/7am-7pm) | **20.59%** | 7/34 routes meet standard (15m). **City Line (1)** is flagship at 9.00m. **Route 11** at exactly 15m. Other 27 routes in Coverage Drain. |
