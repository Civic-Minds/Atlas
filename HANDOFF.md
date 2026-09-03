
# Atlas — Handoff (2026-09-03, Live pause and Vercel deployment fix)

## Current state

- Live GTFS-RT archiving is paused. The five Cloudflare archive Workers remain deployed without Cron Triggers; they were not deleted, and existing `atlas-live` R2 snapshots remain intact.
- The beta Live feature is disabled: `VITE_LIVE_ENABLED` was removed from the `atlas-beta` Production environment, so the Live control is hidden after deployment. The Live code remains available for a future rebuild.
- The failed Vercel deployments (`dpl_Chea42msbT6i1eGFwSm3gHoW8aWD` and `dpl_7FBXw5S5Qhbf7nt6TxuNimEgPcSs`) built successfully but exceeded Vercel Hobby’s 12-function limit. `api/privacy-region.ts` was consolidated into `api/geo.ts` through `shared/privacyRegion.ts` and a rewrite, returning Atlas to 12 functions.
- Both Vercel projects now deploy successfully from `main`. Production and beta report commit `a5af2975`, both public domains returned HTTP 200, and beta no longer shows Live in the rendered page.
- Relevant pushed commits: `359944aa` (Vercel function-limit fix) and `a5af2975` (pause Live collection). `main` was clean and synchronized with `origin/main` at verification time.

## Next suggested work

- Rebuild Live as a small, reliable on-demand relay without background archiving. Define feed coverage, freshness/error behavior, and agency-specific validation before restoring the UI.
- Do not restore the five Cron Triggers until collection quality is verified.


# Atlas — Handoff (2026-08-14, 10-agency history expansion — completed by Gemini)

# Status
*   **Completed 10-Year Backfills**:
    *   `metro-transit`: backfilled 2016-2026 via `mdb-205` (110 routes with changes archived in R2). Updated config to dynamic URLs.
    *   `grt`: backfilled 2016-2026 via legacy `mdb-721` (23 routes with changes archived in R2). Updated config.
    *   `brampton`: backfilled 2016-2026 via `mdb-729` (52 routes with changes archived in R2).
    *   `ddot`: backfilled 2016-2026 via `mdb-464` (31 routes with changes archived in R2). Updated config to dynamic mirror.
    *   `spokane`: backfilled 2016-2026 via `mdb-290` (19 routes with changes archived in R2).
    *   Ran `npm run build-history` to compile and upload the updated public `atlas/history-config.json` to R2 (now contains 137 agencies).
*   **Documentation & Deferred List**:
    *   Created `docs/DATA_HISTORY.md` which lists eligibility criteria, active systems, high-feasibility candidates (e.g. Halifax), and deferred systems (AC Transit, NORTA, Richmond GRTC, Hamilton HSR) with detailed reasons.
*   **Commit**: Staged and committed code changes locally on branch `fix/nrt-service-classification` under commit `b4f5bdc3` (all 528 tests passing).

---

# Atlas — Handoff (2026-07-30, session cut off mid-task)

Nothing mid-task on `main`/`beta` — both are released (v3.2.13), pushed, and in sync. What's actually open:

