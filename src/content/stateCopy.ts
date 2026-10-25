/** Wording for loading and error states in panels and badges, so every screen says it the same way. */

/** "Loading night service…": the noun after the verb, then an ellipsis character (not three dots).
 *  Every loading message uses it, or LOADING_TEXT where nothing names the thing. */
export const loadingText = (noun: string) => `Loading ${noun}…`;

/** "Loading…", for the few places that don't name what is loading. */
export const LOADING_TEXT = 'Loading…';

/** "Couldn't load history data." */
export const loadErrorText = (noun: string) => `Couldn't load ${noun}.`;

/** Added after a load error that the person can retry. */
export const RETRY_HINT = 'Check your connection and try again.';

/** A route list with nothing to show: the agency card's wording, shared with History's agency view. */
export const NO_ROUTES_LOADED = 'No routes loaded yet.';
/** A route list whose mode pill (or search) leaves nothing: "No streetcar routes match.", or "No routes match." with no pill. */
export const noRoutesMatchText = (modeLabel?: string | null) => `No ${modeLabel ? `${modeLabel.toLowerCase()} ` : ''}routes match.`;
