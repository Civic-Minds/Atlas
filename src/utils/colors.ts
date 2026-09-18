import { HEADWAY_TIERS, MAP_ZOOM_HEADWAY_STEPS, MAP_ZOOM_DEFAULT_MAX_HEADWAY, type HeadwayTier } from '../../shared/config';
export { HEADWAY_TIERS };

export interface StatusColor {
  bg: string;
  border: string;
  text: string;
}

export type ColorVisionMode = 'default' | 'friendly';

/** A colour-blind-friendly palette with distinct hues and darker text-safe fills. */
export const COLOR_VISION_HEADWAY_TIERS: HeadwayTier[] = [
  { max: 10, color: '#13294b', label: '≤10m' },
  { max: 15, color: '#244c66', label: '≤15m' },
  { max: 20, color: '#3c6f73', label: '≤20m' },
  { max: 30, color: '#5e8b72', label: '≤30m' },
  { max: 60, color: '#9a8a45', label: '≤60m' },
  { max: Infinity, color: '#c8a900', label: 'Infrequent' },
];

export const COLOR_VISION_STATUS_COLORS: Record<'early' | 'late' | 'on_time' | 'no_data', StatusColor> = {
  early: { bg: '#0072b2', border: '#005a8d', text: '#005a8d' },
  late: { bg: '#c44516', border: '#9e3510', text: '#9e3510' },
  on_time: { bg: '#009e73', border: '#007a59', text: '#007a59' },
  no_data: { bg: '#6b7280', border: '#4b5563', text: '#4b5563' },
};

const COLOR_VISION_FARE_COLORS = ['#0072b2', '#009e73', '#b07a00', '#c44516', '#a64f89'];

function palette(mode: ColorVisionMode): HeadwayTier[] {
  return mode === 'friendly' ? COLOR_VISION_HEADWAY_TIERS : HEADWAY_TIERS;
}

export function getHeadwayTiers(mode: ColorVisionMode = 'default'): HeadwayTier[] {
  return palette(mode);
}

function statusPalette(mode: ColorVisionMode) {
  return mode === 'friendly' ? COLOR_VISION_STATUS_COLORS : STATUS_COLORS;
}

export const STATUS_COLORS: Record<'early' | 'late' | 'on_time' | 'no_data', StatusColor> = {
  early: { bg: '#3182ce', border: '#2b6cb0', text: '#2b6cb0' },
  late: { bg: '#e53e3e', border: '#9b2c2c', text: '#9b2c2c' },
  on_time: { bg: '#38a169', border: '#276749', text: '#276749' },
  no_data: { bg: '#718096', border: '#4a5568', text: '#718096' },
};

export function getDelayColor(deltaMin: number | null, mode: ColorVisionMode = 'default'): string {
  const colors = statusPalette(mode);
  if (deltaMin === null) return colors.no_data.border;
  if (deltaMin < -0.5) return colors.early.border;
  if (deltaMin <= 1)   return colors.on_time.border;
  if (deltaMin <= 3)   return mode === 'friendly' ? '#b07a00' : '#f59e0b';
  return colors.late.border;
}

export const getTierColor = (tier: string | null, mode: ColorVisionMode = 'default'): string => {
  const tiers = palette(mode);
  if (!tier || tier === 'span' || tier === 'infrequent') return tiers[tiers.length - 1].color;
  const t = parseInt(tier);
  for (const { max, color } of tiers) {
    if (t <= max) return color;
  }
  return '#9ca3af';
};

/** Map a numeric headway (minutes) to its tier color hex. */
export function headwayToTierColor(h: number | null | undefined, mode: ColorVisionMode = 'default'): string {
  const tiers = palette(mode);
  if (h == null) return getTierColor(null, mode);
  for (const { max, color } of tiers) {
    if (h <= max) return color;
  }
  return getTierColor('infrequent', mode);
}

export function getVehicleStatus(delayMin: number | null): 'no_data' | 'early' | 'late' | 'on_time' {
  if (delayMin === null) return 'no_data';
  if (delayMin <= -1.5) return 'early';
  if (delayMin >= 5.5) return 'late';
  return 'on_time';
}

export function getVehicleColors(status: 'early' | 'late' | 'on_time' | 'no_data', mode: ColorVisionMode = 'default'): StatusColor {
  return statusPalette(mode)[status];
}

export function getTimelineHeadwayColor(hw: number | null, mode: ColorVisionMode = 'default'): { bg: string; fg: string } {
  if (hw == null) return { bg: 'var(--bg-hover)', fg: 'var(--text-dim)' };
  const bg = headwayToTierColor(hw, mode);
  return { bg, fg: '#fff' };
}

export interface FareTier {
  max: number;
  label: string;
  color: string;
}

export const FARE_TIERS: FareTier[] = [
  { max: 0, label: 'Free', color: '#14b8a6' },
  { max: 2, label: '< $2', color: '#4ade80' },
  { max: 4, label: '$2–4', color: '#facc15' },
  { max: 8, label: '$4–8', color: '#fb923c' },
  { max: Infinity, label: '$8+', color: '#f87171' },
];

