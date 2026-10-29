import { describe, expect, it } from 'vitest';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { passesRouteFilter, type ShapeProperties, type TimePeriod } from '../useIntervalStats';
import { buildRouteTileFilter } from '../../../shared/routeTileFilter';
import { routeFilterTileProps } from '../../../shared/routeHeadwayFilter';
import { tileRouteKeyExpr } from '../../../shared/tileFilterExprs';
import fixture from './fixtures/route-filter-parity.json';

// CIV-1011 #8: the map's route filter (tile expression) and the in-memory predicate that feeds the
// counter and lists must classify every route the same way. Fixture: one published feature per
// combination of route type, service class, tier, irregular/limited flags and day (release-mvp929b3).
// Plus shapes published data doesn't have today, so a rule that drifts on them still fails here.
const base = fixture[0] as Record<string, unknown>;
const EDGE_CASES = [
  { serviceClass: undefined, tier: 'span' },
  { serviceClass: undefined, tier: '30' },
  { serviceClass: 'regular', tier: 'span' },
  { serviceClass: 'irregular', tier: '15' },
  { serviceClass: 'time-limited', tier: '30', routeAllDayHeadway: undefined, routeHasLimitedDirection: undefined },
  { serviceClass: 'regular', tier: '30', routeAllDayHeadway: undefined, routeHasLimitedDirection: true },
  { serviceClass: 'regular', tier: '30', routeHasIrregularDirection: true },
].map((edge, i) => ({ ...base, ...edge, routeId: `edge-${i}` }));
const features = [...fixture, ...EDGE_CASES] as unknown as ShapeProperties[];
const AGENCIES = new Set(features.map(f => f.agencySlug!));
const PERIODS: TimePeriod[] = ['all', 'amPeak', 'midday', 'pmPeak', 'evening', 'late', 'overnight'];
const HEADWAYS = [Infinity, 10, 15, 30, 60];
const MODE_SETS = [new Set<number>(), new Set([3]), new Set([0]), new Set([0, 1, 2])];

describe('map filter and in-memory filter agree (CIV-1011 #8)', () => {
  it('on every fixture feature, for every filter combination', () => {
    let checked = 0;
    const mismatches: string[] = [];
    for (const day of ['Weekday', 'Saturday', 'Sunday']) {
      for (const period of PERIODS) {
        for (const maxHeadway of HEADWAYS) {
          for (const modes of MODE_SETS) {
            for (const hideSpan of [false, true]) {
              for (const hideLimitedService of [false, true]) {
                const filters = { agencies: AGENCIES, day, period, maxHeadway, modes, hideSpan, hideLimitedService };
                const tile = featureFilter(buildRouteTileFilter(filters) as never, {} as never);
                for (const p of features) {
                  const js = passesRouteFilter(p, p.agencySlug!, filters, null);
                  const map = tile.filter({ zoom: 10 } as never, { properties: routeFilterTileProps(p) } as never);
                  if (map !== js) mismatches.push(`${p.agencySlug} ${p.routeId} ${p.day} dir ${p.directionId}: ${JSON.stringify({ period, maxHeadway, modes: [...modes], hideSpan, hideLimitedService, js, map })}`);
                  checked++;
                }
              }
            }
          }
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(50_000);
  }, 30_000);

  it('an agency outside the allowlist fails both, and no agencies hides everything', () => {
    const p = features[0];
    const filters = { agencies: new Set(['nowhere']), day: p.day!, period: 'all' as const, maxHeadway: Infinity, modes: new Set<number>() };
    expect(passesRouteFilter(p, p.agencySlug!, filters, null)).toBe(false);
    expect(featureFilter(buildRouteTileFilter(filters) as never, {} as never).filter({ zoom: 10 } as never, { properties: routeFilterTileProps(p) } as never)).toBe(false);
    expect(buildRouteTileFilter({ ...filters, agencies: new Set() })).toEqual(['==', ['get', 'agencySlug'], '']);
  });

  // CIV-1135: the counter evaluates the map's own expression, so the two edge states where the old JS predicate
  // differed now follow the drawn map: no agencies counts nothing, and a route feature without a day is not counted.
  it('counts what the map draws in the edge states too', () => {
    const p = features[0];
    const filters = { agencies: new Set<string>(), day: p.day!, period: 'all' as const, maxHeadway: Infinity, modes: new Set<number>() };
    expect(passesRouteFilter(p, p.agencySlug!, filters, null)).toBe(false);
    const noDay = { ...p, day: undefined } as ShapeProperties;
    const all = { ...filters, agencies: AGENCIES };
    expect(passesRouteFilter(noDay, noDay.agencySlug!, all, null)).toBe(false);
    expect(featureFilter(buildRouteTileFilter(all) as never, {} as never).filter({ zoom: 10 } as never, { properties: routeFilterTileProps(noDay) } as never)).toBe(false);
  });

  it('a hovered branch shows its direction for the selected route only', () => {
    const expr = buildRouteTileFilter({ agencies: new Set(['ttc']), day: 'Weekday', period: 'all', maxHeadway: Infinity, modes: new Set(), hoveredDirection: { routeKey: 'ttc::51', directionId: 1 } });
    expect(expr).toEqual(['all',
      ['in', ['get', 'agencySlug'], ['literal', ['ttc']]],
      ['==', ['get', 'day'], 'Weekday'],
      ['case', ['==', tileRouteKeyExpr(), 'ttc::51'], ['==', ['get', 'directionId'], 1], ['==', ['get', 'directionId'], 0]],
    ]);
  });
});
