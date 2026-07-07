import type { PeriodKey } from './config.js';
import { periodHeadwayFlatKeys } from './pmtilesProps.js';
import { VIRTUAL_LRT_MODE } from './modes.js';

type PeriodFilter = PeriodKey | 'all';

/**
 * Headway expression for MapLibre layer filters (PMTiles).
 * Filter-safe: no to-number or numeric coalesce fallbacks — those break the
 * style-spec compiler when combined with direction/day clauses.
 */
export function tileEffectiveHeadwayExpr(period?: PeriodFilter): unknown[] {
  const allDay: unknown[] = [
    'coalesce',
    ['get', 'worstDirectionHeadway'],
    ['get', 'minStopHeadway'],
    ['get', 'headway'],
  ];
  if (period && period !== 'all') {
    const [msph, wdph, hph] = periodHeadwayFlatKeys(period);
    return ['coalesce', ['get', msph], ['get', hph], ['get', wdph], allDay];
  }
  return allDay;
}

/** Flat per-mode matchers (avoids nested case expr that breaks filter compilation). */
export function buildModeFilterClause(modes: Set<number>): unknown[] | null {
  if (!modes || modes.size === 0) return null;

  const longName: unknown[] = ['coalesce', ['get', 'routeLongName'], ''];
  const parts: unknown[] = [];

  for (const m of modes) {
    if (m === VIRTUAL_LRT_MODE) {
      parts.push([
        'any',
        ['all', ['==', ['get', 'routeType'], 0], ['==', ['coalesce', ['get', 'agencySlug'], ''], 'octranspo']],
        ['all', ['==', ['get', 'routeType'], 0], ['==', ['slice', longName, 0, 5], 'Line ']],
        ['all', ['==', ['get', 'routeType'], 2], ['in', 'ION', longName]],
      ]);
    } else if (m === 0) {
      parts.push([
        'all',
        ['==', ['get', 'routeType'], 0],
        ['!=', ['coalesce', ['get', 'agencySlug'], ''], 'octranspo'],
        ['!=', ['slice', longName, 0, 5], 'Line '],
      ]);
    } else if (m === 2) {
      parts.push([
        'all',
        ['==', ['get', 'routeType'], 2],
        ['!', ['in', 'ION', longName]],
      ]);
    } else {
      parts.push(['==', ['get', 'routeType'], m]);
    }
  }

  return ['any', ...parts];
}
