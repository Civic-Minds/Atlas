/** Wording for loading and error states in panels and badges, so every screen says it the same way. */

/** "Loading night service…": the noun after the verb, then an ellipsis character (not three dots). */
export const loadingText = (noun: string) => `Loading ${noun}…`;

/** "Couldn't load history data." */
export const loadErrorText = (noun: string) => `Couldn't load ${noun}.`;

/** Added after a load error that the person can retry. */
export const RETRY_HINT = 'Check your connection and try again.';

/** A route list with nothing to show: the agency card's wording, shared with History's agency view. */
export const NO_ROUTES_LOADED = 'No routes loaded yet.';
/** A route list whose mode pill (or search) leaves nothing: "No streetcar routes match.", or "No routes match." with no pill. */
export const noRoutesMatchText = (modeLabel?: string | null) => `No ${modeLabel ? `${modeLabel.toLowerCase()} ` : ''}routes match.`;

/** Live: one agency's feed failed ("<message> It will retry automatically."). */
export const liveFeedErrorText = (message: string, stuck: boolean) => `${message}${stuck ? ' — still trying, but this has been down for a while.' : ' It will retry automatically.'}`;
/** Live: every feed in view failed, and has been for a while (the first line is noticeCopy's LIVE_FEEDS_UNAVAILABLE). */
export const LIVE_FEEDS_DOWN_STUCK = 'Still trying, but these have been down for a while.';
/** Live: nothing running on any followed route in view. */
export const LIVE_NOTHING_ACTIVE = 'Nothing active on tracked routes';
export const LIVE_NOTHING_ACTIVE_HINT = 'Buses appear here when they are running on a monitored route.';
