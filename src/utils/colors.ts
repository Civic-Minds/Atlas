import { HEADWAY_TIERS, MAP_ZOOM_HEADWAY_STEPS, MAP_ZOOM_DEFAULT_MAX_HEADWAY } from '../../shared/config';
export { HEADWAY_TIERS };

export interface StatusColor {
  bg: string;
  border: string;
  text: string;
}

export const STATUS_COLORS: Record<'early' | 'late' | 'on_time' | 'no_data', StatusColor> = {
  early: { bg: '#3182ce', border: '#2b6cb0', text: '#2b6cb0' },
  late: { bg: '#e53e3e', border: '#9b2c2c', text: '#9b2c2c' },
  on_time: { bg: '#38a169', border: '#276749', text: '#276749' },
  no_data: { bg: '#718096', border: '#4a5568', text: '#718096' },
};

export function getDelayColor(deltaMin: number | null): string {
  if (deltaMin === null) return STATUS_COLORS.no_data.border;
  if (deltaMin < -0.5) return STATUS_COLORS.early.border;
  if (deltaMin <= 1)   return STATUS_COLORS.on_time.border;
  if (deltaMin <= 3)   return '#f59e0b';
  return STATUS_COLORS.late.border;
}

export const getTierColor = (tier: string | null): string => {
  if (!tier || tier === 'span' || tier === 'infrequent') return '#6b7280';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#9ca3af';
};

/** Map a numeric headway (minutes) to its tier color hex. */
export function headwayToTierColor(h: number | null | undefined): string {
  if (h == null) return getTierColor(null);
  for (const { max, color } of HEADWAY_TIERS) {
    if (h <= max) return color;
  }
  return getTierColor('infrequent');
}

export function getVehicleStatus(delayMin: number | null): 'no_data' | 'early' | 'late' | 'on_time' {
  if (delayMin === null) return 'no_data';
  if (delayMin <= -1.5) return 'early';
  if (delayMin >= 5.5) return 'late';
  return 'on_time';
}

export function getVehicleColors(status: 'early' | 'late' | 'on_time' | 'no_data'): StatusColor {
  return STATUS_COLORS[status];
}

export function getTimelineHeadwayColor(hw: number | null): { bg: string; fg: string } {
  if (hw == null) return { bg: 'var(--bg-hover)', fg: 'var(--text-dim)' };
  const bg = headwayToTierColor(hw);
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

export function getFareColor(fare: number | null | undefined): string {
  if (fare == null) return '#6b7280';
  if (fare === 0) return FARE_TIERS[0].color;
  if (fare < 2) return FARE_TIERS[1].color;
  if (fare < 4) return FARE_TIERS[2].color;
  if (fare < 8) return FARE_TIERS[3].color;
  return FARE_TIERS[4].color;
}

/** MapLibre case expression for fare-based line color. */
export function buildFareColorExpression(): unknown[] {
  const expr: unknown[] = ['case'];
  expr.push(['==', ['coalesce', ['get', 'baseFare'], -1], 0], FARE_TIERS[0].color);
  expr.push(['all', ['>', ['coalesce', ['get', 'baseFare'], 999], 0], ['<', ['coalesce', ['get', 'baseFare'], 999], 2]], FARE_TIERS[1].color);
  expr.push(['all', ['>=', ['coalesce', ['get', 'baseFare'], 999], 2], ['<', ['coalesce', ['get', 'baseFare'], 999], 4]], FARE_TIERS[2].color);
  expr.push(['all', ['>=', ['coalesce', ['get', 'baseFare'], 999], 4], ['<', ['coalesce', ['get', 'baseFare'], 999], 8]], FARE_TIERS[3].color);
  expr.push(['>=', ['coalesce', ['get', 'baseFare'], 999], 8], FARE_TIERS[4].color);
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
 */
export function buildDefaultRouteLineOpacityExpression(headwayExpr: unknown): unknown[] {
  const expr: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const [z, opacity] of [[8, 0.7], [11, 0.8], [14, 0.9]] as const) {
    expr.push(z, ['case', ['>', headwayExpr, headwayThresholdForZoom(z)], 0, opacity]);
  }
  return expr;
}
