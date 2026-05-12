# Changelog Archive

All legacy release notes for Atlas are preserved here. For recent changes, see [CHANGELOG.md](CHANGELOG.md).

## [0.19.3] - 2026-05-06

### Added
- **Strategic Audit in Analyze**: Added a new strategic audit workflow and supporting shared module UI primitives to tighten the Core 5 consolidation across analysis surfaces.
- **Server stop-adherence analytics**: Added `GET /api/intelligence/stop-adherence` to return per-stop delay and on-time metrics for a route over a configurable time window.
- **Server script build track**: Added `server/scripts/backfill-stop-times.ts`, `server/tsconfig.scripts.json`, and committed generated `server/dist-scripts/` artifacts for script execution parity.

### Changed
- **Core module consolidation**: Folded legacy module paths into the consolidated Core 5 structure, including route redirects in the app shell and navigation updates across the frontend.
- **Map, Performance, Pulse, Alerts, and Simulator refresh**: Reworked major frontend module surfaces and supporting shared styles/components to align the product around the new Atlas operating model.
- **Benchmark and matcher operations**: Tightened ingestion and intelligence runtime behavior, including benchmark window/refresh changes and matcher/import/static-db updates on the server.

### Removed
- **Legacy Intelligence module**: Removed the old standalone Intelligence view and stylesheet in favor of the consolidated Analyze flow.
- **Deprecated server lab scripts**: Removed `server/scripts/discovery-lab.ts` and `server/scripts/setup-lab.ts`.

## [0.19.2] - 2026-05-04

### Fixed
- **OCI server weekly OOM crash / SSH unreachable**: Root cause was 1GB RAM being exhausted by Postgres (~300MB) + Redis loading 410MB RDB dump + Node.js heap. Fix: permanently disabled Redis (`systemctl disable redis`, deleted dump.rdb) and removed BullMQ entirely from the ingestion path. Poller now calls `matchPositions` + DB writes directly as fire-and-forget async ops. Redis freed ~300–500MB; server has been stable since.
- **PM2 wrong cwd → env vars undefined**: PM2 was started without `--cwd /home/ubuntu/atlas-server`, so `dotenv/config` loaded from the wrong directory and all API keys resolved as `undefined`. Fixed by restarting with explicit `--cwd` flag.
- **Matcher hang — static DB queries blocking indefinitely**: Two root causes: (1) initial LRU fill queries for large agencies (MBTA: 137 trips → 52–82s on cold Postgres) and (2) per-route fallback queries (~10s each for TTC with 100+ unmatched routes) were exhausting the static DB connection pool and holding match slots forever. Fixes: initial LRU fill wrapped in `Promise.race` with 20s timeout (returns 0 matches for the cycle; subsequent cycles progressively warm the Postgres buffer cache); per-route fallback query wrapped in `Promise.race` with 7s timeout; 25s total fallback budget per agency; static pool capped at `max: 3` with `connectionTimeoutMillis: 180000`; `MAX_CONCURRENT_MATCH` reduced from 4 → 2; `MAX_CACHE_SIZE` increased from 500 → 3000 so trip schedules aren't evicted across 18 agencies.
- **matcher.ts log noise**: Replaced hundreds of `console.log` debug lines in the matcher and fallback loop with structured `log.info/warn` calls. PM2 out.log is now a usable diagnostic surface instead of an unreadable wall of text.
- **`Promise.race` static pool connection leak — permanent backpressure**: `Promise.race` returned a timeout sentinel but the underlying DB query kept running and holding the pool connection for 82–131s. With `max: 3` and 18 agencies all cold-starting simultaneously, the pool was permanently exhausted. Fix: replaced `Promise.race` with dedicated `client.connect()` + `SET statement_timeout = N` so Postgres actually cancels the query and releases the connection after the deadline. Applied to both LRU fill (20s) and `getRouteScheduleAroundTime` (7s).
- **LRU cache cleared on every agency — 0% match rate**: `scheduleCache` was a single Map keyed by `tripId` with a module-level `lastFeedVersion`. Each of the 18 agencies has a different `versionId`, so every agency call set `lastFeedVersion` to its own value and cleared the entire shared cache. No agency could accumulate cached trips. Fix: re-keyed cache as `${versionId}:${tripId}` and removed the `lastFeedVersion` clear — version upgrades now age out naturally via LRU eviction.
- **Zombie DB queries accumulating across restarts**: Before `statement_timeout` was added, every `pm2 restart` left in-flight LRU fill queries running in Postgres indefinitely. After several restarts, 24+ zombie queries were holding all static pool slots, causing permanent `connectionTimeout` on new connections. Fix: killed all existing zombies with `pg_terminate_backend`; new `statement_timeout` prevents future accumulation.
- **Halifax delay values systematically wrong (−25 hours)**: GTFS extended-time convention: trips that run past midnight use arrival_times > 1440 minutes (e.g. 25:10 = 1510 min). `localSecondsFromMidnight` returns 0–86399 for the current calendar day, so for a 1:10 AM observation against a 25:10 scheduled stop, `delay = 4200 − 90600 = −86400s`. Fix: after computing the raw delay, if `rawDelay < −43200`, add 86400 to observedSeconds to align with the schedule's service day.
- **Halifax missing timezone — delays off by 1 hour**: Halifax fell back to `America/Toronto` (UTC−4) instead of `America/Halifax` (UTC−3). Added explicit `timezone: 'America/Halifax'` to the Halifax agency config.
- **Benchmark query timing out every 15 min (>300s on full 24h window)**: `vehicle_positions` had no index on `(agency_id, observed_at)` — every benchmark run was a full sequential scan of a multi-million-row table. Fix: added `vehicle_positions_agency_time_idx` (CONCURRENTLY); reduced benchmark window from 24h → 6h; refresh interval 15 min → 30 min.
- **`stop-adherence` endpoint including stale trip data**: Added `ABS(delay_seconds) < 3600` filter to the stop-adherence query so readings from vehicles stuck reporting a finished trip's ID (e.g. STA showing +3h delays) are excluded.
- **Server build not compiled on deploy**: Root `npm run build` only builds the Vite frontend (`noEmit: true` in root tsconfig). Server changes to `server/src/` require `cd server && npm run build` before rsyncing `server/dist/`. Updated `CLAUDE.md` with explicit two-step build instructions.
- **Frontend unreachable in production**: End users were previously unable to access the dashboard because the UI wasn't deployed anywhere (it required running `npm run dev` locally with an SSH tunnel). Fix: Made the OCI Express server a full-stack host. It now statically serves the compiled Vite `dist/` folder and handles React Router SPA fallbacks via `app.get('/{*splat}')` (updated for Express 5 routing). Opened port 3001 in iptables so the app is now publicly accessible.

