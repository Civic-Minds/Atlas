# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Improved
- **Live polling UX**: routes with live GTFS-RT data (Burlington 1/10, Hamilton 01/10) now show a small green dot in the stop panel route list so users know live data is available before opening the route. Live box in the route panel no longer shows "fetching…" indefinitely — hides entirely when no active trips are detected (e.g. outside service hours), and the pulsing dot is dimmed while pending vs solid when data is live.

### Fixed
- **Live adherence API 504 timeout**: `fetchTripUpdates` had no fetch timeout, causing the Vercel function to hang the full 60 s when Burlington or Hamilton's GTFS-RT endpoint was slow from Vercel's datacenter. Added a 12 s `AbortController` timeout so the function fails fast and returns `noData` instead of timing out.

### Added
- **PIPELINE.md**: added pipeline documentation covering the full GTFS → Blob → frontend data flow, GeoJSON schema, `index.json` format, frequency analysis tiers, and how to add or refresh agencies.
- **Ferry mode in Mode filter**: added Ferry (GTFS route_type=4) as a selectable mode. No ferry agencies are currently in Atlas; Linear AI-76 and AI-77 track Toronto Island Ferry and Montreal navettes fluviales respectively.
- **Streetcar / LRT split in Mode filter**: Line 5 Eglinton and Line 6 Finch West are open and in the TTC GTFS as route_type=0, mixed with streetcar routes. GRT ION is tagged route_type=2 in their GTFS but is urban LRT. Mode filter now has separate "LRT" and "Streetcar" entries; LRT covers TTC Lines 5/6 (heuristic: routeLongName starts with "Line \d") and GRT ION (routeLongName contains "ION"). No pipeline reprocessing needed.

