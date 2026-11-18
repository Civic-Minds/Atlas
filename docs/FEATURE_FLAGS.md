# Feature flags

Atlas gates immature features (thin agency coverage, no scaling plan, or genuinely not ready) behind flags rather than shipping them to everyone in production nav. This doc is the single place to check current state — don't re-derive it from scattered code comments.

## Current flags

| Flag | Controls | Production | Beta deployment | Why gated |
|---|---|---|---|---|
| `LIVE_ENABLED` (`VITE_LIVE_ENABLED`) | The Live map: Live pill, `/apps/live`, `LiveVehicles.tsx`, vehicles on the map, stop-card arrivals and the route-card delay. Setting it also turns the Live report pages on (`FEATURES.liveReports`). | off | off | Live vehicle coverage is paused everywhere until the data pipeline and scope are ready. TTC vehicle positions are recorded every minute and kept 30 days (Ryan, 2026-11-15; checked with `npm run audit-live-state`, CIV-1689). The other four archive Workers (TTC trips, Hamilton, STM, Burlington/Halifax) are paused and their data has expired. Resuming Live needs the archive restored first, not only this flag. |
| `LIVE_REPORTS_ENABLED` (`VITE_LIVE_REPORTS_ENABLED`, read as `FEATURES.liveReports`) | The Live report pages only: `/apps/live/:agency`, `/apps/live/:agency/:route` and `/apps/live/:agency/tool` (`main.tsx`), and their prerendered link previews (`scripts/prerender-routes.ts`). Nothing realtime: the pages read published analysis JSON from R2. | off | off | Local only (Ryan, 2026-11-15): the page design is still in progress. (Their TTC data refreshes daily again since CIV-1690, 2026-11-15.) The Vite dev server serves them in every mode. Static pages with no realtime endpoints (added 2026-10-16, 857da2d; on at beta until 2026-11-15). |
| `HISTORY_ENABLED` (`VITE_HISTORY_ENABLED`) | History control, Agency-list History filter and coverage pills, `/apps/history`, `History.tsx` | off | on | Covers a handful of cities out of the current public catalog. |
| `HISTORY_DAY_PICKER_ENABLED` (`VITE_HISTORY_DAY_PICKER_ENABLED`, read as `FEATURES.historyDayPicker`) | History's Day chip (Weekday, Saturday, Sunday) and the `hday` link param (`FilterChips.tsx`, `History.tsx`, `historyViewUrl.ts`); needs `HISTORY_ENABLED` too | off | off until set | CIV-1425: weekend values by time of day exist only for pilot agencies so far, and the new wording is waiting on Ryan's OK. |
| `CARD_CLICK_TO_FLAG_ENABLED` (`VITE_CARD_CLICK_TO_FLAG_ENABLED`) | Click-to-flag affordance on card values (`FlaggableValue` in `cardUi.tsx`) | off | on | New, unproven interaction — no route/component split like the others, just a UI behavior to validate before it's in front of everyone. |
| `UNEVEN_BANNER_ENABLED` (`VITE_UNEVEN_BANNER_ENABLED`) | "Service is uneven" route-card banner, `RouteCardHeadway.tsx` | off | on | The excess/ratio threshold deciding when a period's worst gap is worth surfacing (#345) needs more real-feed tuning than a single main push should carry. |
| `SEGMENT_COLOURS_ENABLED` | Route lines drawn in segments coloured by the pooled per-stop tier (`route-segments` layers in `MapCanvas.tsx`, `src/utils/frequencySegments.ts`) | off | on (follows `beta`/`dev` mode) | New map reading ([#690](https://github.com/Civic-Minds/Atlas/issues/690)): the public map keeps one colour per route line from the route-level tier until the segment colours have been reviewed on real routes. |
| `CONTEXT_LAYER_ENABLED` (`FEATURES.contextLayer`) | Population density and median household income shading under the route lines, its control, legend and popup (`useContextLayer.ts`, `src/utils/contextLayer.ts`, `FilterPanel.tsx`) | off | off | Local only (Ryan, 2026-11-14, CIV-524: "I think it should be local only"): on the Vite dev server, like the connections bar. Trial (CIV-482). Also needs a data URL: none exists in production, so the control stays hidden until one is set; local testing uses the dev-only `VITE_CONTEXT_LAYER_URL` (vite serves `tmp/dev-context/context.pmtiles`). Loads nothing until the layer is switched on. |
| `SHARE_UTM_ENABLED` | Shared links and shared map images carry `utm` tags so analytics can count shared visits (`shared/config.ts`) | off | on (follows `beta`/`dev` mode) | Not env-driven; tried on beta until it is seen working end to end. |
| `COLLAPSE_MODE_TABS_ENABLED` | While Live, History or Compare is on, the other top-bar mode tabs shrink to icons (`App.tsx`) | off | on (follows `beta`/`dev` mode) | Not env-driven; layout is tried on beta first. |
| `FEATURES.persistedSettings` | Saved Settings: hide low-quality routes, persistent legend and data saver, remembered between visits (`App.tsx`, `FilterPanel.tsx`) | off | on (follows `beta`/`dev` mode) | Was a plain `FEATURES.beta` check; named so it can graduate alone. |
| `FEATURES.updateBanner` | "New version available" banner (`App.tsx`) | off | on (follows `beta`/`dev` mode) | Same: named stand-in for `FEATURES.beta`. |
| `FEATURES.mapContext`, `FEATURES.matchPercentage` | Map-context readout and match percentage in the map's status badge (`Interval.tsx`) | off | on (follows `beta`/`dev` mode) | Same: named stand-ins for `FEATURES.beta`. |
| `FEATURES.feedQuality` | Feed-quality notes on route and agency cards | off | on (follows `beta`/`dev` mode) | Same: named stand-in for `FEATURES.beta`. |
| `FEATURES.outdatedFilter` | "Outdated" choice in the agency list filter (`InfoPanel.tsx`) | off | on (follows `beta`/`dev` mode) | Same: named stand-in for `FEATURES.beta`. |
| `FEATURES.whatsNewBetaItems` | Beta-only entries in "What's new" (`ChangelogPage.tsx`, `MapAttribution.tsx`) | off | on (follows `beta`/`dev` mode) | Same: named stand-in for `FEATURES.beta`. |
| `FEATURES.dataSourceLink` | "Source" link to the agency's own website on the agency card (`AgencyCard.tsx`, CIV-841); hidden for agencies with no website (CIV-467) | off | off | Turned off everywhere (CIV-940): it links to the agency's website, not its data feed. |
| `FEATURES.routeVariants`, `FEATURES.runningTimes`, `FEATURES.sparklineExpand` | "Includes variants" line, trip running times and the expand control on the route card's frequency chart (`RouteCardHeadway.tsx`) | off | on (follows `beta`/`dev` mode) | Same: named stand-ins for `FEATURES.beta`. |
| `FEATURES.agencyHoursBar` | Hours-of-service bar on agency pages (`AgencyPage.tsx`, CIV-1605) | off | off | Local only: on the Vite dev server (`import.meta.env.DEV`), not in any deployed build. Prototype. |
| `FEATURES.connectionsBar` | Connections top bar on the Bustang connections view (`FilterChips.tsx`, `Interval.tsx`, CIV-1353): Day, wait, walk, arriving/leaving and a departure dropdown; the map shows the picked trip's connecting routes | off | off | Local only (Vite dev server), as Live's pages are; on beta and public the CIV-101 view is unchanged. |
| `FEATURES.plannersLink` | The "For Transit Planners" page (CIV-1320): its route (`main.tsx`), its footer link ("For Planners", in the Learn column, `SiteFooter.tsx`), its prerendered page and link preview (`seo.ts` gate `planners`, `seoFlags()`). Not indexed and not in the sitemap | off | off | Local only (Ryan, 2026-11-15, CIV-1704: "then make the for planners page local only", after hearing Live is local only): on the Vite dev server, as the connections bar is. On beta and public `/planners` is a 404 and the footer has no link. Was a stand-in for `FEATURES.beta` until 2026-11-15. |
| `FEATURES.researchersLink` | The "For Researchers" page (CIV-1709): its route (`main.tsx`), its footer link ("For Researchers", in the Product column after For Planners, `SiteFooter.tsx`), its prerendered page and link preview (`seo.ts` gate `researchers`, `seoFlags()`). Not indexed and not in the sitemap | off | off | Local only, like `FEATURES.plannersLink`: on the Vite dev server until History goes public (CIV-1709). On beta and public `/researchers` is a 404 and the footer has no link. |
| `FEATURES.studio` (`STUDIO_ENABLED`) | Atlas Studio, the agency tools section: one map page at `/studio` (`StudioPage.tsx`, CIV-1731, on the shared MapApp layout) with the before/after schedule figures (`StudioChangesPage.tsx`, CIV-1715) and buses needed (`StudioVehiclesPage.tsx`, CIV-1693) in its sidebar; `/studio/vehicles` and `/studio/changes` open it (`main.tsx`); plus the header's Studio link (`SiteHeader.tsx`, CIV-1694). The page reads `tmp/studio/<slug>-before-after.json` (written by `scripts/compare-feed-dates.ts --json`) and `tmp/studio/<slug>-vehicles.json` (written by `scripts/vehicles-needed.ts --json`), served only by the Vite dev server. Both files come from the same schedule file and week (one calculation per fact): `vehicles-needed.ts` gets the comparison's newer zip with `--anchor` set to its read date. The Kingston time-loss report refreshes on Ryan's Mac only, with `npm run studio:report` (CIV-1716, docs/operations/LIVE_ANALYSIS.md); no GitHub job builds Studio data | off | off | Local only (Ryan, 2026-11-15, "Yes local only"; DECISIONS.md): on the Vite dev server until the demo is ready, as the connections bar is. No data goes to R2. |
| `ON_DEMAND_ENABLED` (read as `FEATURES.onDemand`) | On-demand zones on the map, the On-demand filter chip and the standalone on-demand agencies (`MapCanvas.tsx`, `FilterChips.tsx`, `AgencyCard.tsx`, `useOnDemandData.tsx`) | off | on (any non-`public` mode: `beta`, `preview`, `dev`) | Not env-driven; `ON_DEMAND_PUBLIC` is `false` until Ryan signs off on the public launch (CIV-23), and launch flips that one value. |
| `ATLAS_MODE=preview` | Preview title and research-app visibility | off | not configured for the stable domains | Stable Preview uses the Beta project's production deployment; there is no separate Preview project or verified `preview` mode. |

## What is on right now: `npm run flags`

The table above is the intended state. To see what each site actually has switched on, run `npm run flags` before stating it anywhere (CIV-1402). It prints one row per `FEATURES` entry for the public site, beta, and the local `dev:public` / `dev:beta` scripts.

- Every build writes `/flags.json` (the `atlas-flags-json` plugin in `vite.config.ts`): the mode, every `FEATURES` value computed by `shared/config.ts` from that build's env, the switch values it was given (never URLs or keys), and the deployed commit. The command reads it from each site, so it reports what Vercel really built, not what the docs say.
- The local columns run `shared/config.ts` with the env the `package.json` script sets.
- A site deployed before this existed shows `?` with "no flags.json yet".

## How it works

Defined in `shared/config.ts`, read from Vite build-time environment variables rather than hardcoded booleans:

```ts
function envFlag(name: ...): boolean {
  return typeof import.meta !== 'undefined' && import.meta?.env?.[name] === 'true';
}
export const LIVE_ENABLED = envFlag('VITE_LIVE_ENABLED');
```

**Why env vars, not a `const true`/`false`:** Public and Beta use the same repository, while their Vercel project environments decide which features are exposed. Configure deployment-specific values in Vercel, not in source control.

`SHARE_UTM_ENABLED`, `COLLAPSE_MODE_TABS_ENABLED` and the research apps (Night Service at `/research/night`, Frequent Service, the `/research` page) are not env flags: they follow the Atlas mode and are on in `beta` and `dev` only. All of them read through the `FEATURES` registry in `shared/config.ts`. The `FEATURES.*` rows in the table above are named stand-ins for what used to be bare `FEATURES.beta` checks: each equals the beta build today (pinned by `src/__tests__/betaStandInFlags.test.tsx`) and can now graduate on its own with a one-line change. `FEATURES.beta` is still read directly for beta data hosts and agency visibility, the Night Service mount in `App.tsx`, and the About docs text.

There are two Live switches. `VITE_LIVE_ENABLED` (the Live map, vehicles and arrivals) is unset in every deployment; do not add a beta override until the Live feature is intentionally re-enabled. `VITE_LIVE_REPORTS_ENABLED` (the Live report pages) is unset in every deployment since 2026-11-15 (removed from Beta's Vercel settings; Ryan: local only until the archive restarts and the pages are approved), so `/apps/live/ttc` and `/apps/live/ttc/505` are 404 on Beta and Public and load only on the local dev server.

Every `VITE_*` switch read by `envFlag` needs a row in a table in this doc, and `VITE_*_ENABLED` switches are read only in `shared/config.ts`; `src/__tests__/featureFlagDocs.test.ts` fails otherwise.

## Graduated features

- Compare mode is on in every deployment on desktop and tablet; it stays hidden on phones (Ryan, 2026-10-20, CIV-75). It has its own address, `/apps/compare`, which falls back to the map on phones. Its `COMPARE_MODE_ENABLED` flag was removed.
- The phone bottom sheet for route and stop cards is on in every deployment (Ryan, 2026-10-20, [#647](https://github.com/Civic-Minds/Atlas/issues/647)). Its `MOBILE_ROUTE_SHEET_ENABLED` flag was removed.
- Map image export is on in every deployment; its `VITE_MAP_EXPORT_ENABLED` flag ([#642](https://github.com/Civic-Minds/Atlas/pull/642)) and the always-on `FEATURES.mapExport` were removed.
- Agency, area and state pages and the `/agencies` index are built for every deployment (Ryan, 2026-10-13); the public build still drops beta-only agencies. The `AGENCY_PAGES_ENABLED` flag was removed.
- "What's new" (the map's bottom-bar link, its panel and `/changelog`) is on in every deployment since 3.4 (CIV-1359); entries tagged beta stay beta-only through `FEATURES.whatsNewBetaItems`. The `WHATS_NEW_ENABLED` flag was removed.
- The mode transitions (`ModeTransition.tsx`: Compare's split slides in and out, History fades in and out, each map's label changes when its map redraws) are on in every deployment (Ryan, 2026-11-17, CIV-1567, after trying Compare close and History on beta). `MODE_TRANSITIONS_ENABLED` stays as a constant set to on, read as `FEATURES.modeTransitions`; Live does not use it.
- Research is no longer in the map's top bar in any mode; in `beta` and `dev` it is reached from the About page ([#652](https://github.com/Civic-Minds/Atlas/pull/652)).

## Atlas modes

`VITE_ATLAS_MODE` is the single source of truth for the deployment mode and controls agency visibility, beta data, and mode-specific UI:

| Mode | Agency visibility |
|---|---|
| `public` | Public agencies only; hidden-in-production agencies stay hidden. |
| `preview` | Beta agencies and data, but no Night Service or Frequent Service research apps. |
| `beta` | Public agencies plus agencies explicitly marked `betaOnly`. |
| `dev` | All non-staged agencies, including local QA candidates. |

Use `npm run dev:public`, `npm run dev:beta`, or `npm run dev:all` for local testing. The mode owns the deployment-level differences; the remaining feature flags are for individual features that are not tied to a deployment mode. If `VITE_ATLAS_MODE` is unset, deployed builds infer `preview`, `beta`, or `public` from the legacy flags, while Vite development infers `dev`.

When running locally, open `/dev/diagnostics/performance` to see browser navigation timings, paint timings, Atlas readiness marks, the active mode, and the visible agency count. Use its reload button for a fresh measurement.

**Each flag gates three things**, in `src/App.tsx`:
1. The pill/button that surfaces the feature.
2. The `routedApp`/`gated` check — direct URL navigation (e.g. typing `/apps/live`) redirects to the frequency map and corrects the URL, rather than silently rendering the full app anyway. Without this, hiding the pill alone doesn't actually restrict access.
3. The component import itself where bundle isolation matters. A boolean check alone can still ship a component's JS in the bundle, so sensitive/internal tools should remain unreachable from production as well as hidden from its navigation.

Local dev runs in `dev` mode, so mode-based features are on; env flags follow `.env.local` or the `dev:*` script. `dev:public`, `dev:beta`, and `dev:all` keep the Live map off; `dev:beta` sets the Live reports switch (deployed Beta no longer does, since 2026-11-15), and the Vite dev server serves the report pages in every mode. Only `npm run dev:live` (or `npm run live`, which starts the API server too) turns it on.

## Iterating on a gated feature

All product work lands on `main`. The beta deployment follows the same commit as production but enables the selected flags and beta-only agency visibility. A feature is graduated by changing its production flag or removing the gate after beta validation; it does not require a branch merge.

## Verified deployment topology

Verified 2026-09-28:

1. Public (`www.transitatlas.fyi`) is attached to the `atlas` Vercel project.
2. Beta (`beta.transitatlas.fyi`) is attached to the `atlas-beta` Vercel project.
3. Preview (`preview.transitatlas.fyi`) is also attached to `atlas-beta`; it is not a separate Preview project or independently configured deployment.

The Public project has no explicit `VITE_ATLAS_MODE` production variable, so it relies on the public legacy fallback. The Beta project has an explicit production `VITE_ATLAS_MODE` and the Beta feature flags. Preview therefore uses the Beta project's production configuration unless this topology changes.

The Public project has the Google Analytics measurement ID in Production. The Beta project also has a measurement ID in Production. Vercel Web Analytics remains project-specific. Do not document Preview as sharing a separate mode until it has its own project or independently verified environment.

Both projects use the Vite framework preset. The documented Vercel output setting is not a separate `build` directory; keep it aligned with the repository's `dist` build output if the project settings are changed.

## Legacy mode flags

`VITE_BETA_BUILD` and `VITE_PREVIEW_BUILD` are compatibility fallbacks for older deployments. New deployments must set `VITE_ATLAS_MODE` explicitly so the tab title, agency catalog, data artifacts, and feature gates cannot disagree.

| Flag | Read only when `VITE_ATLAS_MODE` is unset | Production | Beta deployment |
|---|---|---|---|
| `VITE_BETA_BUILD` | A deployed build becomes `beta` | unset | set, but unused because `VITE_ATLAS_MODE` is set |
| `VITE_PREVIEW_BUILD` | A deployed build becomes `preview` | unset | unset |