### Added
- **Single-command deployment**: Created `scripts/deploy.sh` (mapped to `npm run deploy`) which builds both the Vite frontend and Node server, rsyncs them to OCI, ensures firewall port 3001 is open, and restarts PM2 automatically.
- **`GET /api/intelligence/stop-adherence`**: Per-stop schedule adherence endpoint. Params: `agency`, `route`, `hours` (1–72, default 24). Aggregates `vehicle_positions.delay_seconds` (match_confidence ≥ 0.7) grouped by `(stop_id, stop_sequence)`, returning `avgDelaySeconds`, `medianDelaySeconds`, `onTimePct`, `earlyCount`, `lateCount`, `sampleCount` per stop. Secondary lookup against static DB for `stop_name`, `stop_lat`, `stop_lon`. No new schema — uses existing `vehicle_positions` data.

### Changed
- **Ingestion pipeline — Redis/BullMQ removed**: `poller.ts` no longer enqueues jobs to Redis. `startPositionWorker` removed from `server.ts`. `position-queue.ts` and `position-worker.ts` remain as dead code (unused, harmless). The queue layer was the single point of failure during Redis LOADING state hangs and is now completely absent from the data path.

### Fixed
- **Halifax matching (0% match rate)**: Root cause was missing stop_times — Halifax was imported in March before stop_times streaming was added to the importer. Re-imported 2026-04-20 via `https://gtfs.halifax.ca/Static/google_transit.zip` to populate stop_times. RT trip IDs (4306xxx) don't match static (4301xxx) but route IDs do — time-based spatial fallback handles matching.
- **Importer silent stop_times failure**: Added post-write verification that `COUNT(*) > 0` in `stop_times` for the new feed version. Import now throws explicitly if stop_times produced 0 rows instead of silently creating a broken feed version.
- **AGENCIES.md tiering**: Restructured to reflect the actual beta state — Tier 1 (full-network + static: Halifax, STA), Tier 2 (partial + static: TTC), Tier 3 (partial, data collection only: all others). Previously listed all agencies as equivalent.

