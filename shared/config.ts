/**
 * Shared configuration constants
 */

const getR2PublicUrl = (): string => {
  if (typeof process !== 'undefined' && process.env?.R2_PUBLIC_URL) {
    return process.env.R2_PUBLIC_URL;
  }
  // Vite dev: same-origin proxy (see vite.config.ts) avoids R2 CORS on localhost.
  // @ts-ignore
  if (typeof window !== 'undefined' && typeof import.meta !== 'undefined' && import.meta?.env?.DEV) {
    return `${window.location.origin}/atlas-data`;
  }
  // Vite client-side environment variable fallback
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_R2_PUBLIC_URL) {
    // @ts-ignore
    return import.meta.env.VITE_R2_PUBLIC_URL;
  }
  return 'https://pub-85dc05d357954b6399c9a44018a3221e.r2.dev';
};

export const R2_PUBLIC_URL = getR2PublicUrl().replace(/\/$/, '');

/**
 * Derive the public URLs for an agency's processed artifacts.
 * This removes the need to store repetitive full R2 URLs in index.json.
 */
export function getAgencyArtifactUrls(slug: string) {
  const base = R2_PUBLIC_URL;
  return {
    url: `${base}/atlas/${slug}.json`,
    stopsUrl: `${base}/atlas/${slug}-stops.json`,
    corridorsUrl: `${base}/atlas/${slug}-corridors.json`,
    tripsUrl: `${base}/atlas/${slug}-trips.json`,
    livePollingUrl: `${base}/atlas/live-polling/${slug}.json`,
  };
}

export function getAgencyDataUrl(slug: string, variant: '' | '-stops' | '-corridors' | '-trips' = '') {
  return `${R2_PUBLIC_URL}/atlas/${slug}${variant}.json`;
}

export interface PeriodConfig<K extends string = string> {
  key: K;
  label: string;
  startHour: number;
  endHour: number;
}

export const TIME_PERIODS = [
  { key: 'amPeak',    label: 'AM Peak',    startHour: 6,  endHour: 9  },
  { key: 'midday',    label: 'Midday',     startHour: 9,  endHour: 15 },
  { key: 'pmPeak',    label: 'PM Peak',    startHour: 15, endHour: 19 },
  { key: 'evening',   label: 'Evening',    startHour: 19, endHour: 23 },
  { key: 'late',      label: 'Late',       startHour: 23, endHour: 26 },
  { key: 'overnight', label: 'Overnight',  startHour: 26, endHour: 30 },
] as const satisfies readonly PeriodConfig[];

export type PeriodKey = (typeof TIME_PERIODS)[number]['key'];

export const PERIOD_KEYS: PeriodKey[] = TIME_PERIODS.map(p => p.key);

export const PERIOD_LABELS: Record<PeriodKey, string> = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, p.label]),
) as Record<PeriodKey, string>;

/** Compact hour label for filter chips: 6a, 12p, 2a (handles GTFS extended hours). */
export function formatPeriodHourChip(h: number): string {
  const h12 = h % 24;
  if (h12 === 0 || h12 === 24) return '12a';
  if (h12 === 12) return '12p';
  return h12 < 12 ? `${h12}a` : `${h12 - 12}p`;
}

/** Filter chip range label, e.g. "6a–9a". */
export function formatPeriodRange(key: string): string {
  const p = TIME_PERIODS.find(t => t.key === key);
  if (!p) return '';
  return `${formatPeriodHourChip(p.startHour)}–${formatPeriodHourChip(p.endHour)}`;
}

/** Long hour label for timelines, e.g. "2 AM" (GTFS hour 26). */
export function formatPeriodHourLong(h: number): string {
  if (h >= 24) {
    const hour = h - 24;
    const h12 = hour === 0 ? 12 : hour;
    return `${h12} AM`;
  }
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

/** Long range label for timelines, e.g. "6–9 AM" or "11 PM–2 AM". */
export function formatPeriodRangeLong(startHour: number, endHour: number): string {
  const startStr = formatPeriodHourLong(startHour);
  const endStr = formatPeriodHourLong(endHour);
  const startSuffix = startStr.split(' ')[1];
  const endSuffix = endStr.split(' ')[1];
  return startSuffix === endSuffix
    ? `${startStr.split(' ')[0]}–${endStr}`
    : `${startStr}–${endStr}`;
}

/** Map clock/sparkline hour to GTFS extended hour for period lookup (matches filter chip logic). */
export function toGtfsHour(h: number): number {
  return h < 6 ? h + 24 : h;
}

export function periodKeyForHour(h: number): PeriodKey | null {
  const gtfsH = toGtfsHour(h);
  return TIME_PERIODS.find(p => gtfsH >= p.startHour && gtfsH < p.endHour)?.key ?? null;
}

export function isHourInPeriod(h: number, periodKey: string): boolean {
  const gtfsH = toGtfsHour(h);
  const p = TIME_PERIODS.find(t => t.key === periodKey);
  return p != null && gtfsH >= p.startHour && gtfsH < p.endHour;
}

/** Sparkline / hourly headway window: 5 AM through 2 AM next day (GTFS hour 26). */
export const SPARKLINE_START_HOUR = 5;
export const SPARKLINE_END_HOUR = 26;
export const SPARKLINE_HOURS = Array.from(
  { length: SPARKLINE_END_HOUR - SPARKLINE_START_HOUR + 1 },
  (_, i) => i + SPARKLINE_START_HOUR,
);

export type HeadwayByPeriod = Partial<Record<PeriodKey, number | null>>;

export interface HeadwayTier {
  max: number;
  color: string;
  label: string;
}

export const HEADWAY_TIERS: HeadwayTier[] = [
  { max: 10, color: '#22863a', label: '≤10m' },
  { max: 15, color: '#3da44d', label: '≤15m' },
  { max: 20, color: '#f59e0b', label: '≤20m' },
  { max: 30, color: '#e07b2a', label: '≤30m' },
  { max: 60, color: '#92400e', label: '≤60m' },
  { max: Infinity, color: '#6b7280', label: 'Infrequent' },
];

/** Finite headway tier breakpoints derived from HEADWAY_TIERS (pipeline analysis). */
export const SURFACE_TIER_MAXES: number[] = HEADWAY_TIERS
  .filter(t => t.max !== Infinity)
  .map(t => t.max);

/** Default map center when no saved view (GTHA). */
export const DEFAULT_MAP_CENTER: [number, number] = [43.65, -79.45];
export const DEFAULT_MAP_ZOOM = 11;

/** Bbox padding from agency center when index.json has no explicit bbox. */
export const AGENCY_BBOX_PAD = { lat: 0.4, lon: 0.5 } as const;
/** Initial viewport padding around center. */
export const VIEWPORT_BBOX_PAD = { lat: 0.5, lon: 0.6 } as const;
/** Agency chip visibility check padding. */
export const AGENCY_CHIP_PAD = 0.5;

/** Runtime map zoom gate: [zoom threshold, max headway] steps after the sub-zoom-7 default (10 min). */
export const MAP_ZOOM_HEADWAY_STEPS: ReadonlyArray<readonly [zoom: number, maxHeadway: number]> = [
  [7, 20],
  [9, 9999],
];
export const MAP_ZOOM_DEFAULT_MAX_HEADWAY = 10;

export function pmtilesMinZoomForHeadway(hw: number): number {
  if (hw <= 10) return 0;
  if (hw <= 15) return 7;
  if (hw <= 30) return 9;
  return 11;
}
