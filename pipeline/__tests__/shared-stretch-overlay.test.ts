import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { normalizeRouteFilterFeatures, routePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';
import { computeFrequencySegmentOverlay, failingRouteSharedRanges } from '../../src/utils/frequencySegments';
import { buildRouteStopMetric } from '../../src/utils/routeFacts';
import { sharedStretchHeadway } from '../../src/utils/routeCardTrunk';
import { buildSharedStopIndex } from '../../shared/sharedStops';

// CIV-82 phase 2: a route that fails the active filter may draw only the shared stretches whose
// pooled stop values pass the same filter in both directions. It still fails everywhere else.

// TTC 29 at real stop spacing (every stop, trips starting 6-11 AM): the opposite-direction stop
// across the street must exist for the both-directions check.
async function ttc29(): Promise<GeoJSON.FeatureCollection> {
  return processed('ttc-29-dufferin-full', 'ttc');
}

async function processed(fixture: string, slug: string): Promise<GeoJSON.FeatureCollection> {
  const zip = new JSZip();
  const dir = resolve(__dirname, 'fixtures', fixture);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug });
  const fc = JSON.parse(result.geojson) as GeoJSON.FeatureCollection;
  // The app normalizes loaded agency JSON the same way (worst-direction stamps).
  normalizeRouteFilterFeatures(fc.features as any);
  for (const f of fc.features) (f.properties as any).agencySlug = slug;
  return fc;
}

const weekday = (fc: GeoJSON.FeatureCollection) => ({
  ...fc,
  features: fc.features.filter(f => f.geometry.type !== 'LineString' || (f.properties as any).day === 'Weekday'),
});
const lineProps = (fc: GeoJSON.FeatureCollection) => fc.features
  .filter(f => f.geometry.type === 'LineString')
  .map(f => f.properties as any);
