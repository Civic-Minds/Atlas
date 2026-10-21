/**
 * Every user-facing string of the population / income map layer (CIV-482), in one place.
 * Wording approved by Ryan (option 1; legend titles option 2).
 * Only the attribution line is fixed.
 */

/** The map's attribution line for the layer. Fixed text. */
export const CONTEXT_ATTRIBUTION = 'Source: U.S. Census Bureau, ACS 5-year estimates; TIGER/Line';

/** Settings row. */
export const CONTEXT_CONTROL_TITLE = 'Neighbourhood shading';
export const CONTEXT_OPTION_OFF = 'None';
export const CONTEXT_OPTION_DENSITY = 'Population density';
export const CONTEXT_OPTION_INCOME = 'Median household income';

/** Legend titles, per metric. The unit is in the density title and in the income class labels ($), so there is no unit line. */
export const CONTEXT_LEGEND_TITLE_DENSITY = 'People per square kilometre';
export const CONTEXT_LEGEND_TITLE_INCOME = 'Typical household income';

/** The grey hatched swatch. */
export const CONTEXT_NO_DATA_LABEL = 'No reliable figure';

/** Short credit in the map's attribution pill (next to "OpenStreetMap · CARTO"), shown only while the shading is on. */
export const CONTEXT_CREDIT_SHORT = 'U.S. Census Bureau';
/** Hover text on the credit: the fixed attribution line, plus the survey years once the tiles have said which. */
export const contextCreditTitle = (years: [number, number] | null) => (years ? `${CONTEXT_ATTRIBUTION} (${years[0]}–${years[1]})` : CONTEXT_ATTRIBUTION);

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
