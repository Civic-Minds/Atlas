export const HEADWAY_TIERS = [
  { max: 10, color: '#059669', label: '≤10m' },
  { max: 15, color: '#10b981', label: '≤15m' },
  { max: 20, color: '#84cc16', label: '≤20m' },
  { max: 30, color: '#eab308', label: '≤30m' },
  { max: 60, color: '#f97316', label: '≤60m' },
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
