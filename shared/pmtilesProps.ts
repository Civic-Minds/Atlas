import { PERIOD_KEYS, type PeriodKey } from './config.js';

/** Nested GeoJSON period maps → flat keys for PMTiles/MVT (tippecanoe drops nested objects). */
const PERIOD_FLAT_PREFIXES = [
  ['minStopHeadwayByPeriod', 'msph'],
  ['worstDirectionHeadwayByPeriod', 'wdph'],
  ['headwayByPeriod', 'hph'],
] as const;

export function flattenPeriodHeadwayProps(props: Record<string, unknown>): void {
  for (const [src, prefix] of PERIOD_FLAT_PREFIXES) {
    const obj = props[src];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    for (const key of PERIOD_KEYS) {
      const periodProps = obj as Record<string, unknown>;
      const v = periodProps[key];
      if ((typeof v === 'number' && Number.isFinite(v)) || v === null) {
        props[`${prefix}_${key}`] = v;
      }
    }
  }
}

/** MapLibre property names for period headway coalesce (matches flattenPeriodHeadwayProps). */
export function periodHeadwayFlatKeys(period: PeriodKey): [string, string, string] {
  return [`msph_${period}`, `wdph_${period}`, `hph_${period}`];
}
