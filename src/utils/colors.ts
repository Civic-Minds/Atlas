import { delayStatus } from '../../shared/liveDelayStatus';
import { HEADWAY_TIERS, MAP_ZOOM_HEADWAY_STEPS, MAP_ZOOM_DEFAULT_MAX_HEADWAY, type HeadwayTier } from '../../shared/config';
import type { NightServiceFrequency } from '../../shared/nightService';
import {
  BRANCH_STACK_COLORS, COLOR_VISION_NIGHT_SERVICE_COLOR, COLOR_VISION_STATUS_COLORS, COLOR_VISION_TIER_COLOURS, FALLBACK_GREY,
  NIGHT_SERVICE_COLOR, NIGHT_SERVICE_TIER_COLORS as NIGHT_SERVICE_TIER_COLORS_SOURCE, STATUS_COLORS, TEXT_ON_DARK, TEXT_ON_LIGHT,
  type StatusColor,
} from '../../shared/rules/colours';
export { HEADWAY_TIERS };

export type { StatusColor };
export { BRANCH_STACK_COLORS, COLOR_VISION_NIGHT_SERVICE_COLOR, COLOR_VISION_STATUS_COLORS, NIGHT_SERVICE_COLOR, STATUS_COLORS };

export type ColorVisionMode = 'default' | 'friendly';

/** The tiers in colour-vision-friendly mode: the same maxes and labels as HEADWAY_TIERS, in COLOR_VISION_TIER_COLOURS. */
export const COLOR_VISION_HEADWAY_TIERS: HeadwayTier[] = HEADWAY_TIERS.map((t, i) => ({ ...t, color: COLOR_VISION_TIER_COLOURS[i] }));

function palette(mode: ColorVisionMode): HeadwayTier[] {
  return mode === 'friendly' ? COLOR_VISION_HEADWAY_TIERS : HEADWAY_TIERS;
}

export function getHeadwayTiers(mode: ColorVisionMode = 'default'): HeadwayTier[] {
  return palette(mode);
}

function statusPalette(mode: ColorVisionMode) {
  return mode === 'friendly' ? COLOR_VISION_STATUS_COLORS : STATUS_COLORS;
}

export const getTierColor = (tier: string | null, mode: ColorVisionMode = 'default'): string => {
  const tiers = palette(mode);
  if (!tier || tier === 'span' || tier === 'infrequent') return tiers[tiers.length - 1].color;
  const t = parseInt(tier);
  for (const { max, color } of tiers) {
    if (t <= max) return color;
  }
  return FALLBACK_GREY;
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

/** The map's vehicle status: Live's one late/early rule (shared/liveDelayStatus.ts), or no data. */
export function getVehicleStatus(delayMin: number | null): 'no_data' | 'early' | 'late' | 'on_time' {
  if (delayMin === null) return 'no_data';
  return delayStatus(delayMin);
}

export function getVehicleColors(status: 'early' | 'late' | 'on_time' | 'no_data', mode: ColorVisionMode = 'default'): StatusColor {
  return statusPalette(mode)[status];
}

/** A vehicle dot's fill as [r, g, b] (for WebGL layers): the same status colour as the cards, in the given mode. */
export function getVehicleRgb(status: 'early' | 'late' | 'on_time' | 'no_data', mode: ColorVisionMode = 'default', /** 'border': the same colour's darker shade, a picked vehicle's dot (CIV-2043). */ shade: 'bg' | 'border' = 'bg'): [number, number, number] {
  const hex = getVehicleColors(status, mode)[shade].replace('#', '');
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Dark or white text, whichever reads better (WCAG contrast) on a hex background. */
export function readableTextOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return TEXT_ON_DARK;
  const lin = (i: number) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  // Contrast with white is 1.05 / (l + 0.05); with near-black (#111827, luminance ~0.009) it is (l + 0.05) / 0.059.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.059 ? TEXT_ON_DARK : TEXT_ON_LIGHT;
}

/** Flat line color for Night Service view — every visible route already passed the
 * nightService filter, so (unlike headway) there's no tier to express, just one color. */
export function branchStackColor(index: number): string {
  return BRANCH_STACK_COLORS[index % BRANCH_STACK_COLORS.length];
}

export function getNightServiceColor(mode: ColorVisionMode = 'default'): string {
  return mode === 'friendly' ? COLOR_VISION_NIGHT_SERVICE_COLOR : NIGHT_SERVICE_COLOR;
}

/** CIV-1329: the night grades' three shades (shared/rules/colours.ts). */
export const NIGHT_SERVICE_TIER_COLORS: Record<'default' | 'friendly', Record<NightServiceFrequency, string>> = NIGHT_SERVICE_TIER_COLORS_SOURCE;

export function getNightServiceTierColor(grade: NightServiceFrequency, mode: ColorVisionMode = 'default'): string {
  return NIGHT_SERVICE_TIER_COLORS[mode === 'friendly' ? 'friendly' : 'default'][grade];
}

/** MapLibre colour for the Night Service overlay, by each feature's nightGrade (selectNightServiceFeatures). */
export function nightServiceTierColorExpression(mode: ColorVisionMode = 'default'): unknown[] {
  return ['match', ['get', 'nightGrade'],
    30, getNightServiceTierColor(30, mode),
    90, getNightServiceTierColor(90, mode),
    getNightServiceTierColor(60, mode)];
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
export function headwayThresholdForZoom(zoom: number): number {
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

/** Fade background routes while keeping the selected route fully visible. */
export function buildFocusedRouteLineOpacityExpression(routeMatch: unknown, headwayExpr: unknown, mode: ColorVisionMode = 'default'): unknown[] {
  const expr: unknown[] = ['interpolate', ['linear'], ['zoom']];
  // Keep the network visible as context, but make the selected route unmistakable.
  const backgroundOpacities = mode === 'friendly' ? [0.16, 0.18, 0.2] : [0.18, 0.18, 0.18];
  for (const [z, opacity] of [[8, backgroundOpacities[0]], [11, backgroundOpacities[1]], [14, backgroundOpacities[2]]] as const) {
    const backgroundOpacity = ['case', ['>', headwayExpr, headwayThresholdForZoom(z)], 0, opacity];
    expr.push(z, ['case', routeMatch, 1.0, backgroundOpacity]);
  }
  return expr;
}
