import { BUNCHING_STEP_LIMITS, stepColor, stepFor } from './routeStripModel';

/** The late charts' bar colour: the strip's three late colours (on time, a little late, late), cut at the strip's share limits. */
export const lateShareColor = (share: number): string => stepColor('delay', (stepFor('bunching', share) ?? 0) as 0 | 1 | 2);

/** The legend swatch for that three-colour scale. */
export const LATE_SHARE_SWATCH = 'linear-gradient(90deg, var(--strip-delay-0) 33%, var(--strip-delay-1) 33% 67%, var(--strip-delay-2) 67%)';

/** The shares where the colour steps up (re-exported so tests and charts agree on the cut points). */
export const LATE_SHARE_LIMITS = BUNCHING_STEP_LIMITS;
