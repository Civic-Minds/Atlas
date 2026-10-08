import type { PeriodKey } from './config.js';
import { NO_PERIOD_SERVICE_TILE_VALUE, periodHeadwayFlatKeys } from './pmtilesProps.js';
import { PERIOD_COVERAGE_MAX_HEADWAY } from './periodEligibility.js';
import { buildEffectiveModeExpression, ON_DEMAND_MODE, VIRTUAL_LRT_MODE } from './modes.js';

type PeriodFilter = PeriodKey | 'all';

/** MapLibre expression matching the explicit time-limited service class only. */
export function tileLimitedServiceExpr(): unknown[] {
  return ['any',
    ['==', ['get', 'serviceClass'], 'time-limited'],
    ['==', ['coalesce', ['get', 'routeHasLimitedDirection'], false], true],
  ];
}

/** MapLibre expression matching the canonical agency::route[:branch] key. */
export function tileRouteKeyExpr(): unknown[] {
  const base: unknown[] = [
    'concat',
    ['coalesce', ['get', 'agencySlug'], ''],
    '::',
    ['coalesce', ['get', 'routeId'], ''],
  ];
  return [
    'case',
    ['all', ['has', 'routeBranch'], ['!=', ['get', 'routeBranch'], '']],
    [...base, '::branch:', ['get', 'routeBranch']],
    base,
  ];
}

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
    const coverageKeys = [`wdpch_${period}`, `pch_${period}`];
    const periodValue = [
      'coalesce',
      ...periodKeys.map((key) => ['get', key]),
      NO_PERIOD_SERVICE_TILE_VALUE,
    ];
    const coverage = [
      'case',
      // Span routes can contain tightly clustered school/special trips, but those
      // clusters are not regular frequency. Do not use their max-gap fallback to
      // pass an active-period frequency filter.
      ['==', ['get', 'tier'], 'span'], NO_PERIOD_SERVICE_TILE_VALUE,
      ['has', coverageKeys[0]], ['get', coverageKeys[0]],
      ['has', coverageKeys[1]], ['get', coverageKeys[1]],
      // Older tiles can contain an explicit unsustained marker without the
      // coverage field. Do not let their partial-period median pass as a
      // full-period frequency match.
      ['==', ['get', `hps_${period}`], false], NO_PERIOD_SERVICE_TILE_VALUE,
      ['any', ...periodKeys.map((key) => ['has', key])],
      periodValue,
      // A period-specific filter must not silently become an all-day filter when
      // an old or incomplete tile has no period properties at all.
      NO_PERIOD_SERVICE_TILE_VALUE,
    ];
    const regularPeriod = [
      'case',
      ['has', periodKeys[0]], ['get', periodKeys[0]],
      ['has', periodKeys[1]], ['get', periodKeys[1]],
      NO_PERIOD_SERVICE_TILE_VALUE,
    ];
    const qualifiedCadence = [
      'case',
      ['all', ['==', ['get', `hps_${period}`], true], ['<=', coverage, PERIOD_COVERAGE_MAX_HEADWAY]],
      regularPeriod,
      coverage,
    ];
    return [
      'case',
      // New artifacts keep the active cadence for a properly sustained period that covers
      // the window (coverage <= 60). If the period is marked unsustained or has no service for most
      // of the window (e.g. Calgary overnight routes starting around 5 AM), use the full-window
      // coverage value so a late-start route cannot pass as frequent or receive a normal tier (#507).
      // Older or incomplete tiles have no period properties and fail closed rather
      // than falling back to daytime/all-day values.
      ['has', `hps_${period}`],
      qualifiedCadence,
      coverage,
    ];
  }
  return allDay;
}

/** MapLibre expression that detects any computed service in a selected period. */
export function tilePeriodServiceExpr(period: PeriodFilter): unknown[] {
  if (period === 'all') return ['literal', true];
  const [, wdph, hph] = periodHeadwayFlatKeys(period);
  const keys = [`msph_${period}`, wdph, hph, `wdpch_${period}`, `pch_${period}`];
  return ['any', ...keys.map(key => [
    'all',
    ['has', key],
    ['<', ['get', key], NO_PERIOD_SERVICE_TILE_VALUE],
  ])];
}

/** Flat per-mode matchers (avoids nested case expr that breaks filter compilation). */
export function buildModeFilterClause(modes: Set<number>): unknown[] | null {
  if (!modes || modes.size === 0) return null;
  const routeModes = [...modes].filter(mode => mode !== ON_DEMAND_MODE);
  if (routeModes.length === 0) return ['==', ['get', 'routeId'], '__atlas_no_scheduled_route__'];

  const longName: unknown[] = ['coalesce', ['get', 'routeLongName'], ''];
  const effectiveMode: unknown[] = buildEffectiveModeExpression();
  const parts: unknown[] = [];

  for (const m of routeModes) {
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
    } else if (m === 3) {
      parts.push(['==', effectiveMode, 3]);
    } else {
      parts.push(['==', ['get', 'routeType'], m]);
    }
  }

  return ['any', ...parts];
}
