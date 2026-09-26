# Feature Flags

Atlas gates immature features (thin agency coverage, no scaling plan, or genuinely not ready) behind flags rather than shipping them to everyone in production nav. This doc is the single place to check current state — don't re-derive it from scattered code comments.

## Current flags

| Flag | Controls | Production | Beta deployment | Why gated |
|---|---|---|---|---|
| `LIVE_ENABLED` | Live pill, `/apps/live`, `LiveVehicles.tsx` | off | off | Live vehicle coverage is paused everywhere until the data pipeline and scope are ready. |
| `HISTORY_ENABLED` | History control, Agency-list History filter and coverage pills, `/apps/history`, `History.tsx` | off | on | Covers a handful of cities out of 556 public agencies. Same reason. |
| `CARD_CLICK_TO_FLAG_ENABLED` | Click-to-flag affordance on card values (`FlaggableValue` in `cardUi.tsx`) | off | on | New, unproven interaction — no route/component split like the others, just a UI behavior to validate before it's in front of everyone. |
| `CORRIDORS_ENABLED` | `/apps/corridors`, `Corridors.tsx` | off | off | Not good enough as a feature yet (Ryan, 2026-07-28). Its panel is also broken by a CSS bug independent of this flag. |
| `UNEVEN_BANNER_ENABLED` | "Service is uneven" route-card banner, `RouteCardHeadway.tsx` | off | on | The excess/ratio threshold deciding when a period's worst gap is worth surfacing (#345) needs more real-feed tuning than a single main push should carry. |
| `ATLAS_MODE=preview` | Preview title and research-app visibility | off | on | Preview deployments retain beta data access for external testing without exposing the Night Service or Frequent Service research apps. |

## How it works

Defined in `shared/config.ts`, read from Vite build-time environment variables rather than hardcoded booleans:

```ts
function envFlag(name: ...): boolean {
  return typeof import.meta !== 'undefined' && import.meta?.env?.[name] === 'true';
}
export const LIVE_ENABLED = envFlag('VITE_LIVE_ENABLED');
```

**Why env vars, not a `const true`/`false`:** production and beta use the same `main` commit. Only their Vercel build environments differ, so a feature can be tested on beta without creating a second code branch or repeatedly merging two divergent trees. Configure beta-only values on the beta deployment/project, not in source control:

Live is currently unset/false in every deployment. Do not add a beta override until the Live feature is intentionally re-enabled.

## Atlas modes

`VITE_ATLAS_MODE` is the single source of truth for the deployment mode and controls agency visibility, beta data, and mode-specific UI:

| Mode | Agency visibility |
|---|---|
| `public` | Public agencies only; hidden-in-production agencies stay hidden. |
| `preview` | Beta agencies and data, but no Night Service or Frequent Service research apps. |
| `beta` | Public agencies plus agencies explicitly marked `betaOnly`. |
| `dev` | All non-staged agencies, including local QA candidates. |

Use `npm run dev:public`, `npm run dev:beta`, or `npm run dev:all` for local testing. The mode owns the deployment-level differences; the remaining feature flags are for individual features that are not tied to a deployment mode. If `VITE_ATLAS_MODE` is unset, older deployed builds infer `public` or `beta` from the legacy flags, while Vite development infers `dev`.

When running locally, open `/apps/diagnostics/performance` to see browser navigation timings, paint timings, Atlas readiness marks, the active mode, and the visible agency count. Use its reload button for a fresh measurement.

**Each flag gates three things**, in `src/App.tsx`:
1. The pill/button that surfaces the feature.
2. The `routedApp`/`gated` check — direct URL navigation (e.g. typing `/apps/live`) redirects to the frequency map and corrects the URL, rather than silently rendering the full app anyway. Without this, hiding the pill alone doesn't actually restrict access.
3. The component import itself where bundle isolation matters. A boolean check alone can still ship a component's JS in the bundle, so sensitive/internal tools should remain unreachable from production as well as hidden from its navigation.

Local dev keeps experimental features available for QA, but Live is currently explicitly disabled everywhere.

## Iterating on a gated feature

All product work lands on `main`. The beta deployment follows the same commit as production but enables the selected flags and beta-only agency visibility. A feature is graduated by changing its production flag or removing the gate after beta validation; it does not require a branch merge.

## Deployment separation

Keep three Vercel deployments pointed at the same repository and `main` branch:

1. Production (`www.transitatlas.fyi`): `VITE_ATLAS_MODE=public`, automatic from `main`.
2. Preview (`preview.transitatlas.fyi`): `VITE_ATLAS_MODE=preview`, automatic from `main`; this is the stable outreach link for agency contacts.
3. Beta (`beta.transitatlas.fyi`): `VITE_ATLAS_MODE=beta`, manually promoted from a validated `main` deployment.

The beta deployment may be a separate Vercel project so both sites can automatically rebuild from `main` with different environment values. Do not restore a long-lived beta Git branch just to hold these settings. If beta access ever needs to be limited to named testers, add access control at the deployment boundary; do not make the production client guess whether a user is allowed to see an internal tool.

### Vercel cutover procedure

The production project and beta project must be separate because Vercel environment variables are project-scoped; there is no supported way to inject beta flags into one deployment while leaving another deployment of that project unchanged.

1. Create or use the Preview and Beta Vercel projects and set both production branches to `main`.
2. Set `VITE_ATLAS_MODE=preview` in the Preview project and `VITE_ATLAS_MODE=beta` plus approved beta flags in the Beta project. Keep the production project on `public`.
3. Deploy each project and verify the generated deployment URL with `npm run verify:deployments` using temporary hostname overrides.
4. Attach the stable domains, verify them again, and confirm Preview shows the current on-demand outreach demo.
5. Keep the old branch-based project available until both stable hostnames are confirmed; retire it only after the cutover is complete.

The beta project currently uses the Vite framework/output configuration (`dist`). A Vercel deployment can show a successful `npm run build` and still fail afterward if its Output Directory is incorrectly set to `build`.

## Legacy mode flags

`VITE_BETA_BUILD` and `VITE_PREVIEW_BUILD` are compatibility fallbacks for older deployments. New deployments must set `VITE_ATLAS_MODE` explicitly so the tab title, agency catalog, data artifacts, and feature gates cannot disagree.