### Added
- **`tsconfig.scripts.json`**: Separate TypeScript config for compiling `server/scripts/` with `rootDir: "."` and `outDir: "./dist-scripts"`. Lets import scripts be compiled and deployed to OCI independently of the main server build.

### Fixed
- **PerformanceView `Cannot read properties of undefined`**: Added extensive defensive handling (`?? []`) to all `PerformanceView` tabs to ensure `.map()` and `.length` calls are safe if API responses are empty or missing expected arrays.
- **PerformanceView `as any` casts**: Replaced four unsafe casts in `OverviewTab`'s `Promise.all` catch fallbacks with properly typed `BottleneckResponse`, `NetworkPulseResponse`, `GhostResponse`, and `MatchingStatsResponse` returns.
- **PerformanceView duplicate loading/error JSX**: Extracted shared `TabLoading` and `TabError` components and replaced 7 identical inline spinner/error blocks across all tab components.
- **SimulatorView JSX and structure**: Resolved critical structural errors in `src/modules/simulator/SimulatorView.tsx` where extra closing div tags and syntax discrepancies were breaking the Vite/Babel build process.
- **PerformanceView type safety**: Fixed a TypeScript assignment error in `src/modules/performance/PerformanceView.tsx` by correctly typing the navigation `TABS` constant with `LucideIcon` and resolving `ComponentType` incompatibilities.
- **Stale local/cloud runtime ambiguity**: Removed the leftover local Discovery Lab poller entrypoints (`server/scripts/discovery-lab.ts`, `server/scripts/setup-lab.ts`) that were causing agents and docs to conflate old local experiments with the live OCI runtime.
- **Spokane polling docs drift**: Updated `docs/AGENCIES.md` to match the actual config — STA is now documented as full-system polling (`ROUTE_FILTER.sta = null`), not a partial route subset.
- **Agency switcher dropdown persistence**: The TopNav agency menu now closes on route change and on outside click instead of staying open across pages.
- **Broken import/runtime errors**: Fixed stale relative imports in `StrategicAudit.tsx`, added the missing `useViewAs` import in `ScreenerView.tsx`, and repaired `SimulatorView.tsx` JSX syntax errors that were breaking Vite parsing.
- **Performance KPI mislabeling**: Reworked the misleading Performance overview cards so feed-quality scoring is no longer presented as generic "health", live reporting is counted as vehicles instead of a confusing route fraction, and the duplicate route-gap table was removed from Performance instead of shadowing Pulse.
- **Performance overview signal**: Added a plain-English "What Matters Now" summary band at the top of Performance so the page now leads with an operational readout instead of forcing users to infer the situation from abstract KPI cards.

