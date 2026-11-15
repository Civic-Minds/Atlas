import { buildRouteKey } from './routeKey';

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

/** The route a MapFocus is on, as "slug::routeShortName" (null with nothing picked). */
export function mapFocusRoute(focus: MapFocus | null | undefined): string | null {
  return focus ? buildRouteKey(focus.agencySlug, focus.routeShortName) : null;
}

/**
 * A route the main map handed to Live stays the map's selection until Live has taken it: until Live's own map
 * key is that route, or Live's pick moved on from what it was at the hand-off (opened it, or went back). Without
 * the hold, the map would frame Live's previous route for a moment between the two.
 */
export function liveHandoffSettled(
  handoff: { route: string; liveRouteAtHandoff: string | null },
  live: { route: string | null; mapRouteKey: string | null } | null,
): boolean {
  if (!live) return true;
  if (live.mapRouteKey && sameRouteId(live.mapRouteKey, handoff.route)) return true;
  return live.route !== handoff.liveRouteAtHandoff;
}

function sameRouteId(a: string, b: string): boolean {
  const routeOf = (key: string) => key.split('::branch:')[0];
  return routeOf(a) === routeOf(b);
}