const strip = (fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => ({
  ...fc,
  features: fc.features.map(f => {
    const { sharedStretches, sharedStops, ...rest } = (f.properties ?? {}) as any;
    return { ...f, properties: rest };
  }),
});

describe('failing routes draw only their passing shared stretches', () => {
  it('TTC 29 fails every 15 but draws its shared stretch in both directions; the 29C tail stays hidden', async () => {
    const fc = weekday(await ttc29());
    const routes = lineProps(fc);
    for (const period of ['all', 'amPeak'] as const) {
      // The route itself fails (each branch every 16).
      expect(routePassesHeadwayFilter(routes, period, 'Weekday', 15)).toBe(false);
      const result = failingRouteSharedRanges(fc.features, fc.features, period, 15);
      const byHeadsign = new Map(result.map(r => [(r.feature.properties as any).headsign, r]));
      const a = byHeadsign.get('Exhibition (Dufferin Gate)');
      const c = byHeadsign.get("Exhibition (Princes' Gates)");
      const north = byHeadsign.get('Wilson');
      expect(a && c && north).toBeTruthy();
      const aProps = a!.feature.properties as any;
      const cProps = c!.feature.properties as any;
      // 29A: the shared stops draw (its last, drop-off-only stop does not pool).
      expect(a!.ranges[0][0]).toBe(0);
      expect(a!.ranges.at(-1)![1]).toBeGreaterThanOrEqual(aProps.stopOrder.length - 3);
      // 29C: nothing past 29A's stops (its tail is 29C-only, every 16).
      const lastShared = cProps.stopOrder.findIndex((s: string) => s === aProps.stopOrder.at(-2));
      for (const [, to] of c!.ranges) expect(to).toBeLessThanOrEqual(lastShared);
      expect(north!.ranges.length).toBeGreaterThan(0);
      // Colours come from the tier palette of the worst filter value (every 8 here).
      for (const v of a!.values.values()) expect(v).toBeLessThanOrEqual(15);
    }
    const overlay = computeFrequencySegmentOverlay({ ttc: fc } as any, 'all', 15);
    expect(overlay.segments.some(s => s.properties.routeId === '29')).toBe(true);
    // Never a partial match: the failing route's own line stays filtered out.
    expect(overlay.partialMatches.some(k => k.routeId === '29')).toBe(false);
  });

  it('draws nothing when the opposite direction fails at the matching stops', async () => {
    const fc = weekday(await ttc29());
    // Northbound loses its pooled data and runs every 30 at every stop.
    for (const f of fc.features) {
      const p = f.properties as any;
      if (f.geometry.type !== 'LineString' || p.directionId !== 1) continue;
      delete p.sharedStretches;
      delete p.sharedStops;
      for (const id of Object.keys(p.stopHeadways ?? {})) p.stopHeadways[id] = 30;
      for (const id of Object.keys(p.stopPeriodHeadways ?? {})) {
        for (const pk of Object.keys(p.stopPeriodHeadways[id])) p.stopPeriodHeadways[id][pk] = 30;
      }
    }
    for (const period of ['all', 'amPeak'] as const) {
      expect(failingRouteSharedRanges(fc.features, fc.features, period, 15)).toEqual([]);
    }
  });

  it('draws nothing new without the stretch ranges, and counts never change', async () => {
    const fc = weekday(await ttc29());
    const bare = strip(fc);
    for (const period of ['all', 'amPeak', 'midday'] as const) {
      for (const max of [10, 15, 20, 30]) {
        expect(failingRouteSharedRanges(bare.features, bare.features, period, max)).toEqual([]);
        // Route pass/fail (lists, counts, agency cards) is identical with and without pooled data.
        expect(routePassesHeadwayFilter(lineProps(fc), period, 'Weekday', max))
          .toBe(routePassesHeadwayFilter(lineProps(bare), period, 'Weekday', max));
        const withData = computeFrequencySegmentOverlay({ ttc: fc } as any, period, max);
        const without = computeFrequencySegmentOverlay({ ttc: bare } as any, period, max);
        expect(withData.partialMatches).toEqual(without.partialMatches);
        expect(without.segments.some(s => s.properties.routeId === '29')).toBe(false);
      }
    }
  });

  it('stop card and route card read the same pooled value as the map', async () => {
    const fc = weekday(await ttc29());
    const routes = lineProps(fc);
    const index = buildSharedStopIndex(fc.features);
    const a = routes.find(p => p.headsign === 'Exhibition (Dufferin Gate)');
    const stopId = a.stopOrder[3];
    // Since #690 the feature's own stop value is the pooled one (8), with or without the index.
    const stopMetric = buildRouteStopMetric(a, stopId, index);
    expect(stopMetric.value).toBe(8);
    expect(buildRouteStopMetric(a, stopId).value).toBe(8);
    expect(a.stopHeadways[stopId]).toBe(8);
    const south = routes.filter(p => p.directionId === 0);
    // The card reads the overlay's own per-stop pass (shallow copies of the props, as the card holds).
    const copies = south.map(p => ({ ...p }));
    expect(sharedStretchHeadway(fc.features, copies, 'all', 15)?.headway).toBe(8);
    expect(sharedStretchHeadway(fc.features, copies, 'all', Infinity)?.headway).toBe(8);
    expect(sharedStretchHeadway(fc.features, copies, 'all', 5)).toBeNull(); // nothing draws at <=5
    const bare = strip(fc);
    expect(sharedStretchHeadway(bare.features, lineProps(bare).filter(p => p.directionId === 0), 'all', 15)).toBeNull();
  });

  // Rail: one direction splits into two branches (pooled), the other runs as ONE headsign that
  // already counts every trip. The single-pattern direction draws along the paired stops too.
  // Cut from the 2026-10 feeds: one weekday, trips starting 7 AM to noon, every stop, so the
  // all-day value (the midday median) is the one these fixtures can judge.
  // Rail stays one row per headsign (converging origins are labelled on surface routes only).
  for (const [fixture, slug, single, branches, max] of [
    ['nyct-b-subway', 'nyct-subway', 'Beach', ['Park Blvd', '145 St'], 15],
    ['cta-green-line', 'cta', 'Harlem-Green', ['East 63rd-Cottage Grove', 'Ashland/63rd'], 15],
  ] as const) {
    it(`${slug} ${single}: the single-pattern direction draws where both directions pass`, async () => {
      const fc = weekday(await processed(fixture, slug));
      const routes = lineProps(fc);
      const one = routes.filter(p => p.headsign === single);
      expect(one).toHaveLength(1);
      expect(one[0].sharedStretches).toBeUndefined();
      expect(routePassesHeadwayFilter(routes, 'all', 'Weekday', max)).toBe(false);
      const result = failingRouteSharedRanges(fc.features, fc.features, 'all', max);
      const drawn = new Map(result.map(r => [(r.feature.properties as any).headsign, r]));
      expect(drawn.has(single)).toBe(true);
      expect(branches.some(h => drawn.has(h))).toBe(true);
      // Symmetric: the single direction's drawn stops lie across from drawn branch stops.
      const singleStops = drawn.get(single)!.ranges.reduce((n, [a, b]) => n + b - a + 1, 0);
      const branchStops = Math.max(...branches.map(h => drawn.get(h)?.ranges.reduce((n, [a, b]) => n + b - a + 1, 0) ?? 0));
      expect(singleStops).toBeGreaterThan(branchStops / 3);
      // Never a partial match, and the route still fails.
      const overlay = computeFrequencySegmentOverlay({ [slug]: fc } as any, 'all', max);
      expect(overlay.partialMatches.some(k => k.headsign === single)).toBe(false);
      // Without pooled data neither direction draws anything new.
      const bare = strip(fc);
      expect(failingRouteSharedRanges(bare.features, bare.features, 'all', max)).toEqual([]);
    });
  }
});

/**
 * Hand-built route: southbound (dir 0) branches A and B share s0..s5 and pool to every 8 there
 * (each every 16); northbound (dir 1) runs ONE pattern every 8 with a stop across from each of
 * s0..s5, plus pPast, 150 m past s5 beyond the branch point.
 */
function splitRoute(opts: {
  amPeak?: { median: number; coverage: number; unsustained?: boolean };
  /** The branches' own AM coverage and sustained flag (pooled values apply only where better). */
  ownAm?: { coverage: number; sustained: boolean };
} = {}): GeoJSON.FeatureCollection {
  const lat = (i: number) => 43.6 + i * 0.003;
  const trunk = [0, 1, 2, 3, 4, 5].map(i => `s${i}`);
  const point = (id: string, la: number, lo: number): GeoJSON.Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lo, la] }, properties: { stopId: id } });
  const points = [
    ...trunk.map((id, i) => point(id, lat(i), -79.4)),
    point('a1', lat(6), -79.39), point('b1', lat(6), -79.41),
    ...trunk.map((_, i) => point(`p${i}`, lat(i), -79.4003)),
    point('pPast', lat(5) + 0.00135, -79.4003),
  ];
  const periods = (v: number) => Object.fromEntries(['amPeak', 'midday', 'pmPeak', 'evening'].map(k => [k, v]));
  const line = (headsign: string, dir: number, stops: string[], hw: number, extra: Record<string, unknown> = {}): GeoJSON.Feature => {
    const coords = stops.map(id => (points.find(pt => (pt.properties as any).stopId === id)!.geometry as GeoJSON.Point).coordinates);
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        routeId: 'r', routeShortName: '7', agencySlug: 'x', day: 'Weekday', directionId: dir, headsign,
        tier: hw <= 10 ? '10' : '30', serviceClass: 'regular', headway: hw,
        headwayByPeriod: periods(hw), periodCoverageHeadway: periods(hw + 4), headwayByPeriodSustained: Object.fromEntries(['amPeak', 'midday', 'pmPeak', 'evening'].map(k => [k, true])),
        stopOrder: stops, stopPositions: stops.map((_, i) => i / (stops.length - 1)),
        stopHeadways: Object.fromEntries(stops.map(s => [s, hw])),
        stopPeriodHeadways: Object.fromEntries(stops.map(s => [s, periods(hw)])),
        stopPeriodCoverageHeadways: Object.fromEntries(stops.map(s => [s, periods(hw + 4)])),
        ...extra,
      },
    };
  };
  const am = opts.amPeak ?? { median: 8, coverage: 12 };
  const ownAm = (p: Record<string, any>) => {
    if (!opts.ownAm || p.directionId !== 0) return;
    p.headwayByPeriodSustained.amPeak = opts.ownAm.sustained;
    for (const s of Object.keys(p.stopPeriodCoverageHeadways)) p.stopPeriodCoverageHeadways[s].amPeak = opts.ownAm.coverage;
  };
  const block = Object.fromEntries(trunk.map(s => [s, {
    headway: 8,
    periods: [am.median, 8, 8, 8],
    coverage: [am.coverage, 12, 12, 12],
    ...(am.unsustained ? { unsustained: ['amPeak'] } : {}),
  }]));
  const stretch = [{ from: 0, to: 5, with: ['other'] }];
  const features = [
    ...points,
    line('A', 0, [...trunk, 'a1'], 16, { sharedStretches: stretch, sharedStops: block }),
    line('B', 0, [...trunk, 'b1'], 16, { sharedStretches: stretch }),
    line('North', 1, ['pPast', 'p5', 'p4', 'p3', 'p2', 'p1', 'p0'], 8),
  ];
  for (const f of features) if (f.geometry.type === 'LineString') ownAm(f.properties as any);
  normalizeRouteFilterFeatures(features as any);
  return { type: 'FeatureCollection', features };
}

