# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Derive headway and stop offsets from GTFS pipeline (AI-150)**: Added automatic headway and stop travel-time offset calculation directly from the GTFS datasets during the pipeline execution (`processGtfsBuffer` in `process-core.ts`). The computed metadata is stored as a sidecar JSON file (`atlas/live-polling/{slug}.json`) on Cloudflare R2.
- **Dynamic live & history headway overrides (AI-150)**: Updated `computeLiveAdherence` and `api/history-adherence` to asynchronously fetch the pipeline-computed sidecars from R2 and use the dynamically computed scheduled headway values with backwards-compatible fallbacks.
- **Automated history headway aggregation (AI-154)**: Created the `build-history.ts` pipeline script to fetch all historical agency headway snapshots from R2, compile them, and dynamically generate `shared/historyConfig.ts`, replacing hardcoded history configurations.
- **Offload GeoJSON parsing to Web Worker (AI-147)**: Implemented `geoWorker.ts` to asynchronously fetch, parse, and enrich large agency GeoJSON files (like TTC or GO Transit) in a background thread, preventing main-thread lag when switching agencies or loading the map. Includes a graceful fallback to main-thread processing in environments without worker support (such as tests).
- **Search bar suggestions on focus (AI-152)**: Shows a Suggestions panel when clicking into the search input with an empty query. Displays the last 5 searches (stored in localStorage) if they exist.
- **Search bar suggestions fallbacks**: If no recent searches exist, falls back to recently viewed routes (up to 5 routes saved when tapped on the map) or dynamic popular/frequent routes in the viewport in Frequency map, and falls back to listing all historical agencies in History view.
- **Live Vehicles App (AI-155)**: Implemented a new real-time vehicle positions tracking map screen (accessible via the app drawer). Features include a serverless API proxy (`api/live-vehicles.ts`) to fetch and parse GTFS-RT positions/trip-updates feeds, colored delay-status indicators (on time, early, late), automatic 15-second polling, search/filtering by route number or headsign, and map auto-centering/popup opening on clicked vehicles.
- **PMTiles + MapLibre GL JS migration (AI-145)**: Completely replaced Leaflet with MapLibre GL JS and range-requested `.pmtiles` vector tiles from R2 for static route geometries and stop markers. Implemented the unified national PMTiles vector tile generator script (`pipeline/build-pmtiles.ts`) utilizing `tippecanoe`. Rebuilt controls, bounds triggers, and custom HTML/CSS marker overlays for history stop cards and live vehicle tracking directly onto the WebGL map canvas, reducing cold-load data requests by 98% and achieving fluid 60 FPS panning/zooming at any scale.

### Fixed
- **Filter History suggestions**: Excluded agencies that have no historical snapshots populated from the search suggestion dropdown in the History app, ensuring only agencies with active history are shown.
- **Corridors app top-right layout overlap**: Fixed a visual clashing bug where the Frequency settings/light-mode panel and the Corridors day-picker overlapped in the top-right corner. The Frequency map settings panel is now conditionally hidden when `showCorridorBand` is active, and the light-mode toggle is integrated cleanly into the Corridors top-right bar next to the day picker.

### Changed
- **Unified color token systems**: Centralized scattered and duplicated early/late/on_time status colors and corridors timeline headway color logic (`hwColor`) from local files (`LiveVehicles.tsx`, `LiveVehiclesLayer.tsx`, `Corridors.tsx`) into `src/utils/colors.ts` under the new `STATUS_COLORS` mapping and helpers (`getVehicleColors` / `getTimelineHeadwayColor`). Updated vehicle list rendering to use separate background and text colors for proper contrast.
- **Systematic style and transition centralization (AI-151 & AI-153)**: Replaced inline CSS panels and raw transition durations (200ms, 300ms) with shared constants `FLOATING_CARD`, `PANEL_ENTER`, `PANEL_ENTER_LEFT`, `PANEL_ENTER_TOP`, `TRANSITION_BASE`, and `TRANSITION_SLOW` from `styles.ts` across all Interval, Corridors, and History components.
- **Centralize R2 public bucket URL fallback**: Created `shared/config.ts` to expose `R2_PUBLIC_URL` using environment variables for serverless APIs and client-side Vite builds, replacing duplicated hardcoded strings in `api/history-adherence.ts`, `shared/computeLiveAdherence.ts`, and `src/components/Interval/MapCanvas.tsx`.
- **Centralize time periods configurations**: Added `TIME_PERIODS` metadata to `shared/config.ts` defining start/end hours and labels. Integrated it dynamically into `pipeline/process-core.ts` (mapped to minutes), `FilterChips.tsx` (for calculating the active period), `Corridors.tsx` (automatically formatting the timeline columns and layouts), and `useIntervalStats.ts` (generating `PERIOD_LABELS` dynamically), removing duplicate hardcoded hours and labels.
- **Centralize headway tiers configurations**: Added `HEADWAY_TIERS` configuration metadata to `shared/config.ts` defining maximum intervals, colors, and label names. Integrated it dynamically into `pipeline/process-core.ts` (for auto-assigning headway tiers) and `MapCanvas.tsx` (for dynamically constructing WebGL route line coloring stylesheet match expressions), and re-exported it in `colors.ts`, removing duplicate hardcoded thresholds and coloring arrays.
- **Reset map selection on app switch**: Added a `useEffect` inside `Interval.tsx` to automatically clear selected routes, selected stops, and disambiguation states when leaving the Frequency map app, preventing selection filters from leaking and distorting other screens (like Live Vehicles, Corridors, or History overlays).
- **Segment corridors from route queries**: Filtered out `-corridors` layers from search suggestions, route statistics, notable routes lists, debug headways, stop detail listings, and nearby routes calculations, preventing overlapping corridor geo segments from polluting the text query searches and route list interfaces.
- **Optimize MapCanvas rendering speed**: Removed unused `layers` and `allLayers` properties from the `MapCanvas` component definition and JSX instantiation, preventing map redraws and component re-renders when panning or zooming triggers GeoJSON data downloads in the background.

### Changed
- **History: removed Year/Freq filter chips**: premature with only one route; will revisit when there's enough data to make filtering meaningful (tracked in Linear).
- **History: panel renamed "Suggestions"**: the agency list header now reads "Suggestions" instead of "Frequency History"; will dynamically switch to "Recents" once search history is implemented.
- **History: focus-triggered panel**: the Suggestions panel now appears only when the search bar is focused (or an agency is selected). Clicking map or pressing Escape dismisses it. Agency list items use `onMouseDown` with `preventDefault()` so clicking them doesn't blur the input before the click registers.

### Fixed
- **Search bar placeholder transition**: switching apps no longer causes the placeholder text to snap instantly. A custom `<span>` replaces the native `placeholder` attribute and fades out/in (120ms) when the label changes between "Search routes", "Find an agency…", and "From".

### Fixed
- **History: panel now left-side floating card**: History content renders at `top-20 left-[182px]` (same position as Frequency sidebar panels) instead of a bottom slide-up strip. Agency list and route comparison cards use the same `bg-[var(--bg-panel)] rounded-2xl shadow-2xl` style as the rest of the app.
- **History: map auto-flies on open**: when no agency is selected, falls back to the first entry in HISTORY_DATA so the map always flies somewhere useful when History is opened.
- **History: settings and info buttons visible again**: FilterChips + Now button are gated by `showUi` (Frequency-only), but FilterPanel (settings + info) is now always rendered regardless of active app.
- **History: search bar reuses main top bar**: History mode no longer hides the search bar; instead it repurposes it as "Find an agency…" and wires the query into the History agency list filter. Typing clears the agency selection.
- **History panel**: removed internal search bar; removed custom card styles; agency list uses plain border-b row pattern consistent with the rest of the app; "FREQUENCY HISTORY" all-caps label corrected to "Frequency History".

