export const HEADWAY_TIERS = [
  { max: 10, color: '#2563eb', label: '≤10m' },
  { max: 15, color: '#16a34a', label: '≤15m' },
  { max: 20, color: '#16a34a', label: '≤20m' },
  { max: 30, color: '#ca8a04', label: '≤30m' },
  { max: 60, color: '#dc2626', label: '≤60m' },
  { max: Infinity, color: '#6b7280', label: 'Infrequent' },
];

export function getDelayColor(deltaMin: number | null): string {
  if (deltaMin === null) return '#6b7280';
  if (deltaMin < -0.5) return '#3b82f6'; // early
  if (deltaMin <= 1)   return '#22c55e'; // on time
  if (deltaMin <= 3)   return '#f59e0b'; // slightly late
  return '#ef4444';                      // late
}

export const getTierColor = (tier: string | null): string => {
  if (!tier || tier === 'span' || tier === 'infrequent') return '#6b7280';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#9ca3af';
};

export function getVehicleStatus(delayMin: number | null): 'no_data' | 'early' | 'late' | 'on_time' {
  if (delayMin === null) return 'no_data';
  if (delayMin <= -1.5) return 'early';
  if (delayMin >= 5.5) return 'late';
  return 'on_time';
}
