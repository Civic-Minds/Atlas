/**
 * Shared configuration constants
 */

const getR2PublicUrl = (): string => {
  if (typeof process !== 'undefined' && process.env?.R2_PUBLIC_URL) {
    return process.env.R2_PUBLIC_URL;
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

export interface PeriodConfig {
  key: string;
  label: string;
  startHour: number;
  endHour: number;
}

export const TIME_PERIODS: PeriodConfig[] = [
  { key: 'amPeak',    label: 'AM Peak',    startHour: 6,  endHour: 9  },
  { key: 'midday',    label: 'Midday',     startHour: 9,  endHour: 15 },
  { key: 'pmPeak',    label: 'PM Peak',    startHour: 15, endHour: 19 },
  { key: 'evening',   label: 'Evening',    startHour: 19, endHour: 23 },
  { key: 'late',      label: 'Late',       startHour: 23, endHour: 26 },
  { key: 'overnight', label: 'Overnight',  startHour: 26, endHour: 30 },
];

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