### Changed
- **History app redesigned as Frequency History**: replaced the live schedule-adherence panel entirely. New flow: agency search → route list → before/after headway comparison cards. Shows how a route's weekday frequency has changed across snapshot years (e.g. GCRTA HealthLine: 5 min → 7.5 min → 15 min). Year chips highlight a specific snapshot across all route cards; frequency chips filter routes by headway threshold at the selected year.

### Added
- **`shared/historyConfig.ts`**: data model for historical GTFS snapshots (`AgencyHistory`, `RouteHistoryEntry`, `RouteSnapshot`). Seeded with GCRTA HealthLine (2008 launch 5 min, 2016 7.5 min, 2026 15 min).

### Added
- **"Now" action button**: sits between the filter chips and Settings button; snaps both Day and Period to the current moment (day-of-week + time period). Filled accent when already at "now", tinted accent bg otherwise. Time periods: AM Peak 6–9a, Midday 9a–3p, PM Peak 3–7p, Evening 7–11p, All day outside those hours.

### Fixed
- **Search bar X button**: was flush with the right border of the pill (`right-0`); moved to `right-2` so it's properly inset.

### Added
- **Agency search in main search bar**: typing an agency slug (e.g. "ttc", "hamilton") or display name (3+ chars, e.g. "toronto") now matches all routes for that agency, filtering the map to just that agency's network.

### Fixed
- **History map auto-fly**: switching to the History app now immediately flies the map to the selected agency's center (before stop data loads), then refines to a `fitBounds` around the anchor stops once the stops index loads. Previously the map stayed wherever you last left it.
- **Settings panel**: frequency-only settings (Live tracking, Hide irregular, Combined corridors) now appear dimmed with a "These settings apply to the Frequency map" note when in Corridors or History — still editable, but context-appropriate. Settings persist when switching apps since Interval stays mounted.
- **History route picker**: key-gated routes (TransLink 099, STM 55) were appearing in the History app's route selector even though they're not accessible yet. Now filtered to only show routes without an API key requirement (or with `active: true`).

### Added
- **STM live polling**: STM Route 55 is now live. Added `active` flag to `LiveRouteConfig` — key-gated routes with `active: true` show in the UI; without it they stay hidden until configured. STM GTFS-RT added to the Cloudflare Worker archiver with `apikey` header auth. `STM_API_KEY` added to Vercel and the Worker secret store.

### Fixed
- **Filter chips transition**: now scales in/out from the left (origin-left) — chips expand from the Days card position when entering Frequency and collapse back when leaving.
- **Settings/InfoPanel header height mismatch**: Settings header `py-4` (60px) was taller than InfoPanel tabs (44px), causing the border-b divider to appear at different heights. Settings reduced to `py-2` (44px) to match.
- **Corridors alignment**: "To" pill, From/To dropdowns, and results panel were all offset at `left: 104px` (pre-dates wordmark + AppDrawer). All updated to `left: 182px` via `SEARCH_LEFT` constant.
- **App drawer icon**: switched from rounded rects to circles for a cleaner dot-grid look.
- **InfoPanel tab header height** now matches the Settings panel header (`pt-4 pb-3.5` on tabs vs `py-4` in Settings).

### Added
- **IndexedDB GeoJSON cache** (`src/lib/idbCache.ts`): agency GeoJSON and corridor data now persists in IndexedDB between sessions, keyed by `{slug}-{weekVersion}`. On repeat visits within the same week, all agencies load from local storage instead of R2 — near-instant on return visits. Falls through to network on any IDB failure (private browsing, quota). Stale entries from prior weeks are pruned automatically on first load. Closes AI-146.

### Added
- **docs/ARCHITECTURE.md**: full bucket contract (atlas/atlas-archive/atlas-live), live polling split (client-side vs. Cloudflare Worker archiver), data flow, env vars, Vercel API routes, retention policy.
- **CLAUDE.md**: updated agency count (65), added R2 bucket quick-reference and live polling quick-reference, pointer to ARCHITECTURE.md.

### Fixed
- **atlas-history misplaced in atlas bucket**: headway diff snapshots (`history/{slug}/`) now written to `atlas-archive` (private) instead of `atlas` (public). Added `r2PutArchiveJson` and `r2GetArchive` to `pipeline/r2.ts`; updated `pipeline/refresh.ts` to use them.

### Added
- **InfoPanel "Live" tab**: dedicated tab listing all live-polled routes (route number, agency, scheduled headway). Replaces the inline list that was in the About tab. Accessible from the Settings panel via "See which routes →" link on the Live tracking toggle.
- **Agency cards in Agencies tab**: clicking any agency in the list shows a detail view with name, region, slug, and live-polled routes for that agency. Back button returns to list. Agencies with live routes show a Radio icon in the list.
- **Region chips scroll horizontally** in the Agencies tab — no more multi-row wrap.

### Fixed
- **Double "About" header**: removed the static "About" title from the InfoPanel header; tabs (About / Agencies / Live) provide sufficient navigation context.
- **Search results panel misaligned**: `left-[104px]` hardcoded offset pre-dated the wordmark + AppDrawer additions; updated to `left-[182px]` to align under the search bar.
- **Leaflet attribution restyled**: smaller font, transparent background, themed text — legally required but no longer visually jarring.
- **InfoPanel opens to correct tab**: `defaultTab` prop added; Settings "See which routes →" opens directly to the Live tab.

