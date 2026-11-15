/**
 * The one mark for a value that's missing, in one place (CIV-1569).
 *
 * The rule: a table cell, tile or list figure with no value to show reads an em dash, "—", the mark the frequency
 * text has always used for a missing frequency (shared/headwayText.ts). That covers the area and agency tables (a
 * mode an area doesn't have, a period with no number), the fare map's tiles, and Live's tables and tiles (a figure
 * with too few trips measured). Never type a dash by hand for an empty cell; a dash inside a range ("6–12 min")
 * is punctuation, not a missing value, and is not this.
 */
export const MISSING_VALUE = '—';
