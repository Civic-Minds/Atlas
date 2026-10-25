/**
 * Synthetic multi-agency, multi-period R2 contents for the build-history golden test.
 * Pure data: no imports from the pipeline, so the same file can drive origin/main's build
 * (to make the golden) and this branch's build (to compare).
 *
 * Cases covered: two snapshots in one year (unsorted), a future-dated period, an empty period
 * key (empty label), a blank-short-name route (route_id key), a long-name-only route, a
 * limited route (no all-day value), trip-duration files, an agency that passes the History bar
 * only through coverage metadata, and a v2 sidecar that a default build must ignore.
 */

export type R2Contents = {
  /** atlas-archive: key -> raw JSON text */
  archive: Record<string, string>;
  /** public atlas bucket: key -> raw JSON text */
  pub: Record<string, string>;
  index: unknown;
  aliases: unknown;
};

const j = (v: unknown) => JSON.stringify(v);
const line = (n = 0): { type: 'LineString'; coordinates: number[][] } => ({ type: 'LineString', coordinates: [[-79 + n, 43], [-79 + n, 43.1]] });

function feature(props: Record<string, unknown>, shapeN = 0) {
  return { type: 'Feature', geometry: line(shapeN), properties: { day: 'Weekday', directionId: 0, routeType: 3, ...props } };
}

