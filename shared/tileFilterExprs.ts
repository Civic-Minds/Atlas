import type { PeriodKey } from './config.js';
import { periodHeadwayFlatKeys } from './pmtilesProps.js';
import { buildEffectiveModeExpression, VIRTUAL_LRT_MODE } from './modes.js';

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
    // wdph (worst-direction) must win: every direction has to meet the threshold, not just
    // this one feature's own branch. msph (min-stop / shared-core) is deliberately excluded
    // here — it can reflect a combined frequency that only applies to part of the line, and
    // without geometry clipping to match, using it here would let a partial match pass the
    // whole (unclipped) route through the filter (#314/#315).
    const [, wdph, hph] = periodHeadwayFlatKeys(period);
    const periodKeys = [wdph, hph];
    return [
      'case',
      ['any', ...periodKeys.map((key) => ['has', key])],
      ['coalesce', ...periodKeys.map((key) => ['get', key])],
      allDay,
    ];
  }
  return allDay;
}

/** Flat per-mode matchers (avoids nested case expr that breaks filter compilation). */
export function buildModeFilterClause(modes: Set<number>): unknown[] | null {
  if (!modes || modes.size === 0) return null;

  const longName: unknown[] = ['coalesce', ['get', 'routeLongName'], ''];
  const effectiveMode: unknown[] = buildEffectiveModeExpression();
  const parts: unknown[] = [];

  for (const m of modes) {
    if (m === VIRTUAL_LRT_MODE) {
      parts.push(['==', effectiveMode, VIRTUAL_LRT_MODE]);
    } else if (m === 0) {
      parts.push(['all', ['==', ['get', 'routeType'], 0], ['!=', effectiveMode, VIRTUAL_LRT_MODE]]);
    } else if (m === 2) {
      parts.push([
        'all',
        ['==', ['get', 'routeType'], 2],
        ['<', ['index-of', 'ION', longName], 0],
      ]);
    } else {
      parts.push(['==', ['get', 'routeType'], m]);
    }
  }

  return ['any', ...parts];
}
