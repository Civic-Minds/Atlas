import { HEADWAY_TIERS } from '../../shared/config';
export { HEADWAY_TIERS };

export interface StatusColor {
  bg: string;
  border: string;
  text: string;
}

export const STATUS_COLORS: Record<'early' | 'late' | 'on_time' | 'no_data', StatusColor> = {
  early: { bg: '#3182ce', border: '#2b6cb0', text: '#2b6cb0' },
  late: { bg: '#e53e3e', border: '#9b2c2c', text: '#9b2c2c' },
  on_time: { bg: '#38a169', border: '#276749', text: '#276749' },
  no_data: { bg: '#718096', border: '#4a5568', text: '#718096' },
};

export function getDelayColor(deltaMin: number | null): string {
  if (deltaMin === null) return STATUS_COLORS.no_data.border;
  if (deltaMin < -0.5) return STATUS_COLORS.early.border; // early
  if (deltaMin <= 1)   return STATUS_COLORS.on_time.border; // on time
  if (deltaMin <= 3)   return '#f59e0b'; // slightly late
  return STATUS_COLORS.late.border; // late
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

export function getVehicleColors(status: 'early' | 'late' | 'on_time' | 'no_data'): StatusColor {
  return STATUS_COLORS[status];
}

export function getTimelineHeadwayColor(hw: number | null): { bg: string; fg: string } {
  if (hw == null) return { bg: 'var(--bg-hover)',  fg: 'var(--text-dim)' };
  if (hw <= 10)   return { bg: '#22863a',          fg: '#fff' };
  if (hw <= 15)   return { bg: '#3da44d',          fg: '#fff' };
  if (hw <= 20)   return { bg: '#78c87e',          fg: '#1a1a1a' };
  if (hw <= 30)   return { bg: '#d4a017',          fg: '#fff' };
  if (hw <= 60)   return { bg: '#d4671e',          fg: '#fff' };
  return                  { bg: '#c0392b',          fg: '#fff' };
}
