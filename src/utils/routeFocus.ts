/** Opacity for map context faded behind a selection (routes, on-demand zones and stops). */
export const FOCUS_DIM_OPACITY = 0.18;

/** Shared "is this feature the selection" paint case: `focused` when `match` holds, else `faded`. */
export function buildFocusCase(match: unknown, focused: unknown, faded: unknown): unknown[] {
  return ['case', match, focused, faded];
}

/** Override selected geometry without changing the background's normal opacity.
 * Keep zoom interpolation at the top level, as required by MapLibre paint expressions.
 * defaultOpacity is either the default route interpolation or the local layer's constant.
 */
export function buildSelectedRouteLineOpacity(defaultOpacity: unknown[] | number, focusCases: unknown[]): unknown[] {
  if (typeof defaultOpacity === 'number') return ['case', ...focusCases, defaultOpacity];
  return defaultOpacity.map((value, index) =>
    index >= 4 && index % 2 === 0 ? ['case', ...focusCases, value] : value);
}

/** Shared map paint for a focused route: keep network context visible while spotlighting one line. */
export function buildFocusedRoutePaint(routeMatch: unknown, dimOpacity = FOCUS_DIM_OPACITY, dimWidth = 1.25): {
  opacity: unknown[];
  width: unknown[];
} {
  return {
    opacity: buildFocusCase(routeMatch, 1.0, dimOpacity),
    width: buildFocusCase(routeMatch, 3.5, dimWidth),
  };
}
