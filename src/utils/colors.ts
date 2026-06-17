export const HEADWAY_TIERS = [
  { max: 10, color: '#0f766e', label: '≤10m' },
  { max: 15, color: '#14b8a6', label: '≤15m' },
  { max: 20, color: '#2dd4bf', label: '≤20m' },
  { max: 30, color: '#5eead4', label: '≤30m' },
  { max: 60, color: '#99f6e4', label: '≤60m' },
  { max: Infinity, color: '#475569', label: 'Infrequent' },
];

export const getTierColor = (tier: string | null): string => {
  if (!tier || tier === 'span' || tier === 'infrequent') return '#4b5563';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#4b5563';
};
