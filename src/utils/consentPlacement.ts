/** Room kept clear at the right edge for the bottom-right map buttons, in px. */
export const CONSENT_RIGHT_CLEARANCE = 64;
/** The gap between the bottom-left map pills (gap-1.5). */
export const CONSENT_PILL_GAP = 6;

export type ConsentPlacement =
  | { mode: 'default' }
  | { mode: 'top' }
  | { mode: 'row'; left: number; bottom: number };

/**
 * Where the analytics prompt goes on sm and up. On the map it joins the bottom-left pill row,
 * right after the last pill at the same bottom; when that would reach the bottom-right map
 * buttons it moves to the phone position under the top bar. Below sm, or with no map pill row
 * (other pages), it keeps its default place.
 */
export function consentPlacement(options: {
  isSm: boolean;
  /** The bottom-left pill row's box, or null when the page has none. */
  row: { right: number; bottom: number } | null;
  pillWidth: number;
  viewportWidth: number;
  viewportHeight: number;
}): ConsentPlacement {
  if (!options.isSm || !options.row || options.pillWidth <= 0) return { mode: 'default' };
  const left = Math.round(options.row.right + CONSENT_PILL_GAP);
  if (left + options.pillWidth > options.viewportWidth - CONSENT_RIGHT_CLEARANCE) return { mode: 'top' };
  return { mode: 'row', left, bottom: Math.round(options.viewportHeight - options.row.bottom) };
}