### Added
- **Shared UI style constants** (`src/styles.ts`): extracted `SURFACE`, `ICON_BTN`, `DROPDOWN_PANEL`, `dropdownAnim`, `FLOATING_CARD`, `PILL_SURFACE`, `CHIP_BASE` — used across `FilterPanel`, `InfoPanel`, `FilterChips`, `AppDrawer`, `App`. Single source of truth for structural tokens; color tokens remain in CSS variables.
- **InfoPanel redesigned as right-anchored dropdown**: replaces the centered floating modal with a card that drops down from the top-right under the info button (`top-[4.5rem] right-6`), scales in from `origin-top-right`. Settings slide-in is unchanged — the two panels now have distinct but complementary treatments.
- **Live tracking: TTC 503 Kingston Rd and 504 King**: both routes added using the open `gtfsrt.ttc.ca` feed (no API key). 503 covers York/King → Sackville → Woodbine → Bingham Loop at 10 min; 504 covers Dundas West → Niagara → Church → Broadview at 5 min.
- **Live tracking: TransLink 99 B-Line, STM 55 Saint-Laurent**: two new routes in `livePollingConfig.ts` for key-gated feeds. TransLink 099 (UBC–Commercial-Broadway) uses `TRANSLINK_API_KEY` appended as a URL query param; STM 55 (Henri-Bourassa–Saint-Jacques) uses `STM_API_KEY` sent as an HTTP header. Both degrade gracefully (return `noData`) until the respective env vars are added to Vercel. `LiveRouteConfig` now has optional `apiKeyParamEnvVar` and `apiKeyHeaderEnvVar` fields; `fetchTripUpdates` injects them at call time.
- **Live tracking: Edmonton 004, YRT VIVA Blue, Halifax 1**: three new routes added to `livePollingConfig.ts` using open GTFS-RT feeds (no API key required). Edmonton 004 (Lewis Farms – University – Capilano) at `gtfs.edmonton.ca`; VIVA Blue (Finch GO – Newmarket Terminal) at `rtu.york.ca`; Halifax Route 1 (Spring Garden, Mumford – Bridge Terminal) at `gtfs.halifax.ca`. Each entry includes both-direction anchor stops and scheduled offsets. Vancouver 99 B-Line and Montréal 55 are next but need free API key registration (TransLink developer portal, STM developer portal).
- **Warn on expired GTFS feeds during refresh** (AI-138): after peeking `feed_end_date`, `refresh.ts` now compares it against today and prints a warning (`[warn] feed expired Nd ago (YYYY-MM-DD)`) before processing — makes stale feeds visible in CI logs and terminal output.
- **Multi-feed support** (AI-137): `refresh.ts` now accepts `supplementalFeedUrls` on any agency entry. Supplemental zips are downloaded, processed, and merged into the primary output before writing to R2 — features, corridors, and stops all combined. NFTA `supplementalFeedUrls` set to the Metro Rail feed so the rail data survives the weekly refresh automatically.
- **25 new agencies**: TransLink (Vancouver), BC Transit Fraser Valley, BC Transit Victoria, BC Transit Kelowna, RTC (Québec City), Sarnia Transit, Blue Water Area Transit (Port Huron), DDOT, SMART, Detroit People Mover, QLine, TheRide (Ann Arbor), GCRTA (Cleveland), TARTA (Toledo), Calgary Transit, Edmonton Transit (ETS), Winnipeg Transit, Halifax Transit, Regina Transit, Codiac Transpo (Moncton), Fredericton Transit, Saint John Transit, T3 Transit (PEI), Metrobus (St. John's NL), Saskatoon Transit. Total: 65 agencies. Now covers every Canadian province plus US expansion. Calgary/Edmonton/Winnipeg/Fredericton use direct city feed URLs. Saskatoon Transit assembled from ArcGIS Hub CSVs (official server returning 503; feedUrl set to recover automatically when server comes back).
- **NFTA Metro Rail merged into NFTA**: bus and rail are served as one agency entry. R2 data is manually merged (4061 features). `feedUrl` updated to direct NFTA URL. Rail will be re-merged once AI-137 (multi-feed support) ships.
- **index.json refactored**: added `region` field to all agencies; sorted by region then name; removed `octranspo-debug` and duplicate `hsr` entries; added missing bboxes; standardized field ordering.

### Fixed
- **Corridors scroll broken** (AI-141): App.tsx Corridors wrapper div had no `pointer-events-none` when active, swallowing all mouse/scroll events before they reached the Interval map. Fixed by moving `pointer-events-none` to always apply on the wrapper — Corridors panels already use `pointer-events-auto` so they remain interactive.
- **Legend/filter color mismatch** (AI-142): `colors.ts` `HEADWAY_TIERS` used dark-gray shades that bore no relation to the blue/green/amber/red shown in the InfoPanel legend. Updated to use the semantic palette: blue (≤10 min), green (≤20 min), amber (≤30 min), red (≤60 min), gray (Infrequent). InfoPanel now imports `HEADWAY_TIERS` directly — no more duplicated color values.
- **Settings panel**: the Settings dropdown is now a slide-in right panel (matching the InfoPanel pattern). Each setting shows a one-sentence description explaining what it does — "Combined corridors", "Live tracking only", "Hide irregular routes". About Atlas button moved into the panel footer.
- **Deduplicate stop pins at shared stations** (AI-94): added a cross-agency `primaryStopKeys` memo in MapCanvas that picks the highest-priority stop per ~50m grid cell (rail > bus, more routes = higher score). Non-primary stops render as zero-radius invisible markers, so GO stations shared by multiple agencies show one clean pin instead of 2–3 overlapping dots.
- **Station view direction separator** (AI-95): when a route serves a stop in both directions, a subtle divider is now rendered between the direction groups so headsigns are visually organized rather than listed as a flat undifferentiated sequence.
- **Select All / Select None in Agencies filter** (AI-140): two buttons at the top of the agencies dropdown. "All" re-enables every agency; "None" deselects all. Both are disabled when already in that state.
- **Refactor: extract MapCanvas Leaflet sub-components** — `MapRefCapturer`, `MapClickHandler`, `LocateControl`, `ResetViewControl`, `RouteZoomer`, `ViewPersistor`, `GeolocateOnMount`, `BoundsReporter` moved to `MapControls.tsx`. MapCanvas.tsx drops from 702 → 545 lines. Stale imports (`useMap`, `useMapEvents`, `LocateFixed`, `getAgencyBounds`, `saveView`) cleaned up from MapCanvas.
- **Refactor: shared color utilities** — extracted `getDelayColor(deltaMin)` to `colors.ts`; History.tsx and HistoryStopMarkers.tsx both imported their own duplicate `delayColor`/`gapColor` functions. MapCanvas hardcoded `#2563eb` for the corridor band; replaced with `CORRIDOR_BAND_COLOR = HEADWAY_TIERS[0].color`. InfoPanel now imports `HEADWAY_TIERS` instead of a parallel hardcoded `TIER_LEGEND` array. FilterChips `TIER_FOR_MAX` lookup removed — replaced with inline `isFinite(max) ? getTierColor(String(max))`. Single source of truth for all tier and severity colors.
- **Filter bar hard-disappears on app switch** (AI-143): FilterChips, FilterPanel, and SidebarControls were conditionally mounted (`{showUi && ...}`) causing an instant cut when switching apps. Changed to always-mounted with `opacity-0 pointer-events-none` transition so the bar fades in/out with the 200ms ease matching other UI transitions.
- **Removed `nfta-rail` duplicate**: the entry shared the exact same feed URL as `nfta` (NFTA only publishes a bus feed — Metro Rail is not in their GTFS). Total agencies: 54.
- **Corridor layer agency filter**: `passesRouteFilter` now strips the `-corridors` suffix before checking the agencies Set, so corridor features aren't accidentally hidden when a user de-selects then re-selects an agency.

### Performance
- **LRU cache for in-memory GeoJSON** (`agencyGeo.ts`): unbounded Map replaced with a 15-slot LRU. Agencies evicted from the LRU remain in React layer state; re-fetches go to the browser HTTP cache. Caps JS heap at ~15 agencies worth of GeoJSON (~75 MB worst case).
- **Direction 0 only rendered** (`useIntervalStats.ts`): direction 1 features (return trips) are filtered out before rendering. Halves polyline count on the Leaflet canvas with no visual change — frequency is the same in both directions on a given route.
- **Geometry simplification** (`process-core.ts`): Douglas-Peucker at 0.0001° (~11 m) applied to all route LineStrings during pipeline processing. Reduces dense-network GeoJSON sizes (e.g. TTC: ~7 MB → ~4 MB) with imperceptible rounding at typical zoom levels.
- **Corridor features split to separate files** (`process-core.ts`, `refresh.ts`, `process-gtfs.ts`): `isCorridor` segments are written to `{slug}-corridors.json` in R2 instead of being embedded in the main agency file. Main GeoJSON is now routes + stops only. Corridors are loaded lazily by `useAgencyData` only when `showCorridorBand` is true (i.e. the Corridors app is open). `showCorridorBand` is also forwarded to `useIntervalStats` so corridor features always pass the filter predicate when the Corridors band view is active. 52 of 55 agencies have corridors files; the 3 local-zip agencies without a `feedUrl` (sarnia, port-huron, tarta) are unaffected — they show no corridor band until re-processed.

### Added
- **Region filter chips in agency browser**: "All / Ontario / British Columbia / …" chips in the InfoPanel Agencies tab for quick filtering by province/state. Chips are generated from the `region` field in `index.json` — new regions appear automatically.
- **Agencies dropdown grouped by region**: the Agencies chip in the frequency map filter bar now groups agencies under region headers (Ontario, British Columbia, Quebec, New York) instead of a flat list. Scales cleanly as coverage expands.
- **Info panel with agency browser**: (i) button on all three map views opens a panel with two tabs. "About" has a description, frequency tier legend, and GitHub link. "Agencies" has a live-search list of all agencies grouped by region — automatically reflects `index.json` additions with no code changes. Placed next to Settings on Frequency, next to the day picker on Corridors, and in the History panel header.

### Changed
- **Screen transitions**: switching between apps is now animated — History panel slides up/down (300ms ease-out), Corridors overlay fades in/out (300ms), top-bar search bar and stats chips fade when entering History (200ms). Previously all app switches were instant cuts.
- **History app redesigned as map overlay**: History is now a bottom panel over the live map instead of a full-screen overlay. The selected route is highlighted on the map (all other routes dimmed to near-invisible). Each monitored anchor stop gets a floating card on the map showing actual headway gap and vs-scheduled delta, color-coded by severity. Click a card to expand and see scheduled headway. The panel retains the route picker, live summary chips, active trip list, and trend chart. Stop coordinates are resolved by fetching the agency stops index on first load. Implemented via new `HistoryMapOverlay` context, `HistoryStopMarkers` react-leaflet component, and dimming logic in `MapCanvas`.
- **History route picker grouped by agency**: routes now appear under their agency label (Burlington / Hamilton) rather than in a flat list. Scales cleanly as more routes are added without making the picker harder to read.

### Fixed
- **Corridors UI bleeding into History**: `active={!inFrequency}` kept Corridors mounted and visible (From/To inputs, day picker) when History was open. Changed to `active={inCorridors}` so Corridors only activates in its own view.
- **Search bar hidden in History**: App-level search bar (used for route search / Corridors From) now hidden when History is active — History has its own route picker and the search bar was confusing noise.

### Added
- **URL routing for map apps**: `/apps/frequency`, `/apps/corridors`, `/apps/history` — links are now shareable and browser back/forward works. `/` stays as the frequency map default. Structure leaves room for non-app pages at the root level. Implemented with `react-router-dom` `BrowserRouter`; `vercel.json` SPA catch-all rewrite added; Vite `historyApiFallback` enabled for local dev.
- **`/api/history-adherence` rewrite added to `vercel.json`**: was missing, relied on Vercel's automatic `.ts` resolution.
- **Corridors band view**: when the Corridors app opens with no From/To selected, the map shows only `isCorridor` segments — stop-link sections where 2+ routes share the same corridor — as solid blue lines on the base map. Regular route layers are hidden. When a From/To corridor is selected, the band clears and the specific corridor routes take over via the existing overlay. Implemented via `showCorridorBand` prop threaded through Interval → MapCanvas.

### Added
- **History app** (`src/apps/History.tsx`): new map app showing actual vs scheduled trip delays for Hamilton King (01), Hamilton B-Line (10), Burlington Route 1, and Burlington Route 10. Route picker, 7/14/30-day window selector, SVG bar chart of avg delay by hour of day, summary stats.
- **History app live section**: "Right now" panel at top of History app uses existing `useLiveAdherence` hook to show active trips, per-trip on-time status, avg delay, and actual headway vs scheduled at anchor stops — immediately useful without waiting for archived data to accumulate.
- **`api/history-adherence.ts`**: Vercel function that reads archived trip-update JSON from `atlas-live` R2, filters by route, aggregates delays by hour of day, returns time-series result.
- **`shared/computeHistoryAdherence.ts`**: analysis logic — filters snapshots by route_id, buckets delays into hours (EST), computes per-hour averages and overall avg.
- **`src/hooks/useHistoryAdherence.ts`**: React hook for fetching history adherence data with loading/noData/error states.
- **AppDrawer History entry enabled**: was `available: false`, now live. Description updated to "Actual vs scheduled trip delays".
- **`R2_LIVE_BUCKET_NAME` added to Vercel env**: production environment variable set explicitly; other environments fall back to `'atlas-live'` default in code.

### Changed
- **Route switch no longer blanks UI**: `useLiveAdherence` and `useHistoryAdherence` retain previous data while new route loads, preventing flash-to-empty on route change.

### Fixed
- **History crash when API response missing `byHour`**: hook now validates response shape before setting status to `ready`; History.tsx uses optional chaining as a safety net to prevent crashing the whole app.
- **Corridors map blank on open**: route layers now stay visible in Corridors mode so the network is shown as context before From/To are selected.
- **History trend API capped at 500 fetches**: `api/history-adherence.ts` limits sampled R2 object fetches to 500 per request to keep response times predictable as archived data grows.
- **Live section shows last-updated time**: timestamp displayed next to the live indicator dot, updated on each poll.

### Changed
- **GTFS-RT archiver rewrites raw protobuf storage to compact JSON**: instead of saving the full feed binary (~1.5 MB/poll), the worker now parses each TripUpdate and extracts only `trip_id`, `route_id`, `direction_id`, and delay in seconds. Output is ~5–20 KB per poll — roughly 99% smaller. Files stored as `{slug}/{date}/{unix}.json`.
- **GTFS-RT archiver cron corrected to `*/5 * * * *`**: was unintentionally set to every minute (`* * * * *`); 5 minutes is the right interval to capture Hamilton's 6-minute headway routes without missing trips.
- **GTFS-RT archiver adds 30-day retention cleanup**: a second cron (`0 4 * * *`) runs daily at 04:00 UTC and deletes date-prefix folders older than 30 days from `atlas-live`.
- **GTFS-RT archiver skips idle polls**: if the feed response is under 5 KB, no file is written — handles overnight periods when no trips are running without hardcoding service hours.
- **GTFS-RT archiver fixes Burlington fetch**: added `User-Agent` header to all feed requests; Burlington's server was silently rejecting headerless requests, leaving `atlas-live` with only `hamilton/` data.
- **R2 credentials rotated to all-buckets token**: `.env.local` and GitHub Actions secrets updated to use new credentials covering `atlas`, `atlas-archive`, and `atlas-live`. Old atlas-only token deleted.

### Changed
- **Dependency updates**: `@aws-sdk/client-s3` 3.1071→3.1073, `lucide-react` 1.14→1.21, `papaparse` 5.5.3→5.5.4, `playwright` 1.60→1.61 (Dependabot #65–68)
- **GitHub Actions updated**: `actions/checkout` v4→v7, `actions/setup-node` v4→v6 in both workflows (Dependabot #63–64)

### Fixed
- **GTFS-RT archiver cron corrected to every 5 minutes**: `wrangler.toml` had `* * * * *` (every minute) — now `*/5 * * * *`. Redeployed.
- **`atlas-live` R2 lifecycle rule added**: 30-day TTL on all objects (`delete-old-snapshots` rule) so .pb snapshots don't accumulate forever.

### Changed
- **Refresh pipeline skips unchanged feeds**: before processing, `refresh.ts` now peeks at `feed_info.txt` inside the downloaded zip and compares `feed_end_date` against `lastFeedExpiry` in `index.json`. If the schedule period hasn't changed, the agency is skipped entirely — no reprocessing, no R2 writes. Falls back to `feed_version` for agencies without a `feed_end_date`.
- **Raw GTFS zip archiving to private bucket**: when a feed has a new schedule period, the raw zip is uploaded to the private `atlas-archive` R2 bucket at `gtfs/archive/{slug}/{feedExpiry}.zip`. Keeps historical feeds permanently without exposing them publicly.
- **Crash-resilient index.json writes**: `index.json` is now written after each successfully refreshed agency rather than once at the end, so a mid-run failure doesn't lose `lastFeedExpiry` for completed agencies.
- **`lastFeedVersion` tracked in index.json**: agencies that publish `feed_version` but no `feed_end_date` now also get skip deduplication.
- **`migrate-archive` script** (`npm run migrate-archive`): uploads existing local GTFS zips from `Desktop/Data/GTFS/` to the archive bucket, keyed by `feed_end_date`. Supports `--dry-run` to preview without uploading. Uses `gtfs/historical/` prefix (separate from pipeline's `gtfs/archive/`) since local filenames don't match Atlas agency slugs.
- **`extract-go-stops.ts` migrated to R2**: was the last pipeline script still writing to Vercel Blob; now uses `r2Put` like everything else.

### Fixed
- **CI workflow missing `R2_ARCHIVE_BUCKET_NAME`**: the secret was set but never injected into the workflow env block, so every weekly run that encountered a changed feed was marking the agency as FAILED and writing no archive.
- **Silent skip when feed has no archive key**: feeds without `feed_end_date` or `feed_version` now log a warning instead of silently skipping the archive step.

## [2.3.1] - 2026-06-22

### Fixed
- **NFTA feeds failing weekly refresh**: `metro.nfta.com` has a broken SSL cert that fails certificate verification in CI. Switched `nfta` and `nfta-rail` `feedUrl` to the Mobility Database stable mirror (MDB #465).


- **Loop-route terminus headway inflated (AI-121)**: routes where the terminus stop appears at both the start and end of each trip (e.g. exo-terrebonne route 8, exo-laurentides route 243) had both departure times per trip added to `stopDepsByGroup`. The interleaved outbound/return times at the terminus produced falsely short gaps (e.g. route 8: 13 min instead of 60 min). Fixed by tracking the first visit per `(trip_id, stop_id)` in the `stop_times` scan — subsequent visits to the same stop within the same trip are skipped.
- **Search result click does nothing (AI-120)**: clicking a route in search results called `setSelectedRoute` but the route card is gated behind `!query.trim()` — the card never appeared while the query was still set. Fix: clear the query on click alongside setting the route.
- **OC Transpo Route 1 "every 0 min" (AI-114)**: agencies that split the same schedule across multiple service_ids (OC Transpo uses separate Mon–Thu and Friday service_ids for the Confederation Line, both tagged `monday=1`) produced exact-duplicate departure times in `stopDepsByGroup`. `medianHeadwayInWindow` computed gaps between unsorted duplicates, returning a median of 0. Fixed by deduplicating and sorting times inside `medianHeadwayInWindow` before computing gaps. Route 1 now correctly shows every 5 min weekday.
- **titleCase capitalizing after apostrophes (AI-115)**: regex `\b` treats apostrophes as word boundaries, so "Tunney's" became "Tunney'S". Added a post-pass `.replace(/'(\p{L})/gu, ...)` to lowercase any letter immediately following an apostrophe.
- **O-Train classified as Streetcar (AI-116)**: OC Transpo O-Train lines (Confederation, Trillium, Airport) use GTFS `route_type=0` (tram/streetcar) but are urban LRT. Added agency-specific rule to `effectiveMode`: `agencySlug === 'octranspo' && routeType === 0 → VIRTUAL_LRT_MODE`. They now appear under LRT in the mode filter.
- **Parent stations (location_type=1) not shown on map (AI-117)**: GTFS parent station IDs are never referenced in `stop_times` — only child platform IDs are. The pipeline's `servedStopIds` filter excluded all 61 OC Transpo parent stations (e.g. RIDEAU, TUNNEY'S PASTURE, BAYVIEW). Fixed by building a `childToParent` map and propagating routes + departure times from child platforms up to their parent station during the `stop_times` scan. Parent stations whose children appear in `stop_times` are now included in stop features with correct route badges and headways.
- **Disambiguation list shortName not titleCased (AI-118)**: route disambiguation list rendered `{r.shortName}` raw — REM routes with lowercase suffixes (e.g. "A4-a1") stayed uncased. Changed to `titleCase(getRouteLabel(r.shortName, r.longName, r.agencyName))` so REM and all routes go through the same label pipeline as the route card header.
- **Station view per-headsign branches (AI-113)**: station view was grouping all features for the same direction into one row, showing `bestHeadway = min(p.headway)` with all destinations listed together. For branching routes (e.g. Lakeshore West at Exhibition GO), this implied every destination (including Niagara Falls GO, 3×/day) ran at the most-frequent branch's headway. Refactored `stopRoutes` useMemo to key branches by `${dirId}::${headsign}` — each terminal destination is now its own row with its own `p.headway`. Branches sorted by direction then frequency (most frequent first).
- **Branch headway source unified**: `stopHeadways[stop]` was being used to display branch headways in both the station view and the route view range calculation. For branching routes (GO commuter rail), trunk stops aggregate ALL trains regardless of terminus, so Niagara Falls / Confederation / West Harbour branches incorrectly showed the combined LW trunk frequency (29–60 min). Refactored both displays to read `p.headway` (terminal-stop headway, already computed correctly by the pipeline). `stopHeadways` is now only used as a gate check (does this route shape cover this stop?). Removed the stop-range display in the route card entirely — it was driven by `stopHeadways` and is now replaced by the single terminal headway.
- **"to GO" on Kitchener GO route card (AI-112)**: `cleanHeadsign` had a case-insensitive flag (`i`) on the short-name prefix regex, causing `^KI[A-Za-z0-9]*` to match "Kitchener" in the already-cleaned headsign "Kitchener GO" — stripping the word and leaving just "GO". Removed the `i` flag so the regex is case-sensitive; "KI" no longer matches "Ki". The function is now idempotent when called a second time on pipeline-cleaned headsigns.
- **GO Transit terminal stop headway (AI-111)**: pipeline Step 4 was computing feature `headway` and `tier` using the all-stop median, dominated by high-frequency trunk stops. Branching routes (e.g. Kitchener, Niagara Falls, West Harbour GO) now use the terminal stop's headway instead. `minStopHeadway` is still kept as the all-stop minimum for filter visibility.
- **Station view route duplication (AI-110)**: stop-view route card was keyed by `shortName::directionId`, showing both directions as separate route rows. Changed key to `shortName` and nested directions as branches. Also removed the `?? p.headway` fallback when no stop-level headway exists — this was pulling in trunk headways for terminal-only stops.
- **Debug headway panel**: added a collapsible "debug headways" panel to both the stop view and route view in the sidebar, showing per-feature stopHw / routeHw and which value was used.
- **KNOWN_ISSUES.md**: added `docs/KNOWN_ISSUES.md` documenting missing agencies, feed quirks, and platform limitations that are out of scope for Linear.

### Added
- **6 new agencies (AI-82)**: Transit Windsor, Belleville Transit, Cornwall Transit, STLévis, OC Transpo (Ottawa), STO (Gatineau) — processed and added to index.json with feedUrls and bboxes. Atlas now covers 42 agencies. RTC Quebec City and STTR Trois-Rivières feeds were dead or unreturnable; noted for follow-up.
- **Corridors service timeline**: results panel now shows a service timeline with AM Peak / Midday / PM Peak / Evening columns, color-coded by headway tier. Direction labels appear above each bar row; all period bars are equal width.

### Changed
- **Corridors layout**: merged the route list and service timeline into a single 500 px panel, eliminating the height-mismatch between two side-by-side panels. Route badge + agency header sits above per-direction bar rows.
- **Corridors headway source**: period headways now use the FROM stop (where the user waits) rather than the TO stop. TO-stop headways were misleadingly low at major hubs where many patterns converge (e.g. Square One showing 7 min for GO route 41 instead of the 30 min wait at Hamilton GO).
- **Corridors To-input X button**: now uses the same absolute-positioned centering as the From input so both pills are visually consistent.
- **AppDrawer back button**: replaced the waffle-menu Frequency Map shortcut (was re-added by mistake) with an ← arrow on the home button when inside a sub-app. Waffle menu now only shows non-frequency apps.
- **Route info card alignment**: left edge aligned to 104 px to match the search bar.
- **Docs**: rewrote PIPELINE.md as a public-facing explainer (removed ops-manual detail), VISION.md (stripped AI buzzwords), STRATEGY.md (removed false "Planned" competitive features), ROADMAP_PRODUCT.md (removed fabricated Agency Intelligence section; added bus sub-type filter, on-demand zones, ferries from Linear), ROADMAP_TECHNICAL.md and ROADMAP_PLATFORM.md (stripped unplanned items).

## [2.3.0] — 2026-06-19

### Added
- **GO Rail & Transit Hub departures schedule panel (AI-52)**: Station View detail sidebar now displays a **Scheduled Departures** board for subway and commuter rail stops. The board is populated by the pipeline extracting, sorting, and deduplicating departure schedules for `isRail` stops. Displays route pill colored by headway-tier, time (formatted to 12h clock), destination headsign, and direction. Includes a filter to show upcoming departures from the current local time (browser clock) with automatic wrap-around, and a "Show All" toggle to view the full timetable.
- **Stop features schedule extraction in pipeline**: `process-core.ts` compiles scheduled departure times (`t` in minutes from midnight, route, direction, cleaned headsign) for subway and commuter rail stops during GTFS processing and embeds `departures: { Weekday, Saturday, Sunday }` in the GeoJSON stop properties.
- **Hub & Rail Stop Map Rendering & Visibility (AI-53)**: Both commuter rail stops and major transit hubs (stations with 3+ routes) are now rendered starting at zoom level 12 (rather than hiding hubs until zoom 15) styled as high-contrast hollow rings with thick borders.
- **Pre-commit author guard**: `.githooks/pre-commit` rejects Slop Factory / slopfactory.dev identities; `npm install` sets `core.hooksPath`.
- **App drawer (AI-104/AI-105)**: waffle icon in the top-left bar opens a drawer to switch between Atlas apps. Frequency Map is the default. Corridors and History are listed; History marked "soon". Reset button navigates back to the frequency map when in a sub-app. Search bar and stats chips hidden when not in the frequency app.
- **Corridors app (AI-104)**: new app that finds all direct transit routes connecting two stations. Pipeline emits a per-agency stops index (`{slug}-stops.json`, `stopId → name/lat/lon`) uploaded to R2 alongside the main GeoJSON; `stopsUrl` added to `index.json` for all 34 agencies. Corridors loads all stops indexes on mount, normalizes stop names (strips platform/bay/direction suffixes), deduplicates cross-agency to show one entry per physical station, then queries loaded GeoJSON features by matching stop names in `stopOrder`. Results grouped by route number with branches listed as "to [headsign]" sub-rows. Best headway shown at the TO stop specifically (from `stopHeadways`), not the route-level median.
- **Corridors stop search (`corridor-search.ts`)**: ranked autocomplete (exact → prefix → word-start → substring; shorter names win), auto-select on blur/Enter when unambiguous, keyboard navigation (↑↓ Enter Esc), and stops-first loading so suggestions appear before GeoJSON finishes.
- **Corridors route lines (AI-108)**: matched routes draw on the map between From/To stops (shape clipped via `stopOrder`/`stopPositions`); map fits bounds and pins both endpoints.
- **HSR feedUrl added**: Hamilton Street Railway now has a stable Mobility Database feed URL (`mdb-723`) in `index.json` so it's included in the weekly auto-refresh alongside all other agencies.
- **GTFS-RT archiver Worker (AI-98)**: Cloudflare Worker (`workers/gtfs-rt-archiver/`) polls Burlington and Hamilton TripUpdates feeds every 5 minutes and writes raw `.pb` snapshots to the `atlas-live` R2 bucket at `{slug}/{YYYY-MM-DD}/{unix-seconds}.pb`. No parsing at capture time — raw storage for later analysis. Separate bucket from the main `atlas` GeoJSON bucket to allow independent lifecycle rules.
- **History snapshots keyed by feed expiry date**: Burlington history snapshots now use `feed_end_date` from `feed_info.txt` as the snapshot key instead of ISO week number. Each snapshot now represents a real schedule period (e.g. "expires 2026-09-06") rather than an arbitrary Monday. `ProcessResult` now exposes `feedExpiry` and `feedVersion` for use by the refresh pipeline. Falls back to `feed_version` then processed date if `feed_end_date` is absent.
- **Frequency-based shape clipping (AI-97)**: when a frequency filter is active, route shapes are now clipped to only show the segment where the stop-level headway meets the threshold. Pipeline projects each stop onto the shape polyline (nearest-point-on-polyline), sorts by position, and writes `stopOrder: string[]` + `stopPositions: number[]` to each GeoJSON feature. Frontend walks these alongside `stopHeadways` to find the longest contiguous passing segment and interpolates the sub-linestring at render time. Trunk sections with combined 10-min service remain visible while branch extensions with 20-min or 30-min service are clipped away when you filter below their threshold.


- **Route disambiguation picker (AI-61)**: clicking where multiple routes overlap now shows a compact "Multiple routes here" picker listing each route with its colored tier dot and agency. Selecting one opens its route panel. Clicking anywhere on the map or on a stop dismisses the picker. Uses a pixel-space spatial query across all visible features at the current zoom.
- **Live adherence panel (AI-61)**: when a route with GTFS-RT coverage is selected (Burlington 1/10, Hamilton 01/10), a separate Live card appears below the Scheduled card showing per-stop actual headways and delta from scheduled. Stops with large gaps show red; minor gaps amber; on-time green.
- **"Scheduled" label on route panel**: when the live panel is also showing, the route panel gains a small "Scheduled" label so both cards are clearly distinguished.

### Changed
- **Corridors map shell**: Corridors reuses the frequency map's Leaflet instance (overlay context) instead of mounting a second map — eliminates tile flash when switching apps.
- **Corridors query-scoped GeoJSON load**: route GeoJSON fetches only when From and To are set — typically 1–2 agencies instead of all 36 on mount. Stops indexes still load upfront for autocomplete.
- **Shared agency GeoJSON cache**: Frequency and Corridors reuse the same in-memory cache (`agencyGeo.ts`) for route GeoJSON — switching apps after panning the map does not re-download agencies already loaded.
- **Corridors UX**: To autocomplete uses fixed positioning at app-bar z-index (was clipped under the Leaflet map); per-agency `allSettled` loading so one failed feed does not blank search; README/ROADMAP/PIPELINE updated for map-apps direction and R2 storage.
- **R2 upload retries**: `r2Put` retries up to 4 times on transient SSL/network errors during refresh — avoids the partial-failure pattern seen on full refreshes.
- **ROADMAP**: GTFS-RT archiver writing to `atlas-live` R2; schedule adherence can use archived snapshots plus on-demand TripUpdates.
- **Feature headway now derived from stop-level data (AI-101)**: `process-core.ts` no longer uses the headsign-trip median as the feature headway. Instead it uses `median(stopHeadways)` across all stops confirmed to be on this feature's shape (proximity filter: stops >~500 m from the shape excluded). `headwayByPeriod` recomputed from per-stop period medians. `tier` re-derived from new headway. New properties: `minStopHeadway` (best frequency at any stop) and `minStopHeadwayByPeriod` (per-period best). All 37 agencies reprocessed.
- **Filter uses best stop headway, not route median (AI-101)**: `passesRouteFilter` now checks `minStopHeadway` against the active threshold instead of the all-day feature median. For period filters it checks `minStopHeadwayByPeriod[period]`. A route is shown if any part of it meets the filter — AI-97 clipping visually restricts the displayed geometry to the qualifying section. Previously routes with high-frequency trunks were excluded if their route-level median didn't meet the threshold.
- **Sidebar shows headway range when frequency varies (AI-101)**: headsign rows now show "every 6–11 min" when `max(stopHeadways) / min(stopHeadways) > 1.5`. Dimmed state uses `minStopHeadway` so routes with a qualifying trunk don't appear faded.
- **projectStopsOntoShape returns deviation (AI-101)**: now returns `dev2` (squared degrees from nearest shape point) per stop, enabling the pipeline to exclude stops from other headsign branches.
- **Period headways require ≥3 departures**: `medianHeadwayInWindow` now accepts a `minDeps` param; period windows (AM Peak, Midday, etc.) require at least 3 departures before a headway is reported. Previously 2 departures (1 gap) could produce a misleading headway from a single gap measurement. GO Transit and all agencies reprocessed.
- **Sidebar headway range capped at 60 min**: the "every X–Y min" range display now ignores stops with headways >60 min so far-end terminus stations served by 2–3 daily trains don't distort the display to "every 29–481 min".
- **go-test agency removed from index.json**: a stale `go-test` entry was causing double "LW — Lakeshore West" rows in the disambiguation picker and a spurious "2 agencies" pill when selecting GO Transit. Entry removed entirely.
- **Period headway now uses terminal stop only (AI-103)**: `headwayByPeriod` for a headsign feature is now derived from the terminal stop (last stop in `stopOrder` by shape position) rather than the median across all on-shape stops. Previously, headsigns whose terminal had infrequent service inherited inflated period headways from shared trunk stops served by other headsigns (e.g. "to Niagara Falls GO every 30 min AM Peak" — there are zero westbound AM Peak trains to Niagara Falls). `minStopHeadwayByPeriod` continues to use all stops so the filter correctly reveals any section of the route that meets the active threshold.
- **Live panel is a separate card**: previously rendered inside the route panel; now a sibling card with identical styling, maintaining visual separation.
- **Early buses now amber/red, not blue**: color scheme uses green (on time, <2 min), amber (2–5 min off), red (≥5 min off) for both early and late.
- **Hamilton 01 live config corrected**: `scheduledHeadwayMin` fixed from 12 → 6 (two 12-min branches interleave at Eastgate), and route ID 5687 added to cover both branches.
- **Agencies pill dot inverted**: dot now shows when all agencies are selected (default/full-coverage state) rather than when a filter is active.
- **Route/stop panels hidden during search**: typing a search query hides the route panel, stop panel, and live panel so search results aren't mixed with route detail.
- **Removed "Scheduled every X min" from live panel**: redundant with the route panel above.
- **Removed total bus count from live panel**: count includes all-day trips, not just active ones — misleading. Only on-time/late breakdown shown.
- **Removed X close button from route panel**: click elsewhere on the map to deselect.

### Fixed
- **Corridors TypeScript build error**: cast `geo.features` to `GeoJsonAgency['features']` at the two assignment sites in `Corridors.tsx` — GeoJSON's `Geometry` union includes `Point` (with `coordinates: number[]`) which TypeScript couldn't assign to the hand-rolled `number[][]` type; actual data is always LineString.
- **YRT + RTL stops indexes (AI-106)**: refreshed both feeds; `stopsUrl` added to `index.json` for Corridors stop search.
- **CI workflow Node version bump**: updated the CI test/build runner to use Node.js 24 to match the local and scheduled refresh environments, resolving `npm ci` lockfile verification failures caused by newer npm v11 package-lock format.
- **Station View headsigns split by direction (AI-95)**: stop panel now groups headsigns by `directionId` so eastbound and westbound destinations appear as separate rows. Previously all headsigns for a route were lumped together regardless of direction (e.g. Appleby GO showing Union Station GO and Hamilton GO Centre in the same row). `directionId` was already written by the pipeline — this was a UI-only fix.
- **Per-stop headways in pipeline (AI-96, AI-93)**: `process-core.ts` now collects per-stop departure times from `stop_times` during the existing build pass, computes the all-day median headway at each stop, and writes `stopHeadways: { [stopId]: number }` to each GeoJSON route feature. Station View now reads `stopHeadways[stopId]` for the clicked stop instead of the route-level headway — fixing Aldershot GO showing every 19 min (route-wide) instead of the correct every 29 min (stop-level).
- **Search ignores agency filter**: search now queries all loaded features regardless of the active agency/mode filter, so routes are findable even when their agency is hidden.
- **Search and disambiguation picker deduplicate by route name**: different schedule-period `route_id`s for the same route (e.g. two GO "LW" or two HSR "20" feeds) now collapse to a single search result and a single disambiguation row.
- **Headsign leading dash removed**: GO headsigns like "LW — Union Station GO" were being cleaned to "— Union Station GO" (leaving a leading dash after "LW" was stripped). The shortName strip regex now also consumes the trailing " — " separator.
- **Remaining browser tooltips removed**: two additional `title` attributes (headsign in route period detail, stop name in live panel) were causing sticky native tooltips.
- **Hamilton GTFS refreshed**: re-processed with current feed to include West Hamilton Loop (1A) shape, which was missing from the previous (expired April 2026) feed.
- **HSR GTFS refreshed**: re-processed to pick up the full King (01) shape including the West Hamilton extension (previously only the downtown–east segment was shown because the shorter high-frequency shape was winning).
- **Search leading zero normalization**: typing "1" now matches "01 — King" and other zero-padded route numbers.
- **Search results sorted by viewport proximity**: routes currently visible on screen sort above off-screen matches.
- **titleCase single-letter initials**: "Frank A. Cooke" was rendering "Frank a. Cooke" because "a" matched the KEEP_LOWER list. Single-letter words followed by "." are now always capitalized.
- **Headsign native browser tooltips removed**: `title` attributes on headsign elements in both the route panel and station view caused sticky browser tooltips on hover.
- **Stop clicks clear disambiguation picker**: clicking a station while the disambiguation panel was open left it visible.
- **Corridor features excluded from disambiguation spatial query**: corridors were being included in nearby-route detection, generating invalid keys.

## [2.2.0] - 2026-06-17

### Added
- **Burlington history snapshots (AI-83)**: on each refresh, the pipeline writes a compact headway snapshot to `atlas-history/burlington/<YYYY-WW>.json` containing the Weekday headway + tier per route short name. No frontend yet — snapshots accumulate until there are enough data points to build a meaningful timeline UI.
- **Time-of-day period switcher (AI-59)**: new "Period" chip in the filter bar — All day / AM Peak (6–9) / Midday (9–15) / PM Peak (15–19) / Evening (19–22). Selecting a period recolors all map lines based on that period's frequency. When a route panel is open, the headway display updates to the selected period and a label tag appears next to the value. Defaults to "All day" (existing behavior unchanged).
- **Per-period headways in pipeline (AI-59)**: `process-core.ts` now computes `headwayByPeriod: { amPeak, midday, pmPeak, evening }` on each GeoJSON route feature by reusing the existing phase-1 departure times. Stored as extra properties so file size only grows marginally (no geometry duplication). Data populates automatically on next refresh.
- **Headway sparklines on route cards (AI-74)**: when `headwayByPeriod` data is present for a route, a compact 4-bar SVG sparkline appears in the route panel below the route title. Bar height reflects relative frequency (taller = more frequent); bars are colored by tier. Hovering a bar shows the exact period + headway. Gracefully hidden when period data hasn't been processed yet.
- **PIPELINE.md**: added pipeline documentation covering the full GTFS → Blob → frontend data flow, GeoJSON schema, `index.json` format, frequency analysis tiers, and how to add or refresh agencies.
- **Ferry mode in Mode filter**: added Ferry (GTFS route_type=4) as a selectable mode. No ferry agencies are currently in Atlas; Linear AI-76 and AI-77 track Toronto Island Ferry and Montreal navettes fluviales respectively.
- **Streetcar / LRT split in Mode filter**: Line 5 Eglinton and Line 6 Finch West are open and in the TTC GTFS as route_type=0, mixed with streetcar routes. GRT ION is tagged route_type=2 in their GTFS but is urban LRT. Mode filter now has separate "LRT" and "Streetcar" entries; LRT covers TTC Lines 5/6 and GRT ION. No pipeline reprocessing needed.
- **Montreal transit agencies**: STM (bus + metro), REM, STL (Laval), RTL (Longueuil), exo trains, plus five exo bus sectors (Sud-Ouest, La Presqu'île, Laurentides, Le Richelain/Roussillon, Terrebonne-Mascouche), Saint-Jean-sur-Richelieu, Mont-Tremblant, L'Inter des Laurentides, and Ville de Saint-Hyacinthe. All processed with current GTFS and stable direct feedUrls.
- **Nearby Routes panel (AI-71)**: tapping the locate button shows a "Near You" panel listing every route within 500 m of your location, sorted by best headway. Tapping a route opens its detail panel. Implemented via `useNearbyRoutes` hook (Haversine distance across all loaded GeoJSON Point features) and `NearbyRoutesPanel` component.
- **Viewport-aware lazy loading (AI-72)**: agency GeoJSON is now loaded on-demand as you pan instead of all 35 agencies on mount. Agencies fetch only when their bounding box intersects the visible map viewport. Each agency entry in `index.json` now carries a `bbox: [s, w, n, e]` field. Loading indicator shows `{loaded}/{requested}`.
- **Persist user preferences to localStorage**: frequency filter, day type, and agency selection now survive page reloads. Agency exclusions are saved rather than the inclusion set, so newly added agencies are always visible by default without needing to reset.
- **Loaded state indicator in Agencies dropdown**: agency entries that are selected but not yet fetched (outside the current viewport) show a small hollow circle on the right side of their row.

### Changed
- **Storage migrated from Vercel Blob to Cloudflare R2 (AI-81)**: all 35 agency GeoJSON files moved to R2. Zero egress fees. Pipeline (`refresh.ts`, `process-gtfs.ts`) and GitHub Actions workflow updated to use R2 credentials. Burlington history snapshots also write to R2.
- **Frequency tier colours**: switched to a monochrome grey gradient (dark slate for ≤10m → progressively lighter greys) for a more neutral single-hue look.
- **Line thickness**: reduced base weights (bus 1.5 / rail 2.5) and made corridors thinner so dense areas don't look too thick. Selection still thickens the chosen route.
- **Stop selection dimming**: when a stop is selected, routes not serving it are dimmed (instead of hidden), preserving network context.
- **Settings panel redesigned**: replaced chunky wide border-buttons with compact toggle-switch rows. Panel is narrower and denser.
- **Pointer cursor on all buttons**: Tailwind v4 preflight resets button cursor to `default`; added a global `button { cursor: pointer; }` rule.
- **Default map zoom raised from 9 → 11**: initial load opens on the GTHA core. The logo reset button still uses `fitBounds` to show all agencies.
- **Settings button order**: light/dark toggle now appears to the left of the Settings gear.
- **Initial map view uses last saved position**: the map restores last center and zoom from `localStorage` on every visit. Falls back to geolocation, then GTHA default.
- **GeoJSON browser caching (AI-75)**: agency files fetch with a weekly `?v=YYYYWW` query param. Cache busts automatically when the Monday refresh runs.
- **Lazy-load fallback uses saved view**: the pre-`moveend` fallback bounds derives from the last saved map position instead of always assuming Toronto.

### Improved
- **Filter chip labels**: all chips now reflect their current state. Mode shows the mode name when exactly 1 is selected, "N modes" when multiple. Frequency shows the active tier label instead of always "Frequency".
- **Live polling UX**: routes with live GTFS-RT data (Burlington 1/10, Hamilton 01/10) now show a green dot in the stop panel route list. Live box no longer shows "fetching…" indefinitely — hides entirely when no active trips are detected, pulsing dot is dimmed while pending vs solid when live.
- **Terminal / hub stop display at overview zoom**: when zoomed out, only major hubs (3+ routes or location_type=1 stations) and rail stops show as stop markers. Full per-bay detail at zoom ≥15.
- **Zoom to full route when selecting from station panel**: clicking a route in the Station View sidebar flies the map to show the route's entire extent. The selected route is force-included in map layers regardless of current filters.
- **Montreal/REM + French headsign presentation**: REM branches show cleanly (e.g. "A3-A1 — Anse-à-l'Orme / Brossard"). Fixed title-casing for accented French names. Stripped verbose "Destination " prefixes on exo headsigns. Sidebar panel constrained to `w-64` with `break-words` + `title` tooltips.
- **Agency filter names**: shortened MTL agencies to clean short forms (STM, STL, RTL) without bracketed qualifiers.
- **TTC headsign cleaning**: better stripping for express routes (e.g. "960b Steeles West Express Towards Finch Station Via Pioneer Village Station" → "Finch via Pioneer Village").

### Fixed
- **Live adherence API 504 timeout**: `fetchTripUpdates` had no fetch timeout, causing the Vercel function to hang 60 s when GTFS-RT endpoints were slow. Added a 12 s `AbortController` timeout.
- **Sidebar panel width**: details panel is now strictly `w-64` with `overflow-x-hidden` to match the search bar width exactly.
- **Clicking routes showed map tooltip "panel"**: removed `bindTooltip` from route lines. Clicking a route now exclusively opens full details in the sidebar.
- **Route click toggle was unreliable (stale closure)**: changed `setSelectedRoute` / `setSelectedStop` calls in MapCanvas to functional updaters so toggle always uses latest state.
- **Loading indicator covers locate button**: moved spinner from bottom-right to bottom-left.
- **Sticky native tooltip on locate button and other controls**: replaced `title` attributes with `aria-label` across all buttons.
- **Sticky tooltip on agency filter buttons**: same fix applied to agency name buttons in the Agencies chip dropdown.
- **All-caps route labels (Stratford and others)**: `getRouteLabel` output wrapped with `titleCase` so agencies that store `route_long_name` in all-caps display correctly.

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

## Older Releases
Earlier release history is available in the [Changelog Archive](./CHANGELOG_ARCHIVE.md).
