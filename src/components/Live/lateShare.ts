import { stepColor } from './routeStripModel';
import { MAP_STEP_LIMITS, mapStep } from './routeMapModel';

/**
 * The late charts' bar colour: the strip's three late colours (on time, a little late, late), cut where the map's Late
 * key steps (under 10%, 10-20%, 20% or more), so a bar and the map agree on the same share (#1152).
 */
export const lateShareColor = (share: number): string => stepColor('delay', mapStep('late', share) ?? 0);

/** The legend swatch for that three-colour scale. */
export const LATE_SHARE_SWATCH = 'linear-gradient(90deg, var(--strip-delay-0) 33%, var(--strip-delay-1) 33% 67%, var(--strip-delay-2) 67%)';

/** The shares where the colour steps up (re-exported so tests and charts agree on the cut points). */
export const LATE_SHARE_LIMITS = MAP_STEP_LIMITS.late;
