import type { PeriodKey } from './config.js';
import { NO_PERIOD_SERVICE_TILE_VALUE, periodHeadwayFlatKeys } from './pmtilesProps.js';
import { PERIOD_COVERAGE_MAX_HEADWAY } from './periodEligibility.js';
import { buildEffectiveModeExpression, ON_DEMAND_MODE } from './modes.js';

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
  // This expression is the single definition of the frequency-filter rule: in-memory surfaces
  // evaluate it via shared/routeHeadwayFilter.ts. Worst direction decides. minStopHeadway (the
  // busiest stop) is deliberately not a fallback: a busy stretch must never make a route pass.
  const allDay: unknown[] = [
    'coalesce',
    ['get', 'worstDirectionHeadway'],
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
    // Frequency focus step 5a: a route stamped with the stretch selector's filter value (rv_) is
    // judged on it, every direction's worst counting stretch, for each row that is not span and
    // runs in the period itself; a null value (no regular service) arrives as the sentinel. Routes
    // without rv_ (older releases, routes with no stretch data) keep the rule below.
    const rowRuns = ['any',
      ...[hph, `pch_${period}`].map(key => ['all', ['has', key], ['<', ['get', key], NO_PERIOD_SERVICE_TILE_VALUE]]),
      ['==', ['get', `pws_${period}`], true],
    ];
    const legacy = [
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
    return [
      'case',
      ['has', `rv_${period}`],
      ['case',
        ['==', ['get', 'tier'], 'span'], NO_PERIOD_SERVICE_TILE_VALUE,
        rowRuns, ['get', `rv_${period}`],
        NO_PERIOD_SERVICE_TILE_VALUE,
      ],
      legacy,
    ];
  }
  return allDay;
}

/** MapLibre expression that detects any computed service in a selected period. */
export function tilePeriodServiceExpr(period: PeriodFilter): unknown[] {
  if (period === 'all') return ['literal', true];
  const [, wdph, hph] = periodHeadwayFlatKeys(period);
  const keys = [`msph_${period}`, wdph, hph, `wdpch_${period}`, `pch_${period}`];
  const legacy = ['any',
    ...keys.map(key => [
      'all',
      ['has', key],
      ['<', ['get', key], NO_PERIOD_SERVICE_TILE_VALUE],
    ]),
    // A route that runs on only some weekdays (#710) has no headway values for the Weekday
    // tier ("limited"), but it still has service in this period on those weekdays.
    ['==', ['get', `pws_${period}`], true],
  ];
  // Step 5a: a route stamped by the stretch selector runs in the period only when one of its
  // directions runs through it (rr_); stray or part-day trips alone (YRT Viva overnight) no longer
  // draw it under "All". The row must still run there itself.
  return ['case', ['has', `rr_${period}`], ['all', ['==', ['get', `rr_${period}`], true], legacy], legacy];
}

/** MapLibre filter clause for the selected period and frequency ceiling. */
export function buildTileHeadwayFilterClause(period: PeriodFilter | undefined, maxHeadway: number): unknown[] {
  // When Frequency = All for a specific period, the service predicate is already
  // boolean. Do not wrap it in a numeric <= comparison; MapLibre 6 rejects that
  // expression and it never represented a numeric headway threshold.
  if (maxHeadway === Infinity && period && period !== 'all') {
    return tilePeriodServiceExpr(period);
  }

  const threshold = maxHeadway === Infinity ? NO_PERIOD_SERVICE_TILE_VALUE - 1 : maxHeadway;
  const clause = ['<=', tileEffectiveHeadwayExpr(period), threshold];
  // #899: all day, a direction with little or no midday service caps the route at its midday wait
  // (worstDirection.ts; no midday service at all fails every threshold). A tile without the cap
  // behaves as before.
  if ((!period || period === 'all') && maxHeadway !== Infinity) {
    return ['all', ['<=', ['coalesce', ['get', 'worstDirectionMiddayCap'], 0], threshold], clause];
  }
  return clause;
}

/** Flat per-mode matchers (avoids nested case expr that breaks filter compilation). */
export function buildModeFilterClause(modes: Set<number>): unknown[] | null {
  if (!modes || modes.size === 0) return null;
  const routeModes = [...modes].filter(mode => mode !== ON_DEMAND_MODE);
  if (routeModes.length === 0) return ['==', ['get', 'routeId'], '__atlas_no_scheduled_route__'];

  const effectiveMode: unknown[] = buildEffectiveModeExpression();
  const parts: unknown[] = [];

  for (const m of routeModes) {
    // Every chip matches the effective mode, so listed per-route overrides move routes between chips.
    parts.push(['==', effectiveMode, m]);
  }

  return ['any', ...parts];
}
