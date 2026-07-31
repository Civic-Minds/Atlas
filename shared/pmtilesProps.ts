import { PERIOD_KEYS, type PeriodKey } from './config.js';

/** Nested GeoJSON period maps → flat keys for PMTiles/MVT (tippecanoe drops nested objects). */
const PERIOD_FLAT_PREFIXES = [
  ['minStopHeadwayByPeriod', 'msph'],
  ['worstDirectionHeadwayByPeriod', 'wdph'],
  ['headwayByPeriod', 'hph'],
] as const;

// MVT (the format tippecanoe/PMTiles serialize to) has no null value type -- a property written
// as `null` in the source GeoJSON is silently dropped from the compiled tile, not preserved as
// null. tileEffectiveHeadwayExpr's `has()` check then can't tell "no data was ever computed for
// this period" (key genuinely absent, correctly falls back to the all-day headway) apart from
// "computed and confirmed zero service this period" (key present with value null, should exclude
// the route entirely) -- both look identical once the tile is built. A route with real overnight
// service and none in some other period (TTC 320 midday) then wrongly passes that period's filter
// using its overnight headway. This sentinel survives MVT encoding (it's a real number, not null)
// and is far above every real headway tier (see HEADWAY_TIERS in config.ts, max 60) and every
// selectable filter threshold, so the existing `<= maxHeadway` comparison in tileEffectiveHeadwayExpr
// naturally rejects it without needing a separate has()/sentinel check at each call site.
export const NO_PERIOD_SERVICE_TILE_VALUE = 999999;

export function flattenPeriodHeadwayProps(props: Record<string, unknown>): void {
  for (const [src, prefix] of PERIOD_FLAT_PREFIXES) {
    const obj = props[src];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    for (const key of PERIOD_KEYS) {
      const periodProps = obj as Record<string, unknown>;
      const v = periodProps[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        props[`${prefix}_${key}`] = v;
      } else if (v === null) {
        props[`${prefix}_${key}`] = NO_PERIOD_SERVICE_TILE_VALUE;
      }
    }
  }
}

/** MapLibre property names for period headway coalesce (matches flattenPeriodHeadwayProps). */
export function periodHeadwayFlatKeys(period: PeriodKey): [string, string, string] {
  return [`msph_${period}`, `wdph_${period}`, `hph_${period}`];
}