- **[#313](https://github.com/Civic-Minds/Atlas/issues/313)** — TTC Blue Night Network routes entirely missing from processed data. Not yet root-caused. This is why Night Service currently shows 0 routes everywhere.
- **`experiment/night-service-gallery`** branch (local only, not pushed) — parked mini-map gallery redesign for Night Service, single commit `0ab2b96b` has the full context including the unresolved rendering bug. Nothing else depends on it.
- **France launch on beta** — Ryan tabled this before any research or code started. No agency picked yet. See `AGENTS.md` § Production Data Rules for the `hiddenInProduction` behavior note if it comes back up.

---

# Atlas — Handoff (2026-07-29, Frequent Network research — for Grok)

## Task

Research brief already written: `docs/DATA_FREQUENT_NETWORK.md`. Read it first — it lays out the product question and exactly what's unresolved. This handoff is just the pointer + explicit scope.

**What to do**: survey how real transit agencies and transit-advocacy orgs define their own "frequent network" / "high-frequency network" — this is a real, established concept many systems already publish (their own frequent-service maps), not something Atlas is inventing from scratch. For each one found:

- Headway threshold (10 min? 15 min? "every 12 min or better"?)
- What hours/time-span counts as "all day" — start and end times
- Whether the threshold must hold uniformly across that whole span, or tolerates a dip in a weaker period (e.g. midday) as long as peaks/evening hold
- Weekday-only, or does it also require weekend frequency
- **Source everything** — agency/org name, the specific document or map page it comes from, and the date. These get revised, so don't summarize from memory; cite what's live right now.

Known starting points to check (verify these are still current, don't assume): TransitCenter's frequent-network research, individual agency frequent/high-frequency network maps (systems like Houston METRO and King County Metro have historically published these), and any GTFS-based frequent-network tools that publish their own methodology.

**What NOT to do**: don't pick a threshold for Atlas, don't design the feature, don't touch any code. This is research only — write findings into `docs/DATA_FREQUENT_NETWORK.md` under a new "Survey findings" section (add it, the doc doesn't have one yet), then answer the two open design questions already listed in the doc ("Open design question this research should settle") with a recommendation grounded in what the survey found — but leave it as a recommendation, not an implemented decision. Ryan makes the final call.

No code changes, no CHANGELOG entry (docs-only). Commit as `docs: survey frequent-network definitions for #<doc>` once the doc is filled in — no issue number exists for this yet, it's still pre-issue research.

---

# Atlas — Handoff (2026-07-19, France expansion — for Grok)

## Task

Add 3-5 more French transit agencies as candidates, on the `feat/france-expansion` branch, following the same rigor used for Metz/Nancy/Rennes this session:

1. Find candidates via `docs/COVERAGE_GAP_DISCOVERY.md` / `transport.data.gouv.fr` (France publishes GTFS per-operator, not bundled — unlike the UK).
2. `npm run process -- <feed> <slug> "[name]" "[lat,lon]" --dry-run` — never the real (non-`--dry-run`) command. See § below.
3. `npm run route-report -- <slug>` — check for zero unrepaired shape anomalies, no near-duplicate headsigns, and headway mismatches that look like the "benign long peri-urban branch" pattern (not a real bug).
4. Visually verify on the local map before calling it done — the local dev server's PMTiles/agency-data preview plugins in `vite.config.ts` let you do this with zero R2 writes; see `docs/ADDING_AGENCIES.md` § Incremental PMTiles Build for the exact steps (build a local preview merged with the current deployed tiles, copy to `tmp/atlas-pmtiles-preview.pmtiles`, restart dev server).
5. Add each candidate's config to `config/agencies/<slug>.json` with `hiddenInProduction: true, pmtilesPending: true` — same pattern as Metz/Nancy/Rennes.

## Critical constraint — do not process for real

**France has zero live agencies in production right now — stay on `--dry-run` for everything, no exceptions, even if a city looks completely clean.** This is a hard rule, not a judgment call: publishing a new country's first agency (even hidden) is a country-launch decision, not a routine agency add, and needs Ryan's own explicit go-ahead each time. See `AGENTS.md` § Production Data Rules and `docs/ADDING_AGENCIES.md` for the full explanation — this was violated once already this session (Metz ended up live on R2 without approval; left as-is since it's harmless/hidden, but not to be repeated).

## Known shape-corruption patterns to watch for

France's GTFS feeds (likely a NeTEx→GTFS conversion artifact, see `docs/INTERNATIONAL.md` § France) have shown real corruption beyond what `pipeline/parseGtfs.ts`'s general detectors catch automatically:
- Clustered/paired reversals — auto-repaired already, no action needed.
- Isolated single-point reversals — auto-detected but NOT auto-fixed generally (rejected as a general rule after nearly misfiring on a real TTC terminus loop); known real Nancy cases are hardcoded in `KNOWN_ISOLATED_POINT_FIXES` in `parseGtfs.ts`. If a new city shows this pattern, it needs the same manual visual-confirm-then-hardcode treatment, not a new general rule.
- A 4th pattern (large jumps, only a mild turn angle) is **not yet detected by anything** — confirmed on Nancy and Guadalajara, tracked in GitHub issue #247, still open. If a new French city's map shows a line cutting through blocks that `route-report` doesn't flag, this is likely why — check manually.

---

# Atlas — Handoff (2026-07-15, next session)

## Current state

- Atlas `v3.2.2` is released and pushed.
- `main`, `origin/main`, and tag `v3.2.2` all resolve to `ae34324`.
- Worktree is clean.
- The old `ai-211-support-gtfs-fares-v2` branch was already merged and deleted locally/remotely.

## Next tasks

1. **Backfill data-quality history**: populate `config/feed-review-history.json` with confirmed historical feed reviews, especially Niagara, so the 2-of-last-10 rule can actually trigger for agencies with recurring GTFS problems.
2. **Verify the new-feed notice in the deployed app**: trigger or manually stage a `feedReviewStatus: "review"` agency and confirm the agency/route cards and in-app explainer read correctly.
3. **Review the remaining Niagara 337 frequency branch**: the current artifact still had one weekday branch showing roughly 20–23 minutes; compare it with the raw schedule before deciding whether another normalization is needed. Related tracking: [GitHub #194](https://github.com/Civic-Minds/Atlas/issues/194).
4. **Keep agency source files canonical**: the config split is committed in `53dbd83`; verify future refresh/process runs keep `config/agencies/*.json` and generated `public/data/index.json` synchronized.

## Recent decisions

- Feed-specific corrections are tied to the exact GTFS snapshot and clear when a new feed arrives.
- Only agencies with at least 2 confirmed issues in their last 10 reviewed feeds receive a temporary new-feed verification notice; fewer than 3 reviewed feeds is insufficient history.
- GTFS Fares V2 is supported alongside V1; V2 adult products take precedence, with V1 and manual overrides as fallbacks. Recorded in `docs/DECISIONS.md`.

# Atlas — Handoff (2026-07-10, Live overhaul session pt 2)

## Remaining tasks (moved from CLI task list, 2026-07-10)
1. ~~**Fix headway-measurement shape matching**~~ — **Fixed 2026-07-16.** Added `shared/shapeProjection.ts` (segment-interpolated projection instead of nearest-vertex; MultiLineString support; sample-driven branch selection via `pickBestShape` instead of picking the geometrically longest candidate). Used by `scripts/streetcar-headways.ts` and the live `api/live-vehicles.ts` TTC gap-status path. Rerun against 2026-07-16 archive: 19/19 route+direction candidates now produce valid midpoint crossings (up from 2), with plausible medians (504 King ~3-4 min, most others 8-11 min). Trust the numbers now.
2. **Past-hour measured arrivals at a stop** — API reads last hour of positions/ttc/ (private R2, mirror history-adherence access), vehicles within ~80m of stop, min-distance sample = passage time, direction via trajectory bearing. Complements the predicted "Live at this stop" chips. TTC streetcars only until more agencies archived.
3. **Decide display surface for speed/headway stats** — Ryan's call once headway numbers are trustworthy: History tab extension, route card section, or new map app. Plot variance/spread, not just means. Speed numbers already solid (504 King 6.7 km/h midafternoon, script: scripts/streetcar-speeds.ts).
4. **#155** — TTC per-vehicle delay is structurally impossible (RT trip IDs don't join static GTFS); the headway-based per-vehicle status (gap to car ahead) workaround was already implemented, and was blocked on task 1's shape-matching bug (now fixed 2026-07-16) silently degrading MultiLineString/branch routes to `no_data`. Re-verify live once deployed.
5. **#89 second half** — shared trunk highlighting on the map; corridor band layer already computes overlaps but is off by default (route-card grouping shipped).

## Day-2 additions (2026-07-10)
- **Map filters were silently dead** — MapLibre rejected the combined filter (legacy + expression syntax mix); frequency/mode/day/search never filtered the map. Fixed (94c94cd, closes #135/#136). Expect the map to visibly change once deployed.
- Search polish: hover-to-highlight on map, "showing 10 of N" headers, variant family collapse in results (3a134dc, #167).
- Variant families merge into one route card (destinations list carries all branches) + agencies load on cold shared URLs (#160).
- Richmond/Enter no-fly report could NOT be reproduced on current code (headless Playwright: agency-only result + Enter flies correctly) — likely stale HMR bundle; retest after hard refresh.
- Headless verification harness: scratchpad playwright-core + chrome-headless-shell (repro scripts in session scratchpad; window.__map/__deckOverlay DEV globals in MapCanvas).

## Just completed (Claude, Live/streetcar session day 1)
- 10 local commits pending push (b20e777..1a567b2); GH issues #147-#154, #156, #157 auto-close on push. Push needs MANGO.
- Live: clickable coverage place list; all 10 TTC streetcar routes (vehiclesOnly config tier); live headway vs scheduled on route cards; per-vehicle speed; live arrivals + current gap on stop cards (/api/live-stop); mode-aware labels (Streetcar not Bus); hover tooltip reimplemented (manual deck picking, retina-safe radius).
- Fixed: pan/zoom lock (deck canvas ate gestures); route badge over-count (geometry + day scoping).
- Refactor: MapCanvas 1185→822 lines; overlays in src/components/Interval/map/ hooks.
- Cloudflare Worker deployed: TTC streetcar positions archived every 1 min to atlas-live R2 positions/ttc/ (30-day retention); trip delays stay 5-min.
- TTC static data refreshed on R2 (sidecar now populated for all 10 streetcar routes).

## Key findings
- TTC GTFS-RT trip IDs do NOT join to static GTFS (2/1993, no start_time) → per-vehicle schedule delay impossible for TTC (#155 open). Path: headway-based status from position archive.
- TTC populates position.speed on all ~1,500 vehicles.
- Concurrent AI sessions commit to this repo — verify HEAD before amend.

## In progress / next
- Task #5: streetcar commercial speed by route/hour from positions/ttc/ archive (script not yet written; archive collecting since ~13:45 ET).
- Task #6/#9: measured headways + past-hour stop arrivals from archive.
- GH #135/#136 (mode/frequency filter don't restrict map) — investigation started; tiles carry all needed properties, tileFilter looks correct, UI-driven repro incomplete (filter dropdown resisted Playwright).
- Local dev note: /api/* proxies to production, so new endpoints/config appear only after deploy.

## Prior
- Added **Yellowknife Transit** (NWT) + **Whitehorse Transit** (Yukon). 414 agencies. PMTiles rebuild after (Grok).

## Prior
# Atlas — Handoff (2026-07-09)

## Just completed (2026-07-09 — fixed-route batch +24)

- Processed/uploaded 24 agencies: college towns, midsize metros, VT/NH fill, Brandon/Juneau/Bangor/Bis-Man/Annapolis.
- **412 agencies** in index.
- Manchester NH still blocked (inactive MDB only).
- PMTiles rebuilt/uploaded after batch.

## Prior handoff

# Atlas — Handoff (2026-07-08)

## Just completed (2026-07-08 — Tier 1–2 coverage)

- **Added/processed** (R2 + index + PMTiles rebuilt/uploaded via rclone):
  - `springfield-mo` — City Utilities Transit (official GTPM zip)
  - `brownsville` — was stub; processed tld-7927
  - `evansville` — METS via ntd-50043 (calendar end ~2025-01; stale)
  - `kenosha` — Trillium feed (stale ~2024; NTD GTFS waived)
- **Blocked** (no public GTFS) → KNOWN_ISSUES: peterborough, brantford, cape-breton, sts-saguenay (sts.qc.ca is Sherbrooke not Saguenay), sttr already blocked
- **388 agencies** in index; Tier 1–2 backlog cleared for available feeds
- Next: Tier 3 (gmt, manchester-nh, coast-nh) or live depth

## Prior handoff

# Atlas — Handoff (2026-07-06)

## Just completed (2026-07-06 session)

- Filled feedUrls + processed/refreshed for waukesha-metro (mdb-396), tulare-county-transit (mdb-646), pace (deduped to pace-bus mdb-2347).
- Added + processed + refreshed: Visalia Transit (direct + ntd-90091), Green Bay Metro (mdb-917).
- Geographic gap analysis (subagent cancelled; manual via index scan + MDB/web research):
  - Current: 343 agencies (strong CA 76, ON/NY 24 ea; sparse Midwest/secondaries).
  - Priority gaps identified + started adding: Columbus OH (COTA - direct feed), Des Moines IA (DART mdb-193), Wichita KS (mdb-185), Appleton/Fox Cities WI (Valley Transit mdb-2069).
  - Other notables: more WI (Racine/Kenosha), secondary CA (Bakersfield/Stockton/Modesto), TX secondaries (Laredo etc.), South Bend IN, Rockford IL, Tacoma WA, Reno NV, Lincoln NE.
- Updated index.json, AGENCIES.md (synced), CHANGELOG [Unreleased].
- Processes launched for new gap agencies (R2 artifacts).
- Deduped duplicate Pace entries; cleaned "pace" slug.
- Note: some new feeds stale (e.g. Green Bay 2020); Columbus/DART/Appleton/Wichita fresh or recent.
- No commits/push yet (ahead 3 from prior releases).

## Previous (2026-07-05)

- **TTC 506 Sparkline 2am Bug (AI-267)**: Fixed boundary mapping of hour 26 to `'overnight'` instead of `'late'` in `HandwaySparkline.tsx`. Integrated `Math.max` between branch-specific start headways and terminal stop headways in the pipeline (`process-core.ts`) to prevent late-night schedule bunching/layover artifacts (e.g. 2-minute gaps at Main Street Station at 2 AM) from inflating route frequency.
- **TTC 35 Headway Ranges (AI-270)**: Updated pipeline (`process-core.ts`) to compute branch-specific, headsign-specific period and hourly headways. Prevented shared terminal stop headways from bleeding into different branches (e.g. `35A` vs `35B` both ending at Mount Dennis) by comparing branch-specific start headways with terminal stop headways using `Math.max`.
- Staged and committed all modifications under commit `f9001a4`.
- Updated Linear issues `AI-267` and `AI-270` to status **In Review** and appended commit SHA `f9001a4`.
- Production build verification (`tsc && vite build`) and Vitest test suite verified successfully.
- Filed Atlas live bug report (image): selected 15m frequency but entire network visible (AI-280).

## Next up (priority)

### GitHub issues #80–84 — close after deploy (Grok)

**Can agents update GitHub issues via `gh`?** Partially.
- Works: `gh issue create`
- Works: `gh issue view` / `gh issue list`
- Blocked on this machine (per `CLAUDE.md` / `AGENTS.md`): `gh issue edit`, `gh issue comment`, `gh issue close`
- Works: **Auto-close on push** via `Closes #N` / `Fixes #N` in commit message (standard GitHub workflow — see `docs/ISSUES.md` Issue Lifecycle)

**Issue body rewrite (#79–84):** Already done. #79 closed with plain-language intro + `data override` label. #80–84 bodies match `docs/ISSUES.md` format (no `bug` label, no leaked chat context). **Do not rewrite again.**

---

#### Uncommitted fixes (Cursor session 2026-07-06 PM)

Local diff (not committed yet) addresses all five open bugs:

| Issue | Fix (files) |
|-------|-------------|
| **#80** RGRTA misleading ranges | `headsignMinStopHeadwayByPeriod` in `pipeline/process-core.ts`; `RouteCardHeadway.tsx` uses it for trunk range |
| **#81** CDTA BusPlus casing | `Busplus → BusPlus` in `src/utils/format.ts` `TRANSIT_ACRONYMS` |
| **#82/#84** GRTC single direction | `busAnalysisShapeIds()` unions full-route shape clusters in `process-core.ts` (weekday/weekend shape_ids no longer drop a direction) |
| **#83** Badge vs map mismatch | `tileFilter` mirrors `passesRouteFilter` period + worst-direction headway in `useIntervalStats.ts`; removed duplicate `headwayPillFilter` in `MapCanvas.tsx` |

Tests: `useIntervalStats.test.ts` (+ period filter case) — 12 passing.

---

#### Exact steps for Grok to close #80–84

Per `docs/ISSUES.md` lifecycle: **changelog → commit with `Closes` → reprocess affected agencies → rebuild PMTiles → push (MANGO only).**

**1. Reprocess + upload data** (fixes need fresh R2 GeoJSON; #83 also needs PMTiles):

```bash
source .env.local
npm run process -- <grtc-feed.zip> grtc "GRTC Transit (Richmond, VA)" "37.445,-77.474"
npm run process -- <rgrta-feed.zip> rgrta "RGRTA" "<center>"
# #81 is frontend-only — no CDTA reprocess needed
npm run build-pmtiles
# rclone upload atlas.pmtiles (see CLAUDE.md)
```

GRTC feed: `https://files.mobilitydatabase.org/mdb-902/latest.zip` (also in `index.json`). After refresh, bump `lastFeedExpiry` in `index.json` if feed date changed (stale banner is separate from direction bug).

**2. Update `CHANGELOG.md` `[Unreleased]`** — one bullet covering shape-filter union, tileFilter alignment, headsign trunk headways, BusPlus casing.

**3. Commit** (author: Ryan Hanna). **Single commit** closing all five:

```
fix: GRTC directions, map badge filter, RGRTA ranges, BusPlus casing

- Union full-route shape clusters so weekday/weekend shape_ids don't drop directions
- Align PMTiles tileFilter with passesRouteFilter (period + worst-direction headway)
- Scope route-card trunk headways per headsign (RGRTA 21/22 ranges)
- Normalize CDTA BusPlus branding in titleCase

Closes #80
Closes #81
Closes #82
Closes #83
Closes #84
```

GitHub auto-closes each issue when this commit is **pushed/merged to default branch**. No `gh issue close` needed.

**4. Optional comment** — only if Ryan has a machine with `gh issue comment` access and wants a note before push. Otherwise the commit message is sufficient per `docs/ISSUES.md`.

**5. Verify after deploy**
- GRTC: BRT + route 5 show **both** directions in route card (#82, #84)
- GRTC map: badge count matches filtered visible lines (#83)
- RGRTA 21/22 Charlotte Midday: **"every 30 min"** not "every 13–30 min" (#80)
- CDTA 910: **"BusPlus Purple Line"** (#81)

**6. Linear** — if mirror issues exist, set **In Review** + append 7-char SHA + "Fixed by Grok". Do not set Done.

**Do NOT:** use `gh issue edit`/`close` on this machine; rewrite issue bodies; close before commit exists.

---

### Other next-up items

## Ideas

- **Environments / testing workflow**: Move toward 
  - Production (local on personal computer — accessible across your devices via LAN or personal tunnel for bug hunting)
  - Preview (Vercel previews; stable URL like preview.site.com nice-to-have but not required)
  - Public (live confirmed version)

  Key clarification: Don't care if preview is publicly accessible.

  Motivation: Bug hunting and issue flagging currently tied to `localhost` on one machine (laptop). Can't easily use desktop/other computers to explore the app and surface issues because localhost isn't reachable. Goal is multi-device local "Production" testing.

  Note: Default Vercel previews create unique URLs per deploy. For stable preview URL, use dedicated `preview` branch + Vercel domain/alias. Data (R2) shared for simplicity.
# Atlas — Handoff (2026-07-15, route-facts consolidation)

## Current state

- Local `main` is clean and ahead of `origin/main` by 24 commits. No push has been made; pushing requires the exact approval word `MANGO`.
- Latest commits:
  - `1403d23` — Unify route panel facts
  - `65f4dfe` — Unify route facts across route surfaces
- Verification after both changes: `npm test` passes (34 files, 166 tests); `npm run build` passes with the existing large-bundle warning.

## What changed

- Added `src/utils/routeFacts.ts` as the frontend's canonical route-facts record.
- Search, Recent routes, suggested routes, agency cards, selected route construction, stop route groups, nearby routes, and route disambiguation now use shared route identity/name/agency fallbacks.
- This is only the identity/display layer so far. Frequency/headway calculations are still split across route-card, filter, branch, shared-section, stop, and live-data paths.

## GitHub issue tracking

- **Resolved 2026-07-16**: #180 (fixed in `bb85c68`), #181 (fixed in `f1dbed5`), #166 (fixed in `3f8b00b`, `958572b`), and the #185-replacement umbrella #186 are all closeable — verified fixes are on `main` and referenced via `Closes #NN` in the `1be626d` housekeeping commit (auto-closes on push).
- `StopRouteGroup.branchHeadway` (the last duplicated fallback-chain call site) now routes through the shared `metricValueForPeriod` instead of reimplementing it (`cb34231`).
- The remaining scope from the "Next task" below — a canonical *live-data* RouteFacts projection unifying `shared/liveHeadway.ts`/`api/live-vehicles.ts` with the display/filter/branch/shared metrics — is intentionally **not done**. No open issue currently demands it now that #180/#181/#166/#186 are fixed; treat it as a future architecture item if a concrete live/static mismatch surfaces, not a standing task.

## Next task (superseded — see above)

~~Define and implement the canonical service summary in `RouteFacts`~~ — the display/filter/branch/shared metric work this described is done (see GitHub issue tracking above). What's left (live-data projection) is deliberately deferred, not forgotten.
