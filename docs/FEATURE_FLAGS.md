# Feature Flags

Atlas gates immature features (thin agency coverage, no scaling plan, or genuinely not ready) behind flags rather than shipping them to everyone in production nav. This doc is the single place to check current state — don't re-derive it from scattered code comments.

## Current flags

| Flag | Controls | `main` | `beta` | Why gated |
|---|---|---|---|---|
| `LIVE_ENABLED` | Live pill, `/apps/live`, `LiveVehicles.tsx` | off | on | Covers ~5 agencies, 2 routes each, out of 400+. No scaling plan yet. |
| `HISTORY_ENABLED` | History pill, `/apps/history`, `History.tsx` | off | on | Covers a handful of cities out of 400+. Same reason. |
| `CARD_CLICK_TO_FLAG_ENABLED` | Click-to-flag affordance on card values (`FlaggableValue` in `cardUi.tsx`) | off | on | New, unproven interaction — no route/component split like the others, just a UI behavior to validate before it's in front of everyone. |
| `CORRIDORS_ENABLED` | `/apps/corridors`, `Corridors.tsx` | off | off | Not good enough as a feature yet (Ryan, 2026-07-28). Its panel is also broken by a CSS bug independent of this flag. |
| `DIAGNOSTICS_ENABLED` | Tools/wrench menu, `/apps/diagnostics/table`, `DiagnosticsPage.tsx` + `Diagnostics.tsx` | **doesn't exist** | on | Internal spot-check tool, never meant to reach production — not a "graduating" feature like the others above. **The code itself must not exist on `main`**, not just be gated off: `DiagnosticsPage.tsx`, `apps/Diagnostics.tsx`, and `hooks/useAgencies.ts` live only on `beta`. All Diagnostics work happens on `beta` only; do not port it to `main` (2026-08-07 — it had drifted onto `main` and back off again, causing repeated merge conflicts before this rule was written down). |
| `UNEVEN_BANNER_ENABLED` | "Service is uneven" route-card banner, `RouteCardHeadway.tsx` | off | on | The excess/ratio threshold deciding when a period's worst gap is worth surfacing (#345) needs more real-feed tuning than a single main push should carry. |

## How it works

Defined in `shared/config.ts`, read from Vite env vars (`VITE_LIVE_ENABLED`, `VITE_HISTORY_ENABLED`, `VITE_CORRIDORS_ENABLED`) rather than hardcoded booleans:

```ts
function envFlag(name: ...): boolean {
  return typeof import.meta !== 'undefined' && import.meta?.env?.[name] === 'true';
}
export const LIVE_ENABLED = envFlag('VITE_LIVE_ENABLED');
```

**Why env vars, not a `const true`/`false`:** a hardcoded constant that needs to differ between `main` (off) and `beta` (on) conflicts with itself on every `main → beta` merge — someone eventually resolves it wrong and either ships an unfinished feature to production or kills it on beta. An env var is identical source on both branches; only the Vercel-side value differs per branch's preview environment. `beta`'s vars are set via:

```bash
echo "true" | vercel env add VITE_LIVE_ENABLED preview beta
```

**Each flag gates three things**, in `src/App.tsx`:
1. The pill/button that surfaces the feature.
2. The `routedApp`/`gated` check — direct URL navigation (e.g. typing `/apps/live`) redirects to the frequency map and corrects the URL, rather than silently rendering the full app anyway. Without this, hiding the pill alone doesn't actually restrict access.
3. The component import itself, via `React.lazy()`. A boolean check alone still ships the component's JS in the main bundle, just unrendered — a `main` build must never even fetch `LiveVehicles.tsx`/`History.tsx`/`Corridors.tsx`, not just skip rendering them.

Local dev (`.env.local`) sets all three to `"true"` so localhost keeps showing everything.

## Iterating on a gated feature

Once a feature's flag is off on `main` and on for `beta`, further work on it can happen entirely on `beta` (or a feature branch merged into `beta`) without needing to also land on `main` in the meantime — `main`'s flag being off means nobody is affected by its dormant copy going stale. Reconcile the two only when you actually decide to graduate the feature: merge the accumulated `beta` work into `main` and flip its env var on, as one deliberate step.

## Graduating a feature to `main`

1. Merge whatever's accumulated on `beta` into `main` (or cherry-pick the relevant commits).
2. Set the corresponding `VITE_*_ENABLED` var to `"true"` on `main`'s production Vercel environment.
3. No code change needed — the gate itself doesn't move.

## `VITE_BETA_BUILD`

Not an app gate — same env-driven pattern, but purely cosmetic. Prefixes the browser tab title with `[Beta]` (`src/main.tsx`) so the beta deployment doesn't look identical to production. Set to `"true"` on `beta`'s preview environment only; stays that way indefinitely, nothing to graduate.
