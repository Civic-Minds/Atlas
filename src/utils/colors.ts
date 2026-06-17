export const HEADWAY_TIERS = [
  { max: 10, color: '#10b981', label: '≤10m' },
  { max: 15, color: '#6366f1', label: '≤15m' },
  { max: 20, color: '#8b5cf6', label: '≤20m' },
  { max: 30, color: '#f59e0b', label: '≤30m' },
  { max: 60, color: '#f97316', label: '≤60m' },
  { max: Infinity, color: '#4b5563', label: 'Infrequent' },
];

export const getTierColor = (tier: string | null): string => {
  if (!tier || tier === 'span' || tier === 'infrequent') return '#4b5563';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#4b5563';
};
