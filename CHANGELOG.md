# Changelog

All notable changes to this project will be documented in this file.

See [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md) for earlier history.

## [Unreleased]

- **Routes remain clickable while Live Vehicles is open**: the normal route layers stay visible beneath live vehicle markers so users can open route details from the map.
- **Live route cards now follow the static route-card layout**: destinations and route identity lead the card, with vehicle status and speed treated as supporting live details.
- **Live vehicle directions now fill from static route shapes when feeds omit them**: TTC, Edmonton, and Halifax vehicles can show a destination or direction when their realtime metadata is incomplete, while ambiguous matches remain unlabeled.
- **Live rail coverage prepared for SF Muni and LA Metro**: added vehicles-only polling for Muni Metro and all six current LA Metro rail lines, with each provider's route filtering and API-key contract.
- **Fixed reference-date detection for feeds with recurring multi-year holiday exceptions**: Emery Go-Round had real, current shape data but published zero routes. The reference-date heuristic's calendarDates sanity-check treats a tight cluster of exception dates as the true service window (the Foothill Transit pattern) — but Emery Go-Round's calendar_dates.txt recorded the same Dec 24/31 holiday closure across three separate years, and averaging across a 3-year span landed the "reference date" a full year in the past, excluding every active trip. The override now only applies when the exception dates themselves span under a year.
- **Searching a city name now actually moves the map**: Typing a place like "Denver" found matching agencies/routes/stops but the map never moved. Root cause: the fly-to only fired when the query uniquely matched exactly one agency, which silently fails for any city served by more than one operator (Denver alone has RTD Denver and Bustang). Search now checks for an exact city-name match first, independent of how many agencies serve it, so the map reliably flies to a typed place.
- **Fixed 5 agencies pointing at completely wrong GTFS feeds**: The COMET, GreenLink, CARTA (Chattanooga), Sun Tran, and YCAT had the wrong Mobility Database feed ID configured — each was actually downloading and publishing a different, unrelated agency's data (Bay Area shuttle systems, Flagstaff's NAIPTA, and a Paso Robles, CA operator). Corrected each `feedUrl` to the real agency's current feed, reprocessed, and rebuilt/republished the map tiles.
- **Fixed the map getting stuck on the wrong place while typing a search**: Typing "Bellevue" could fly the map to Belleville, Ontario and leave it there — a mid-typing prefix ("Bellev") was a unique match for the unrelated Belleville Transit, and once the finished word stopped matching anything, the camera just silently stayed put. The fly-to now waits for typing to pause before evaluating, so a fast-typed word no longer gets stuck on an accidental partial match.
- **Removed duplicate Wave Transit entry**: `wave-transit` and `wilmington-nc` were the same real agency (Wilmington, NC) under two slugs. The `wave-transit` entry's feed was stale (last updated Feb 2024) and had essentially no processed stop data; `wilmington-nc` is the healthy, actively-refreshed one and is now the only entry.
- **Agencies and search now know which cities they actually serve, derived from real stop data**: Regional agencies (King County Metro, Sound Transit, SEPTA, WMATA, and 400 others) previously had at most one hand-picked city attached, so searching a city they genuinely serve but weren't tagged with (e.g. "Bellevue" for King County Metro) found nothing. Each agency's stop coordinates are now matched against a North America city gazetteer to derive up to 10 cities it actually serves, ranked by stop density — search matches against the full list, not just the display name. Also caught 5 agencies (COMET, GreenLink, CARTA Chattanooga, Sun Tran, YCAT) whose published stop data was actually a different, unrelated agency's feed — tracked separately for a data fix.
- **Bare/branded agency names now show their city in the agencies list**: Metra, TriMet, WMATA, MARTA, SEPTA, Sound Transit, GoTriangle, and ~45 other agencies with brand-only names (no city or region in the name itself) were indistinguishable from other agencies once grouped only by state/province. Added the existing `"(City)"` name-suffix convention to each, which the agencies list already renders as a subtitle.
- **Abbreviated agency names now keep their place instead of dropping it**: AVTA, GET, MTD, VTA, BART, and other long-legal-name agencies collapsed straight to a bare acronym with no city — losing the disambiguating info entirely (two unrelated agencies both landing on "GET" with nothing to tell them apart). The place buried in the legal name is now recovered and shown alongside the acronym.
- **Agencies list no longer needlessly abbreviates names that fit**: Edmonton Transit Service, Sonoma County Transit, Suffolk County Transit, and a handful of others were collapsing to a bare acronym (ETS, SCT, ...) even though the full name fit the row fine. Now only names that are genuinely too long, or a small set of acronyms more recognizable than their expansion (BART), get shortened.
- **Map tile fetches now retry on rate-limit/server errors**: A single 429 or 5xx from R2 on any map tile request used to fail silently with no retry, which could blank out the whole map until a manual page reload. Now retries with backoff, matching how the backend pipeline already handles this.
- **Fixed two agencies with no routes at all**: Dutchess County Public Transit and Fredericksburg Regional Transit had real, valid GTFS data but published zero route features. Dutchess: the reference-date picker preferred a near-empty 2-trip placeholder block over the real 585-trip dominant service just because it started later. Fredericksburg: route shape selection only considered Monday/Saturday/Sunday, silently dropping the agency's actual Tuesday–Friday-only service. Both now publish real routes (62 and 16 respectively).
- **Routes/coverage badge now fades instead of disappearing instantly** when switching out of the map view (e.g. into Fares).
- **PMTiles coverage check false positives fixed**: The sparse 9-point sampling grid could miss real route geometry for agencies with only a few routes clustered in part of their bbox (confirmed on Laredo, Siskiyou, Lassen — all render correctly on the map, the checker just wasn't looking in the right tiles). Now samples every tile in an agency's bbox up to a cap, instead of fixed corner/edge points.
- **Laredo (El Metro) location data corrected**: `center` was off by over a degree (pointed south of the actual service area) and had no `bbox`, which was also the root cause of the false-positive coverage failure above.
- **Duplicate agency removed**: Grand Valley Transit (Mesa County, CO) was listed twice under different slugs, pointing at the same feed — removed the less complete duplicate.
- **Continent specialty agencies**: Added JFK AirTrain, Staten Island Ferry, NYC Ferry, Roosevelt Island Tramway, Guadalajara Mi Transporte, Cheyenne Transit Program, Rapid Transit System (Rapid City), and Sioux City Transit — NYC water/airport specialties, first Mexico coverage, first Wyoming agency, and Iowa/Nebraska border.
- **Seattle specialty agencies**: Added Seattle Center Monorail and Snoqualmie Valley Transportation (SVT). Seattle Streetcar is configured but still pending — its feed is King County Metro's full multi-agency GTFS and needs agency-scoped filtering the pipeline doesn't support yet (#214), so it won't appear on the map until that's built.
- **PMTiles builds**: Retry throttled R2 artifact downloads, refuse incomplete uploads (with an explicit opt-out for agencies still pending their first data publish), and fall back to rclone when Node's large-file R2 transport fails.
- **Map rendering gaps closed**: Rebuilt and republished the map tiles, fixing dozens of agencies (including GTrans, CTA, Metra, MARTA, Metrolink, and most of the LA/Southern California additions) that had correct data in search and the sidebar but drew nothing on the map — the aggregate tile file had gone stale relative to the agency data. A small number of agencies still have real gaps under investigation (tracked separately, not a tile-staleness issue).
- **SoCal secondary agencies**: Added Imperial Valley Transit, Kern Transit, Banning Connect, Beaumont Transit, Corona Cruiser, Thousand Oaks Transit, Simi Valley Transit, Camarillo Area Transit, Basin Transit (Morongo Basin), Needles Area Transit, Arvin Transit, Moorpark City Transit, Valley Express, Laguna Beach Transit, and Taft Area Transit — fills major IE / Imperial / Kern / Ventura / high-desert / OC city gaps outside the big regionals.
- **Southern California coverage**: Added Torrance Transit, Beach Cities Transit, Carson Circuit, and Gold Coast Transit District, repaired Metrolink's missing trip-to-shape links, and expanded SunLine bounds so regional Route 10 appears through San Bernardino.
- **Limited-service route branches**: Keep clustered short-turn schedule gaps out of normal route-card and route-list headways so sparse service is not presented as frequent service.
- **Recent searches**: Picking a route from search results now also saves the query to Recent searches (previously only Recent routes updated), so Recent searches no longer shows a stale, older query after a route pick.
- **PMTiles coverage check**: New `npm run verify-pmtiles-coverage` compares every agency in `index.json` against the deployed PMTiles and fails loudly on any agency with zero route features rendered — catches a `build-pmtiles`/upload step that was silently skipped (confirmed 43 agencies affected, including GTrans, CTA, Metra, MARTA, and Metrolink, all present in search/sidebar with real data but invisible on the map).
- **Live vehicle API types**: Keep the no-TTC shape fallback typed like the TTC shape map so API typechecking succeeds for all agencies.
- **Live Vehicles resilience**: Bound optional archive, shape, and sidecar lookups so a stalled enrichment request cannot make the live feed endpoint time out.
- **Search typing lag**: Keep the search field on immediate local state and defer full route/stop scans (plus cache geometry bboxes) so keystrokes paint without waiting for multi-agency search work.
- **LA Metro rail**: Ingest the separate Metro Rail GTFS as a supplemental feed so A/B/C/D/E/K lines appear with bus, not bus-only mdb-29.
- **Agency list headways**: Agency card route rows use the same list display cadence as Recent/Suggested (best active-period destination headway across branches), not a filter-oriented min-stop value.
- **Near You / period headways**: When a period summary is explicitly null (no service), stop falling through to raw hourly mins that can be bunching spikes (e.g. "every 2 min" overnight).
- **Route-service metrics**: Keep route lists, nearby/transfer cards, route grouping, stop service, and live scheduled comparisons on the active period’s canonical display cadence instead of stale day, branch, or all-day values.
- **Route suggestion hierarchy**: Reduced stacked dividers in Recent and Suggested routes so section spacing carries more of the grouping.
- **Map selection hint**: Align the zoom-in notice with the bottom map status pills so it reads as part of the same map chrome.
- **Map zoom controls**: Added +/- buttons for zooming the map, since scroll/pinch was the only way to zoom before.
- **TTC streetcar live gap status**: Fixed shape-matching that silently degraded to "no data" on routes with multiple branch/diversion shapes — position projection now interpolates along the nearest segment instead of snapping to the nearest vertex, and picks whichever shape candidate vehicles actually match instead of assuming the longest one.
- **Live Vehicles list dividers**: Vehicle and route rows now use the lighter spacing already applied to the agency picker, instead of a heavy border on every row.
- **Live feed errors**: "Feed unavailable" now shows the actual reason (timed out, unreachable, unreadable data) and which agency, instead of one generic message for everything. A feed that's been down for multiple retries in a row says so instead of implying it'll definitely recover. A partial failure (trip delay data down but positions still working) no longer degrades silently.
- **Recently seen at this stop (TTC)**: The stop card's live section now also shows recently observed passages from GPS position history, alongside the predicted arrivals — "what actually happened" next to "what the feed predicts."
- **Map cursor**: Hovering a clickable stop or route now shows a pointer instead of the default cursor.
- **Map control spacing**: Tightened the gap between the zoom buttons and the locate button to match the spacing already used elsewhere in the same corner.
- **Search suggestions dividers**: "Recent searches" was the only section header with its own trailing divider, so a single recent search read as boxed in between two lines close together. All section dividers now come from the same side (leading, above the next header) and are inset from the panel edges instead of full-width.
- **Recent search text weight**: A recent search query was rendered at the heaviest available weight, heavier than even route codes in the same panel. Brought down a step to match its role as a label, not a code.
- **Agency search results**: Search and the agency card now use the same name/place logic as the agency browse list — a place shows next to the name only when the name doesn't already say it, instead of repeating the same region on every row (searching "California" no longer shows "California" 78 times in a row).
- **Agency name mislabeling**: Any agency whose name contains "Municipal" or "Community" (e.g. Gardena Municipal Bus Lines) was mislabeled "SFMTA" in route search results — a substring check meant to catch San Francisco's "Muni" brand matched "muni" inside unrelated words. Every short bare-acronym check in the same function (VTA, BART, MBTA, and others) had the identical risk and is now fixed the same way, plus "DDOT (Detroit)" and "QLine (Detroit)" no longer both collapse to their shared city name. A regression test now checks all 438 real agencies for this class of bug automatically.

## [3.2.5] - 2026-07-16

- **Live provider compatibility**: Normalize compact archived GTFS-RT records so downstream consumers receive the documented Atlas contract.

## [3.2.4] - 2026-07-15

- **Live replay build compatibility**: Fixed the Node-handler URL parsing type so the replay API builds successfully in Vercel.

## [3.2.3] - 2026-07-15

- **Live provider response handling**: Atlas canary snapshot and replay endpoints now return correctly through Vercel’s Node function interface.

## [3.2.2] - 2026-07-15

- **Feed data-quality review**: Agencies with repeated GTFS problems now get a temporary verification notice when a new feed arrives, without carrying old feed-specific corrections forward.
- **Live provider runtime compatibility**: Fixed canary snapshot and replay APIs failing on Vercel’s Node-style request headers.
- **Live provider response handling**: Updated canary snapshot and replay APIs to write responses through Vercel’s Node function interface.

## [3.2.1] - 2026-07-15

- **Canary live-data contract**: Atlas R2 GTFS-RT snapshots now carry a versioned normalized envelope, and TTC trip updates join the existing canary archive without expanding route coverage. Vehicle snapshots retain operational fields needed by downstream consumers.
- **Canary snapshot API**: Added an R2-backed `/api/live-snapshot` endpoint with versioned records, route filtering, freshness states, and explicit unavailable responses for downstream consumers.
- **Canary snapshot lookup**: Paginated live R2 listings so the latest snapshot remains discoverable after a high-volume day.
- **Canary replay API**: Added bounded `/api/live-replay` access so downstream consumers can validate the existing cohort against historical Atlas snapshots without private R2 access.
- **Replay pagination**: Added deterministic `offset`/`limit` paging for ranges containing more snapshots than one response.
- **Canary verification command**: Added `npm run verify:live-contract` to check deployed snapshot freshness, schema, and replay availability before coverage expansion.
- Give route search names more room so long route destinations are easier to scan.
- Stack route metadata below the route name so agencies and frequencies remain readable.
- Exclude malformed Niagara 209/216 short-turn records so published route frequencies are not overstated.
- Link corrected-data explanations to their technical GitHub issue for deeper context.
- Keep Niagara’s daytime and nighttime route numbers separate so their frequencies are not combined.
- Scope stop-level headways to each route branch so shared stops do not make routes appear more frequent than scheduled.
### Fixed
- **Live vehicle feed**: Restored the Live map on Vercel by handling its Node-style request headers in the serverless API.
- **Live agency picker**: Replaced heavy row dividers with lighter spacing so the coverage list reads as grouped places.
- **Corridors mode**: Restored the From/To station panel so the Corridors header button opens a usable route comparison experience.
- **Stop search results**: Made stop names the primary readable label, moving stop codes and agency metadata below and beside them.
- **Place search navigation**: Agency results now move the map immediately, even while map layers are still initializing.
- **Header controls**: Kept Live and Corridors beside Search as a single left-side group, separate from the Filters controls.
- **Corridors navigation**: Hid the unclear network-analysis mode from primary navigation while preserving the underlying tool for future refinement.
- **Header spacing**: Kept Live immediately beside Search instead of letting the flexible search group push it toward the Filters controls.
- **Search navigation**: Unique city and agency queries now move the map automatically while keeping route and stop results available.
- **Search result layout**: Reduced divider noise and constrained metadata so route and stop results remain readable on narrow screens.
- **Search results redesign**: Unified in-area and elsewhere results into one ranked list, standardized the visible cap at 10, and added a shared Show more results control.

## [3.2.0] - 2026-07-14

### Added
- **Secondary cities batch (+13)**: Sioux Falls SAM, Wilmington Wave, Yakima, Grand Forks CAT, St. George SunTran, Grand Valley Transit, Greeley-Evans GET, Greater Bridgeport Transit, Davenport CitiBus, Bettendorf Transit, Dubuque The Jule, Pocatello Regional Transit, and Albany GA Transit — fills midsize metro holes (incl. first SD coverage).
- **Santa Cruz METRO**: Added 27 routes and 754 stops covering Santa Cruz, Capitola, and Watsonville.

### Fixed
- **Route service metrics**: Route cards, filters, sparklines, shared sections, stop panels, and live scheduled comparisons now project named metrics from one canonical route service summary, preventing conflicting headways across surfaces.
- **Route panel identity consistency**: Agency cards, selected routes, stop panels, nearby routes, and disambiguation now use the shared route-facts identity and display fallbacks.
- **Route identity consistency**: Search, Recent routes, and route suggestions now derive route names, agency identity, and keys from one shared route-facts record.
- **Route search recents**: Selecting a route now records it only in Recent routes, where its shared route metadata provides the name and agency consistently.
- **University / campus-adjacent systems (+10)**: U-M Transit, NCSU Wolfline, Clemson CATbus, CityBus Lafayette, Duke Transit, Streamline (Bozeman), Athens OH, Connect Transit (Bloomington–Normal), DeKalb Public Transit, and Radford Transit — public fixed-route feeds with working GTFS.
- **Frequency audit reproducibility**: The scheduled-frequency audit now accepts a configurable GTFS directory and seed so findings can be rerun consistently.
- **Variant shared sections**: Selecting a lettered route family now highlights only that family’s combined corridor segments on the map.
- **Sparse route sparklines**: Hourly headway points now require three departures, preventing isolated departure clusters from appearing as frequent service.
- **Stop churn visibility**: Weekly refreshes now log agency stop additions, removals, renames, moves, and route-membership changes against the prior snapshot.
- **Branched route sparklines**: Route cards now show labeled, stacked branch contributions when branches combine into more frequent shared-section service.
- **TTC vehicle status**: TTC vehicles now show an observed headway gap instead of “No data” when the feed cannot be joined to scheduled trips.
- **LRT filter parity**: Map rendering now applies the same Minneapolis METRO LRT classification as the sidebar.
- **City search aliases**: Searches now surface agencies by known city names even when the agency's display name is an acronym or legal name without the city.
- **LRT mode classification**: Recognized route_type=0 rail feeds across Calgary, Edmonton, Los Angeles, Phoenix, San Diego, Minneapolis, and Montreal so their rail lines no longer appear as streetcars.
- **Responsive search bar**: The header search field now uses available space in medium-width browser windows instead of staying at a narrow fixed width.
- **Agency mode labels**: Agency cards now distinguish streetcars from virtual LRT routes instead of showing both as “Light Rail.”
- **Headway consistency**: Agency cards and Near You now use the same active-period route headway shown on route cards instead of filter-oriented minimum-stop values.
- **Recent route headways**: Recent routes now matches the active-period headway shown on the route card instead of retaining an all-day value.

## [3.1.1] — 2026-07-13

### Added
- **Security Policy (`SECURITY.md`)**: Added a standard vulnerability disclosure policy pointing to `ryan@ryanisnota.pro`.

### Changed
- **API Rate Limiting**: Added in-memory rate limiting to `/api/live-vehicles` and `/api/history-adherence` serverless endpoints to protect against client hammering and reduce R2/upstream fetch costs.

## [3.1.0] — 2026-07-11

### Added
- **Public agency directory (`atlas/agencies.json`)**: `refresh.ts` now publishes a small read-only agency index (slug, name, region, center, bbox — no `feedUrl`/pipeline-internal fields) alongside the per-agency artifacts. Lets external consumers discover an agency's slug instead of hardcoding a per-agency map (the gap that blocked Transit-Stats#152's "multi-agency for free" plan). New `pipeline/agencyIndex.ts` + 4 unit tests. Staged agencies excluded.
- **TERMS.md**: basic terms of service — acceptable use / anti-scraping clause, and an accurate disclosure that the only location data Atlas ever touches is the optional client-side "locate me" button (never sent to or stored on any server). Self-drafted starting point, not a substitute for legal review.
- **Stop search in main search bar ([#162](https://github.com/Civic-Minds/Atlas/issues/162))**: Users can now search for stops by name or stop code in the main search bar. Typing a stop name or code displays the matching stops in the search panel (grouped by in-area vs elsewhere, showing the serving routes and agency), and selecting a stop flies the map to that stop's location and opens its StopCard.
- **Per-stop metadata export (`atlas/{slug}-stops-meta.json`)**: the pipeline now derives stop-level facts from each feed — routes served (stop_times→trips→routes join) and direction of travel (headsign-prefix majority, asserted only at ≥90% agreement, vetoed by contradicting side-of-street name suffixes) — and publishes them to R2 alongside the existing artifacts. Official stop names are exported verbatim; the file is a read-only facts layer for external consumers (first consumer: Transit Stats stop resolution). New `pipeline/stopsMeta.ts` + 9 unit tests; URL derivable via `getAgencyArtifactUrls().stopsMetaUrl`. This was implemented but never actually published — `atlas/ttc-stops-meta.json` 404'd on R2 until today. Published for real now (9,378 stops, 1.33 MB) via a new scoped one-off (`scripts/publish-stops-meta-only.ts`) that derives and uploads only this artifact from a local GTFS copy, without touching the fresher (July 6) live geojson/route data a full reprocess would have overwritten. Closes Civic-Minds/Atlas#161.
- **Live headway on route cards**: Live route cards now show "Every ~X min · scheduled every Y min" — observed headway computed from gaps between predicted arrivals across all stops, compared against the frequency data for the current day and hour. Answers "is the promised frequency actually being delivered right now?"
- **Per-vehicle speed in Live**: the live API now surfaces GTFS-RT speed (km/h) and per-vehicle timestamps; vehicle rows show current speed. Groundwork for corridor speed analysis.
- **TTC streetcar position archive**: the GTFS-RT archiver Worker now snapshots streetcar positions (id, route, lat/lon, speed, bearing) every minute to R2 (`positions/ttc/`), 30-day retention — sampling must sit well under the ~5-min headway to capture gaps and bunching. Trip-delay archiving stays at 5-minute cadence. Enables "how slow are streetcars, by route and hour" analysis. Protobuf parser extended to decode floats.
- **Lettered route variant grouping**: variant families (GRTC-style 1/1A/1B/1C) are treated as one route — the route card folds all variants' branches into the destinations list and notes the combined frequency on shared sections. Conservative detection: numeric base + single letter, same agency, 2+ members.
- **Streetcar speed analysis script**: `scripts/streetcar-speeds.ts` computes measured commercial speed (stops included) by route and hour from the position archive. First data: 504 King averages 6.7 km/h midafternoon.
- **Measured headway analysis script**: `scripts/streetcar-headways.ts` reconstructs delivered headways (bunching and holes included) by projecting archived positions onto route shapes and timing midpoint crossings per direction.
- **Live arrivals on stop cards**: stops served by live-capable agencies show a "Live at this stop" section — next predicted arrivals plus the current observed gap ("Coming every ~7 min right now") via a new `/api/live-stop` endpoint.
- **Full TTC streetcar network on Live Vehicles**: all 10 streetcar routes (501–512) now show on the Live map via a new `vehiclesOnly` config tier — no anchor-stop curation needed. Delay badges work from the TTC's explicit per-stop delay values. Adherence card and History remain scoped to fully configured routes.
- **Tier 1–2 coverage**: Springfield MO (City Utilities), Evansville METS, Kenosha Area Transit; Brownsville Metro processed to R2. Tier 1–2 backlog exhausted for public GTFS.
- **Fixed-route batch (+24)**: Ben Franklin, Asheville, Bloomington, Athens ACC + UGA, Blacksburg, CATA State College, CyRide/Iowa City/Coralville/CAMBUS, Lawrence–KU, SMTD Springfield IL, Topeka, BARTA, COAST NH, Advance Transit, CCTA/GMT + Marble Valley VT, Bis-Man, Bangor, Brandon MB, Juneau, Annapolis. Fills college-town frequency + VT/NH holes.
- **Northern Canada**: Yellowknife Transit (NWT) and Whitehorse Transit (Yukon).

### Changed
- **Search results polish**: hovering a result spotlights that route on the map (others fade); truncated headers read "showing 10 of N" instead of a bare match count; lettered variant families collapse to one row ("1 · 4 variants") unless a specific variant is typed.
- **Agency card filter split**: drop redundant “Matching your filters” all-caps header — the outside-filters notice is enough.
- **Pittsburgh branding**: Port Authority of Allegheny County → Pittsburgh Regional Transit (PRT); slug unchanged.
- **Browse filter chips**: selected All/Live/History/region chips use a clear dark border + stronger fill (still not solid black pills) so active state is obvious.
- **Browse agency long names**: legal names + brand codes show the short callsign (BART, SFMTA, ETS); remaining long primaries compact via `shortenAgencyName`; full registry name on hover `title`.
- **Shared card notices**: outdated / corrected / outside-filters copy all go through `CardHelpNotice` + style tokens (`CARD_NOTICE`, `CARD_NOTICE_ACTION`, `CARD_NOTICE_FOOTER`, `CARD_NOTICE_INLINE`).
- **Outside-filters routes control**: “N more routes (outside filters)” now matches the schedule help-notice style (sentence case + Show/Hide →) instead of a loud uppercase section label.
- **Agency list label standard**: dark = agency name; light = place/sector only when not already in the name. Acronyms never as secondary (`Edmonton Transit Service (ETS)` → `Edmonton Transit Service`; `BC Transit (Kelowna)` → `BC Transit · Kelowna`). Registry name for Edmonton set to full “Edmonton Transit Service (ETS)”.
- **exo sector labels**: Six Quebec exo feeds no longer share the bare name “exo” — labeled by sector (Trains, La Presqu’île, Sud-Ouest, Le Richelain–Roussillon, Laurentides, Terrebonne-Mascouche) so browse/search can tell them apart.
- **Browse agencies sort**: Region sections and agencies within them are A–Z (was raw `index.json` order, so Ontario always led).
- **Info panel subpage header**: Back is arrow-only; page title sits beside it (not on the button) so “Agencies” reads as the current page, not a back destination. Browse title is “Agencies” not “Data”.
- **Browse agencies chips/badges**: Live/History badges and selected filter chips use subtle grey tokens (`accent-bg` / `bg-btn`) instead of solid near-black pills.
- **Region multi-select**: Browse agencies location chips (province/state) can be multi-selected — e.g. Alberta + British Columbia together. Empty selection still means all regions.
- **Agency list labels**: Browse/filter lists render `Name (qualifier)` as `Name · qualifier` (e.g. `BC Transit · Kelowna`, `MiWay · Mississauga`) so place vs acronym parentheses share one pattern; long legal names collapse to the short brand (BART, SFMTA).
- **Agency list scrollbar**: Browse agencies scrolls only the list — search and filter chips stay fixed so the scrollbar no longer runs beside them.
- **Live Vehicles empty state**: Replaced the dead-end "Zoom in to start tracking" message (and the static city chips) with a clickable list of live-enabled places — clicking one flies the map to that agency and starts tracking immediately.
- **Day filter chip indicator**: Always show the active dot indicator on the Day filter chip to reflect that a day-of-service filter is consistently active (Weekday/Saturday/Sunday).
- **InfoPanel layout**: Restored the "Feedback" header in the Info panel above the "Send feedback" button.
- **Stop card routes resolution ([#163](https://github.com/Civic-Minds/Atlas/issues/163))**: Extracted the routes serving a stop directly from the stop-level properties (`routesByAgency` populated in the single-pass stop scanner) instead of performing a fragile double-scan GeoJSON join over all map-rendering features.
- **MapCanvas split into layer hooks**: corridor, history, and live-vehicle overlay effects extracted to `src/components/Interval/map/` hooks (~360 lines out of MapCanvas); dead marker refs removed.

### Fixed
- **Stop card directions ([#164](https://github.com/Civic-Minds/Atlas/issues/164))**: Derived and stamped stop direction of travel (majority prefix/suffix from stops-meta) onto the exported stops GeoJSON features in the pipeline (`process-core.ts`), and updated the StopCard UI to append the direction suffix to the title (e.g. "Spadina/Dundas — Northbound").
- **Dismiss search panel on outside click ([#138](https://github.com/Civic-Minds/Atlas/issues/138))**: Added a document-wide `mousedown` event listener to blur the search input and dismiss the search results/suggestions dropdown when clicking outside the search bar.
- **Unit tests for stats day-scoping**: Updated the `activeDay` check in `useIntervalStats.ts` stats calculation to allow features with `undefined` day properties (aligning with `passesRouteFilter`), fixing 8 failing stats unit tests.
- **Map filters were silently dead**: MapLibre rejected the routes-layer filter because legacy-syntax clauses (`['==', 'agencySlug', …]`, `['in', string, …]`) mixed with expression-syntax ones made it classify the whole filter as legacy and fail validation — so frequency, mode, day, and search filtering never applied to the map (only the sidebar). All clauses are now unambiguous expressions (`index-of` for substring matches, `['get', …]` equality). Verified: ≤10 min filter drops downtown Toronto from 115 rendered routes to 39; console filter errors gone.
- **Anchorage (and dir-1-only) sparklines**: route-card sparkline no longer hard-requires `directionId === 0`. Feeds that only encode dir 1 (People Mover 31/40/41/51, etc.) now show hourly headways.
- **Live vehicle hover tooltip**: reimplemented via manual deck picking driven by MapLibre mouse events (deck canvas stays inert, so gestures keep working); pick radius now accounts for retina displays. Tooltip shows speed and no longer hides for vehicles without delay data.
- **Streetcars labeled "Bus"**: vehicle rows now use the route's mode (route_type) — Streetcar/Train/Ferry/Bus.
- **Agencies now load on shared URLs**: opening a link to a new area loads that area's agencies immediately — previously nothing loaded until the map was panned.
- **Route count badge accuracy**: viewport membership is now geometry-verified (bbox intersection alone counted L-shaped routes that never enter the view) and scoped to the active service day (weekday-only routes no longer count on weekend views).
- **Live map pan/zoom lock**: the deck.gl vehicle canvas grabbed pointer events whenever vehicles were on screen, swallowing all map gestures. Canvas is now always inert (dots had no click behavior — only a cosmetic hover highlight is lost). With the full streetcar network this froze the map permanently in Toronto.
- **Headway filtering fallback**: derived time-period headways from hourly data (`headwayByHour`) when the selected period is not pre-computed (e.g. for `late` or `overnight` periods on older agency data runs). This prevents routes with high-frequency service from being hidden under period filters (fixes [#146](https://github.com/Civic-Minds/Atlas/issues/146)).

## [3.0.14] — 2026-07-08

### Changed
- Frequency/day/period filters now drive from URL (active view) with LS fallback for prefs. Survives refresh, shareable links, back/forward. Agencies remain LS-only.

### Fixed
- Test 'should filter by worst-direction period headway' updated for new precedence (headBy/min over worst) after RGRTA filter logic change.

## [3.0.13] — 2026-07-08

### Added
- **Pipeline override audit**: Clears `issueUrl` when upstream publishes a new GTFS file; logs when excluded routes may no longer need overrides (`excludeRouteShortNames` kept until verified).
- **Unambiguous search Enter-to-select**: Pressing Enter in the main search bar auto-selects the row when exactly one agency or route result is visible.
- **In-app Corrected Data details**: Clicking "Learn more →" on data override notices opens a dedicated in-app drawer explaining the data corrections made.
- **London Transit route names preprocessor**: Added a pipeline preprocessor transform (`synthesizeLondonRouteNames`) to dynamically extract descriptive route long names from trip headsigns for agencies like London Transit that publish redundant names.

### Changed
- **Card Help notices alignment**: Aligned styling, font size, and placement of "We corrected this data" with the outdated-schedule notice under a unified `CardHelpNotice` component.
- **History eligibility criteria**: Filtered historical data exploration to agencies meeting `agencyQualifiesForHistoryExplore` threshold.
- **Sidebar search component modularization**: Refactored `SidebarControls.tsx` to extract search suggestions and result list rendering logic into self-contained `SearchSuggestionsPanel` and `SearchResultsList` components.
- **Search result layouts**: Removed border separators between individual rows in the search suggestions and matched results panels, and removed the " — refine search" suffix from truncated labels.
- **Search results styling refinement**: Shortened agency names in the search matches list using `shortenAgencyName` and refined spacing/margin layouts between the routes and agencies categories.
- **Mobile layout refinement**: Hid Live/Corridors toggle buttons on mobile viewports to declutter the header, allowing the search bar to stretch across the full remaining screen width. Moved map filter chips (Frequency, Day, Period, Modes) to a mobile-only core filters section within the Settings panel. Hid bottom map routes count and coverage badges on mobile.
- **Branch hover debouncing**: Added an intentional 80ms delay before highlighting branches on hover, and 50ms before clearing, to completely prevent rapid layout oscillation/map flickers when positioning the mouse near row boundaries.
- **Rockford**: `excludeRouteShortNames: ["Test"]` — junk upstream route stripped at process time (Closes [#144](https://github.com/Civic-Minds/Atlas/issues/144)).
- **Rockford**: Switched `feedUrl` to official `rmtd.org/rmtdgtfs/GTFS_FILES.zip` (valid through Oct 2026); removed Test override — upstream no longer publishes that route.
- **Niagara Transit**: switched `feedUrl` to current http://68.71.24.110/gtfs/GTFSExport.zip (via transit.land; previous mdb mirror was stale 2021 data with legacy RED/BLUE).
- **Agencies**: Cascades East Transit, Mountain Transit (Big Bear Lake), RoadRUNNER Transit (Las Cruces), EZ Rider, San Angelo Transit, Brownsville Metro; Roswell/Hobbs (NM), Longview/Texarkana/Fort Bend (TX), Lake Charles/Terrebonne/Tangipahoa (LA); Space Coast, Martin County, Indian River, Collier CAT (FL).

### Fixed
- **Help notices**: single top border when "outdated schedule" + "We corrected this data" stack (no line between, e.g. Niagara).
- **Outdated schedule notice**: reworded to "This schedule may be outdated and ended Jan 9, 2021." (no brackets or em dash).
- **InfoPanel backdrop**: made non-blocking (`pointer-events-none`) + outside-click via listener so background elements (e.g. other "Learn more" buttons in cards) receive proper hover cursors and interactions while panel is open.
- **Period filter**: prefer minStopHeadwayByPeriod or headwayByPeriod over worstDirectionHeadwayByPeriod for "15 min" etc filters (so routes with good sections or headBy show even if one direction is worse; fixes RGRTA 8/16/22 etc not appearing).
- **Direction filter**: removed hard-coded directionId===0 restriction from passesRouteFilter and tileFilter (and agency list) so routes with 15min service in one direction (e.g. RGRTA 22) are visible under tight frequency+period filters. Both directions now considered; overlapping geometry accepted for accuracy.
- **Niagara Transit**: `excludeRouteShortNames: ["RED", "BLUE"]` + display name updated; no longer operates former WEGO Red (rebranded 116/216) or Blue (to Niagara Parks WEGO). Stale entries hidden via overrideNote.
- **Empty routeShortName routes** (e.g. 145): changed `routeShortName &&` guard to `!= null` in process-core.ts so stop headway loop runs; headwayByHour, stopHeadways, stopOrder etc. now compute.
- **Pipeline**: Post-merge tier refinement uses `headwayToTier()` instead of undefined `HEADWAY_TIERS`.
- **MVTA**: Agency label (`MVTA` not `VTA`); 4FUN corridor title and headsign cleanup; MOA/MSP/TS/FUN acronyms; route/stop cards skip direction dividers for simple bidirectional pairs.
- **RMTD**: `shortenAgencyName` maps Rockford Mass Transit District before generic "Mass" stripping.
- **Agency card**: Removed period from header and close button; dismiss via outside click, Escape, or map click.
- **Data override link**: Shown only when `issueUrl` is set — card stops linking after weekly refresh clears the URL while exclusions remain.
- **Stale schedule help**: Route card "Learn more" opens in-app outdated-schedule explainer instead of GitHub docs; help panel shows when Atlas last fetched the feed (`lastRefreshedAt`, backfilled from last weekly refresh for existing agencies). Expired-feed agencies get `websiteUrl` from GTFS with a "Check current schedules" link in the help panel. Next refresh countdown reads `scheduleCron` from git and `lastCompletedAt` from R2 (`atlas/feed-refresh-meta.json`, no extra commits when feeds are unchanged). Info panel **Schedule sources** view under Data; About footer shortened to one line plus refresh dates.

## [3.0.12] — 2026-07-07

### Fixed
- **Vercel deploy**: Frontend day-type imports moved to `shared/dayTypes.ts` — `types/` is `.vercelignore`d so `types/gtfs` was missing at build time.
- **Pipeline refresh**: Correct `headway-utils.ts` import path for `shared/config`.

## [3.0.11] — 2026-07-07

### Changed
- **Agency route list**: Split matching vs other routes when frequency filter is active; show filter-grade headways; header summary (`12 routes · 8 match ≤60m`); collapsed "outside filters" section.

### Fixed
- **Frequency filter vs route card** ([#143](https://github.com/Civic-Minds/Atlas/issues/143)): `worstDirectionHeadway` no longer crosses service days — weekend headways were hiding weekday 60-min routes (e.g. TARTA 15) at ≤60m while the card showed "every 60 min".
- **CI deploy**: TypeScript errors in SidebarControls, useIntervalStats, effectiveHeadway, and searchResults tests.

## [3.0.10] — 2026-07-07

### Changed
- **Agency card mode filters**: Replaced the prose blurb (`subway and light rail, 23 express routes`) with tappable pills that filter the route list (Subway · 4, Light rail · 12, Express · 23, etc.).
- **Corridors mode**: Header **Corridors** toggle (like Live); self-contained From/To panel on the map — no longer hijacks the main search bar; shares global day filter; stop card **Corridors from here…** entry.
- **App drawer hidden**: Removed waffle menu from header again; History/Fares remain URL-only until ready (reverts [#115](https://github.com/Civic-Minds/Atlas/issues/115)).
- **Near You panel**: Removed close button; panel clears when location is dismissed from the map.
- **Near You headways**: “Every X min” respects the selected day and period filter (`headwayByPeriod`), not midday headline only.
- **Near You loading**: Shows spinner while agency GeoJSON loads instead of “No routes within 500 m”.
- **Near You dismiss** ([#139](https://github.com/Civic-Minds/Atlas/issues/139)): Panel closes on outside click (same pattern as filter chips).
- **Search suggestions**: Section headers match content — Recent searches / Recent routes / Suggested routes (or agencies in Fares); both recent and suggested routes can show together.
- **Live Vehicles**: Vehicle detail rows use fleet labels or ordinals instead of raw UUIDs; route list drops redundant "Route N" suffix; multi-agency headers match suggestion section style.
- **Panel tokens**: Shared `PANEL_TITLE_BAR`, `PANEL_SECTION_HEAD`, `PANEL_CARD_HEADER`, etc. in `styles.ts`; Live Vehicles, Near You, and search suggestions use them.

### Fixed
- **CI / deploy**: Fix TypeScript errors blocking `tsc` (search result types, viewport bounds, headway-by-hour).
- **Map route deselect** ([#141](https://github.com/Civic-Minds/Atlas/issues/141)): Unified map click handler; paint resets synchronously on clear; fix invalid MapLibre opacity expression that left highlight stuck after deselect.
- **MiWay express headsigns** ([#142](https://github.com/Civic-Minds/Atlas/issues/142)): Strip direction-only express labels (`135 E Express Eglinton Exp`) so route cards show WESTBOUND/EASTBOUND without garbled "to W Express Eglinton Exp" rows.
- **Route card one-way destinations** ([#134](https://github.com/Civic-Minds/Atlas/issues/134)): Unified headsign pipeline (`resolveDisplayHeadsign`) so GeoJSON never drops cleaned-away destinations; route/stop cards share `resolveBranchLabel` with direction fallbacks; route-title redundancy handled at display time, not in stored data. Route cards no longer repeat the section heading as a row label (e.g. "to Southbound" under SOUTHBOUND).
- **Letter-suffix branch routes**: Pipeline auto-merges GTFS pairs like `blue` + `blue B` when long names prove same corridor (YRT VIVA, etc.) — default-on for all agencies; opt out with `skipLetterSuffixMerge` in `index.json`.
- **Pipeline modularization**: GTFS normalize/transform orchestration, shape selection, headway utils, geometry, and feature enrichment extracted from `process-core.ts` into dedicated modules.
- **Map attribution**: Compact linked `OpenStreetMap · CARTO` pill (full license string on `title`); MapLibre default hidden.
- **Mode filter** ([#135](https://github.com/Civic-Minds/Atlas/issues/135)): Mode gating moved into shared `tileFilter` (map + stats use the same clause); `effectiveMode` coerces string `routeType` and always receives `agencySlug` for virtual LRT rules.
- **Frequency filter** ([#136](https://github.com/Civic-Minds/Atlas/issues/136)): MapLibre tile filter expressions rewritten to compile with direction/day clauses — invalid nested `to-number`/numeric coalesce caused `setFilter` to fail silently so the map ignored headway/mode pills while stats updated.
- **Agency search** ([#137](https://github.com/Civic-Minds/Atlas/issues/137)): Dedupe sub-agency slugs (e.g. exo), sort in-viewport/nearest first, align list rows with route results; routes and agencies split into “In this area” / “Elsewhere” with route-first ordering for route-like queries.
- **Route search**: Substring match on route short names (aligned with map); prefetch GeoJSON for search-matched agencies so routes appear outside the viewport.
- **Search dismiss** ([#138](https://github.com/Civic-Minds/Atlas/issues/138)): Results/suggestions panel closes on blur when clicking outside; typed results gated on `searchFocused` like other panels.
- **Agency slug search** (e.g. `ttc`): Agency result appears first; routes that only matched via agency slug are hidden. Search dropdown caps at 5 agencies and 10 routes with a refine-search hint when truncated.
- **Sidebar panel width**: Live, History, Frequency sidebar, and agency card panels now share `SEARCH_BAR_WIDTH` with the header search bar.
- **Live Vehicles TTC adherence** ([#140](https://github.com/Civic-Minds/Atlas/issues/140)): Infer delay from predicted vs scheduled stop times when GTFS-RT omits `delay` (TTC); pipeline sidecar now stores per-trip stop schedules.
- **Search list rows**: Recent, suggested, and typed search results now share `RouteListRow` (route + companion name, agency · headway on the right) and `PANEL_SECTION_HEAD` section labels.
- **Live Vehicles empty state**: When buses are active off-screen, list them under “Outside this view” instead of a blank panel; true empty shows which routes are monitored in the area. Links to Data panel filtered to live agencies (empty and off-screen states).
- **Data panel filters**: Agency list adds All / Live / History chips (Live opens from Live Vehicles empty states and settings). Feature badges hidden when that filter is active. Feature + region chips share one scroll row; regions scope to the active feature.
- **Corridors map**: Stop showing the full PMTiles corridor-band layer in Corridors mode — only clipped A→B route segments render after From/To are set.
- **Corridors panel alignment**: Corridors input panel now uses the same responsive width as the main search bar and is anchored directly under the header row instead of oversized/off-position.
- **Corridors UX simplification**: Removed the dedicated From/To Corridors panel; Corridors now uses the single global search bar (like Live) and renders corridor-only map lines in that mode.
- **Search placeholder flashing**: Removed placeholder fade/crossfade on app switch so search hint text updates instantly between Frequency, Live, and Corridors.
- **Route card headways**: Removed ranged labels (`every X–Y min`) from direction rows; cards now consistently show a single cadence value per branch.
- **Route card sparkline realism**: Route-card sparklines now use branch/destination cadence only (no combined trunk minimum), avoiding optimistic lows like `every 3 min` on destination-specific service.
- **Route card headway ranges (restored, gated)**: Multi-branch rows can show `every X–Y min` again when headsign-scoped trunk wait is ≥5 min, ≥5 min better than destination wait, and ratio ≤4×; route-wide combined deps no longer drive the low end.
- **Route card duplicate destinations**: Drop stub headsign duplicates that appear in both direction groups (e.g. TTC 900 “to Kipling” under Eastbound and Westbound) — keep the full-length branch only.
- **Search vs route card**: Focusing the search bar clears the selected route/stop so suggestions don’t stack over an open route card; picking a search result dismisses search focus.
- **Headway consistency**: Agency route list and search suggestions now use the same period-aware headway as route cards (e.g. midday `every 6 min`), not a different all-day minimum across directions.

## [3.0.9] — 2026-07-06

### Fixed
- **CI**: Pin `@emnapi/core` and `@emnapi/runtime` at 1.11.2 in `package-lock.json` so `npm ci` passes on Node 22 (Tailwind/Rolldown wasm optional deps).

## [3.0.8] — 2026-07-06

### Added
- **History adherence tests** ([#130](https://github.com/Civic-Minds/Atlas/issues/130)): Unit tests for `computeHistoryAdherence` timezone bucketing.
- **Stop click route highlight** ([#104](https://github.com/Civic-Minds/Atlas/issues/104)): Selecting a stop keeps connecting routes at full color/width; other visible routes fade to 15% opacity.

### Changed
- **CI typecheck** ([#111](https://github.com/Civic-Minds/Atlas/issues/111)): Added `tsconfig.api.json` — API routes type-checked in CI alongside `src`/`shared`.
- **validate-index in CI** ([#112](https://github.com/Civic-Minds/Atlas/issues/112)): `npm run validate-index` runs on every PR.
- **R2 URL centralization** ([#127](https://github.com/Civic-Minds/Atlas/issues/127)): `DEFAULT_R2_PUBLIC_URL` exported from `shared/config.ts`.
- **Dead code removed** ([#126](https://github.com/Civic-Minds/Atlas/issues/126)): Deleted `dev-api-server.ts` and `pipeline/mapStyles.ts`.
- **Deps cleanup** ([#125](https://github.com/Civic-Minds/Atlas/issues/125)): Removed unused Leaflet and Playwright packages.
- **Docs** ([#128](https://github.com/Civic-Minds/Atlas/issues/128)): README and ROADMAP updated to MapLibre GL stack.
- **refresh-feeds CI** ([#131](https://github.com/Civic-Minds/Atlas/issues/131)): Weekly workflow runs typecheck and tests before commit.
- **Worker gitignore**: Fixed pattern that incorrectly ignored `gtfs-rt-archiver/src/`.
- **Sidebar card primitives** ([#103](https://github.com/Civic-Minds/Atlas/issues/103)): `SidebarCardShell`, shared list/section wrappers, and `CardDirectionRow` — stop, route, and agency cards share one layout system; removed duplicate route-card wrapper margin.
- **Stop card period labels**: Dropped redundant "Evening" (etc.) suffix on every headway — active period is already in the sidebar filter.
- **Stop card debug panel**: Removed internal "debug headways" toggle from the public stop card.

### Fixed
- **CI**: Synced `package-lock.json` after dependency cleanup (restores optional `@emnapi` entries required by `npm ci` on Node 22).
- **Route card sparkline overnight** ([#100](https://github.com/Civic-Minds/Atlas/issues/100)): Hourly chart runs 6 AM → 2 AM left-to-right with 5 AM grouped at the end; restored 3 AM and 4 AM bars (GTFS hours 27–28) in the overnight tail ([#133](https://github.com/Civic-Minds/Atlas/issues/133)).
- **Frequency filter** ([#132](https://github.com/Civic-Minds/Atlas/issues/132)): Map tile filter uses flat PMTiles period headway keys (`wdph_midday`, etc.) instead of nested GeoJSON objects tippecanoe drops; all-day `worstDirectionHeadway` fallback and tier parsing aligned with sidebar logic.
- **History timezone** ([#105](https://github.com/Civic-Minds/Atlas/issues/105)): Hourly delay buckets use per-agency IANA timezones instead of hardcoded UTC−4.
- **Supplemental feed skip** ([#106](https://github.com/Civic-Minds/Atlas/issues/106)): Weekly refresh no longer skips agencies with unchanged primary feeds when supplementals exist.
- **Per-stop GTFS times** ([#107](https://github.com/Civic-Minds/Atlas/issues/107)): Pipeline uses `t2m()` for stop headways (supports >24:00 overnight times).
- **Stale feed expiry** ([#108](https://github.com/Civic-Minds/Atlas/issues/108)): Expired `feed_end_date` forces reprocess instead of indefinite skip.
- **Live Vehicles bboxes** ([#109](https://github.com/Civic-Minds/Atlas/issues/109)): TransLink and STM added to `LIVE_AGENCY_BBOXES`.
- **Live config drift** ([#110](https://github.com/Civic-Minds/Atlas/issues/110)): TTC 503 and STM 55 `scheduleOffsetMin` stop IDs aligned with `targetStops`.
- **Agency index load** ([#113](https://github.com/Civic-Minds/Atlas/issues/113)): Failed `index.json` fetch shows retry UI instead of infinite Loading.
- **History API env** ([#114](https://github.com/Civic-Minds/Atlas/issues/114)): `history-adherence` fails fast on missing R2 credentials.
- **App navigation** ([#115](https://github.com/Civic-Minds/Atlas/issues/115)): Re-enabled `AppDrawer` for Corridors, History, and Fares.
- **Error boundaries** ([#116](https://github.com/Civic-Minds/Atlas/issues/116)): Map shell wrapped in recoverable `ErrorBoundary`.
- **Map zoom UX** ([#117](https://github.com/Civic-Minds/Atlas/issues/117)): Low-zoom stop clicks fly in; route disambiguation and geolocation show hints.
- **Search a11y** ([#118](https://github.com/Civic-Minds/Atlas/issues/118)): Main search input has `aria-label` per app mode.
- **Map attribution** ([#119](https://github.com/Civic-Minds/Atlas/issues/119)): Compact MapLibre attribution control restored.
- **process-gtfs parity** ([#120](https://github.com/Civic-Minds/Atlas/issues/120)): Manual process archives zip and updates `lastFeedExpiry`/`lastFeedVersion`.
- **Supplemental options** ([#121](https://github.com/Civic-Minds/Atlas/issues/121)): Supplemental feeds receive full `ProcessOptions` in refresh.
- **IDB cache bust** ([#122](https://github.com/Civic-Minds/Atlas/issues/122)): `CACHE_BUILD` auto-increments on successful refresh uploads.
- **Corridor tiers** ([#123](https://github.com/Civic-Minds/Atlas/issues/123)): Corridor features use `HEADWAY_TIERS` bucket labels.
- **peekFeedInfo CSV** ([#124](https://github.com/Civic-Minds/Atlas/issues/124)): Feed info parsing uses Papa CSV instead of naive split.
- **Route card trunk frequency** ([#99](https://github.com/Civic-Minds/Atlas/issues/99)): Multi-branch routes (e.g. HSR 5) show combined shared-section headway in the sparkline by default; destination rows show terminal wait ranges. Branch hover switches sparkline to that branch.
- **Sidebar card continuity** ([#101](https://github.com/Civic-Minds/Atlas/issues/101)): Stop and agency cards reuse `RouteDirectionRow` styling — stacked labels/headways, shared `to …` branch formatting, consistent dots and typography.
- **Stop card route groups** ([#102](https://github.com/Civic-Minds/Atlas/issues/102)): Shared headway collapsed into one line per route with compact destination list — flat layout, no nested route cards.
- **Route card limited destinations**: Limited-service hint no longer repeats destinations already shown with regular headways (e.g. GO 41 Square One).

## [3.0.7] — 2026-07-06

### Added
- **Branch hover highlight ([#96](https://github.com/Civic-Minds/Atlas/issues/96))**: Hovering a destination row in the route card highlights that headsign's geometry on the map; sibling branches dim. Inbound (direction 1) branches reveal on hover. Sibling rows in the card fade while hovering.

### Fixed
- **Route card direction groups ([#97](https://github.com/Civic-Minds/Atlas/issues/97))**: Multi-direction routes show Westbound/Eastbound (etc.) section labels and a divider between groups. Two-group routes label by relative mean shape-end position; sort follows the same axis.
- **Route card sparkline ([#98](https://github.com/Civic-Minds/Atlas/issues/98))**: Headway chart uses outbound branches only by default (median per hour); follows the hovered branch when one is selected — fixes misleading tall-bar/dot patterns on multi-branch routes.
- **GRT agency card ([#93](https://github.com/Civic-Minds/Atlas/issues/93))**: ION light rail no longer summarized as "commuter rail" — blurb uses effective mode (same LRT remapping as map filters).
- **HRT sparkline bunching ([#91](https://github.com/Civic-Minds/Atlas/issues/91))**: Hourly tooltip capped to period headway when paired departures inflate frequency (e.g. Tide 800 at 7 PM).
- **HRT trunk range display ([#92](https://github.com/Civic-Minds/Atlas/issues/92))**: Tight "every X–Y min" range hidden when period headway is ≥20 min (sparse paired service).
- **Route card titles ([#95](https://github.com/Civic-Minds/Atlas/issues/95))**: Show route long names alongside numbers when the name adds information (aligned with HSR-style cards).
- **Frequency filter ([#94](https://github.com/Civic-Minds/Atlas/issues/94))**: Map and sidebar now hide routes above the selected max headway (tileFilter aligned with sidebar filter).
- **Local dev data loading**: Vite proxies `/atlas-data` to R2 so localhost bypasses browser CORS blocks on artifact fetches.
- **Map zoom gate**: Progressive route reveal by zoom now uses paint opacity (MapLibre filters cannot use `zoom` expressions).

## [3.0.6] — 2026-07-06

### Added
- **Agency expansion**: 24 new agencies + stub feed fixes — 343 → 367 total (Stockton, Modesto, Baton Rouge, Knoxville, McAllen, Augusta, Lincoln, South Bend, Rockford, Racine, Sudbury, Anchorage, Lexington, Champaign, Kalamazoo, Laredo, Thunder Bay, Greensboro, Winston-Salem, Allentown, Harrisburg, Jackson MS, Lancaster, Scranton/Wilkes-Barre, PATCO; plus Sarnia, Port Huron, TARTA, Madison).
- **`npm run discover-gaps`**: MDB `feeds_v2.csv` spatial anti-join + population ranking → `tmp/gap-candidates.json`.
- **`docs/AGENCY_BACKLOG.md`**: Canonical prioritized expansion queue; linked from `AGENCIES.md` and `ROADMAP.md`.

### Fixed
- **Duplicate slugs**: Removed duplicate `cota` entry; renamed Youngstown `wrta` → `youngstown-wrta` (Worcester keeps `wrta`).

## [3.0.5] — 2026-07-06

### Added
- **Pipeline Concurrency**: Introduced parallel processing to pipeline stages (agency feed refreshes, PMTiles metadata downloads, and history snapshot compilation).
- **R2 Retry Logic**: Implemented robust retry handling with exponential backoff for R2 GET and LIST actions to prevent SSL/socket hangups under high concurrency.

### Fixed
- **GRTC missing directions ([#82](https://github.com/Civic-Minds/Atlas/issues/82), [#84](https://github.com/Civic-Minds/Atlas/issues/84))**: Union full-route shape clusters in the pipeline so separate weekday/weekend `shape_id`s no longer drop an entire direction from GeoJSON.
- **Map route count badge ([#83](https://github.com/Civic-Minds/Atlas/issues/83))**: Align PMTiles `tileFilter` with `passesRouteFilter` (period + worst-direction headway); remove duplicate headway filter in MapCanvas.
- **RGRTA misleading headway ranges ([#80](https://github.com/Civic-Minds/Atlas/issues/80))**: Per-headsign trunk headways (`headsignMinStopHeadwayByPeriod`) so competing branches don't produce optimistic "every 13–30 min" ranges.
- **CDTA BusPlus casing ([#81](https://github.com/Civic-Minds/Atlas/issues/81))**: Normalize `Busplus` → `BusPlus` in route title display.
- **Refresh GTFS feeds workflow**: Fixed failure in `refresh-feeds.yml` by adding the missing `R2_PUBLIC_URL` environment variable to the `build-history` step.
- **Workflow Error Handling**: Updated `pipeline/build-history.ts` to call `process.exit(1)` on error so that failures in history generation fail the workflow rather than passing silently.
- **Git Push Failure**: Added `git pull --rebase origin main` before `git push` to prevent weekly refreshes from failing when concurrent commits are pushed.
- **Node.js Deprecation**: Bumped Node.js setup version from `20` to `22` in `ci.yml` and `refresh-feeds.yml`.
- **Security**: Fixed CodeQL "Incomplete URL substring sanitization" in `pipeline/audit-feed-urls.ts` (use parsed hostname with exact + safe `.endsWith('.mobilitydatabase.org')` + gated GCS `mdb-latest` path check).

## [3.0.4] — 2026-07-06

### Added
- **Visalia Transit** and **Green Bay Metro**.
- Gap additions: COTA (Columbus OH), Des Moines DART (IA), Wichita Transit (KS), Appleton/Valley Transit (WI).

### Changed
- Refreshed feeds + R2 artifacts for waukesha-metro, tulare-county-transit, visalia, green-bay (plus prior pace).

### Fixed
- **GitHub Actions refresh-feeds (and CI)**: bumped ancient checkout/setup-node; refresh script no longer fails the job on partial errors (expired feeds etc.).

## [3.0.3] — 2026-07-06

### Changed
- **Changelog**: restored versioned release notes after 3.0.2 (no functional changes).

## [3.0.2] — 2026-07-06

### Fixed
- **Refresh**: handle agencies that produce 0 features (e.g. flex/microtransit like Durango) without failing the job.


## [3.0.1] — 2026-07-06

### Added
- **Sparkline bar tooltip**: hovering a bar shows a floating pill with the exact hour and headway (e.g. "9 AM · every 12 min"); hovered bar scales up slightly with an accent ring.
- Empty search results now show a "No routes match your search" message.

### Changed
- URL: no trailing `?` on bare path (e.g. default `/` not `/?`).
- Search: "new york" / city names now match via region (in addition to "NYC").
- Map route clicks now clear active search query (so route card actually appears / "pops up").
- RouteCardTitle now passes agencyName to getRouteLabel (helps name display in cards for special agencies).
- **Period label on sparkline hover**: label now updates to the hovered period, not just the selected one; reverts on mouse-leave.

### Removed
- **DATA_OVERRIDES.md**: deprecated; data overrides now tracked exclusively via individual GitHub issues with `data override` label + `issueUrl` per agency in `index.json`.

### Fixed
- **Security fixes**: SSRF in live sidecar fetch (whitelist + encoding), tainted format string in console.error, incomplete URL substring sanitization in feed audit.
- TypeScript errors in SidebarControls (region access on agencyData) and RouteCardTitle (null agencyName) to make dependabot PRs pass CI.
- Refresh failures: updated ECO Transit feedUrl to working EVTA source; set lastFeedExpiry for Durango (flex feed) to skip 0-feature processing.
- Sparkline period label making chart width vary; now reserves fixed slot so chart stays consistent width.
- Sparkline hover tooltip no longer clips on left/right edge (edge-aware translate).
- Route selection highlight uses full `agency::routeId` (prevents unrelated routes bolding on numeric id collisions e.g. NYC subway).
- **CI**: sync `package-lock.json` (`@emnapi` entries were missing, causing `npm ci` to fail).
- **Route card symmetric direction collapse**: routes where both directions share the same headway and no headsigns (e.g. TTC 512) now show a headway row instead of rendering blank.
- **"Via" capitalization**: added `via` to the lowercase-preserve list in `titleCase` — "Finch via Pioneer Village" no longer renders as "Finch Via Pioneer Village".
- **Search results missing route names**: routes with a null GTFS `route_short_name` now fall back to `routeId` in search result display, preventing blank rows.
- **TTC 506 Sparkline 2am Bug (AI-267)**: fixed boundary mapping of hour 26 to `'overnight'` instead of `'late'` to align with period boundaries; used `Math.max` between branch-specific start headways and terminal stop headways in the pipeline to prevent late-night schedule bunching/layover artifacts (e.g. 2-minute gaps at Main Street Station at 2 AM) from inflating route frequency.
- **TTC 35 Headway Ranges (AI-270)**: pipeline computes branch-specific, headsign-specific period and hourly headways; prevented shared terminal stop headways from bleeding into different branches (e.g. `35A` vs `35B` both ending at Mount Dennis) by comparing branch-specific start headways with terminal stop headways using `Math.max`.

## [3.0.0] — 2026-07-05

### Added
- **Agency coverage expanded to 324 agencies** across Canada and the US — all provinces, all major US metros. See [index.json](public/data/index.json) for the full list.
- **IDB cache build version**: `CACHE_BUILD` counter in `agencyGeoWeekVersion()` — increment after mid-week data fixes to force browsers to re-fetch instead of serving stale IDB data
- **Sparkline click-to-period**: clicking a zone sets the period filter; clicking again resets to All
- **Sparkline hover**: zone highlights with background band; inactive bars preview in tier color
- **Period label beside sparkline**: period name shown inline right of chart
- **SidebarControls refactor**: extracted DisambiguationPanel, StopCard, RouteCardHeadway, LiveAdherenceCard, DirectionLabel, RouteDirectionRow — 1330 → 948 lines
- **Settings panel split**: Appearance (dark mode) and Filters sections with labeled dividers
- **History time-scrubber**: year slider to replay service changes on the map
- **History backfill**: annual snapshots for Community Transit (2016–2026), Kingston Transit (2016–2026), CDTA/Albany, GCRTA/Cleveland — via automated MDB backfill script (`pipeline/backfill-mdb-history.ts`)
- **MDB fallback feed URLs**: 48 agencies now have `mdbFeedUrl` fallback for pipeline resilience
- **Pipeline: worst-direction headway**: routes carry `worstDirectionHeadway`; filter gates on worst direction so a route passing one way doesn't appear if the return is too infrequent
- **Pipeline: bus sub-type detection**: `busSubType` field — `brt`, `express`, `coach`, `local`
- **Pipeline: short-turn variant metadata**: direction-0 features carry `shortTurnVariants` with headsign + trip share
- **Late + Evening periods**: Evening extended to midnight; Late added for midnight–3 AM. `--force` flag on `npm run refresh` for schema changes
- **Hourly sparkline**: per-hour frequency bars (5 AM–2 AM) with 90-min sliding window; replaces named-period bars
- **Live Vehicles app**: real-time vehicle positions via GTFS-RT; delay-status indicators, 15s polling, route search, route-grouped sidebar, Deck.gl GPU-rendered markers
- **Live polling**: TTC 503/504, TransLink 99 B-Line, STM 55, Edmonton 004, YRT VIVA Blue, Halifax 1 — with optional API key support (`apiKeyParamEnvVar`, `apiKeyHeaderEnvVar`)
- **GTFS-RT archiver** (Cloudflare Worker): archives TripUpdates every 5 min to `atlas-live`; 30-day retention cleanup cron; skips idle overnight polls; currently Burlington + Hamilton
- **Pipeline: static trips lookup**: `atlas/{slug}-trips.json` on R2 for live-vehicles direction/headsign enrichment when GTFS-RT feeds omit them
- **History: headway trend sparkline**: time-series SVG sparkline on RouteHistoryCard across snapshot years; period tabs
- **Staged agency support**: `staged: true` in `index.json` hides agencies until data is ready; pipeline auto-clears after first successful refresh
- **LOD route visibility**: routes appear progressively by tier as zoom increases — frequent rapid from zoom 0, frequent from 7, moderate from 9, infrequent from 11
- **History config on R2**: `atlas/history-config.json` fetched at runtime; no generated file committed to git
- **GeoJSON Web Worker**: `geoWorker.ts` parses large agency GeoJSON in background thread; graceful main-thread fallback
- **IndexedDB GeoJSON cache**: agency GeoJSON persists between sessions keyed by `{slug}-{weekVersion}`; stale entries pruned weekly
- **Search bar suggestions**: focus shows last 5 searches; falls back to recently viewed routes or popular routes in viewport
- **PMTiles + MapLibre GL JS migration**: replaced Leaflet; range-requested vector tiles from R2; 98% fewer cold-load data requests, 60 FPS panning
- **URL-based map state**: `?lat=`, `?lon=`, `?z=`, `?route=`, `?stop=` — shared links open the exact same view
- **Agency search**: typing an agency slug or name in the search bar filters the map to that network
- **Connection explorer**: stop card shows routes reachable within 10 min walk (120m–800m); cross-agency connections automatic
- **GTFS Fares V2 support**: pipeline parses `fare_products`, `rider_categories`, `fare_leg_rules`; prefers V2 adult products when present
- **Fare map app**: routes colored by base adult fare (Free / <$2 / $2–4 / $4–8 / $8+); `fare-overrides.json` on R2 for manual overrides
- **Shared UI primitives**: `LIST_ROW`, `SEARCH_PILL`, `SEARCH_FIELD`, `FLOATING_CARD`, `PANEL_ENTER`, transition constants in `styles.ts`; applied across all panels
- **Info panel**: agency browser with region filter chips, Live tab (polled routes), History tab (covered agencies)
- **URL routing**: `/apps/frequency`, `/apps/corridors`, `/apps/history`; SPA rewrite in `vercel.json`; browser back/forward works
- **Corridors band view**: `isCorridor` segments shown when Corridors opens with no From/To selected
- **History app** (`src/apps/History.tsx`): headway trends over time — agency search → route list → before/after headway comparison with sparkline, period tabs, vertical timeline, year scrubber
- **GitHub Issues data override pattern**: per-agency override documentation linked from route/agency cards
- **Multi-feed support**: `supplementalFeedUrls` per agency; zips merged before writing to R2
- **Warn on expired GTFS feeds**: `refresh.ts` compares `feed_end_date` against today and warns in CI logs
- **Pipeline: skip unchanged feeds**: compares `feed_end_date` / `feed_version` before processing; skips R2 writes if schedule unchanged; archives raw zips to `atlas-archive` when new
- **Pipeline: R2 pagination**: `r2List` follows `NextContinuationToken` — no longer capped at 1000 objects
- **`find-mdb` tool** (`npm run find-mdb`): queries MDB catalog and emits ready-to-paste `index.json` snippets
- **Stale schedule warning**: route cards show "Schedule may be outdated" in amber when today is past `lastFeedExpiry`
- **Station View stop-level headways**: each route row shows headway at the selected stop specifically, not the route's terminal headway
- **Frequency range on route cards**: when trunk stops have ≥35% better headway than the terminal, shows a range (e.g. "every 6–12 min")
- **Data overrides**: now tracked via per-agency GitHub issues (label `data override`) + `issueUrl` in index.json (UI links "We corrected this data"). Monolithic `DATA_OVERRIDES.md` deprecated.

### Changed
- **Frequency map now at `/`**: `APP_TO_PATH` updated; `/apps/frequency` remains an alias
- **App drawer hidden**: Corridors and History lack sufficient data to be useful; re-enable by uncommenting `AppDrawer` in `App.tsx`
- **Sidebar panel width**: `w-64` → `w-72` (288px) to prevent "Midday" label from clipping
- **Search bar width**: responsive steps bumped from `w-40/52/64` to `w-44/56/72`
- **Inter font applied globally**: was loaded from Google Fonts but never set on `html`
- **Near You panel**: redesigned to LIST_ROW style — each row shows its own nearest stop name and distance; removed misleading shared-stop header
- **Global UI scale**: root font-size 14px (from browser default 16px)
- **Responsive header**: unified flex layout with React portal for right section; chips collapse below 1024px into "More filters" panel
- **Filter chips**: static labels always; dot-only active indicator; "Period" renamed to "Time"; "Now" button removed (didn't belong in either chip)
- **Live Vehicles**: moved from app drawer to standalone header button (Radio icon); minimum zoom gate at z9
- **Fares app hidden**: `available: false` — pending fare card UX
- **Fare data**: manual base fare overrides moved from `index.json` to R2 `fare-overrides.json`; richer fields (`label`, `zones`, `adultCash`, `free`, `fareUrl`) per agency
- **Stop card**: agency names as plain text (not pill buttons); nearby connections section visually separated with thick top border
- **Agency filter**: "None" deselects in-viewport agencies only; bbox/center intersection for visibility check; always-visible on/off dot per row
- **Frequency map: zoom-based progressive rendering**: GPU MapLibre step expression — below z7 only ≤10 min routes; z7–9 shows ≤20 min; z9+ applies headway pill
- **Disambiguation popup sorted numerically**
- **Live Vehicles: viewport-based multi-agency polling**: polls all agencies whose bbox overlaps current viewport in parallel; removed agency selector dropdown
- **Headline headway uses terminal stop midday period**: was all-day average; midday (9am–3pm) is more representative; falls back to all-day for peak-only routes
- **History agency panel redesign**: purpose-built `HistoryAgencyPanel` showing first→last headway per route with change direction color-coding
- **History: focus-triggered suggestions panel**: appears on search focus; Escape or map click dismisses
- **Screen transitions**: History slides up/down, Corridors fades, header chips fade on app switch
- **index.json refactor**: R2 artifact URLs derived via `getAgencyArtifactUrls`; JSON Schema + `npm run validate-index` added
- **process-gtfs.ts**: accepts remote `https://...` GTFS URLs directly (auto-downloads to `tmp/`)
- **Stats pills relocated**: moved from header to `bottom-6 right-14` map overlay; hidden while loading
- **Live adherence card**: stop rows clickable; deviation labels rounded to whole minutes; sorted by worst deviation first
- **Live button redesign**: pill with green dot + "Live" label; border when inactive, accent fill + pulsing dot when active
- **Centralized configs**: `TIME_PERIODS`, `HEADWAY_TIERS`, `STATUS_COLORS`, `Z_MAP_OVERLAY`/`Z_PANEL`/`Z_HEADER` etc. in `shared/config.ts` and `styles.ts`; removed scattered duplicates across 12+ files
- **MapCanvas tile filter centralized**: `useIntervalStats` returns `tileFilter` expression derived from the same inputs as `passesRouteFilter`; MapCanvas only adds map-state clauses
- **Sidebar panel left position centralized**: `sidebarLeft` prop threaded from App.tsx via ResizeObserver measurement; `SIDEBAR_LEFT_FALLBACK = 182` as single fallback
- **Various refactors**: extracted `RouteListRow`, `HeadwaySparkline`, `ServiceTimeline`, `StopInput`, `RouteGroupCard`, map utilities (`mapStyle.ts`, `mapHtml.ts`), `RouteCardTitle` — reduced file sizes across MapCanvas, Corridors, SidebarControls, History
- **GTFS-RT archiver**: switched from raw protobuf (~1.5 MB/poll) to compact JSON (~5–20 KB); corrected cron to `*/5 * * * *`
- **Dependency updates**: `@aws-sdk/client-s3`, `lucide-react`, `papaparse`, `playwright`; `actions/checkout` v4→v7, `actions/setup-node` v4→v6

### Fixed
- **index.json**: decoded unicode escapes in Quebec agency names (RTC, STLévis, Sherbrooke); corrected Bustang Outrider center
- **Loading spinner**: now fires on MapLibre `sourcedataloading`/`idle` — shows when PMTiles tiles are streaming even if GeoJSON is already cached; "Loading map..." for tile-only, "X/Y networks" when fetching GeoJSON
- **"ST" all-caps in stop names**: removed `St` from `TRANSIT_ACRONYMS`; was uppercasing "Street" in stop names (e.g. "Nassau ST"); standalone "ST" still uppercases via ≤3-char rule
- **Route card missing for stale-cached agencies**: `CACHE_BUILD` counter in `agencyGeoWeekVersion()` forces re-fetch after mid-week data fixes
- **Bustang/Outrider cards missing in Denver**: added explicit bboxes covering actual route extents
- **RTD Denver showing no routes**: slug was pointing at Bustang feed (mdb-2280); re-processed from correct mdb-178
- **Near You panel**: each route now shows its own nearest stop; was showing `routes[0].nearestStopName` as a shared header
- **Agency filter: deselecting had no effect on map**: `selectedAgencies` was only applied to sidebar/stats, never to the PMTiles tile filter
- **Headsign display all-caps**: reduced ≤4-char uppercase preservation to ≤3 — "LOOP" now title-cases; real 4-char acronyms (BART etc.) are in `TRANSIT_ACRONYMS`
- **Route 330 stop card headway**: peak-only routes with fewer than 3 midday/PM trips now excluded from stop card for that direction rather than showing misleading all-day median
- **Worst-direction tier promotion bug**: Step 4 terminal headway override can now only degrade a tier, never promote; prevents AM-peak cluster inflation
- **Direction-less feed headway understatement**: `synthesizeMissingDirections` assigns direction_id via shape/headsign clustering when feed lacks `direction_id` column
- **Loop route parent station headway inflation**: parent station credited with only one visit per trip; fixes multi-bay stations over-counting departures
- **Pipeline: feed expiry date parsing**: strips surrounding quotes from `feed_info.txt` fields (Hamilton uses quoted CSV values)
- **Search route list alignment + agency headers**: flex-1 truncation misalignment fixed; "(CITY)" parens stripped from route card headers
- **Duplicate destination rows**: pipeline and UI now dedup on cleaned headsign
- **Frequency filter for infrequent routes**: map tile expression now treats `tier==='infrequent'` as 9999 to match `passesRouteFilter` JS logic
- **Blank map for newly added US agencies**: `atlas.pmtiles` was not rebuilt after adding agencies; routes invisible until PMTiles regenerated
- **Back button stuck after leaving Fares app**: `moveend` and URL-sync effects migrated to `window.history.replaceState` to avoid stale React Router closure capturing `/apps/fares` pathname
- **Corridors/Live Vehicles capturing events when invisible**: added `inert` attribute to root div of each — suppresses pointer/keyboard events unconditionally including children with explicit `pointer-events-auto`
- **Fares app breaking all map interactions**: was rendering a second `Interval` (second MapLibre map) on top of the main one; fixed by removing separate `Fares` component and passing `fareView={inFares}` to the main `Interval`
- **Map route selection fits full extent**: was using `queryRenderedFeatures` (only in-viewport tiles); now scans in-memory GeoJSON for the correct agency
- **Disambiguation threshold**: lowered from zoom 13 to zoom 11 so clicks on dense corridors at normal city zoom show the route picker
- **Live Vehicles: agencies outside viewport shown in sidebar**: route list now filtered to vehicles within current map bounds
- **Live Vehicles: route card header inconsistent**: shared `RouteCardTitle` component; same `text-sm font-black` + `getRouteLabel()` in frequency and live cards
- **Live Vehicles: vehicle detail showed "—"**: groups by headsign when available; falls back to cleaned vehicle ID
- **Fares: STM search showing 187 routes**: Fares mode now shows agency fare cards in search, not individual routes
- **Fares: suggested agencies showing wrong-area/duplicates**: suggestions now scoped to loaded viewport agencies; deduped by name
- **Fares legend**: replaced circle dots with horizontal line swatches matching map rendering; tightened spacing
- **Sparkline hover**: switched from `nativeEvent.offsetX` (breaks on child elements) to `getBoundingClientRect` + `clientX`
- **SidebarControls parse error**: `return ({(() => {` is invalid JSX; fixed to `return (() => {`
- **Route label cleanup**: suppress terminus-style 1–2 word long names for numeric routes; strip "Via [location]" routing qualifiers; suppress BRT brand names from terminus suppression list; strip leading "- " after prefix removal; suppress redundant "G Line — G-Line Rapid Ride" patterns
- **Route card**: removed back button from frequency map card; collapsed identical no-headsign directions; `line-clamp-2` on long titles; left-aligned stale schedule notice
- **Stop card**: removed redundant "Station View" header; destination prefix wrapping fixed
- **Agency card**: removed debug slug mono text; region + route count as single muted text line
- **Agency filter pill**: `shortenAgencyName` truncates long formal names to clean short forms
- **Info button color**: `text-dim` → `text-muted` at rest (was looking disabled)
- **Live button**: neutral dot when Live is off; was green regardless of state
- **Route lines antialiasing**: `antialias: true` on MapLibre constructor; zoom-interpolated line-width/opacity
- **Stats pills hidden while loading**: suppress "0 routes / 0%" during pan to unloaded area
- **Z-index stack**: named constants in `styles.ts` replace scattered `z-[500]`/`z-[1000]` etc. across 12 files
- **Time filter**: Late (11pm–2am) and Overnight (2am–6am) periods added; `getNowPeriod` correctly maps early-morning hours to GTFS 24+ notation; period chips now toggleable
- **App drawer cursor flickering**: added `cursor-default` to dropdown panel wrapper; `button:disabled { cursor: not-allowed }` as global CSS rule
- **InfoPanel slide carousel offset**: replaced fragile horizontal slide container with clean conditional rendering; fixed margin/clipping bugs
- **Station stop grouping**: sibling stops grouped by name; multi-agency proximity grouping within 120m; major station hubs shown at zoom 12–15