describe('shared stretch edges', () => {
  it('the single-pattern direction never draws past the branch point', () => {
    const fc = splitRoute();
    expect(routePassesHeadwayFilter(lineProps(fc), 'all', 'Weekday', 15)).toBe(false);
    const result = failingRouteSharedRanges(fc.features, fc.features, 'all', 15);
    const north = result.find(r => (r.feature.properties as any).headsign === 'North');
    expect(north).toBeTruthy();
    const northStops = (north!.feature.properties as any).stopOrder as string[];
    const drawn = north!.ranges.flatMap(([a, b]) => northStops.slice(a, b + 1));
    // pPast is 150 m from s5, the stretch's end: it must not pair there and draw.
    expect(drawn).not.toContain('pPast');
    expect(drawn).toContain('p2');
    // The branched direction draws its whole stretch.
    const a = result.find(r => (r.feature.properties as any).headsign === 'A');
    expect(a!.ranges).toEqual([[0, 5]]);
  });

  it('draws nothing in a period whose pooled median passes but coverage or sustained fails', () => {
    for (const [amPeak, ownAm] of [
      // Unsustained (own also unsustained): the filter reads the pooled coverage, 40.
      [{ median: 8, coverage: 40, unsustained: true }, { coverage: 80, sustained: false }],
      // Coverage over 60: the filter reads the pooled coverage, 70.
      [{ median: 8, coverage: 70 }, { coverage: 90, sustained: true }],
    ] as const) {
      const fc = splitRoute({ amPeak, ownAm });
      expect(failingRouteSharedRanges(fc.features, fc.features, 'amPeak', 15)
        .filter(r => (r.feature.properties as any).directionId === 0)).toEqual([]);
      // The same data still draws all day.
      expect(failingRouteSharedRanges(fc.features, fc.features, 'all', 15).length).toBeGreaterThan(0);
    }
  });
});

describe('route card shared stretch matches the map', () => {
  it('uses the same per-stop pass: no N where the map draws nothing, and the worst drawn stop', () => {
    const fc = splitRoute({ amPeak: { median: 8, coverage: 40, unsustained: true }, ownAm: { coverage: 80, sustained: false } });
    const south = lineProps(fc).filter(p => p.directionId === 0).map(p => ({ ...p }));
    // AM: the pooled median (8) passes but the filter fails on coverage, so no card N either.
    expect(sharedStretchHeadway(fc.features, south, 'amPeak', 15)).toBeNull();
    expect(sharedStretchHeadway(fc.features, south, 'all', 15)?.headway).toBe(8);
    // The single-pattern direction draws on the map but gets no "Shared stretch" card row.
    const north = lineProps(fc).filter(p => p.directionId === 1).map(p => ({ ...p }));
    expect(sharedStretchHeadway(fc.features, north, 'all', 15)).toBeNull();
  });
});
