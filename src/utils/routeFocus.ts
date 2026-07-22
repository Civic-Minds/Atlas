/** Shared map paint for a focused route: keep network context visible while spotlighting one line. */
export function buildFocusedRoutePaint(routeMatch: unknown, dimOpacity = 0.32, dimWidth = 1.25): {
  opacity: unknown[];
  width: unknown[];
} {
  return {
    opacity: ['case', routeMatch, 1.0, dimOpacity],
    width: ['case', routeMatch, 3.5, dimWidth],
  };
}
