# Feature Flags

Atlas gates immature features (thin agency coverage, no scaling plan, or genuinely not ready) behind flags rather than shipping them to everyone in production nav. This doc is the single place to check current state — don't re-derive it from scattered code comments.

## Current flags

| Flag | Controls | Production | Beta deployment | Why gated |
|---|---|---|---|---|
| `LIVE_ENABLED` | Live pill, `/apps/live`, `LiveVehicles.tsx` | off | on | Covers ~5 agencies, 2 routes each, out of 400+. No scaling plan yet. |
| `HISTORY_ENABLED` | History control, Agency-list History filter and coverage pills, `/apps/history`, `History.tsx` | off | on | Covers a handful of cities out of 400+. Same reason. |
| `CARD_CLICK_TO_FLAG_ENABLED` | Click-to-flag affordance on card values (`FlaggableValue` in `cardUi.tsx`) | off | on | New, unproven interaction — no route/component split like the others, just a UI behavior to validate before it's in front of everyone. |
| `CORRIDORS_ENABLED` | `/apps/corridors`, `Corridors.tsx` | off | off | Not good enough as a feature yet (Ryan, 2026-07-28). Its panel is also broken by a CSS bug independent of this flag. |
| `DIAGNOSTICS_ENABLED` | Tools/wrench menu, `/apps/diagnostics/table`, `DiagnosticsPage.tsx` + `Diagnostics.tsx` | off | on | Internal spot-check tool, never meant for the public production site. It lives in the shared source tree but is unreachable when the production flag is off. |
| `UNEVEN_BANNER_ENABLED` | "Service is uneven" route-card banner, `RouteCardHeadway.tsx` | off | on | The excess/ratio threshold deciding when a period's worst gap is worth surfacing (#345) needs more real-feed tuning than a single main push should carry. |

## How it works

Defined in `shared/config.ts`, read from Vite build-time environment variables rather than hardcoded booleans:

```ts
function envFlag(name: ...): boolean {
  return typeof import.meta !== 'undefined' && import.meta?.env?.[name] === 'true';
}
export const LIVE_ENABLED = envFlag('VITE_LIVE_ENABLED');
```

**Why env vars, not a `const true`/`false`:** production and beta use the same `main` commit. Only their Vercel build environments differ, so a feature can be tested on beta without creating a second code branch or repeatedly merging two divergent trees. Configure beta-only values on the beta deployment/project, not in source control:

```bash
# Run this while linked to the beta Vercel project.
echo "true" | vercel env add VITE_LIVE_ENABLED production
```

**Each flag gates three things**, in `src/App.tsx`:
1. The pill/button that surfaces the feature.
2. The `routedApp`/`gated` check — direct URL navigation (e.g. typing `/apps/live`) redirects to the frequency map and corrects the URL, rather than silently rendering the full app anyway. Without this, hiding the pill alone doesn't actually restrict access.
3. The component import itself where bundle isolation matters. A boolean check alone can still ship a component's JS in the bundle, so sensitive/internal tools should remain unreachable from production as well as hidden from its navigation.

Local dev (`.env.local`) sets all three to `"true"` so localhost keeps showing everything.

## Iterating on a gated feature

All product work lands on `main`. The beta deployment follows the same commit as production but enables the selected flags and beta-only agency visibility. A feature is graduated by changing its production flag or removing the gate after beta validation; it does not require a branch merge.

## Deployment separation

Keep two Vercel deployments pointed at the same repository and `main` branch:

1. Production (`www.transitatlas.fyi`): beta flags off.
2. Beta (`beta.transitatlas.fyi`): beta flags on, `VITE_BETA_BUILD=true`, and beta-only agencies visible.

The beta deployment may be a separate Vercel project so both sites can automatically rebuild from `main` with different environment values. Do not restore a long-lived beta Git branch just to hold these settings. If beta access ever needs to be limited to named testers, add access control at the deployment boundary; do not make the production client guess whether a user is allowed to see an internal tool.

### Vercel cutover procedure

The production project and beta project must be separate because Vercel environment variables are project-scoped; there is no supported way to inject beta flags into one deployment while leaving another deployment of that project unchanged.

1. Create or use the beta Vercel project and set its production branch to `main`.
2. Add the beta-only `VITE_*` variables to that project's Production environment. Keep the production project's Production environment unset or `false`.
3. Deploy the beta project and verify its generated deployment URL while it is still private/protected.
4. Attach `beta.transitatlas.fyi` to the beta project, verify the public hostname, then remove that hostname from the old branch-based project.
5. Keep the old beta project/branch available until the new hostname and production site have both been checked; retire it only after the cutover is confirmed.

The beta project currently uses the Vite framework/output configuration (`dist`). A Vercel deployment can show a successful `npm run build` and still fail afterward if its Output Directory is incorrectly set to `build`.

## `VITE_BETA_BUILD`

Not an app gate — same env-driven pattern, but purely cosmetic. Prefixes the browser tab title with `[Beta]` (`src/main.tsx`) so the beta deployment doesn't look identical to production. Set to `"true"` only on the beta deployment; it stays there indefinitely.