### Added
- **Montreal transit agencies**: STM (bus + metro), REM, STL (Laval), RTL (Longueuil), exo trains, plus five exo bus sectors (Sud-Ouest, La Presqu'île, Laurentides, Le Richelain/Roussillon, Terrebonne-Mascouche), Saint-Jean-sur-Richelieu local transit, Mont-Tremblant, L'Inter des Laurentides (intermunicipal), and Ville de Saint-Hyacinthe. All processed with current GTFS and stable direct feedUrls.

### Changed
- **Frequency tier colours**: switched to a monochrome grey gradient (dark slate for ≤10m → progressively lighter greys; medium grey for infrequent) for a more neutral, single-hue look instead of teal/green.
- **Line thickness**: further reduced base weights (bus 1.5 / rail 2.5 normal) and made corridors thinner (2) so dense areas like Toronto don't look too thick. Selection still thickens the chosen route.
- **Stop selection dimming**: when a stop is selected, routes not serving it are now dimmed on the map (instead of hidden), providing network context while highlighting relevant routes.

### Improved
- **Terminal / hub stop display at overview zoom**: when zoomed out, only major hubs (3+ routes or GTFS location_type=1 stations) and rail stops are shown as stop markers. This prevents dense terminal loops/bays from rendering as ugly overlapping blobs of tiny circles. Full per-bay detail appears only when you zoom in closer (≥15). Minor stops are also smaller/fainter. Clean single markers now represent terminals far out.
- **Zoom to full route when selecting from station panel**: clicking a route in the Station View sidebar now flies the map to show the route's entire extent (with sensible maxZoom + padding). The selected route is also force-included in the map layers so you always see its full path regardless of current frequency/day filters. Works for map clicks too for consistency.
- **Montreal/REM + French headsign presentation**: REM branches now show cleanly as e.g. "A3-A1 — Anse-à-l'Orme / Brossard" (instead of redundant "A3-A1 — A3 - Anse-à-..."). Fixed title-casing for accented French names ("Jérôme", "Anse-à-l'Orme" etc.). Stripped verbose "Destination " prefixes on exo headsigns. Sidebar panel constrained to search bar width (`w-64`) with `break-words` + `title` tooltips + overflow clip to prevent cutoff on long destinations.
- **Agency filter names**: shortened MTL agencies to clean short forms (STM, STL, RTL) without bracketed qualifiers or cities for less clutter in the list.
- **TTC headsign cleaning**: better stripping for express routes like "960b Steeles West Express Towards Finch Station Via Pioneer Village Station" → "Finch via Pioneer Village". Improves long verbose TTC headsigns.

### Fixed
- **Sidebar panel width**: the details panel for selected stop/route is now strictly `w-64` (and `overflow-x-hidden`, tighter `p-4`) to match the search bar width exactly; never wider.
- **Clicking routes showed map tooltip "panel"**: removed `bindTooltip` from route lines (and hit areas). Clicking a route now exclusively opens full details in the left sidebar panel (never a floating mini-card on the map at the click location). Hover on routes is silent; only stops + combined corridors keep minimal tooltips.
- **Route click toggle was unreliable (stale closure)**: changed `setSelectedRoute` / `setSelectedStop` calls in MapCanvas to functional updaters + widened prop types so toggle (select/deselect) always uses latest state even without layer remount.
- **Loading indicator covers locate button**: moved loading spinner from bottom-right to bottom-left so it can no longer overlap the locate button or the Nearby Routes panel.
- **Sticky native tooltip on locate button and other controls**: replaced `title` attributes with `aria-label` across all buttons (locate, reset view, filter panel toggles, frequency tier chips). Eliminates the browser's slow-to-dismiss native tooltip.

### Changed
- **Settings panel redesigned**: replaced the chunky wide border-buttons with compact toggle-switch rows (icon + label left, sliding pill toggle right). Panel is narrower and denser; active state is immediately obvious from the toggle position and accent color rather than a subtle background tint.
- **Pointer cursor on all buttons**: Tailwind v4 preflight resets button cursor to `default`; added a global `button { cursor: pointer; }` rule so all interactive elements show the hand cursor.
- **Default map zoom raised from 9 → 11**: initial load now opens on the GTHA core (Toronto metro) instead of the full region from London to Buffalo. The logo reset button still shows all agencies via `fitBounds`.

### Added
- **Nearby Routes panel (AI-71)**: tapping the locate button now shows a "Near You" panel above it listing every route within 500 m of your location, sorted by best headway. Tapping a route opens its detail panel in the sidebar. The panel shows the nearest stop name and distance (e.g. "Queen Station · 290 m") at the bottom, and closes with the X button. Implemented via `useNearbyRoutes` hook (Haversine distance across all loaded GeoJSON Point features) and `NearbyRoutesPanel` component.
- **Viewport-aware lazy loading (AI-72)**: agency GeoJSON is now loaded on-demand as you pan instead of all 35 agencies on mount. Agencies fetch only when their bounding box intersects the visible map viewport — no hardcoded "always-load" list. Before the map fires its first `moveend`, a static Toronto-area fallback bounds is used so GTHA agencies appear immediately without any per-agency special-casing. Each agency entry in `index.json` now carries a `bbox: [s, w, n, e]` field; missing bboxes fall back to center ± 0.4°/0.5°. Loading indicator now shows `{loaded}/{requested}` to reflect in-flight requests rather than total agency count.

### Changed
- **Settings button order**: light/dark toggle now appears to the left of the Settings gear (was reversed). Settings panel dropdown still opens from the rightmost button.
- **Initial map view uses last saved position**: the map now restores your last center and zoom from `localStorage` on every visit. On a fresh visit with no saved position, it silently requests geolocation and flies there (zoom 12) if granted — no button press needed. Falls back to the GTHA core default if both are unavailable. The explicit locate button still works as before and opens the Nearby Routes panel.
- **GeoJSON browser caching (AI-75)**: agency files now fetch with `cache: 'default'` and a weekly `?v=YYYYWW` query param. Browsers cache each file for the week; the cache busts automatically when the Monday refresh pipeline runs and the week number increments. No pipeline changes needed — Vercel Blob ignores unknown query params.
- **Lazy-load fallback uses saved view**: the pre-`moveend` fallback bounds in `useAgencyData` now derives from the last saved map position (from `localStorage`) instead of always assuming Toronto. Returning Montreal users no longer briefly load GTHA agencies before the map reports its first viewport.

### Fixed
- **Sticky tooltip on agency filter buttons**: the agency name buttons in the Agencies chip dropdown had a `title` attribute causing the same slow-dismiss native browser tooltip fixed elsewhere. Replaced with `aria-label`.
- **All-caps route labels (Stratford and others)**: `getRouteLabel` output was rendered raw at all three call sites in the sidebar. Wrapped each with `titleCase` so agencies that store `route_long_name` in all-caps (e.g. Stratford Transit's "CITY CENTRE") display correctly as "City Centre". Headsigns already went through `titleCase`; this brings route labels in line.

### Added
- **Persist user preferences to localStorage**: frequency filter (`maxHeadway`), day type, and agency selection now survive page reloads. Agency exclusions are saved rather than the inclusion set, so newly added agencies are always visible by default without needing to reset. First-time visit still auto-detects the current day of week.
- **Loaded state indicator in Agencies dropdown**: agency entries that are selected but not yet fetched (outside the current viewport) show a small hollow circle on the right side of their row, making the lazy-loading behaviour visible to the user.

## [2.1.0] - 2026-06-17

### Added
- **Agency name is clickable in route panel**: clicking the agency name below the route title filters the map to show only that agency's routes. Click again to clear. (Now uses the correct agency slug so the filter actually works.)
- **NFTA merged into one filter chip**: NFTA Metro and NFTA Rail both renamed to "NFTA (Buffalo)" and shown as a single agency chip that toggles both layers together. FilterChips now groups agencies by display name.

### Fixed
- **DRT 905 Port Perry branch missing from map**: Routes with genuine headsign-based branches (e.g. DRT 905 "A - Windfields Farm" short trips vs "C - Uxbridge" Port Perry extension) were having the minority branch silently dropped by the shape filter. The base cluster picked the majority shape (Windfields Farm, 68 trips), filtering out the Port Perry shape entirely in phase 1. Fixed in `process-core.ts` + `transit-phase1.ts`: now builds per-headsign shape filters so each branch uses its own winning shape. DRT 905 northbound now correctly shows both the Windfields Farm (15 min) and Uxbridge/Port Perry (90 min, infrequent) branches.
- **GO LW inbound headway=1 min** (AI-68): `getActiveServiceIds` was merging all ~14 Mondays within the ±90-day window for GO Transit's per-date service_id feed, creating ~1000 near-duplicate departure times whose median gap collapsed to ~0.5 min → displayed as "every 1 min." Fixed in `transit-calendar.ts`: when all service_ids for a day-of-week are single-occurrence, pick only the one closest to the reference date instead of merging all of them. LW inbound now correctly shows ~19 min. Also affects all GO lines — other inbound directions should self-correct on next `npm run refresh`.
- **Route key collision across agencies** (AI-69): `routeKey` was built from `agencyName`, which the pipeline never writes into GeoJSON properties (always null). All routes from every agency shared the same `null::routeId` namespace, so selecting TTC Route 1 also highlighted Hamilton Route 1, Barrie Route 1, etc. `routeKey` now uses `agencySlug` (injected at render time by `MapCanvas` and `useIntervalStats`). Fixed in: `useIntervalStats.ts`, `MapCanvas.tsx` (line and corridor layers), `SidebarControls.tsx` (`stopRoutes` rKey, `liveAgencySlug`, `liveRouteInfo`).
- **Initial map zoom way too far out**: `getRegionalView` was computing a midpoint over all agencies including Kingston and London, dragging the center east and producing zoom 7. Initial load now always uses the GTHA core default (43.65, -79.45, zoom 9); the reset button still uses `fitBounds` to show all agencies.
- **Mouse wheel zoom too slow**: `zoomDelta` 0.5 → 1, `wheelPxPerZoomLevel` 120 → 60 (back to Leaflet defaults).
- **One-way routes showing "Direction 1"**: when a route has a single direction and no headsign the label is meaningless. Direction heading is now omitted entirely for single-direction routes with no headsign; it still shows for multi-direction routes and routes with a headsign.
- **API error leakage**: `/api/live-adherence` and `/api/gtfs-rt` no longer return raw `err.message` to clients on 500 errors (CodeQL `js/stack-trace-exposure`). Errors are now logged to the Vercel function log and a generic "Internal server error" is returned instead.
- **Station View stop collision across agencies**: stops with the same `stopId` from different agencies were colliding — clicking one could match another agency's stop. Click handlers in `MapCanvas` now set `selectedStop` as `agencySlug::stopId`; `SidebarControls` and `pointToLayer` both resolve using the same composite key.
- **Station View showing routes from wrong agencies** (AI-67): `stopRoutes` searched all agency layers by bare `routeId`, so clicking a Stratford stop showed Simcoe and YRT routes that also have a route "3". Scoped the lookup to only the owning agency's layer.
- **Large headways displayed as raw minutes**: routes with headways over 60 min now display as `every ~Xh` (rounded to nearest 0.5h). Applies to route panel, station view, and map tooltips.
- **Headsign double "to"**: headsigns already containing " to " mid-string (e.g. "Brant South to Downtown") were getting an extra "to " prepended. The `fmtH` formatter now checks for this.
- **Commas stripped from headsigns**: GTFS headsigns with commas (e.g. "New Tecumseth, Recreation Centre") now display without the comma.
- **Search results include unrelated routes** (AI-70): searching "2" returned 221 routes because `routeLongName.includes("2")` matched any long name containing that character. Route number search now uses `startsWith`; long-name search only activates for queries 3+ characters.
- **Search results panel two-tone background**: the search results container used `bg-[var(--accent-bg)]` creating a visually nested box inside the panel. Removed the background and border so results blend cleanly.
- **DRT and GO data refreshed**: re-downloaded feeds to pick up schedule changes.

## [2.0.0] - 2026-06-17

### Added
- **Combined-frequency corridors toggle**: added a "Show combined corridors" toggle in the Settings panel. This surfaces segments where multiple overlapping routes provide higher aggregate frequency (e.g. 504 King + 501 Queen on Queen St). To reduce noise, corridors are only shown if they have 3+ overlapping routes or provide high frequency (<= 15 min).
- **Rail stop visualization**: rail stops (serving route types 0, 1, or 2) now render on the map starting at zoom level 12 (other stops show at 13/14). Rail stops are styled with a larger radius and higher contrast (white fill in light mode, brand accent in dark mode) to distinguish them from bus hubs.
- **Frequency in Station View**: the Station View sidebar now displays the best headway for each route serving that stop for the currently selected day type. Includes a small frequency-tier color dot for consistent visual context.
- **On-demand live adherence** (`/api/live-adherence`): selecting a covered route fetches GTFS-RT TripUpdates and computes headway drift in real time — no background cron or Blob snapshots.
- **Live route coverage (4 routes)**: Burlington 1 & 10, Hamilton 01 (King) & 10 (B-Line). Each polls 3–5 anchor stops (termini + mid-corridor), configured in `shared/livePollingConfig.ts`.
- **Shared `computeLiveAdherence`** (`shared/computeLiveAdherence.ts`) — GTFS-RT parsing logic used by the live API.
- **Shared live polling config** (`shared/livePollingConfig.ts`) — one module for the live API, POC scripts, and the UI Live badge. Supports multiple routes per agency; Burlington/Hamilton `route_id` schedule-period variants included.
- **`npm run validate-headsigns`** — diagnostic script listing routes where multiple headsigns share one `direction_id` (run after feed changes; `npm run validate-headsigns -- simcoe` for one agency).
- **Stratford Transit** in the agency registry with weekly-refresh `feedUrl`.
- **Shared `cleanHeadsign` module** (`shared/cleanHeadsign.ts`) used by both the pipeline and frontend so headsign labels stay consistent at build time and render time.
- **Regional default map view** computed from all agency centers; logo-reset uses `fitBounds` over the full coverage area.
- **New Agency Coverage**: Expanded the map with **UP Express**, **Simcoe County LINX**, **Stratford Transit**, **London Transit**, **Kingston Transit**, and **Buffalo (NFTA Bus & Rail)**.
- **Support for bidirectional routes with shared `direction_id`**: Generalized the pipeline's headsign-splitting logic to all agencies. This ensures that bus routes using a single `direction_id` for both ways (like Simcoe LINX) are correctly processed into separate features for each direction on the map.

### Fixed
- **Day filter chip truncation**: fixed an issue where the "Weekday" label was truncated to "Wee" in the service day selector. The Day chip now correctly displays the full selected day name (Weekday, Saturday, or Sunday), and the dropdown buttons use `whitespace-nowrap` with improved width constraints to ensure text fits across all platforms.
- **Live API on Vercel**: `/api/live-adherence` and `/api/gtfs-rt` use correct `../shared/` imports (were `../../shared/`, causing function crashes) and parse query strings from relative `req.url` (Vercel serverless does not support `new URL(req.url)` alone).
- **Hamilton 01 live adherence offsets**: inbound short-turn anchor offsets updated from GTFS (`1771` → 37 min, `355415` → 39 min; outbound `1403` → 31 min) so segment drift matches scheduled short-turn trips.
- **Niagara Region Transit day/night route pairs**: NRT uses 3xx (weekday daytime) and 4xx (evening/weekend) for the same corridor. A feed-specific preprocess (`preprocess: "nrt-day-night"` in `index.json`) reassigns 4xx trips onto their 3xx twin before analysis so corridors get full-day headway tiers instead of false `span` on evening-only numbers. A warn-only shape audit logs evening shapes that do not match any daytime geometry (merge is not blocked).
- **NFTA feed URL**: `www.nfta.com` URL was dead (HTML response); switched to `metro.nfta.com/__googletransit/google_transit.zip`. `refresh.ts` falls back to `curl` when Node fetch fails TLS verification.
- **Simcoe County LINX center** corrected from Barrie's coordinates to mid-county (`44.35, -79.75`).
- **Sidebar UI Alignment**: Fixed the Close (X) button padding in the Station and Route panels; it now sits flush in the corner with a larger, more accessible click target.
- **Redundant Headsigns**: Refined the `cleanHeadsign` logic to aggressively strip redundant route names (e.g., "510 Spadina towards..."), direction suffixes (" - Sb", " - Nb"), and redundant street addresses ("Wasaga Beach, 25 45th Street S" -> "Wasaga Beach").

### Changed
- **Live adherence architecture**: removed Vercel cron (`api/cron/poll`), Blob snapshot proxy (`api/live-status`), and `crons` from `vercel.json`. Live badge polls `/api/live-adherence?agency=&route=` every 60s only while a covered route is open.
- **POC real-time scripts** moved from repo root to `scripts/poc/`; Hamilton 1A long-pattern detection uses marker stop `2138` instead of hardcoded trip IDs.
- **README and ROADMAP** updated to reflect regional coverage beyond the GTHA core.
- **`titleCase` acronyms** extended for NFTA, LTC, and KTC.
- **Consolidated Niagara Data**: Removed the redundant "Niagara (Legacy)" entry from the registry in favor of the working unified "Niagara Region Transit" feed.
- **Universal Headsign Deduplication**: Updated the GeoJSON deduplication key to include headsigns for all agencies, preventing separate directions or terminus patterns from being collapsed into a single feature.

## [1.32.0] - 2026-06-15

### Fixed
- **Split `span` into `span` (peak-only) and `infrequent` (all-day slow)**: routes with short service windows or low coverage (< 40% of analysis window) stay `span` and are hidden by "Hide limited routes." Routes that pass those thresholds but can't sustain any frequency tier (e.g. Barrie line, GO Route 11) now get `tier='infrequent'` — shown on the map at Frequency = All, hidden at any specific frequency tier. Tooltip shows "infrequent service."
- **Proportional grace period for tier classification**: `determineTier` now computes grace as `max(5, round(T × 0.15))` instead of a flat 5 min. Tier=60 gets 9-min grace (max gap 69 min), tighter tiers keep 5 min. Fixes routes like GO 12 (Niagara Falls) that have one or two gaps slightly over 60 min being misclassified as `span`.
- **Percentage-based grace violation allowance**: max grace violations is now `max(2, floor(gaps × 0.30))` instead of a flat 2. Routes with more trips in the analysis window can have proportionally more minor violations before failing a tier. Fixes GO 12 weekday: 4 violations out of 14 gaps (~29%) now passes tier=60.
- **Agencies chip label**: chip now reads "Agencies" when all agencies are on (was "All agencies"), consistent with the other chip labels (Frequency, Day, Mode).
- **Locate button shape**: button was `rounded-xl` (square corners), now `rounded-full` to match the FilterPanel buttons.
- **Grace/violation config extracted to AnalysisCriteria**: `gracePercent` and `violationPercent` are now explicit fields on `AnalysisCriteria` and `DEFAULT_CRITERIA` (0.15 and 0.30), replacing magic numbers hardcoded in `determineTier`. The `graceMinutes`/`maxGraceViolations` fields are now floors rather than absolute values.
- **Logo button resets map view**: clicking the map logo in the top-left now flies back to the default GTHA view (centre 43.65, -79.45, zoom 10). Uses a `resetViewKey` counter threaded through App → Interval → MapCanvas → `ResetViewControl` (inner component using `useMap`).

### Changed
- **Route panel groups directions and collapses limited patterns**: directions are now grouped by `directionId` so outbound and inbound appear in separate sections with a thin separator. Multiple `span`/limited patterns within the same direction group (e.g. Kitchener GO, Mount Pleasant GO, Georgetown GO all going westbound) are collapsed into one row listing the termini separated by `·`, instead of three separate "limited" rows. Single real-tier patterns still show their individual headway. Applies to all agencies — GO rail, BRT (VIVA Blue), rapid bus (HSR Line 1), etc.
- **`titleCase` utility extracted**: headsign/stop-name title-casing moved to `src/utils/format.ts` with a list of transit acronyms to preserve (GO, DC, YRT, TTC, HSR, GRT, BRT, LRT). All three inline transforms in MapCanvas and SidebarControls now use the shared function.
- **Rail inbound midday window fix**: inbound rail trips (dir=1, "to Union Station") were analyzed over the full service day, which combined rush-hour trains from multiple origins (Kitchener, Georgetown, Bramalea all departing at different points) into one pool — making KI inbound look like "every 18 min" when no single station sees that. Midday window (09:30–14:30) now applies to both rail directions, showing the honest sustained off-peak combined frequency instead of the peak-inflated one. The representative-day rollup is also extended to dir=1.
- **Headway display uses median for all routes**: bus routes were using `avgHeadway` in `process-core.ts`, which pulled away from clock-face values when a few gaps were irregular (e.g. route 25 showing "every 58 min" instead of 60 min, route 56 showing 32–33 min instead of 30). All routes now use `medianHeadway`, consistent with how rail routes were already handled. Median is robust to one or two outlier gaps and correctly reflects the typical scheduled interval for clock-face routes.
- **Headsign title-casing in route panel**: some agencies (GO, Niagara) store headsigns in ALL CAPS in GTFS. Route panel direction rows now apply the same `.toLowerCase() + capitalize` transform used for stop names elsewhere, so "to ALDERSHOT GO STATION" becomes "to Aldershot Go Station".
- **Route panel direction order**: directions are now sorted best-frequency first (lowest headway ascending), with span/limited patterns at the bottom. Previously sorted by raw `directionId`, which put patterns in arbitrary order.
- **GO rail terminus pattern splitting**: GO rail routes (e.g. Kitchener line) now split by headsign so each terminus (Bramalea GO, Kitchener GO) gets its own frequency analysis and its own correctly-sized GeoJSON shape. Selecting ≤60 min shows only the Bramalea segment; Kitchener (sparse midday service) remains span. Implemented via headsign-keyed grouping in `transit-phase1.ts`, per-headsign shape maps in `process-core.ts`, and headsign propagation through `transit-phase2.ts`.
- **GO rail tier classification uses midday window**: full-window analysis created a ~90-min afternoon gap (e.g. KI 16:04→17:34) that broke the tier=60 grace check, forcing all terminus patterns to `span`. Rail outbound (`dir=0`) now classifies tier and computes display headway from the same 09:30–14:30 midday window; falls back to full window when midday has <2 trips (Milton, Richmond Hill correctly stay `span`).
- **Schedule-period dedup overwriting best tier**: when a `tier=span` (null headway) result from one GO schedule period was processed after a real-tier result from another period, the dedup guard skipped its check and the span result overwrote the better one. Fixed: `null` headway never replaces an existing feature. Resolves LW showing "every 96 min" (AI-63).
- **GO rail headsign prefix stripped from display**: terminus headsigns like "KI - Bramalea GO" are now stripped of their route-code prefix before being stored in GeoJSON properties ("Bramalea GO"), matching the UI's existing headsign cleaning.
- **Rail lines visually heavier than bus (AI-54)**: `routeType=2` (GO rail) lines now render at weight 3 (vs 1–2 for bus) in normal state, 5 when selected (vs 4), and stay slightly more visible when dimmed. Matches standard transit map convention where rail lines dominate the visual hierarchy.
- **TTC multi-word headsign prefix stripping (AI-60)**: the branch-code prefix regex now also strips directional words like "East - " and "West - " in addition to single-letter codes ("A - ") and short codes ("KI - "). Fixes TTC route 954 showing "East - 954 Lawrence East Express towards Starspray" instead of "Starspray".
- **Oakville 86B showing "every 5 min"**: 86B has 3 trips total; the 5-min gap between its 2 in-window trips was previously escaping the `isLimitedService` guard in older pipeline builds. Current pipeline correctly classifies it as `span`. Resolved on next refresh (AI-62).

### Added
- **Station View agency filter pills**: when a stop is served by more than one agency (e.g. a GO/TTC interchange stop), filter pills appear above the route list so the user can narrow to one agency at a time. Pills reset when a new stop is selected.

### Changed
- **Filter dropdown layout unified**: Mode and Agencies dropdowns now use the same `flex wrap` pill layout as Frequency and Day — Mode was a 2×2 grid, Agencies was a full-width stacked list, both are now pill rows consistent with the rest of the filter chips.

### Fixed
- **GO Transit rail headway using midday window**: full-day analysis (7am–10pm) clusters peak trains every 8–10 min and drags the median to ~16 min even when midday service is every 30 min. Rail `dir=0` (outbound from hub) now computes display headway from a 09:30–14:30 midday window. Tier classification still uses the full window so peak-only lines (Milton, Richmond Hill) correctly get `span`.
- **GO weekday rollup inflated by outlier days**: the Weekday rollup was merging all 5 days' departure times into a union set. When one day has a different schedule (e.g. extra Friday trains, event-day service), those extra trips inflate the apparent midday frequency. The rollup now picks the single most-representative day — the one whose midday trip count is closest to the median across all weekdays — and computes stats from that day's times only.

### Added
- **Accent CSS variable system**: all accent colours now come from `--accent`, `--accent-bg`, and `--accent-border` CSS variables (light/dark values in `index.css`). Replaced every scattered `indigo-*` Tailwind class across the UI. Changing the two `:root` colour values repaints the entire app.
- **Zoom-based stop visibility**: stop markers now show at three levels — all stops at zoom ≥ 14, hub stops only (4+ routes) at zoom 13, none below 13. Hub stops render slightly larger (radius 4 vs 3). Stops and route lines are mounted on separate Leaflet layers so zoom changes don't remount the (much larger) route layer.
- **Smooth map zooming**: `zoomSnap={0.25}`, `zoomDelta={0.5}`, `wheelPxPerZoomLevel={120}` on `MapContainer` for sub-integer zoom steps and slower mouse-wheel panning.
- **Live polling filter in useIntervalStats**: `livePollingOnly` filter prop hides all routes not covered by Atlas's GTFS-RT adherence polling. Driven by `src/utils/livePolling.ts`, which lists the covered agency/route pairs.

### Changed
- **Route panel direction rows**: headsign ("to Aldershot GO") moves to the top of each direction row; the tier dot + "every X min" line sits below it. Gives destination context before frequency number.
- **Route and stop name title-casing**: GTFS long names and stop names are now display-cased at render time (e.g. "KING STREET WEST" → "King Street West"). Applied in the route panel header, station view header, and stop tooltip.
- **Station View is text-based**: routes at a stop are now listed as text entries (bold route number, indented `→ Headsign` lines) instead of the previous blob-badge layout. Headsigns are cleaned of agency prefix codes (e.g. "LW - Aldershot GO" → "Aldershot GO").
- **MapCanvas mutual exclusivity**: clicking a stop clears the selected route, and clicking a route clears the selected stop. Both panels can no longer be open simultaneously.
- **Stop tooltip**: removed the "X routes serve this hub" count (it was derived from raw `routeIds` and didn't match the deduplicated count shown in the panel); tooltip now just shows "Station" + title-cased stop name.
- **GO Transit rail headway uses median**: `process-core.ts` now uses `medianHeadway` (instead of `avgHeadway`) for `route_type=2` (rail) routes. GO peak trains cluster heavily and drag the mean down to ~11 min even when midday service is every 30 min; median gives the representative off-peak figure.
- **Hide irregular routes on by default**: `hideSpan` now initialises to `true` so span-only (peak/school/shuttle) routes are hidden on first load.

### Fixed
- **Stop and route panels showing simultaneously**: clicking a stop didn't clear the selected route (and vice versa), so both panels rendered at once. Fixed with mutual-exclusivity logic in `MapCanvas` click handlers.
- **Stop tooltip route count didn't match panel**: tooltip said "4 routes" but the panel showed 2 because the panel deduplicates by `routeShortName` while the tooltip used raw `routeIds.length`. Removed the count from the tooltip entirely.

### Added
- **Real-Time GTFS Proxy**: Added `api/gtfs-rt.ts` to proxy and parse binary GTFS-RT TripUpdates into JSON for easier consumption.
- **Schedule Adherence Polling**: Implemented `api/cron/poll.ts` to record predicted vs. scheduled arrivals for Burlington Route 1 and Hamilton B-Line every minute. Each snapshot now includes per-stop headway-vs-scheduled diff (`headwayDeltaMin`) and per-trip segment drift (`entryDelayMin`, `exitDelayMin`, `driftMin`) to detect bunching and early running.
- **Vercel Cron Configuration**: Added `vercel.json` to manage the minute-by-minute polling schedule and API rewrites.
- **Live adherence display**: Selecting Burlington Route 1 or Hamilton Route 1 in the route panel now shows a pulsing "Live" badge with current avg headway delta vs. schedule and a per-trip on-time/late/early breakdown, via a new `api/live-status.ts` Blob proxy and `useLiveAdherence` hook (60s polling).

### Changed
- **Google Maps-style floating UI**: replaced the spanning header bar with independent floating pills — logo, search, on-screen/coverage stats (top-left) and filter chips, settings, dark-mode toggle (top-right) — instead of one combined header bar or combined controls. Stripped remaining all-caps text and decorative icons from the filter UI.
- **Frequency/Mode/Day/Agencies filters broken out into chips**: all four filters now live as standalone pill buttons beside the settings button (Maps' category-chip pattern) instead of inside a single dropdown. Each chip keeps a static label (e.g. "Frequency") with a small dot indicator, and opens its own small dropdown to change the value. Frequency and Day always show their dot/active styling since neither has a true "no filter" default (60 min still excludes Infrequent routes; Weekday still excludes weekend service); Mode and Agencies only show it once something is actually selected. Live polling and hide-irregular are the only toggles left in the (now renamed) Settings popover.
- **On screen / Coverage stats as pills**: lifted out of the sidebar panel entirely and shown as small inline pills next to the search bar (via a new `onStatsChange` callback from `Interval` up to `App`), instead of boxy stat cards inside the sidebar. Coverage percentage no longer uses indigo coloring, since the color didn't correspond to anything meaningful.
- **Sidebar detail panel decluttered and flattened**: removed the "Interval" title/description text and the standalone Reset button (clicking outside the panel already closes it). Route/stop detail blocks no longer render as a nested card-in-card — the inner background/border wrapper was removed so they sit directly on the panel surface. The panel itself now renders nothing (instead of an empty shell) when there's no stop/route selected and no active search.
- **Sidebar panel aligned with search bar**: width matched to the search pill (`w-64`) and left-aligned with the search bar's left edge instead of the outer page margin, so the panel doesn't appear to start further left than the search bar above it.

### Fixed
- **GO Milton (MI) showing false all-day frequency**: Milton line is rush-hour-only — each direction runs a short AM or PM peak window covering less than 40% of the weekday analysis window, but was classified as tier 15/60 with headways like "every 15 min." Routes whose active span covers less than 40% of the day window (or ≤90 minutes total) are now classified as `span` with null headway, same as school runs and shuttles.
- **GO refresh taking 30+ minutes locally**: stop-to-route indexing in `process-core.ts` was O(stop_times × trips) via repeated `.find()` calls, plus O(stops × routes) reverse lookups. Replaced with trip/stop maps for O(1) lookups so large feeds like GO Transit refresh in a few minutes instead of hanging the machine.
- **Redundant TTC headsigns**: stripped redundant "Line X (Name) towards" prefixes and identical-to-line-name headsigns from the display labels, specifically fixing TTC subway directions (e.g., "to Line 4 (Sheppard) towards Don Mills" now shows as "to Don Mills").
- **Filter chip dropdowns clipped off-screen**: dropdowns were anchored `left-0` on their trigger chip, which overflows the viewport since the chip row sits at the right edge of the screen. Anchored to `right-0` instead so they open leftward.
- **Station View only showed a route count, not route names**: clicking a stop showed "N routes depart from here" with no way to see which routes. Stop features only carry raw `routeIds`, not names — names are now cross-referenced from route features in `layers` and shown as badges.

### Fixed
- **Sidebar panel couldn't scroll to the bottom**: the scrollable panel was a flex child with no `min-h-0`/`flex-1`, so it grew to fit its content instead of being constrained by the parent's max-height — `overflow-y-auto` never actually kicked in. Agency list (and anything below it) was unreachable when the panel content exceeded the viewport. Fixed by making the scroll container a proper shrinking flex child.
- **Route lines very hard to click**: thin route lines (1–4px) had a click hit-area equal to their visual width, since Leaflet's Canvas renderer ties click tolerance directly to stroke `weight`. Added an invisible 16px-wide "hit" line under each route purely for click/tap detection, so thin lines stay visually unobtrusive but are much easier to select.
- **Search results showed only a count, not which routes matched**: typing a query surfaced "N routes match" with no way to see or jump to them. The match list now shows each matching route's number and agency, clickable to open its detail panel directly.
- **TTC Route 954 (and any route with AM/PM-split shape IDs) showing a false frequency tier**: TTC's GTFS gives the morning-peak and afternoon-peak blocks of the same physical route *different* `shape_id`s despite identical geometry (confirmed: both directions' AM/PM shape pairs have identical point counts). The phase-1 "most common shape" analysis filter — added earlier to stop short-turn branches from skewing headway — picked whichever block had marginally more trips and silently discarded the other, so a rush-hour-only express (954) was analyzed using only its PM block and came back as a normal ~12 min tier instead of `span`. Fixed by grouping shape_ids by point-count equivalence before filtering, so geometrically identical AM/PM blocks are now analyzed together; genuine branches/short-turns (which differ in length) are still excluded as before.
- **Route info panel showing duplicate "directions"**: The panel matched every feature for a route across all three day types (Weekday/Saturday/Sunday) instead of just the currently selected day, so a 2-direction route like DRT 905 showed up as 6 "directions." `SidebarControls` now filters by the active day before building the directions list.
- **Stale Blob data after refresh**: Agency GeoJSON is served from Vercel Blob with `cache-control: max-age=2592000` (30 days). Browsers that had already fetched an agency's data would keep serving the pre-refresh version for up to 30 days, making weekly auto-refreshes invisible until a hard refresh. `useAgencyData` now fetches with `cache: 'no-store'` so refreshed data is picked up on a normal reload.
- **School/shuttle routes claiming false frequency tiers**: Routes whose trips are compressed into less than 90 minutes of the analysis window (school runs, shuttle bursts, depot moves) were passing the `determineTier` check and showing "every 1 min" or similar impossible headways. Added a span guard: any route with service span < 90 min is classified as `span` and excluded from the tier display. YRT route 417 (Bill Hogarth SS, every 1 min) and similar routes now correctly show as span.
- **DRT 905 only showing Whitby–Oshawa segment**: The full Pickering→Oshawa corridor shape (1921 pts) lost the display-shape selection to a shorter 700-pt shape because it had fewer trips. The new longest-display-shape logic now correctly selects the 1921-pt shape for display. DRT and YRT refreshed to apply both fixes.
- **Bus branch routes not showing full extent**: The pipeline selected the most-common shape per route direction for both display and frequency analysis. On routes with branching variants (e.g. HSR Route 5 via Downtown Dundas), the branch with fewer trips always lost — Route 5's Dundas branches were invisible on the map. Fixed by splitting shape selection into two maps: display uses the longest shape (full branch extent) while analysis keeps the most-common shape (correct headway from main-route trips).
- **Hamilton stale Blob data**: Hamilton Blob data dated from the August 2025 schedule. Route 51 (University, suspended April 26 2026) was appearing as active; Routes 5, 33, 34, 35, 52 were missing from the Dundas area. Refreshed Hamilton from the live HSR feed.
- **ION headway wrong (AI-55)**: GRT Route 301 was showing "every 9 min" instead of every 10 min. The `getActiveServiceIds` function was unconditionally including single-occurrence holiday replacement services (Family Day, Good Friday) alongside the regular weekday service, adding 26 spurious departure times that created artificial 5-minute gaps. Fixed by splitting candidateDates processing into two passes — regular/weekly services first, then count=1 services only if no regular service exists (preserves WSF-style feed support).
- **GO Transit straight-line visuals (AI-56)**: Combined frequency corridor features were being generated for GO Transit's all-rail feed, producing hundreds of 2-point stop-pair chord features that rendered as orange straight lines fanning out from Union Station. Corridors are now skipped for feeds where every route is `route_type=2` (rail), since rail lines run on dedicated single-operator corridors where aggregate stop-pair frequency is not meaningful.
- **GO Transit duplicate route lines (AI-56)**: GO Transit encodes schedule change dates in route IDs (e.g. `04260626-LW` and `06260926-LW` for the same Lakeshore West line in two periods). Both period's routes were active in the analysis window, producing two overlapping LineString features per line. Pipeline now deduplicates route features by `(routeShortName, directionId, day)`, keeping the lower-headway (busier) service period.
- **Combined corridor straight-line diagonals**: Bus-agency corridor features (2-point stop-pair chords from AI-17) were rendering as long diagonal straight lines crossing the map — notably going across Lake Ontario and not following road or rail geometry. On express routes where adjacent stops are far apart, these chords create misleading diagonals that obscure actual route shapes. Corridor features are now hidden entirely in the frontend; individual route lines already convey frequency via colour tier, so corridors added visual noise without useful information.
- **Burlington holiday service inflating weekday frequency**: Burlington Transit encodes holiday service (e.g. Victoria Day) in `calendar.txt` with `start_date === end_date` and all DOW flags set to `1`. These single-day entries were being included alongside regular multi-day weekday service, nearly doubling trip counts and halving the apparent headway (Route 1 appeared to run every 10 min instead of ~30 min). `getActiveServiceIds` Step 1 now uses the same two-pass approach as Step 2: multi-day services in Pass A; single-day entries only in Pass B if Pass A found nothing.
- **Shape filter built from wrong service period (DRT)**: DRT encodes schedule version in shape IDs (e.g. `-2026-04` vs `-2026-06`). The dominant-shape calculation was counting across ALL trips, including future-period trips, which selected a shape ID that no current-period trip matched — silently dropping every trip and producing missing or wildly incorrect headways. Shape counts are now built only from trips whose `service_id` is active in the current period (`detectReferenceDate` + `getActiveServiceIds` across Mon/Sat/Sun). Fixes DRT 905 and any other agency with versioned shape IDs.
- **GO rail lines in wrong tier or hidden**: Rail short-turn trips (e.g. GO Union→Bramalea) were being excluded by the dominant-shape filter, leaving only the handful of end-to-end trips and inflating computed headways by ~6×. Rail routes now bypass the phase-1 shape filter entirely — all trips count toward frequency, while the longest shape is still used for display geometry. Additionally, the rail tier array was missing `60`, so any rail route averaging >30 min fell into `tier=span` and was hidden by default. Added `60` to `modeTierOverrides.rail`.

### Added
- **Headsign-based direction labels**: route panel directions now show "to {headsign}" (e.g. "to Whitby Station") instead of generic "Direction 1"/"Direction 2", with light normalization stripping agency branch-letter prefixes (e.g. DRT's "A - Windfields Farm" → "Windfields Farm").
- **Hide irregular/peak-only routes toggle**: new advanced filter to hide routes with no sustained frequency tier (school runs, shuttles, rush-hour-only express routes) — the existing max-headway slider doesn't catch these since they fall back to raw average headway.
- **Light mode default**: map now defaults to light mode; dark mode still available via the toggle.
- **Auto day-type**: day selector (Weekday/Saturday/Sunday) now initialises to today's actual day instead of always defaulting to Weekday.
- **GO Transit rail**: 7 rail lines (Lakeshore East/West, Kitchener, Barrie, Stouffville, Richmond Hill, Milton) added to the map using a rail-only filtered feed. Routes use actual shape geometry (longest shape per direction, not most-frequent short-turn pattern).
- **Stop dots hidden at regional zoom**: transit stop markers now only appear at zoom ≥ 13; at the regional overview zoom they were covering the entire map in thousands of overlapping circles. Stops mount as a separate Leaflet layer so zooming in/out doesn't remount route lines.

### Added
- **Combined frequency corridors (AI-17)**: overlapping routes on shared stop-to-stop links now emit corridor features with *combined* (union) headway. These render as slightly thicker overlays on top of the per-route lines, so corridor segments visually show the effective frequency provided by multiple routes (e.g. two 12 min routes → ~6 min combined corridor in the tighter color tier). Day and headway filters apply to corridors; station selection filters to corridors involving the stop's routes; search matches corridors via participating route IDs/names.
- **Route info panel (AI-18)**: clicking a route opens a detail panel in the sidebar — route name, agency, and per-direction headways with tier dots. The hover tooltip slims down to route name + headway; the click is now the way to get full detail.

### Changed
- **Viewport-scoped stats (AI-19)**: the "On screen" and Coverage numbers now reflect the current map view instead of the whole region — they recompute as you pan/zoom, using cached per-feature bounding boxes.
- **Clickable legend (AI-20)**: merged the redundant "Show up to" buttons and Legend swatches into one control — each legend tier row is now the frequency filter; tiers above the active threshold dim to show they're hidden. The wordmark also no longer renders all-caps (AI-16).

### Added
- **Clickable Stations**: Users can now click on transit hubs and stations to discover all routes departing from that location.
  - **Spatial Discovery**: Clicking a station filters the regional map to show only the specific routes serving that hub.
  - **Station View HUD**: Added a dedicated sidebar panel that displays the station name and route count when a hub is selected.
  - **Visual Feedback**: Selected stations are highlighted with an indigo pulse and white border for clear spatial focus.
  - **Integrated Reset**: Station selection is automatically cleared when global filters are reset or the map background is clicked.
- **Advanced Map Filtering**: Implemented a comprehensive multi-dimensional filtering system.
  - **Agency Filtering**: Toggle visibility for each of the 13 GTHA agencies (TTC, GO Transit, MiWay, etc.).
  - **Mode Filtering**: Filter routes by vehicle type (Subway, Streetcar, Rail, Bus).
  - **Day Selection**: Support for switching between Weekday, Saturday, and Sunday service levels.
  - **Collapsible UI**: Added an "Advanced Filters" section in the sidebar with active filter indicators and a Reset button.
- **Unit Testing Suite**: Integrated Vitest, JSDOM, and React Testing Library.
  - Added high-coverage tests for `useIntervalStats` hook and color mapping utilities.
- **Clickable Stations (Roadmap)**: Logged feature request for station-level route discovery via spatial mapping.

### Fixed
- **Theme Architecture Refactor**: Centralized all UI colors into CSS variables with a robust `data-theme` switching mechanism on the document root.
- **Persistent Light Mode**: Implemented theme persistence via `localStorage` and synchronized it across the header, map tiles, and side panel.
- **Dynamic Tooltip Colors**: Refactored route overlays to use CSS classes and theme variables, resolving the bug where tooltips remained in dark mode when the app was set to light mode.
- **Header Cleanup**: Removed the hardcoded "Greater Toronto & Hamilton Area" label from the masthead to reflect the expanded regional coverage.
- **Header Theme Consistency**: Fixed the menu bar/header failing to update colors in light mode by linking its background and text to the new theme architecture.

### Changed
- **Search Relocation**: Moved the route search bar from the sidebar to the global header for better UI space utilization and a more standard navigation experience.
- **Color Logic Extraction**: Moved all headway tiering and color mapping logic into a dedicated `src/utils/colors.ts` for better testability and reuse.
- **Modular 'Clean Architecture' Refactor**: Deconstructed the monolithic `Interval.tsx` into a modern modular structure.
  - Extracted data fetching and processing into `useAgencyData` hook.
  - Extracted search, filtering logic, and statistics into `useIntervalStats` hook.
  - Split UI into `MapCanvas` (Leaflet logic) and `SidebarControls` (HUD/filtering) components.
  - Reduced primary application logic from 14KB to <50 lines, significantly improving maintainability for future filtering features.
- **Full reset to the original premise**: a hosted map of how frequent transit service is. Deleted the OCI server, v0 realtime backend, Express API, router, Zustand, and Firebase. Atlas is now a static Vite + React + Leaflet app with no server and no database.
- Thinner line weights (frequent routes 3→2, others 1.5→1) for a less cluttered map at regional zoom.
- Canvas rendering for the ~1,000 simultaneous polylines.

### Added
- **Greater Golden Horseshoe expansion**: Barrie Transit, Grand River Transit, Guelph Transit, and Niagara Region Transit join the map — 13 agencies total. Bradford was evaluated but BWG Transit is on-demand only (no GTFS exists). GRT and Niagara use the Mobility Database stable mirror because their official URLs are dead or unreliable.
- **Single regional map**: all 9 GTHA networks load in parallel onto one continuous map — pan between cities like Google Maps, no agency switcher. Tooltips show the operating agency.
- **Route search**: search box filters routes by number or name across the whole region; matches highlight while everything else dims, with a live match count.
- **GTHA coverage**: 9 agencies live — TTC, Brampton, Burlington, Durham Region, Hamilton, Milton, MiWay, Oakville, YRT.
- **Pipeline → Blob architecture**: `pipeline/process-core.ts` turns a GTFS zip into GeoJSON (route shapes + weekday headway tiers); data is stored in Vercel Blob, keeping the repo at ~80 KB regardless of agency count.
- **`npm run refresh`**: re-downloads every agency's verified `feedUrl` and rebuilds its Blob data. All 9 source URLs tested live.
- **Weekly automation**: GitHub Action refreshes all feeds every Monday and commits index changes.
- **Production deploy**: https://atlas-gamma-two.vercel.app

### Fixed
- Brampton and Hamilton were built from expired local GTFS zips; both rebuilt from current published feeds.
- Cross-platform lockfile drift (`@emnapi/*`) that broke `npm ci` on Linux CI.
- Tooltip white border: stripped Leaflet's default tooltip background, border, and arrow via `.atlas-tooltip` CSS overrides so only the custom dark popup renders.
- Frequency filter showing routes above threshold: routes with `headway: null` were unconditionally passing the visibility check and rendering at any filter level. Null-headway routes are now hidden unless the filter is set to All.
- Short-turn trips inflating headway: the pipeline was computing headway across all trips for a route+direction, including short-turn variants that only cover part of the corridor. Phase 1 now accepts a shape filter and process-core passes the dominant shape per route+direction, so headway is computed only from trips that run the full pattern. Verified on Guelph Route 99 Mainline: corrected from 8m → 10m.

### Added
- **Route selection**: clicking a route highlights it at full color/weight and dims all other routes to dark grey; click the same route or the map background to deselect.
- **"All" frequency filter**: new button alongside the existing headway thresholds shows every route including infrequent ones (>60m), rendered in the existing Infrequent grey tier.
- **Light mode**: sun/moon toggle in the panel header switches between dark (CartoDB dark) and light (CartoDB light) map tiles with a fully adapted panel theme.

## [0.22.5] - 2026-05-12

### Added
- **Stops & Connections API**: Added new backend endpoints to support spatial intelligence:
  - `GET /api/stops/:agency`: Retrieves up to 2,000 stops for a specific agency.
  - `GET /api/connections/:agency/:stopId`: Identifies all distinct stops connected to a given stop within the same agency.

### Fixed
- **Deployment Script Restoration**: Restored the `scripts/deploy.sh` script to the repository root. It was accidentally moved to `v0/scripts/` during the V0 archive, which was causing the `npm run deploy` command to fail with a missing file error.

## [0.22.4] - 2026-05-12

### Fixed
- **CodeQL Security**: Addressed 4 security vulnerabilities identified by CodeQL and Dependabot:
  - Fixed incomplete URL substring sanitization in `v0/backend/src/ingestion/poller.ts` by explicitly parsing the URL hostname.
  - Added rate limiting via `express-rate-limit` to the SPA fallback route in `v0/backend/src/server.ts` to prevent potential DoS.
  - Set explicit `contents: read` permissions for the `GITHUB_TOKEN` in the `.github/workflows/ci.yml` workflow.
  - Re-generated `v0/backend/package-lock.json` to properly reflect the patched `@tootallnate/once` `>=3.0.1` dependency override.

## [0.22.3] - 2026-05-12

### Fixed
- **SQL Injection Hardening**: Refactored multiple backend services (`VehicleService`, `IntelligenceService`, `import-routes`) to eliminate dynamic SQL string construction, resolving 3 CodeQL security alerts.
- **Vulnerability Remediation**: Patched `@tootallnate/once` to `>=3.0.1` via package overrides to resolve a low-severity security finding.
- **Git Hygiene**: Updated `.gitignore` to exclude agent-specific context files (`CLAUDE.md`, `GEMINI.md`, `ATLASLOG.md`) and session handoff documents.

## [0.22.2] - 2026-05-12

### Fixed
- **Root Lockfile Sync**: Explicitly installed `@emnapi/core` and `@emnapi/runtime` to resolve a persistent `npm ci` failure in GitHub Actions caused by missing peer dependencies for `firebase`.