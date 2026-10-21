/**
 * Every user-facing string of the population / income map layer (CIV-482), in one place.
 * PROVISIONAL placeholders: none of this wording is approved yet (docs/STYLE.md: new wording needs a yes).
 * Only the attribution line is fixed.
 */

/** The map's attribution line for the layer. Fixed text. */
export const CONTEXT_ATTRIBUTION = 'Source: U.S. Census Bureau, ACS 5-year estimates; TIGER/Line';

/** Settings row. */
export const CONTEXT_CONTROL_TITLE = 'Neighbourhood shading';
export const CONTEXT_CONTROL_HINT = 'Shades the map under the routes by who lives there.';
export const CONTEXT_OPTION_OFF = 'None';
export const CONTEXT_OPTION_DENSITY = 'Population density';
export const CONTEXT_OPTION_INCOME = 'Median household income';

/** Legend titles and units, per metric. */
export const CONTEXT_LEGEND_TITLE_DENSITY = 'Population density';
export const CONTEXT_LEGEND_TITLE_INCOME = 'Median household income';
export const CONTEXT_UNIT_DENSITY = 'People per square kilometre';
export const CONTEXT_UNIT_INCOME = 'US dollars per year';

/** The grey hatched swatch and its note. */
export const CONTEXT_NO_DATA_LABEL = 'No reliable figure';
export const CONTEXT_NO_DATA_NOTE_DENSITY = 'Hatched: no population figure for this area.';
export const CONTEXT_NO_DATA_NOTE_INCOME = 'Hatched: no figure, or too uncertain to show.';

/** Legend source line: "Census tracts, 2019–2023 estimates". */
export const contextLegendSource = (firstYear: number, lastYear: number) => `Census tracts, ${firstYear}–${lastYear} survey estimates`;

/** Popup lines. */
export const CONTEXT_POPUP_DENSITY = (value: string) => `${value} people per square kilometre`;
export const CONTEXT_POPUP_INCOME = (value: string) => `${value} a year`;
export const CONTEXT_POPUP_MARGIN = (pct: string) => `Could be off by about ${pct}`;
/** Shown for tracts at the survey's top code (the highest figure it reports). */
export const CONTEXT_INCOME_TOP = '$250,000 or more';
export const CONTEXT_POPUP_NO_DENSITY = 'No population figure for this area.';
export const CONTEXT_POPUP_NO_INCOME = 'No income figure for this area.';
export const CONTEXT_POPUP_UNRELIABLE = (pct: string) => `Too uncertain to show (could be off by about ${pct}).`;
export const CONTEXT_POPUP_CLOSE = 'Close';
