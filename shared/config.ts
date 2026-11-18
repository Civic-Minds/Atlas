import { headwayTierLabel } from './headwayText';
import { PUBLIC_TIER_MAXES } from './frequencyRules';
import { hourRange, hourTime } from './timeText';
import { TIME_PERIODS, type PeriodKey } from './rules/periods';
import { FEATURES } from './rules/flags';
/**
 * Shared configuration constants
 */

import { DEFAULT_BETA_R2_PUBLIC_URL, DEFAULT_R2_PUBLIC_URL } from './rules/paths';
import { TIER_COLOURS } from './rules/colours';
// The bucket origins are in shared/rules/paths.ts (rules audit, move 6). The beta bucket holds staged artifacts used by
// beta-only agencies while a country rollout is being validated.
export { DEFAULT_BETA_R2_PUBLIC_URL, DEFAULT_R2_PUBLIC_URL };

const getR2PublicUrl = (): string => {
  if (typeof process !== 'undefined' && process.env?.R2_PUBLIC_URL) {
    return process.env.R2_PUBLIC_URL;
  }
  // Vite dev: same-origin proxy (see vite.config.ts) avoids R2 CORS on localhost.
  if (typeof window !== 'undefined' && typeof import.meta !== 'undefined' && import.meta?.env?.DEV) {
    return `${window.location.origin}/atlas-data`;
  }
  // Vite client-side environment variable fallback
  if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_R2_PUBLIC_URL) {
    return import.meta.env.VITE_R2_PUBLIC_URL;
  }
  return DEFAULT_R2_PUBLIC_URL;
};

export const R2_PUBLIC_URL = getR2PublicUrl().replace(/\/$/, '');

const getBetaR2PublicUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_BETA_R2_PUBLIC_URL) {
    return import.meta.env.VITE_BETA_R2_PUBLIC_URL;
  }
  // Staging R2's public development host is intentionally not browser-CORS enabled.
  // Keep beta-only artifacts same-origin in both local dev and the hosted beta site;
  // Vite/Vercel proxy that path to the staging bucket.
  if (typeof window !== 'undefined') return `${window.location.origin}/beta-data`;
  return '/beta-data';
};

export const BETA_R2_PUBLIC_URL = getBetaR2PublicUrl().replace(/\/$/, '');

// The feature switches (envFlag, ATLAS_MODE, every *_ENABLED, FEATURES, FEATURE_ROUTES) moved to shared/rules/flags.ts
// (rules audit, move 10); this re-export stays until no file imports them here.
export * from './rules/flags';

/**
 * Derive the public URLs for an agency's processed artifacts.
 * This removes the need to store repetitive full R2 URLs in index.json.
 */
export function getAgencyArtifactUrls(slug: string, options?: { betaOnly?: boolean }) {
  const base = FEATURES.beta && options?.betaOnly ? BETA_R2_PUBLIC_URL : R2_PUBLIC_URL;
  return {
    url: `${base}/atlas/${slug}.json`,
    stopsUrl: `${base}/atlas/${slug}-stops.json`,
    corridorsUrl: `${base}/atlas/${slug}-corridors.json`,
    tripsUrl: `${base}/atlas/${slug}-trips.json`,
    stopsMetaUrl: `${base}/atlas/${slug}-stops-meta.json`,
    /** CIV-321: beta section colours only (FEATURES.segmentColours); the public build never fetches it. */
    sectionsUrl: `${base}/atlas/${slug}-sections.json`,
    livePollingUrl: `${base}/atlas/live-polling/${slug}.json`,
  };
}

export function getAgencyDataUrl(slug: string, variant: '' | '-stops' | '-corridors' | '-trips' | '-sections' = '') {
  return `${R2_PUBLIC_URL}/atlas/${slug}${variant}.json`;
}

// The periods, their minutes and the sparkline hours moved to shared/rules/periods.ts (rules audit, move 4); this
// re-export stays until no file imports them here.
export * from './rules/periods';

/** A period's hours for its filter chip, in the app's one time format (CIV-1095): "6–9 AM", "9 AM–3 PM". */
export function formatPeriodRange(key: string): string {
  const p = TIME_PERIODS.find(t => t.key === key);
  return p ? hourRange(p.startHour, p.endHour) : '';
}

/** A GTFS hour as a time (CIV-1095): "2 AM" for hour 26. */
export function formatPeriodHourLong(h: number): string {
  return hourTime(h);
}

/** Two GTFS hours as a range (CIV-1095): "6–9 AM", "11 PM–2 AM". */
export function formatPeriodRangeLong(startHour: number, endHour: number): string {
  return hourRange(startHour, endHour);
}

/** Axis labels the sparkline puts under its bars (keyed by GTFS hour): 6 AM, 12 PM, 6 PM, 12 AM. Other charts reuse them. */
export const SPARKLINE_HOUR_LABELS: Readonly<Record<number, string>> = Object.fromEntries([6, 12, 18, 24].map(h => [h, hourTime(h)]));

export type HeadwayByPeriod = Partial<Record<PeriodKey, number | null>>;

/** Parallel to HeadwayByPeriod (#281) -- whether each period's own median fairly describes its
 * gaps. Kept as a separate field rather than widening HeadwayByPeriod's value shape, since
 * several consumers declare their own independent number-shaped type for headwayByPeriod. */
export type HeadwayByPeriodSustained = Partial<Record<PeriodKey, boolean>>;

/** Longest departure gap touching each period, clipped to the period window (#281). */
export type HeadwayByPeriodMaxGap = Partial<Record<PeriodKey, number | null>>;

/** Typical scheduled departure-gap range inside each period. */
export interface HeadwayPeriodRange {
  min: number;
  max: number;
}

export type HeadwayByPeriodRange = Partial<Record<PeriodKey, HeadwayPeriodRange | null>>;

/** Longest departure gap starting within each sparkline hour. */
export type HeadwayByHourMaxGap = Partial<Record<number, number | null>>;

export interface HeadwayTier {
  max: number;
  color: string;
  label: string;
}

/**
 * The frequency tiers, best first, in their colours (shared/rules/colours.ts): one per PUBLIC_TIER_MAXES step
 * (shared/rules/frequency.ts, the scales' one home), then Infrequent.
 */
export const HEADWAY_TIERS: HeadwayTier[] = [
  ...PUBLIC_TIER_MAXES.map((max, i) => ({ max, color: TIER_COLOURS[i], label: headwayTierLabel(max) })),
  { max: Infinity, color: TIER_COLOURS[PUBLIC_TIER_MAXES.length], label: 'Infrequent' },
];

/** The public scale, re-exported here for its many readers; defined in shared/rules/frequency.ts. */
export { PUBLIC_TIER_MAXES };

/** The default map view, its padding and the zoom steps (shared/rules/limits.ts). */
export {
  DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, AGENCY_BBOX_PAD, VIEWPORT_BBOX_PAD, AGENCY_CHIP_PAD,
  MAP_ZOOM_HEADWAY_STEPS, MAP_ZOOM_DEFAULT_MAX_HEADWAY,
} from './rules/limits';