export function getFareColor(fare: number | null | undefined, mode: ColorVisionMode = 'default'): string {
  if (fare == null) return '#6b7280';
  if (mode === 'friendly') {
    if (fare === 0) return COLOR_VISION_FARE_COLORS[0];
    if (fare < 2) return COLOR_VISION_FARE_COLORS[1];
    if (fare < 4) return COLOR_VISION_FARE_COLORS[2];
    if (fare < 8) return COLOR_VISION_FARE_COLORS[3];
    return COLOR_VISION_FARE_COLORS[4];
  }
  if (fare === 0) return FARE_TIERS[0].color;
  if (fare < 2) return FARE_TIERS[1].color;
  if (fare < 4) return FARE_TIERS[2].color;
  if (fare < 8) return FARE_TIERS[3].color;
  return FARE_TIERS[4].color;
}

/** Flat line color for Night Service view — every visible route already passed the
 * nightService filter, so (unlike fare/headway) there's no tier to express, just one color. */
export const NIGHT_SERVICE_COLOR = '#818cf8';
export const COLOR_VISION_NIGHT_SERVICE_COLOR = '#0072b2';

export function getNightServiceColor(mode: ColorVisionMode = 'default'): string {
  return mode === 'friendly' ? COLOR_VISION_NIGHT_SERVICE_COLOR : NIGHT_SERVICE_COLOR;
}

/** MapLibre case expression for fare-based line color. */
export function buildFareColorExpression(mode: ColorVisionMode = 'default'): unknown[] {
  const colors = mode === 'friendly' ? COLOR_VISION_FARE_COLORS : FARE_TIERS.map(t => t.color);
  const expr: unknown[] = ['case'];
  expr.push(['==', ['coalesce', ['get', 'baseFare'], -1], 0], colors[0]);
  expr.push(['all', ['>', ['coalesce', ['get', 'baseFare'], 999], 0], ['<', ['coalesce', ['get', 'baseFare'], 999], 2]], colors[1]);
  expr.push(['all', ['>=', ['coalesce', ['get', 'baseFare'], 999], 2], ['<', ['coalesce', ['get', 'baseFare'], 999], 4]], colors[2]);
  expr.push(['all', ['>=', ['coalesce', ['get', 'baseFare'], 999], 4], ['<', ['coalesce', ['get', 'baseFare'], 999], 8]], colors[3]);
  expr.push(['>=', ['coalesce', ['get', 'baseFare'], 999], 8], colors[4]);
  expr.push('#6b7280');
  return expr;
}

/** MapLibre step expression for runtime zoom headway gate. */
export function buildZoomHeadwayGateExpression(headwayExpr: unknown): unknown[] {
  const steps: unknown[] = ['step', ['zoom'], MAP_ZOOM_DEFAULT_MAX_HEADWAY];
  for (const [zoom, maxHeadway] of MAP_ZOOM_HEADWAY_STEPS) {
    steps.push(zoom, maxHeadway);
  }
  return ['<=', headwayExpr, steps];
}

/** Headway ceiling at a fixed zoom — mirrors buildZoomHeadwayGateExpression step stops. */
function headwayThresholdForZoom(zoom: number): number {
  let threshold = MAP_ZOOM_DEFAULT_MAX_HEADWAY;
  for (const [z, maxHw] of MAP_ZOOM_HEADWAY_STEPS) {
    if (zoom >= z) threshold = maxHw;
  }
  return threshold;
}

/**
 * Default routes-layer line-opacity. MapLibre allows only one zoom-based subexpression
 * per paint property, so gate headway per interpolate stop instead of nesting step+interpolate.
 * When partialMatch is provided, dim those features inside each zoom stop rather than wrapping
 * the whole interpolate expression in a case (which MapLibre rejects because zoom is no longer
 * top-level).
 */
export function buildDefaultRouteLineOpacityExpression(headwayExpr: unknown, partialMatch?: unknown): unknown[] {
  const expr: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const [z, opacity] of [[8, 0.7], [11, 0.8], [14, 0.9]] as const) {
    const headwayOpacity = ['case', ['>', headwayExpr, headwayThresholdForZoom(z)], 0, opacity];
    expr.push(z, partialMatch === undefined ? headwayOpacity : ['case', partialMatch, 0.35, headwayOpacity]);
  }
  return expr;
}

/** Keep the normal zoom/headway visibility for background routes while spotlighting one route. */
export function buildFocusedRouteLineOpacityExpression(routeMatch: unknown, headwayExpr: unknown): unknown[] {
  const expr: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const [z, opacity] of [[8, 0.7], [11, 0.8], [14, 0.9]] as const) {
    const backgroundOpacity = ['case', ['>', headwayExpr, headwayThresholdForZoom(z)], 0, opacity];
    expr.push(z, ['case', routeMatch, 1.0, backgroundOpacity]);
  }
  return expr;
}
