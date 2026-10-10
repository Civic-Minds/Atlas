# Feature flags

Atlas gates immature features (thin agency coverage, no scaling plan, or genuinely not ready) behind flags rather than shipping them to everyone in production nav. This doc is the single place to check current state — don't re-derive it from scattered code comments.

## Current flags

| Flag | Controls | Production | Beta deployment | Why gated |
|---|---|---|---|---|
| `LIVE_ENABLED` | Live pill, `/apps/live`, `LiveVehicles.tsx` | off | off | Live vehicle coverage is paused everywhere until the data pipeline and scope are ready. GTFS-RT Worker cron triggers are off; existing `atlas-live` objects age out under the bucket’s 30-day lifecycle — resuming Live requires restoring archiving first, not only flipping this flag. |
| `HISTORY_ENABLED` | History control, Agency-list History filter and coverage pills, `/apps/history`, `History.tsx` | off | on | Covers a handful of cities out of the current public catalog. |
| `CARD_CLICK_TO_FLAG_ENABLED` | Click-to-flag affordance on card values (`FlaggableValue` in `cardUi.tsx`) | off | on | New, unproven interaction — no route/component split like the others, just a UI behavior to validate before it's in front of everyone. |
| `CORRIDORS_ENABLED` | `/apps/corridors`, `Corridors.tsx` | off | off | Not good enough as a feature yet (Ryan, 2026-07-28). The panel is intentionally invisible in layout (not a CSS accident) — do not “fix” positioning until the feature is ready to ship. |
| `UNEVEN_BANNER_ENABLED` | "Service is uneven" route-card banner, `RouteCardHeadway.tsx` | off | on | The excess/ratio threshold deciding when a period's worst gap is worth surfacing (#345) needs more real-feed tuning than a single main push should carry. |
| `MOBILE_ROUTE_SHEET_ENABLED` | Route and stop cards open as a bottom sheet on phones (`SidebarControls.tsx`) | off | on (follows `beta`/`dev` mode) | New phone layout to try on real phones before replacing the floating card for everyone ([#647](https://github.com/Civic-Minds/Atlas/issues/647)). |
| `ATLAS_MODE=preview` | Preview title and research-app visibility | off | not configured for the stable domains | Stable Preview uses the Beta project's production deployment; there is no separate Preview project or verified `preview` mode. |

## How it works

Defined in `shared/config.ts`, read from Vite build-time environment variables rather than hardcoded booleans:

```ts
function envFlag(name: ...): boolean {
  return typeof import.meta !== 'undefined' && import.meta?.env?.[name] === 'true';
}
export const LIVE_ENABLED = envFlag('VITE_LIVE_ENABLED');
```

**Why env vars, not a `const true`/`false`:** Public and Beta use the same repository, while their Vercel project environments decide which features are exposed. Configure deployment-specific values in Vercel, not in source control.

`MOBILE_ROUTE_SHEET_ENABLED` and the research apps (Night Service, Frequent Service, the `/research` page) are not env flags: they follow the Atlas mode and are on in `beta` and `dev` only. All of them read through the `FEATURES` registry in `shared/config.ts`.

Live is unset/false in every deployment. Do not add a beta override until the Live feature is intentionally re-enabled.

## Graduated features

- Map image export is on in every deployment; its `VITE_MAP_EXPORT_ENABLED` flag was removed ([#642](https://github.com/Civic-Minds/Atlas/pull/642)).
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

When running locally, open `/apps/diagnostics/performance` to see browser navigation timings, paint timings, Atlas readiness marks, the active mode, and the visible agency count. Use its reload button for a fresh measurement.

**Each flag gates three things**, in `src/App.tsx`:
1. The pill/button that surfaces the feature.
2. The `routedApp`/`gated` check — direct URL navigation (e.g. typing `/apps/live`) redirects to the frequency map and corrects the URL, rather than silently rendering the full app anyway. Without this, hiding the pill alone doesn't actually restrict access.
3. The component import itself where bundle isolation matters. A boolean check alone can still ship a component's JS in the bundle, so sensitive/internal tools should remain unreachable from production as well as hidden from its navigation.

Local dev runs in `dev` mode, so mode-based features are on; env flags follow `.env.local` or the `dev:*` script. `dev:public`, `dev:beta`, and `dev:all` keep Live off; only `npm run dev:live` turns it on.

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