export function historyBuildFixture(): R2Contents {
  const archive: Record<string, string> = {};
  const put = (slug: string, route: string, periodKey: string, headway: number, extra: Record<string, unknown> = {}) => {
    archive[`history/${slug}/${route}/${periodKey}.json`] = j({ headway, routeLongName: `${route} long`, ...extra });
  };

  // alpha / route 10: unsorted, two snapshots in 2019, one in 2024, a future one, an empty key.
  put('alpha', '10', '20240601', 15, { headwayByPeriod: { am: 12, pm: 14 } });
  put('alpha', '10', '20190901', 20);
  put('alpha', '10', '20180901', 30);
  put('alpha', '10', '20190301', 25);
  put('alpha', '10', '20301201', 10);
  archive['history/alpha/10/.json'] = j({ headway: 99 });
  // alpha / route 40: an archived current-year (2026) snapshot, then a future one: the live endpoint
  // decision must behave exactly as origin/main (last archived point is the future year, so it is appended).
  put('alpha', '40', '20180901', 30);
  put('alpha', '40', '20260301', 12);
  put('alpha', '40', '20301201', 10);
  // alpha / route 20: limited today.
  put('alpha', '20', '20180901', 30);
  put('alpha', '20', '20230901', 60);
  // alpha / blank-short-name route keyed by its route_id.
  put('alpha', 'R7', '20190901', 30);
  // alpha / long-name-only route, history only.
  put('alpha', 'Lake Line', '20190901', 40);
  put('alpha', 'Lake Line', '20220901', 30);
  // alpha / a route whose value never changed (dropped by both unless trip-duration).
  put('alpha', '30', '20180901', 20);
  put('alpha', '30', '20240901', 20);
  // trip duration with a stable stop sequence over two periods.
  archive['trip-duration/alpha/30/20180901.json'] = j({ durationMinutes: 30, stopSequence: ['a', 'b', 'c'] });
  archive['trip-duration/alpha/30/20240901.json'] = j({ durationMinutes: 25, stopSequence: ['a', 'b', 'c'] });

  // beta: passes the 10-year bar by coverage metadata only (2012-2022), two real routes.
  archive['history/beta/coverage.json'] = j({ coverageYears: [...Array.from({ length: 11 }, (_, i) => 2012 + i), 2031], materializeAllPeriods: false });
  put('beta', '1', '20130901', 30);
  put('beta', '1', '20210901', 15);
  put('beta', '2', '20140901', 20);
  put('beta', '2', '20200901', 20);
  put('beta', '2', '20250901', 10);

  // gamma: materialized periods (every archived period kept even if unchanged).
  archive['history/gamma/coverage.json'] = j({ coverageYears: [2019, 2020], materializeAllPeriods: true });
  put('gamma', 'G1', '20190901', 20);
  put('gamma', 'G1', '20200901', 20);

  // Sidecar a default build must ignore (it only exists for the v2 build).
  archive['history-v2/alpha/20240601.json'] = j({
    version: 2, slug: 'alpha', periodKey: '20240601', refDate: '20240601',
    routes: { '10': { name: 'Main Street', rep: { h: 18 } }, '20': { rep: { lim: true }, flag: 'limited' } },
  });
  archive['history-v2/alpha/20190901.json'] = j({
    version: 2, slug: 'alpha', periodKey: '20190901', refDate: '20190901',
    routes: { '10': { name: 'Main Street', rep: { h: 22 } } },
  });

  // Route shapes (v2 only; a default build must neither list nor read them): the same line in 2019 and 2024,
  // an older line under the aliased key 10X in 2015, and a second route in 2019.
  const shapesObj = (periodKey: string, routes: Record<string, { c: number[][] }>) => j({ version: 1, slug: 'alpha', periodKey, refDate: periodKey, decimals: 5, toleranceM: 15, routes });
  archive['history-v2-shapes/alpha/20150901.json'] = shapesObj('20150901', { '10X': { c: [[-79.1, 43], [-79.1, 43.1]] } });
  archive['history-v2-shapes/alpha/20190901.json'] = shapesObj('20190901', { '10': { c: [[-79, 43], [-79, 43.1]] }, R7: { c: [[-79.5, 43], [-79.5, 43.1]] } });
  archive['history-v2-shapes/alpha/20240601.json'] = shapesObj('20240601', { '10': { c: [[-79, 43], [-79, 43.1]] } });

  const pub: Record<string, string> = {
    'atlas/alpha.json': j({
      type: 'FeatureCollection',
      features: [
        // route 10: a fast direction-0 pattern (8), a slower one (12) and the other direction; stamped all-day 20.
        feature({ routeShortName: '10', routeLongName: 'Main Street', headway: 8, routeAllDayHeadway: 20, headwayByPeriod: { am: 8 } }, 0),
        feature({ routeShortName: '10', routeLongName: 'Main Street', headway: 12, routeAllDayHeadway: 20 }, 1),
        feature({ routeShortName: '10', routeLongName: 'Main Street', headway: 18, directionId: 1, routeAllDayHeadway: 20 }, 2),
        // route 20: all-span (limited): no all-day value.
        feature({ routeShortName: '20', routeLongName: 'Twenty', headway: 40, tier: 'span', routeAllDayHeadway: 60 }, 3),
        // blank short name -> route_id key.
        feature({ routeShortName: '', routeId: 'R7', routeLongName: 'Seven', headway: 14, routeAllDayHeadway: 14 }, 4),
        // long-name only route.
        feature({ routeShortName: '', routeId: '', routeLongName: 'Lake Line', headway: 20, routeAllDayHeadway: 20 }, 5),
        feature({ routeShortName: '30', routeLongName: 'Thirty', headway: 20, routeAllDayHeadway: 20 }, 6),
        feature({ routeShortName: '40', routeLongName: 'Forty', headway: 6, routeAllDayHeadway: 6 }, 10),
      ],
    }),
    'atlas/beta.json': j({
      type: 'FeatureCollection',
      features: [
        feature({ routeShortName: '1', routeLongName: 'One', headway: 15, routeAllDayHeadway: 15 }, 7),
        feature({ routeShortName: '2', routeLongName: 'Two', headway: 10, routeAllDayHeadway: 10 }, 8),
      ],
    }),
    'atlas/gamma.json': j({
      type: 'FeatureCollection',
      features: [feature({ routeShortName: 'G1', headway: 20, routeAllDayHeadway: 20 }, 9)],
    }),
  };

  const index = {
    agencies: [
      { slug: 'alpha', name: 'Alpha Transit', region: 'Ontario', center: [-79, 43] },
      { slug: 'beta', name: 'Beta Transit', region: 'Quebec', center: [-73, 45] },
      { slug: 'gamma', name: 'Gamma Transit', region: 'Ohio', center: [-81, 41] },
    ],
  };
  const aliases = { alpha: { '10': ['10X'] } };
  // An old key the v2 alias merge folds into 10 (ignored by a default build).
  archive['history/alpha/10X/20150901.json'] = j({ headway: 40 });

  return { archive, pub, index, aliases };
}
