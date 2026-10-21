/**
 * Population density / median household income map layer (CIV-482, beta only): scales, class breaks,
 * the "no reliable figure" rule, map expressions and popup values. No map or React code here.
 *
 * Source tiles (layer `context`, one polygon per US census tract): geoid, pop, area_km2, density
 * (people per km2), income (US dollars), income_moe_pct (margin of error as a FRACTION of income:
 * 0.30 means plus or minus 30%), unreliable, acs_year (last year of the ACS 5-year window).
 * Missing values are omitted from the tile, not null.
 */

export type ContextMetric = 'density' | 'income';
export const CONTEXT_METRICS: readonly ContextMetric[] = ['density', 'income'];

/**
 * THE single "too uncertain" threshold: an income whose margin of error is more than this fraction of
 * the estimate is drawn as no-data. The tiles also carry a baked `unreliable` flag (built at 0.30), but
 * it is deliberately ignored: deriving the rule here from `income_moe_pct` keeps this constant the only
 * place that decides, and lets it change without rebuilding tiles.
 */
export const UNRELIABLE_MOE_FRACTION = 0.3;

/** ACS reports this value for "$250,000 or more". It is a real (capped) figure, never uncertain. */
export const INCOME_TOP_CODE = 250001;

/**
 * Fixed class breaks, one set per metric (no cross-country comparison, each metric has its own scale).
 * Four breaks make five classes: below the first, between each pair, and at or above the last.
 * Values are the quintiles of the Georgia tracts (2019-2023 ACS, 2023 TIGER), rounded; a class holds
 * roughly a fifth of tracts there. Revisit when more states are added.
 */
export const CONTEXT_BREAKS: Record<ContextMetric, readonly [number, number, number, number]> = {
  density: [50, 277.5, 700.5, 1161.8],
  income: [49643, 63750, 79750, 105547],
};

/** Five-step sequential colours, lightest to darkest. Density is blue, income purple, so the two scales never read as one. */
export const CONTEXT_COLOURS: Record<ContextMetric, readonly [string, string, string, string, string]> = {
  density: ['#e8eff7', '#c3d6ea', '#93b6d6', '#5f91c0', '#356ba3'],
  income: ['#efecf6', '#cdc8e3', '#a49dc9', '#7a6fae', '#523f8d'],
};

/** The no-data fill: grey with diagonal hatching. */
export const CONTEXT_NO_DATA_COLOUR = '#8b949e';
export const CONTEXT_FILL_OPACITY = 0.55;

/** The index (0-4) of the class a value falls in. Breaks are lower bounds: a value equal to a break is in the upper class. */
export function contextClassIndex(metric: ContextMetric, value: number): number {
  const breaks = CONTEXT_BREAKS[metric];
  let i = 0;
  while (i < breaks.length && value >= breaks[i]) i++;
  return i;
}

export interface ContextProps {
  density?: number | null;
  income?: number | null;
  income_moe_pct?: number | null;
  pop?: number | null;
  acs_year?: number | null;
  geoid?: string;
}

export const isTopCoded = (income: number): boolean => income >= INCOME_TOP_CODE;

export type ContextReading =
  | { kind: 'value'; value: number; topCoded: boolean; marginPct: number | null }
  | { kind: 'missing' }
  | { kind: 'uncertain'; value: number; marginPct: number | null };

/** What a tract shows for a metric. Density has no uncertainty figure, so it is a value or missing. */
export function readContext(metric: ContextMetric, p: ContextProps): ContextReading {
  if (metric === 'density') {
    return typeof p.density === 'number' ? { kind: 'value', value: p.density, topCoded: false, marginPct: null } : { kind: 'missing' };
  }
  if (typeof p.income !== 'number') return { kind: 'missing' };
  const margin = typeof p.income_moe_pct === 'number' ? p.income_moe_pct : null;
  if (isTopCoded(p.income)) return { kind: 'value', value: p.income, topCoded: true, marginPct: null };
  if (margin === null || margin > UNRELIABLE_MOE_FRACTION) return { kind: 'uncertain', value: p.income, marginPct: margin };
  return { kind: 'value', value: p.income, topCoded: false, marginPct: margin };
}

type Expr = unknown[];

/** Filter: tracts drawn in a class colour. */
export function contextValidFilter(metric: ContextMetric): Expr {
  if (metric === 'density') return ['has', 'density'];
  return ['all', ['has', 'income'], ['any',
    ['>=', ['get', 'income'], INCOME_TOP_CODE],
    ['all', ['has', 'income_moe_pct'], ['<=', ['get', 'income_moe_pct'], UNRELIABLE_MOE_FRACTION]],
  ]];
}

/** Filter: tracts drawn grey and hatched (everything the valid filter leaves out). */
export const contextNoDataFilter = (metric: ContextMetric): Expr => ['!', contextValidFilter(metric)];

/** fill-color expression: step over the metric's breaks. */
export function contextFillColorExpr(metric: ContextMetric): Expr {
  const colours = CONTEXT_COLOURS[metric];
  const expr: Expr = ['step', ['get', metric], colours[0]];
  CONTEXT_BREAKS[metric].forEach((b, i) => expr.push(b, colours[i + 1]));
  return expr;
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const formatDensity = (v: number): string => (v < 10 ? v.toFixed(1) : nf.format(v));
export const formatIncome = (v: number): string => `$${nf.format(v)}`;
export const formatMarginPct = (fraction: number): string => `${nf.format(Math.round(fraction * 100))}%`;

/** Legend rows for a metric: a label per class. Uses an en dash for ranges and no unit (the unit is the legend's own line). */
export function contextClassLabels(metric: ContextMetric): string[] {
  const fmt = metric === 'income' ? formatIncome : formatDensity;
  const b = CONTEXT_BREAKS[metric];
  const hi = (v: number) => fmt(Math.round(v));
  return [
    `Under ${hi(b[0])}`,
    `${hi(b[0])}–${hi(b[1])}`,
    `${hi(b[1])}–${hi(b[2])}`,
    `${hi(b[2])}–${hi(b[3])}`,
    `${hi(b[3])} or more`,
  ];
}

/** Years of the ACS 5-year window that ends in `lastYear`. */
export const acsWindow = (lastYear: number): [number, number] => [lastYear - 4, lastYear];
