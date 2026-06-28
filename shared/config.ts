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

export interface PeriodConfig {
  key: string;
  label: string;
  startHour: number;
  endHour: number;
}

export const TIME_PERIODS: PeriodConfig[] = [
  { key: 'amPeak',  label: 'AM Peak', startHour: 6,  endHour: 9  },
  { key: 'midday',  label: 'Midday',  startHour: 9,  endHour: 15 },
  { key: 'pmPeak',  label: 'PM Peak', startHour: 15, endHour: 19 },
  { key: 'evening', label: 'Evening', startHour: 19, endHour: 22 },
];
