/** Opacity for map context faded behind a selection (routes, on-demand zones and stops). */
export const FOCUS_DIM_OPACITY = 0.18;

/** Shared "is this feature the selection" paint case: `focused` when `match` holds, else `faded`. */
export function buildFocusCase(match: unknown, focused: unknown, faded: unknown): unknown[] {
  return ['case', match, focused, faded];
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

/**
 * What a map selection keeps at full strength, for things that are not route lines (Live's vehicle dots): the
 * selected route's items, narrowed to `ids` when a part of the route (one direction) is picked.
 */
export interface MapFocus {
  agencySlug: string;
  routeShortName: string;
  /** When set, only these items of the route stay at full strength (a direction of the route). */
  ids?: readonly string[] | null;
}

/** Full strength (1) for an item in the focus or when nothing is focused, otherwise the shared fade. */
export function focusOpacity(
  item: { id: string; agencySlug: string; routeShortName: string },
  focus: MapFocus | null | undefined,
  dimOpacity = FOCUS_DIM_OPACITY,
): number {
  if (!focus) return 1;
  const inRoute = item.agencySlug === focus.agencySlug && item.routeShortName === focus.routeShortName;
  if (!inRoute) return dimOpacity;
  return !focus.ids || focus.ids.includes(item.id) ? 1 : dimOpacity;
}