### Changed
- **Production runtime documentation**: Added an explicit OCI runtime statement to `README.md`, `CLAUDE.md`, `GEMINI.md`, `docs/NOTION_REGISTRY.md`, `gtfs-test-log.md`, and `server/src/intelligence/notion-sync.ts` so the repo now clearly states that live vehicle data is cloud-backed and not dependent on a local machine.
- **TopNav simplification**: Removed the theme toggle and promoted Map to a first-class top-level nav item.
- **Map UI redesign**: Reworked `MapView.tsx` around stronger operational context with a live summary panel, route activity list, vehicle inspector, lighter basemap styling, and clearer failure diagnostics instead of low-signal status chrome.
- **Analyze page density**: Removed redundant Analyze page heading chrome, compressed the tab rail, renamed tabs to task-oriented labels (Routes, Corridors, Audit, Operations), and pulled the first real content much higher above the fold.
- **Performance / Pulse / Alerts density**: Replaced oversized section headers with compact inline headers, tightened the tab rails, simplified tab labels, and moved the first meaningful content much higher on the page.
- **Performance page purpose**: Tightened the Performance intro copy so it now frames the module around feed quality, delay build-up, ghost trips, dwell friction, and corridor reliability rather than repeating Pulse-style route gap monitoring.
- **Performance navigation model**: Flattened Performance into one continuous page with anchored sections for overview, reliability, delay, ghosts, dwells, corridors, and service audit instead of forcing users through seven content-switching tabs.
- **Performance section flow**: Reordered the module into a single scrollable operational narrative with compact jump links and explicit section intros, so the page reads as one monitoring surface instead of seven separate micro-pages.
- **Shared module header language**: Added a reusable compact `ModuleIntro` pattern and applied it across Analyze, Performance, Pulse, and Alerts so the modules now open with the same visual hierarchy.
- **Simulate header alignment**: Brought Simulate onto the same compact intro + tightened tab pattern as the rest of the core modules, with shorter tab labels and much less dead space before the main canvas.
- **Admin header alignment**: Switched Admin to the shared `ModuleIntro` pattern and tightened the top spacing so it no longer feels visually separate from the other modules.
- **Shared module rhythm**: Tightened `.module-container` vertical padding and moved the intro typography into shared CSS utilities (`.module-kicker`, `.module-subtitle`) so page openings stay more consistent across the app.
- **Module intro scale**: Reduced the shared module title treatment from oversized display text back to a compact header so pages feel closer to the original product rhythm and stop competing with the content.
- **Module title placement**: Removed the duplicated in-page module names from the shared intro blocks and restored the active module label beside `Atlas` in the top bar to reclaim vertical space without losing context.
- **Core 5 Navigation**: Streamlined the global navigation to a 5-verb "Core Process" (Analyze, Performance, Pulse, Alerts, Simulate). The Map module has been moved to a globally accessible utility icon in the TopNav to reduce clutter and distinguish spatial tracking from categorical analysis steps.
- **UI Architecture Unification**: Consolidated all 5 core modules under a standardized layout pattern using `ModuleHeader`, `ModuleSubNav`, and `.module-container`.
- **Module Consolidation**: Merged the "Strategic Audit" / "Intelligence" module directly into **Analyze**, deprecating the standalone Monitor route. Consolidated legacy "Intelligence Hub" tools into a single diagnostic workspace.
- **Simulate Module Modernization**: Integrated the Simulator into the standard UI architecture, adding a `ModuleHeader` and unified tab navigation while maintaining the full-screen map experience.
- **Alerts Module Modernization**: Refactored the Alerts view to support the new navigation standards and added professional incident logging stubs.
- **Professional Terminology Standardization**: Replaced colloquial developer shorthand and vague metrics with industry-standard transit terminology across the platform.
    - `Freq. Promise` $\rightarrow$ **Reliability Audit** (Performance Tab)
    - `Health Score` $\rightarrow$ **System Health** (MRI Card)
    - `Match Rate` $\rightarrow$ **Data Integrity** (MRI Card)
    - `Routes Active` $\rightarrow$ **In-Service Routes** (MRI Card)
    - `Alerts` $\rightarrow$ **Network Friction** (MRI Card)
    - `Intelligence / Monitor` $\rightarrow$ **Strategic Audit** (Analyze Tab)


## [0.13.0] - 2026-03-30

### Added
- **Corridor Analysis**: Identifies shared transit corridors and computes combined headways.
- **Network Screener (Cloud)**: Screening mode backed by OCI static database instead of local ZIP.
- **Live Map full-network view**: Renders all active vehicles for an agency with optional route highlighting.
- **Streaming GTFS Parser**: Reduces peak heap from 1.5GB to <200MB, allowing massive feeds on 1GB OCI server.

### Changed
- **Infrastructure**: Retired local Postgres requirement; transitioned entirely to OCI-hosted `static` and `realtime` databases.
- **Module Nomenclature**: Renamed Strategy → Analyze, Intelligence → Monitor. Standalone Optimize module merged into Analyze as a Map tab. (Corrected in 0.15.0)

---
*Legacy entries from 0.1.0 to 0.12.0 continue below...*

## [0.10.0] - 2026-03-09

### Added
- **View as Agency**: Admins can now select any agency from the OCI static database via a nav dropdown. Selecting an agency loads their full route catalog (Weekday/Saturday/Sunday) from the `/api/screen` endpoint and populates all modules — no GTFS re-upload needed. A pill indicator shows the active agency with a one-click exit.

### Changed
- **Module renames**: Strategy → Analyze, Intelligence → Monitor. Routes updated accordingly (`/analyze`, `/monitor`).
- **Optimize removed**: The frequency network map is now a Map tab inside Analyze, eliminating a redundant standalone module.
- **Nav cleanup**: Removed circle avatar; replaced with display name + Log out. Nav items moved back to right-justified position.
- **Homepage**: Restored original design (city hero, animated heading, 400px feature cards). Module cards updated to reflect new names and 5-module structure.
- **Map error handling**: Real-time feed errors now stop the retry loop and show a quiet inline banner with a manual Retry button instead of a pulsing red alert.
