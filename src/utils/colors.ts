export const HEADWAY_TIERS = [
  { max: 10, color: '#111827', label: '≤10m' },
  { max: 15, color: '#1f2937', label: '≤15m' },
  { max: 20, color: '#374151', label: '≤20m' },
  { max: 30, color: '#4b5563', label: '≤30m' },
  { max: 60, color: '#6b7280', label: '≤60m' },
  { max: Infinity, color: '#9ca3af', label: 'Infrequent' },
];

export const getTierColor = (tier: string | null): string => {
  if (!tier || tier === 'span' || tier === 'infrequent') return '#6b7280';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#9ca3af';
};
