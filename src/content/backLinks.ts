/**
 * Every back control's words, in one place, under one rule (CIV-1462; Ryan, 2026-11-14: "1 then refactor actually",
 * with History's link reading "Back to agencies").
 *
 * The rule: a back control says "Back to " + the place it returns to.
 * - A text link shows it after the arrow: "← Back to map", "← Back to TTC", "← Back to Route 504", "← Back to agencies".
 * - A control that shows only an arrow or the logo (panel headers, the top bar's logo) says the same words to screen
 *   readers: "Back to agencies", "Back to frequency map", "Back to About Atlas".
 * A common place (map, agencies, settings) is in lower case after "Back to"; a name (an agency, a route, About Atlas,
 * Near you) keeps its own case. An agency's or a route's name comes from its own source (agencyNames().backLink,
 * stopBack.ts) and goes through the same functions.
 */
import { PAGE_NAMES } from '../../shared/pageNames';

export const BACK_ARROW = '←';

/** The places a back control returns to that have a fixed name. */
export const BACK_PLACES = {
  /** The frequency map, from a card opened on it (agency, stop, on-demand area, a note in a card's place). */
  map: PAGE_NAMES.map,
  /** The frequency map, from a research view (Frequent service, Night service) or the logo while History is open. */
  frequencyMap: 'Frequency map',
  /** The agency list: About's agency pages and History's agency chooser (CIV-1462). */
  agencies: PAGE_NAMES.agencies,
  /** Settings, from the hidden-routes and region filter pages. */
  settings: 'Settings',
  /** About Atlas, from its inner pages and the privacy settings. */
  aboutAtlas: PAGE_NAMES.aboutPage,
} as const;

/** The Night service list, from a route opened on it: noticeCopy's MAP_KEY_NIGHT (a test keeps them equal; no import, as noticeCopy imports this file). */
export const NIGHT_LIST_PLACE = 'Overnight service';

/** Common places: lower case after "Back to". Everything else is a name and keeps its case. */
const COMMON = new Set<string>([BACK_PLACES.map, BACK_PLACES.frequencyMap, BACK_PLACES.agencies, BACK_PLACES.settings, NIGHT_LIST_PLACE]);

function placeInSentence(place: string): string {
  return COMMON.has(place) ? place.charAt(0).toLowerCase() + place.slice(1) : place;
}

/** The words of any back control: "Back to map", "Back to TTC". An arrow-only control uses this as its screen-reader name. */
export function backLinkLabel(place: string): string {
  return `Back to ${placeInSentence(place)}`;
}

/** A text back link as it reads on screen: "← Back to map". */
export function backLinkText(place: string): string {
  return `${BACK_ARROW} ${backLinkLabel(place)}`;
}
