export const HEADWAY_TIERS = [
  { max: 10, color: '#2563eb', label: '≤10m' },
  { max: 15, color: '#16a34a', label: '≤15m' },
  { max: 20, color: '#16a34a', label: '≤20m' },
  { max: 30, color: '#ca8a04', label: '≤30m' },
  { max: 60, color: '#dc2626', label: '≤60m' },
  { max: Infinity, color: '#6b7280', label: 'Infrequent' },
];

export const getTierColor = (tier: string | null): string => {
  if (!tier || tier === 'span' || tier === 'infrequent') return '#6b7280';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#9ca3af';
};
